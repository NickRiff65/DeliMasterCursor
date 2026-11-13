import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Las fotos de prueba se guardan en una carpeta temporal, no en backend/uploads
process.env.CARPETA_EVIDENCIAS = path.join(os.tmpdir(), `delimaster-ayudantia-evidencias-${process.pid}`);
// Imagen JPEG mínima (reconocida por su encabezado, igual que en evidencias.test.js)
const FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');

// Mejoras de la ayudantía (noviembre 2026) sobre las solicitudes:
// (1) máximo 1 solicitud por día por cliente y nada de duplicar la misma categoría activa,
// (2) hasta 2 fotos al solicitar, que quedan como evidencias,
// (3) precio cerrado mínimo de $5.000,
// (4) plazo de respuesta del maestro de 1 día hábil (respuesta_vence_en / sin_respuesta).
describe('Ayudantía: límites, fotos, precio mínimo y plazo de 1 día hábil', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool;
  let vencimientoRespuesta, liberarVencidas;
  let n = 0;
  let cliente, prestador;

  before(async () => {
    pool = await prepararBase();
    ({ vencimientoRespuesta, liberarVencidas } = await import('../src/modules/solicitudes/solicitudes.servicio.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `a${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const crear = (u, cuerpo) => como(u)(request(app).post('/api/solicitudes'))
    .send({ direccion: 'Av. Libertad 1234', id: randomUUID(), ...cuerpo });
  const PODA = { descripcion: 'Necesito podar un árbol alto' };
  const ELECTRICIDAD = { descripcion: 'Se me quemó un enchufe' };

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    await como(prestador)(request(app).put('/api/prestadores/yo'))
      .send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
  });

  async function solicitudAsignada(u = cliente) {
    const res = await crear(u, PODA);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.solicitudes[0].id;
    const asig = await como(u)(request(app).post(`/api/solicitudes/${id}/asignar`)).send({ prestador_id: prestador.id });
    assert.equal(asig.status, 200, JSON.stringify(asig.body));
    return id;
  }

  // ---------------------------------------------------------- (1) límites al crear
  test('límite diario: la segunda solicitud del día falla; si la primera se cancela, pasa', async () => {
    const primera = await crear(cliente, PODA);
    assert.equal(primera.status, 201);
    const idPrimera = primera.body.solicitudes[0].id;

    // Otra categoría el mismo día: no es duplicada, pero sí supera el máximo de 1 por día
    const segunda = await crear(cliente, ELECTRICIDAD);
    assert.equal(segunda.status, 409);
    assert.equal(segunda.body.error.codigo, 'LIMITE_SOLICITUDES_DIA');
    assert.match(segunda.body.error.mensaje, /hoy/i);

    // La cancelada no cuenta para el límite: al cancelarla, el cliente puede pedir de nuevo hoy
    const cancelada = await como(cliente)(request(app).post(`/api/solicitudes/${idPrimera}/cancelar`)).send({});
    assert.equal(cancelada.body.solicitud.estado, 'cancelada');
    const reintento = await crear(cliente, ELECTRICIDAD);
    assert.equal(reintento.status, 201, JSON.stringify(reintento.body));
    assert.equal(reintento.body.solicitudes[0].categoria, 'electricidad');
  });

  test('duplicada: no puede haber dos activas de la misma categoría; otra categoría sí pasa', async () => {
    const primera = await crear(cliente, PODA);
    assert.equal(primera.status, 201);
    const idPrimera = primera.body.solicitudes[0].id;

    // La duplicada es el error más específico: se informa antes que el límite diario
    const duplicada = await crear(cliente, PODA);
    assert.equal(duplicada.status, 409);
    assert.equal(duplicada.body.error.codigo, 'SOLICITUD_ACTIVA_MISMA_CATEGORIA');

    // Para aislar la duplicada del límite diario, la primera pasa a ser «de ayer» en los
    // datos (sigue activa): otra categoría distinta sí se puede pedir
    await pool.query("UPDATE solicitudes SET creado_en = now() - interval '1 day' WHERE id = $1", [idPrimera]);
    const otra = await crear(cliente, ELECTRICIDAD);
    assert.equal(otra.status, 201, JSON.stringify(otra.body));

    // Cancelada la activa de poda, ya se puede pedir poda de nuevo (la de electricidad
    // también se mueve a ayer para no chocar con el límite diario en este paso)
    await como(cliente)(request(app).post(`/api/solicitudes/${idPrimera}/cancelar`)).send({});
    await pool.query("UPDATE solicitudes SET creado_en = now() - interval '1 day' WHERE cliente_id = $1", [cliente.id]);
    const deNuevo = await crear(cliente, PODA);
    assert.equal(deNuevo.status, 201, JSON.stringify(deNuevo.body));
    assert.equal(deNuevo.body.solicitudes[0].categoria, 'poda-altura');
  });

  // ---------------------------------------------------------- (2) fotos al solicitar
  test('fotos al crear: 2 fotos quedan como evidencias y 3 son error de validación', async () => {
    const conFotos = await crear(cliente, { ...PODA, fotos: [FOTO, FOTO] });
    assert.equal(conFotos.status, 201, JSON.stringify(conFotos.body));
    const id = conFotos.body.solicitudes[0].id;

    const { rows } = await pool.query(
      'SELECT descripcion FROM evidencias WHERE solicitud_id = $1 ORDER BY creado_en, id', [id]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.descripcion === 'Foto al solicitar'));
    const lista = await como(cliente)(request(app).get(`/api/solicitudes/${id}/fotos`));
    assert.equal(lista.body.fotos.length, 2);

    // Tres fotos superan el máximo del esquema (antes de cualquier límite de negocio)
    const otro = await registrar('cliente', 'Otra Cliente');
    const tres = await crear(otro, { ...PODA, fotos: [FOTO, FOTO, FOTO] });
    assert.equal(tres.status, 422);
    assert.match(tres.body.error.campos.fotos, /Puedes adjuntar hasta 2 fotos al solicitar/);
    assert.equal((await pool.query('SELECT 1 FROM solicitudes WHERE cliente_id = $1', [otro.id])).rowCount, 0);
  });

  // ---------------------------------------------------------- (3) precio mínimo $5.000
  test('precio mínimo: $4.999 se rechaza y $5.000 se acepta al responder con precio cerrado', async () => {
    const id = await solicitudAsignada();
    const bajo = await como(prestador)(request(app).post(`/api/solicitudes/${id}/responder`))
      .send({ aceptar: true, precio: 4999 });
    assert.equal(bajo.status, 422);
    assert.match(bajo.body.error.campos.precio, /El precio mínimo es \$5\.000/);

    const justo = await como(prestador)(request(app).post(`/api/solicitudes/${id}/responder`))
      .send({ aceptar: true, precio: 5000 });
    assert.equal(justo.status, 200, JSON.stringify(justo.body));
    assert.equal(justo.body.solicitud.estado, 'confirmada');
    assert.equal(justo.body.solicitud.precio_acordado, 5000);
  });

  // ---------------------------------------------------------- (4) plazo de 1 día hábil
  test('vencimientoRespuesta: viernes → lunes y día hábil → día hábil siguiente (hora de Chile)', () => {
    // Noviembre 2026: Chile en horario de verano (UTC-3); 13:00 UTC = 10:00 en Chile
    const viernes = new Date('2026-11-13T13:00:00Z');
    assert.equal(vencimientoRespuesta(viernes).toISOString(), '2026-11-16T13:00:00.000Z'); // lunes
    const jueves = new Date('2026-11-12T13:00:00Z');
    assert.equal(vencimientoRespuesta(jueves).toISOString(), '2026-11-13T13:00:00.000Z'); // viernes
    const sabado = new Date('2026-11-14T13:00:00Z');
    assert.equal(vencimientoRespuesta(sabado).toISOString(), '2026-11-16T13:00:00.000Z'); // lunes
  });

  test('liberarVencidas: la asignada vencida vuelve a creada con sin_respuesta y aviso; la vigente no', async () => {
    const vencidaId = await solicitudAsignada(cliente);
    // Al asignar quedó fijado el vencimiento a 1 día hábil
    const asignada = await como(cliente)(request(app).get(`/api/solicitudes/${vencidaId}`));
    assert.ok(asignada.body.solicitud.respuesta_vence_en);
    assert.ok(new Date(asignada.body.solicitud.respuesta_vence_en) > new Date());
    assert.equal(asignada.body.solicitud.sin_respuesta, false);
    await pool.query("UPDATE solicitudes SET respuesta_vence_en = now() - interval '1 hour' WHERE id = $1", [vencidaId]);

    // Otra solicitud asignada y aún dentro de plazo: no se libera
    const otroCliente = await registrar('cliente', 'Beto Cliente');
    const vigenteId = await solicitudAsignada(otroCliente);

    await liberarVencidas();

    const liberada = await como(cliente)(request(app).get(`/api/solicitudes/${vencidaId}`));
    assert.equal(liberada.body.solicitud.estado, 'creada');
    assert.equal(liberada.body.solicitud.prestador, null);
    assert.equal(liberada.body.solicitud.respuesta_vence_en, null);
    assert.equal(liberada.body.solicitud.sin_respuesta, true);
    assert.equal(liberada.body.solicitud.veces_sin_respuesta, 1);
    assert.match(liberada.body.solicitud.eventos.at(-1).detalle, /no respondió/);

    // Aviso explícito al cliente: no respondió en 1 día hábil y puede elegir otro maestro
    const { rows: avisos } = await pool.query(
      'SELECT titulo, texto FROM notificaciones WHERE usuario_id = $1 AND solicitud_id = $2', [cliente.id, vencidaId]);
    assert.ok(avisos.some((a) => /1 día hábil/.test(a.texto) && /elegir otro maestro/.test(a.texto)),
      JSON.stringify(avisos));

    const vigente = await como(otroCliente)(request(app).get(`/api/solicitudes/${vigenteId}`));
    assert.equal(vigente.body.solicitud.estado, 'asignada');
    assert.equal(vigente.body.solicitud.sin_respuesta, false);
  });
});
