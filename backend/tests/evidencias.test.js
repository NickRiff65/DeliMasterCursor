import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Las fotos de prueba se guardan en una carpeta temporal, no en backend/uploads
process.env.CARPETA_EVIDENCIAS = path.join(os.tmpdir(), `delimaster-evidencias-${process.pid}`);
// Imagen JPEG mínima (reconocida por su encabezado)
const FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');

describe('Fotos de una solicitud y evidencia del trabajo (HU-16)', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, firmarToken;
  let n = 0;
  let cliente, prestador, intruso, admin, solicitudId;

  before(async () => {
    pool = await prepararBase();
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `e${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const subir = (u, cuerpo = { imagen_base64: FOTO }) =>
    como(u)(request(app).post(`/api/solicitudes/${solicitudId}/fotos`)).send(cuerpo);
  const listar = (u) => como(u)(request(app).get(`/api/solicitudes/${solicitudId}/fotos`));
  const estado = (e) => pool.query('UPDATE solicitudes SET estado = $2 WHERE id = $1', [solicitudId, e]);

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    intruso = await registrar('cliente', 'Otra');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 50000 });
    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin@test.cl', 'x') RETURNING id, rol");
    admin = { id: rows[0].id, token: firmarToken(rows[0]) };
  });

  test('el cliente sube fotos desde que publica la solicitud, para que el maestro cotice con exactitud', async () => {
    await estado('creada');
    assert.equal((await subir(cliente, { imagen_base64: FOTO, descripcion: 'Así está el árbol' })).status, 201);
    await estado('cotizada');   // también durante la visita de diagnóstico y la cotización
    assert.equal((await subir(prestador)).status, 201);
    assert.equal((await listar(cliente)).body.puede_subir, true);
    // Una solicitud cancelada ya no recibe fotos
    await estado('cancelada');
    assert.equal((await subir(cliente)).status, 409);
    assert.equal((await listar(cliente)).body.puede_subir, false);
  });

  test('el prestador y el cliente suben fotos y ambos las ven, con su autor', async () => {
    await estado('pagada');
    const p = await subir(prestador, { imagen_base64: FOTO, descripcion: 'Árbol podado y ramas retiradas' });
    assert.equal(p.status, 201);
    await estado('en_disputa');
    assert.equal((await subir(cliente)).status, 201);

    const vista = await listar(cliente);
    assert.equal(vista.body.fotos.length, 2);
    assert.deepEqual(vista.body.fotos.map((f) => f.rol), ['prestador', 'cliente']);
    assert.deepEqual(vista.body.fotos.map((f) => f.propia), [false, true]);
    assert.equal(vista.body.fotos[0].descripcion, 'Árbol podado y ramas retiradas');

    // La imagen se entrega con el enlace firmado, y sin él no
    const { pathname, search } = new URL(vista.body.fotos[0].url);
    const img = await request(app).get(pathname + search);
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/jpeg');
    assert.equal((await request(app).get(pathname)).status, 403);
  });

  test('el equipo ve las fotos en el detalle de la disputa', async () => {
    await estado('pagada');
    await subir(prestador);
    const { body } = await como(admin)(request(app).get(`/api/admin/solicitudes/${solicitudId}`));
    assert.equal(body.solicitud.fotos.length, 1);
    assert.equal(body.solicitud.fotos[0].rol, 'prestador');
    assert.match(body.solicitud.fotos[0].url, /\/evidencias\/.+\/imagen\?vence=\d+&firma=/);
    assert.equal((await listar(admin)).body.puede_subir, false);   // el equipo revisa, no sube
  });

  test('nadie ajeno puede ver ni subir fotos', async () => {
    await estado('pagada');
    assert.equal((await subir(intruso)).status, 404);
    assert.equal((await listar(intruso)).status, 404);
  });

  test('después del cierre ya no se suben fotos, y las existentes no se pueden borrar', async () => {
    await estado('pagada');
    await subir(prestador);
    await estado('cerrada');
    assert.equal((await subir(cliente)).status, 409);
    await assert.rejects(pool.query('DELETE FROM evidencias'), /no se pueden eliminar/);
  });

  test('máximo 12 fotos por persona y solo imágenes reales', async () => {
    await estado('finalizada');
    for (let i = 0; i < 12; i++) assert.equal((await subir(prestador)).status, 201);
    const otra = await subir(prestador);
    assert.equal(otra.status, 409);
    assert.equal(otra.body.error.codigo, 'LIMITE_FOTOS');
    // El cliente tiene su propio cupo; un archivo que no es imagen se rechaza
    const texto = Buffer.from('esto no es una imagen, aunque diga que lo es'.repeat(5)).toString('base64');
    assert.equal((await subir(cliente, { imagen_base64: texto })).status, 422);
    assert.equal((await subir(cliente)).status, 201);
  });
});
