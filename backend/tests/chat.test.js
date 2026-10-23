import { describe, test, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { io as clienteSocket } from 'socket.io-client';
import os from 'node:os';
import path from 'node:path';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Las fotos del chat se guardan en una carpeta temporal, no en backend/uploads
process.env.CARPETA_EVIDENCIAS = path.join(os.tmpdir(), `delimaster-chat-${process.pid}`);
// Imagen JPEG mínima (reconocida por su encabezado)
const FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString('base64');

describe('HU-04 · Chat con filtro anti-fuga', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, servidor, url, iniciarSocket, cerrarSocket;
  let n = 0;
  let cliente, prestador, intruso, solicitudId;
  const sockets = [];

  before(async () => {
    pool = await prepararBase();
    ({ iniciarSocket, cerrarSocket } = await import('../src/socket.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
    servidor = http.createServer(app);
    iniciarSocket(servidor);
    await new Promise((r) => servidor.listen(0, r));
    url = `http://localhost:${servidor.address().port}`;
  });
  after(async () => {
    cerrarSocket();
    await new Promise((r) => servidor.close(r));
    await pool.end();
  });
  afterEach(() => { while (sockets.length) sockets.pop().close(); });

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `c${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const enviar = (u, contenido) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}/mensajes`)).send({ contenido });
  const estado = (e) => pool.query('UPDATE solicitudes SET estado = $2 WHERE id = $1', [solicitudId, e]);

  function conectar(u) {
    const s = clienteSocket(url, { auth: { token: u.token }, transports: ['websocket'], forceNew: true });
    sockets.push(s);
    return s;
  }
  const unirse = (s) => new Promise((r) => s.emit('unirse', solicitudId, r));
  const esperarMensaje = (s, ms = 1500) => new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    s.once('mensaje', (m) => { clearTimeout(t); resolve(m); });
  });

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    intruso = await registrar('cliente', 'Otro');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
  });

  test('cliente y prestador conversan; el historial queda guardado', async () => {
    assert.equal((await enviar(cliente, 'Hola, ¿puede venir mañana?')).status, 201);
    assert.equal((await enviar(prestador, 'Sí, a las 10 estoy allá')).status, 201);
    const res = await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`));
    assert.deepEqual(res.body.mensajes.map((m) => m.contenido), ['Hola, ¿puede venir mañana?', 'Sí, a las 10 estoy allá']);
    assert.equal(res.body.filtro_activo, true);
    assert.equal(res.body.puede_escribir, true);
    assert.equal(res.body.mensajes[1].emisor_nombre, 'Luis');
  });

  test('antes del pago, un teléfono se bloquea y no le llega a la otra persona', async () => {
    const res = await enviar(prestador, 'Mejor llámame al 9 8765 4321');
    assert.equal(res.status, 201);
    assert.equal(res.body.mensaje.bloqueado, true);
    assert.match(res.body.aviso, /pago esté protegido/);

    const delCliente = await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`));
    assert.equal(delCliente.body.mensajes.length, 0);                 // el cliente no lo ve
    const delPrestador = await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`));
    assert.equal(delPrestador.body.mensajes[0].bloqueado, true);      // quien lo escribió sí, marcado
    assert.match(delPrestador.body.mensajes[0].motivo_bloqueo, /telefono/);
  });

  test('bloquea un RUT o teléfono enviado por partes en varios mensajes', async () => {
    for (const parte of ['ese', 'es', 'mi']) {
      assert.equal((await enviar(cliente, parte)).body.mensaje.bloqueado, false);
    }
    const res = await enviar(cliente, 'rut');
    assert.equal(res.body.mensaje.bloqueado, true);
    assert.match(res.body.aviso, /varios mensajes/);
  });

  test('desde que el pago está asegurado, pueden compartir datos de contacto', async () => {
    await estado('pagada');
    const res = await enviar(prestador, 'Mi número es 987654321 por si se pierde');
    assert.equal(res.body.mensaje.bloqueado, false);
    const lista = await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`));
    assert.equal(lista.body.filtro_activo, false);
    assert.equal(lista.body.mensajes.length, 1);
  });

  test('después del pago se siguen bloqueando las ofertas de pago por fuera', async () => {
    await estado('pagada');
    const oferta = await enviar(prestador, 'Si quieres te hago el otro árbol aparte, me pagas en efectivo y te sale más barato');
    assert.equal(oferta.body.mensaje.bloqueado, true);
    assert.match(oferta.body.aviso, /por la app/);
    const banco = await enviar(prestador, 'Para el próximo trabajo me depositas directo a mi cuenta rut');
    assert.equal(banco.body.mensaje.bloqueado, true);
    // Coordinar el trabajo sigue siendo libre
    assert.equal((await enviar(prestador, 'Llego a las 9, mi fono es 987654321')).body.mensaje.bloqueado, false);
  });

  test('nadie ajeno a la solicitud puede leer ni escribir', async () => {
    assert.equal((await como(intruso)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`))).status, 404);
    assert.equal((await enviar(intruso, 'hola')).status, 404);
  });

  test('con la solicitud cancelada el chat queda de solo lectura', async () => {
    await enviar(cliente, 'Hola');
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/cancelar`)).send({});
    const res = await enviar(cliente, '¿Sigue ahí?');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'CHAT_CERRADO');
    const lista = await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`));
    assert.equal(lista.body.puede_escribir, false);
    assert.equal(lista.body.mensajes.length, 1);
  });

  test('tiempo real: el mensaje llega al instante a quien tiene el chat abierto', async () => {
    const socketCliente = conectar(cliente);
    assert.deepEqual(await unirse(socketCliente), { ok: true });
    const llega = esperarMensaje(socketCliente);
    await enviar(prestador, 'Voy en camino');
    const m = await llega;
    assert.equal(m?.contenido, 'Voy en camino');
    assert.equal(m.emisor_id, prestador.id);
  });

  test('tiempo real: un mensaje bloqueado no se transmite', async () => {
    const socketCliente = conectar(cliente);
    await unirse(socketCliente);
    const llega = esperarMensaje(socketCliente, 800);
    await enviar(prestador, 'agrégame al wsp');
    assert.equal(await llega, null);
  });

  test('tiempo real: un usuario ajeno no puede unirse a la sala, y sin sesión no se conecta', async () => {
    assert.deepEqual(await unirse(conectar(intruso)), { ok: false });
    const sinToken = clienteSocket(url, { auth: { token: 'falso' }, transports: ['websocket'], forceNew: true });
    sockets.push(sinToken);
    const error = await new Promise((r) => sinToken.once('connect_error', r));
    assert.equal(error.message, 'NO_AUTENTICADO');
  });

  test('el chat sigue abierto durante la visita de diagnóstico y la cotización, con el filtro activo', async () => {
    for (const e of ['visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada']) {
      await estado(e);
      assert.equal((await enviar(cliente, `Hola (${e})`)).status, 201, e);
      const bloqueado = await enviar(prestador, 'págame por fuera al 9 8765 4321 y te sale más barato');
      assert.equal(bloqueado.body.mensaje.bloqueado, true, e);
    }
    const lista = await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`));
    assert.equal(lista.body.filtro_activo, true);
    assert.equal(lista.body.puede_escribir, true);
  });

  test('se envían fotos por el chat: llegan al instante y quedan entre las fotos de la solicitud', async () => {
    const socketPrestador = conectar(prestador);
    await unirse(socketPrestador);
    const llega = esperarMensaje(socketPrestador);
    const res = await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/mensajes/foto`))
      .send({ imagen_base64: FOTO });
    assert.equal(res.status, 201);
    assert.ok(res.body.mensaje.foto_id);
    assert.match(res.body.mensaje.foto_url, /\/evidencias\/.+\/imagen\?vence=\d+&firma=/);
    const m = await llega;
    assert.equal(m?.foto_id, res.body.mensaje.foto_id);

    // El maestro la ve en el historial con su enlace firmado, y también en las fotos de la solicitud
    const lista = await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}/mensajes`));
    const { pathname, search } = new URL(lista.body.mensajes[0].foto_url);
    assert.equal((await request(app).get(pathname + search)).headers['content-type'], 'image/jpeg');
    const fotos = await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}/fotos`));
    assert.deepEqual(fotos.body.fotos.map((f) => f.rol), ['cliente']);
  });

  test('nadie ajeno envía fotos por el chat, ni se envían con el chat cerrado', async () => {
    const foto = (u) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}/mensajes/foto`)).send({ imagen_base64: FOTO });
    assert.equal((await foto(intruso)).status, 404);
    await estado('cancelada');
    assert.equal((await foto(cliente)).status, 409);
  });
});
