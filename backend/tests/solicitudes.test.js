import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('HU-05 / HU-08 / HU-12 · Solicitudes de servicio', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app;
  let pool;
  let n = 0;
  let cliente, otroCliente, podador, electricista, electricistaSinVerificar;

  before(async () => {
    pool = await prepararBase();
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  async function registrar(rol, nombre, extra = {}) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `u${n}@test.cl`, password: 'clave1234', acepta_terminos: true, telefono: '912345678', ...extra });
    return { id: body.usuario.id, token: body.token };
  }
  async function prestador(nombre, categorias, verificar) {
    const p = await registrar('prestador', nombre);
    await request(app).put('/api/prestadores/yo').set('Authorization', `Bearer ${p.token}`)
      .send({ categorias, comunas_atendidas: ['Chillán'] });
    if (verificar) {
      await pool.query(
        `INSERT INTO verificaciones (prestador_id, categoria_id, organismo, numero_registro, estado, revisado_en, vence_en)
         SELECT $1, id, organismo, 'SEC-1', 'aprobada', now(), current_date + 60 FROM categorias WHERE slug = $2`, [p.id, verificar]);
    }
    return p;
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const crear = (u, cuerpo) => como(u)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: randomUUID(), ...cuerpo });

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez', { comuna: 'Chillán' });
    otroCliente = await registrar('cliente', 'Otro Cliente');
    podador = await prestador('Luis Poda', ['poda-altura']);
    electricista = await prestador('Juan Electricista', ['electricidad'], 'electricidad');
    electricistaSinVerificar = await prestador('Pedro Sin Verificar', ['electricidad']);
  });

  async function solicitudConfirmable(texto = 'Necesito podar un árbol muy alto') {
    const { body } = await crear(cliente, { descripcion: texto });
    const id = body.solicitudes[0].id;
    await como(cliente)(request(app).post(`/api/solicitudes/${id}/asignar`)).send({ prestador_id: podador.id });
    return id;
  }

  // ------------------------------------------------------------------ HU-08
  test('interpreta el texto sin crear nada (vista previa)', async () => {
    const res = await como(cliente)(request(app).post('/api/solicitudes/interpretar'))
      .send({ descripcion: 'Necesito cortar un árbol y hacer canales de regadío en Coihueco' });
    assert.equal(res.status, 200);
    // Poda, tala y riego: los tres oficios están habilitados
    assert.deepEqual(res.body.categorias.map((c) => c.slug).sort(), ['poda-altura', 'riego', 'tala']);
    assert.deepEqual(res.body.no_disponibles, []);
    assert.equal(res.body.comuna, 'Coihueco');
    assert.equal((await pool.query('SELECT 1 FROM solicitudes')).rowCount, 0);
  });

  test('crea la solicitud detectando categoría y comuna, y registra el evento', async () => {
    const res = await crear(cliente, { descripcion: 'Se me quemó un enchufe en Coihueco' });
    assert.equal(res.status, 201);
    const s = res.body.solicitudes[0];
    assert.equal(s.estado, 'creada');
    assert.equal(s.categoria, 'electricidad');
    assert.equal(s.comuna, 'Coihueco');
    const ev = await pool.query('SELECT estado_nuevo FROM solicitud_eventos WHERE solicitud_id = $1', [s.id]);
    assert.deepEqual(ev.rows.map((r) => r.estado_nuevo), ['creada']);
  });

  test('si no menciona comuna, usa la del perfil del cliente', async () => {
    const res = await crear(cliente, { descripcion: 'Necesito podar unas ramas' });
    assert.equal(res.body.solicitudes[0].comuna, 'Chillán');
  });

  test('varios servicios en un mensaje crean una solicitud por servicio, agrupadas', async () => {
    const res = await crear(cliente, { descripcion: 'Hay que podar el árbol y revisar el tablero eléctrico' });
    assert.equal(res.status, 201);
    assert.equal(res.body.solicitudes.length, 2);
    assert.deepEqual(res.body.solicitudes.map((s) => s.categoria).sort(), ['electricidad', 'poda-altura']);
    assert.ok(res.body.solicitudes.every((s) => s.grupo_id === res.body.grupo_id));
  });

  test('HU-12: reenviar la misma solicitud no la duplica (tampoco las derivadas)', async () => {
    const cuerpo = { id: randomUUID(), direccion: 'Av. Libertad 1234', descripcion: 'Hay que podar el árbol y revisar el tablero eléctrico' };
    const primera = await como(cliente)(request(app).post('/api/solicitudes')).send(cuerpo);
    const segunda = await como(cliente)(request(app).post('/api/solicitudes')).send(cuerpo);
    assert.equal(primera.status, 201);
    assert.equal(segunda.status, 200);
    assert.equal(segunda.body.creada, false);
    assert.deepEqual(segunda.body.solicitudes.map((s) => s.id).sort(), primera.body.solicitudes.map((s) => s.id).sort());
    assert.equal((await pool.query('SELECT 1 FROM solicitudes')).rowCount, 2);
  });

  test('otro cliente no puede reutilizar un id ajeno', async () => {
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar el árbol' });
    const res = await como(otroCliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar el árbol', comuna: 'Coihueco' });
    assert.equal(res.status, 409);
  });

  test('si solo pide servicios no habilitados, lo dice con claridad', async () => {
    // Un servicio que se deshabilita por un tiempo (las fases del lanzamiento lo permiten)
    await pool.query("UPDATE categorias SET activa = false WHERE slug = 'riego'");
    try {
      const res = await crear(cliente, { descripcion: 'Quiero instalar riego por goteo en el huerto' });
      assert.equal(res.status, 422);
      assert.equal(res.body.error.codigo, 'SIN_CATEGORIA');
      assert.match(res.body.error.mensaje, /riego tecnificado/i);
    } finally {
      await pool.query("UPDATE categorias SET activa = true WHERE slug = 'riego'");
    }
  });

  test('los oficios nuevos se reconocen: gasfiter, cerrajero y gas', async () => {
    const ver = async (descripcion) => (await como(cliente)(request(app).post('/api/solicitudes/interpretar'))
      .send({ descripcion })).body.categorias.map((c) => c.slug);
    assert.deepEqual(await ver('Se rompió una cañería y está saliendo agua por todos lados'), ['gasfiteria']);
    assert.deepEqual(await ver('Me quedé afuera, se me quedaron las llaves adentro'), ['cerrajeria']);
    assert.equal((await ver('Hay olor a gas en la cocina'))[0], 'gas');
    assert.deepEqual(await ver('Tengo goteras en el techo'), ['techumbre']);
  });

  test('si menciona una comuna donde aún no operamos, lo avisa en vez de usar la de su perfil', async () => {
    const vista = await como(cliente)(request(app).post('/api/solicitudes/interpretar'))
      .send({ descripcion: 'Se me quemó un enchufe en San Carlos' });
    assert.equal(vista.body.comuna, null);
    assert.equal(vista.body.fuera_de_cobertura, 'San Carlos');
    const res = await crear(cliente, { descripcion: 'Se me quemó un enchufe en San Carlos' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.codigo, 'FUERA_DE_COBERTURA');
    assert.match(res.body.error.mensaje, /solo en Chillán y Coihueco/);
    // Si elige una comuna cubierta, se crea ahí
    assert.equal((await crear(cliente, { descripcion: 'Se me quemó un enchufe en San Carlos', comuna: 'Chillán' })).status, 201);
  });

  test('si el cliente corrige las categorías, se usan las que eligió', async () => {
    const res = await crear(cliente, { descripcion: 'Tengo un problema en el patio de la casa', categorias: ['poda-altura'] });
    assert.equal(res.status, 201);
    assert.equal(res.body.solicitudes[0].categoria, 'poda-altura');
  });

  test('exige comuna si no se detecta ni está en el perfil', async () => {
    const res = await crear(otroCliente, { descripcion: 'Necesito podar las ramas del árbol' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.campos.comuna);
  });

  // ------------------------------------------------------------------ asignación
  test('solo se puede asignar a un prestador habilitado para esa categoría', async () => {
    const { body } = await crear(cliente, { descripcion: 'Se quemó un enchufe' });
    const url = `/api/solicitudes/${body.solicitudes[0].id}/asignar`;
    for (const p of [electricistaSinVerificar, podador]) {   // sin verificación SEC · otra categoría
      const res = await como(cliente)(request(app).post(url)).send({ prestador_id: p.id });
      assert.equal(res.status, 422);
      assert.equal(res.body.error.codigo, 'PRESTADOR_NO_HABILITADO');
    }
    const ok = await como(cliente)(request(app).post(url)).send({ prestador_id: electricista.id });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.solicitud.estado, 'asignada');
    assert.ok(ok.body.solicitud.responder_antes_de);
  });

  test('una solicitud asignada no se puede volver a asignar', async () => {
    const id = await solicitudConfirmable();
    const res = await como(cliente)(request(app).post(`/api/solicitudes/${id}/asignar`)).send({ prestador_id: podador.id });
    assert.equal(res.status, 409);
  });

  // ------------------------------------------------------------------ HU-05
  test('el prestador acepta con precio y la solicitud queda confirmada', async () => {
    const id = await solicitudConfirmable();
    const sinPrecio = await como(podador)(request(app).post(`/api/solicitudes/${id}/responder`)).send({ aceptar: true });
    assert.equal(sinPrecio.status, 422);
    const res = await como(podador)(request(app).post(`/api/solicitudes/${id}/responder`)).send({ aceptar: true, precio: 45000 });
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.estado, 'confirmada');
    assert.equal(res.body.solicitud.precio_acordado, 45000);
    assert.deepEqual(res.body.solicitud.eventos.map((e) => e.estado_nuevo), ['creada', 'asignada', 'confirmada']);
  });

  test('otro prestador no puede responder una solicitud ajena', async () => {
    const id = await solicitudConfirmable();
    const res = await como(electricista)(request(app).post(`/api/solicitudes/${id}/responder`)).send({ aceptar: true, precio: 1000 });
    assert.equal(res.status, 409);
  });

  test('si el prestador rechaza, el cliente puede elegir a otro', async () => {
    const id = await solicitudConfirmable();
    const res = await como(podador)(request(app).post(`/api/solicitudes/${id}/responder`)).send({ aceptar: false });
    assert.equal(res.body.solicitud.estado, 'creada');
    const detalle = await como(cliente)(request(app).get(`/api/solicitudes/${id}`));
    assert.equal(detalle.body.solicitud.prestador, null);
    const otra = await como(cliente)(request(app).post(`/api/solicitudes/${id}/asignar`)).send({ prestador_id: podador.id });
    assert.equal(otra.status, 200);
  });

  test('si el prestador no responde a tiempo, la solicitud se libera', async () => {
    const id = await solicitudConfirmable();
    await pool.query("UPDATE solicitudes SET asignada_en = now() - interval '31 minutes' WHERE id = $1", [id]);
    const tarde = await como(podador)(request(app).post(`/api/solicitudes/${id}/responder`)).send({ aceptar: true, precio: 5000 });
    assert.equal(tarde.status, 409);
    assert.equal(tarde.body.error.codigo, 'NO_ASIGNADA');
    const detalle = await como(cliente)(request(app).get(`/api/solicitudes/${id}`));
    assert.equal(detalle.body.solicitud.estado, 'creada');
    assert.match(detalle.body.solicitud.eventos.at(-1).detalle, /no respondió/);
  });

  // ------------------------------------------------------------------ privacidad y listados
  test('solo las partes pueden ver una solicitud, y sin teléfono ni correo', async () => {
    const id = await solicitudConfirmable();
    assert.equal((await como(otroCliente)(request(app).get(`/api/solicitudes/${id}`))).status, 404);
    assert.equal((await como(electricista)(request(app).get(`/api/solicitudes/${id}`))).status, 404);
    const vista = await como(podador)(request(app).get(`/api/solicitudes/${id}`));
    assert.equal(vista.status, 200);
    assert.equal(vista.body.solicitud.cliente.nombre, 'Ana');   // solo el primer nombre
    const texto = JSON.stringify(vista.body);
    assert.ok(!texto.includes('912345678') && !texto.includes('@test.cl'));
  });

  test('cada uno ve solo sus solicitudes', async () => {
    await solicitudConfirmable();
    await crear(cliente, { descripcion: 'Se quemó un enchufe' });
    assert.equal((await como(cliente)(request(app).get('/api/solicitudes'))).body.solicitudes.length, 2);
    assert.equal((await como(podador)(request(app).get('/api/solicitudes'))).body.solicitudes.length, 1);
    assert.equal((await como(otroCliente)(request(app).get('/api/solicitudes'))).body.solicitudes.length, 0);
    const filtradas = await como(cliente)(request(app).get('/api/solicitudes?estado=asignada'));
    assert.equal(filtradas.body.solicitudes.length, 1);
  });

  test('el cliente puede cancelar antes del pago, pero no dos veces', async () => {
    const id = await solicitudConfirmable();
    await como(podador)(request(app).post(`/api/solicitudes/${id}/responder`)).send({ aceptar: true, precio: 30000 });
    const res = await como(cliente)(request(app).post(`/api/solicitudes/${id}/cancelar`)).send({ motivo: 'Lo resolví' });
    assert.equal(res.body.solicitud.estado, 'cancelada');
    const otraVez = await como(cliente)(request(app).post(`/api/solicitudes/${id}/cancelar`)).send({});
    assert.equal(otraVez.status, 409);
  });
});
