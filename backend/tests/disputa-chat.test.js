import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// HU-16: en una disputa el equipo conversa por separado con el cliente y con el maestro
describe('Chat de las disputas', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, firmarToken;
  let cliente, prestador, admin, solicitudId;
  let n = 0;

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
      .send({ rol, ...partirNombre(nombre), email: `d${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const deParte = (u) => como(u)(request(app).get(`/api/solicitudes/${solicitudId}/disputa/mensajes`));
  const escribe = (u, contenido) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}/disputa/mensajes`)).send({ contenido });
  const delEquipo = () => como(admin)(request(app).get(`/api/admin/solicitudes/${solicitudId}/disputa`));
  const equipoEscribe = (parte, contenido) => como(admin)(request(app).post(`/api/admin/solicitudes/${solicitudId}/disputa`)).send({ parte, contenido });

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin@test.cl', 'x') RETURNING id, rol");
    admin = { id: rows[0].id, token: firmarToken(rows[0]) };
    solicitudId = randomUUID();
    await pool.query(
      `INSERT INTO solicitudes (id, cliente_id, prestador_id, categoria_id, descripcion_original, estado, motivo_disputa)
       SELECT $1, $2, $3, id, 'Poda de prueba', 'en_disputa', 'Dejó las ramas tiradas' FROM categorias WHERE slug = 'poda-altura'`,
      [solicitudId, cliente.id, prestador.id]);
  });

  test('el equipo escribe a cada parte por separado; cada una ve solo su conversación y recibe un aviso', async () => {
    assert.equal((await equipoEscribe('cliente', '¿Puedes subir una foto del patio?')).status, 201);
    assert.equal((await equipoEscribe('prestador', '¿Por qué quedaron las ramas?')).status, 201);
    assert.equal((await escribe(cliente, 'Ya subí dos fotos')).status, 201);

    const delCliente = (await deParte(cliente)).body;
    assert.deepEqual(delCliente.mensajes.map((m) => [m.de_equipo, m.contenido]),
      [[true, '¿Puedes subir una foto del patio?'], [false, 'Ya subí dos fotos']]);
    assert.equal(delCliente.puede_escribir, true);
    const delMaestro = (await deParte(prestador)).body;
    assert.deepEqual(delMaestro.mensajes.map((m) => m.contenido), ['¿Por qué quedaron las ramas?']);   // no ve la del cliente

    const equipo = (await delEquipo()).body;
    assert.equal(equipo.cliente.length, 2);
    assert.equal(equipo.prestador.length, 1);

    const { rows: avisos } = await pool.query(
      'SELECT titulo FROM notificaciones WHERE usuario_id = $1 AND solicitud_id = $2', [prestador.id, solicitudId]);
    assert.deepEqual(avisos.map((a) => a.titulo), ['DeliMaster te escribió sobre el reclamo']);

    // En la lista de disputas se marca que el cliente respondió y espera al equipo
    const lista = await como(admin)(request(app).get('/api/admin/disputas?estado=abiertas'));
    assert.equal(lista.body.disputas[0].respuesta_pendiente, true);
  });

  test('nadie más entra, y resuelta la disputa la conversación queda cerrada (se puede leer)', async () => {
    const otro = await registrar('cliente', 'Otra Persona');
    assert.equal((await deParte(otro)).status, 404);
    assert.equal((await como(cliente)(request(app).get(`/api/admin/solicitudes/${solicitudId}/disputa`))).status, 403);

    await equipoEscribe('cliente', 'Gracias por los antecedentes');
    await pool.query("UPDATE solicitudes SET estado = 'cerrada' WHERE id = $1", [solicitudId]);
    const cerrada = (await deParte(cliente)).body;
    assert.equal(cerrada.puede_escribir, false);
    assert.equal(cerrada.mensajes.length, 1);
    assert.equal((await escribe(cliente, 'Una cosa más')).status, 409);
    assert.equal((await equipoEscribe('cliente', 'Otra')).status, 409);
  });
});
