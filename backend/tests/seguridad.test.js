// Pruebas de seguridad según OWASP API Security Top 10 (2023).
// Cada prueba intenta un ataque concreto y comprueba que la API lo rechaza.
import { describe, test, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { io as clienteSocket } from 'socket.io-client';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('Seguridad · OWASP API Top 10', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, servidor, url, iniciarSocket, cerrarSocket, firmarToken;
  let n = 0;
  let cliente, otroCliente, prestador, otroPrestador, solicitudId;
  const sockets = [];

  before(async () => {
    pool = await prepararBase();
    ({ iniciarSocket, cerrarSocket } = await import('../src/socket.js'));
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
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
      .send({ rol, ...partirNombre(nombre), email: `s${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán', telefono: '+56987654321' });
    return { id: body.usuario.id, token: body.token, email: `s${n}@test.cl` };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const conToken = (token) => (req) => req.set('Authorization', `Bearer ${token}`);

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    otroCliente = await registrar('cliente', 'Intrusa');
    prestador = await registrar('prestador', 'Luis Poda');
    otroPrestador = await registrar('prestador', 'Pedro Poda');
    for (const p of [prestador, otroPrestador]) {
      await como(p)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    }
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
  });

  // ------------------------------------------------------------------ API1: autorización por objeto (BOLA)
  test('API1 · nadie ajeno puede ver ni actuar sobre una solicitud', async () => {
    const intentos = [
      ['get', `/api/solicitudes/${solicitudId}`, null],
      ['get', `/api/solicitudes/${solicitudId}/mensajes`, null],
      ['post', `/api/solicitudes/${solicitudId}/mensajes`, { contenido: 'hola' }],
      ['post', `/api/solicitudes/${solicitudId}/cancelar`, {}],
      ['post', `/api/solicitudes/${solicitudId}/asignar`, { prestador_id: otroPrestador.id }],
      ['post', `/api/solicitudes/${solicitudId}/pago`, { volver_a: 'http://127.0.0.1/x' }],
      ['post', `/api/solicitudes/${solicitudId}/cerrar`, {}],
      ['post', `/api/solicitudes/${solicitudId}/reportar`, { motivo: 'Intento de reporte ajeno' }],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      const res = await como(otroCliente)(request(app)[metodo](ruta)).send(cuerpo ?? undefined);
      assert.ok([403, 404].includes(res.status), `${metodo} ${ruta} respondió ${res.status}`);
    }
    // Un prestador que no es el asignado tampoco puede responder, ver gastos ni terminar
    for (const [metodo, ruta, cuerpo] of [
      ['post', `/api/solicitudes/${solicitudId}/responder`, { aceptar: true, precio: 50000 }],
      ['get', `/api/solicitudes/${solicitudId}/gastos`, null],
      ['post', `/api/solicitudes/${solicitudId}/finalizar`, {}],
    ]) {
      const res = await como(otroPrestador)(request(app)[metodo](ruta)).send(cuerpo ?? undefined);
      assert.ok([403, 404, 409].includes(res.status), `${metodo} ${ruta} respondió ${res.status}`);
    }
    // Y la solicitud sigue intacta
    const { rows: [s] } = await pool.query('SELECT estado, prestador_id FROM solicitudes WHERE id = $1', [solicitudId]);
    assert.equal(s.estado, 'asignada');
    assert.equal(s.prestador_id, prestador.id);
  });

  test('API1 · un prestador no puede borrar ni ver gastos ajenos', async () => {
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 50000 });
    const { body } = await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/gastos`)).send({ monto: 12000 });
    const gastoId = body.gastos[0].id;
    assert.equal((await como(otroPrestador)(request(app).delete(`/api/gastos/${gastoId}`))).status, 404);
    const { rowCount } = await pool.query('SELECT 1 FROM gastos WHERE id = $1', [gastoId]);
    assert.equal(rowCount, 1);
  });

  test('API1 · quien rechaza una solicitud deja de recibir el chat en tiempo real', async () => {
    const socketPrestador = clienteSocket(url, { auth: { token: prestador.token }, transports: ['websocket'], forceNew: true });
    sockets.push(socketPrestador);
    assert.deepEqual(await new Promise((r) => socketPrestador.emit('unirse', solicitudId, r)), { ok: true });

    // Rechaza; el cliente elige a otro prestador y le escribe
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: false });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: otroPrestador.id });
    const llega = new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 800);
      socketPrestador.once('mensaje', (m) => { clearTimeout(t); resolve(m); });
    });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/mensajes`)).send({ contenido: 'Hola Pedro, ¿puedes el sábado?' });
    assert.equal(await llega, null);
    // Y no puede volver a unirse
    assert.deepEqual(await new Promise((r) => socketPrestador.emit('unirse', solicitudId, r)), { ok: false });
  });

  test('API1 · la foto de una boleta no se entrega sin un enlace firmado válido', async () => {
    const res = await request(app).get(`/api/boletas/${randomUUID()}/imagen?vence=9999999999&firma=${'0'.repeat(64)}`);
    assert.equal(res.status, 403);
  });

  // ------------------------------------------------------------------ API2: autenticación
  test('API2 · se rechazan tokens alterados, sin firma o vencidos', async () => {
    const [h, p] = cliente.token.split('.');
    const sinFirma = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    const conRolAdmin = `${h}.${Buffer.from(JSON.stringify({ ...jwt.decode(cliente.token), rol: 'admin' })).toString('base64url')}.${cliente.token.split('.')[2]}`;
    const vencido = jwt.sign({ rol: 'cliente' }, process.env.JWT_SECRET ?? 'secreto-de-pruebas', { subject: cliente.id, expiresIn: -10 });
    const otraClave = jwt.sign({ rol: 'admin' }, 'una-clave-adivinada', { subject: cliente.id });
    for (const token of [sinFirma, conRolAdmin, vencido, otraClave]) {
      const res = await conToken(token)(request(app).get('/api/auth/yo'));
      assert.equal(res.status, 401);
    }
    assert.equal((await conToken(otraClave)(request(app).get('/api/admin/resumen'))).status, 401);
  });

  test('API2 · el rol sale de la base de datos, no del token', async () => {
    // Un token válido emitido cuando era prestador no sirve como prestador si su rol ya no lo es
    await pool.query("UPDATE usuarios SET rol = 'cliente' WHERE id = $1", [otroPrestador.id]);
    assert.equal((await como(otroPrestador)(request(app).get('/api/prestadores/yo'))).status, 403);
  });

  test('API2 · la sesión de administración vence en 8 horas, la de las apps en 7 días', async () => {
    const admin = jwt.decode(firmarToken({ id: randomUUID(), rol: 'admin' }));
    assert.equal(admin.exp - admin.iat, 8 * 3600);
    const app_ = jwt.decode(cliente.token);
    assert.equal(app_.exp - app_.iat, 7 * 24 * 3600);
  });

  test('API2 · el inicio de sesión no revela si el correo existe', async () => {
    const existe = await request(app).post('/api/auth/login').send({ email: cliente.email, password: 'incorrecta1' });
    const noExiste = await request(app).post('/api/auth/login').send({ email: 'nadie@test.cl', password: 'incorrecta1' });
    assert.equal(existe.status, 401);
    assert.equal(noExiste.status, 401);
    assert.deepEqual(existe.body, noExiste.body);
  });

  // ------------------------------------------------------------------ API3: propiedades (asignación masiva y exposición)
  test('API3 · no se puede autoasignar el rol de administrador ni campos internos', async () => {
    const admin = await request(app).post('/api/auth/registro')
      .send({ rol: 'admin', nombre: 'Hacker', email: 'h@test.cl', password: 'clave1234', acepta_terminos: true });
    assert.equal(admin.status, 422);

    const extra = await request(app).post('/api/auth/registro')
      .send({ rol: 'cliente', nombre: 'Colado', apellido: 'Prueba', email: 'x@test.cl', password: 'clave1234', acepta_terminos: true, activo: false, id: randomUUID() });
    assert.equal(extra.status, 201);
    assert.equal(extra.body.usuario.rol, 'cliente');

    // La reputación no se puede editar desde la ficha
    await como(prestador)(request(app).put('/api/prestadores/yo'))
      .send({ descripcion: 'Soy el mejor', calificacion_promedio: 5, total_resenas: 999, trabajos_cerrados: 999 });
    const { rows: [p] } = await pool.query('SELECT calificacion_promedio, total_resenas FROM prestadores WHERE usuario_id = $1', [prestador.id]);
    assert.equal(Number(p.calificacion_promedio), 0);
    assert.equal(p.total_resenas, 0);
  });

  test('API3 · las respuestas no exponen contraseñas ni contactos de la contraparte', async () => {
    const respuestas = [
      await request(app).post('/api/auth/login').send({ email: cliente.email, password: 'clave1234', acepta_terminos: true }),
      await request(app).get(`/api/prestadores/${prestador.id}`),
      await request(app).get('/api/prestadores?categoria=poda-altura'),
      await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}`)),
      await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}`)),
    ];
    for (const res of respuestas) {
      const texto = JSON.stringify(res.body);
      assert.doesNotMatch(texto, /password|\$2[aby]\$/);
    }
    // La contraparte no ve teléfono ni correo
    for (const res of respuestas.slice(1)) {
      const texto = JSON.stringify(res.body);
      assert.doesNotMatch(texto, /987654321/);
      assert.doesNotMatch(texto, /@test\.cl/);
    }
  });

  // ------------------------------------------------------------------ API5: autorización por función
  test('API5 · cada rol solo usa sus funciones', async () => {
    assert.equal((await como(prestador)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: randomUUID(), descripcion: 'Necesito podar un árbol' })).status, 403);
    assert.equal((await como(cliente)(request(app).get('/api/prestadores/yo/finanzas'))).status, 403);
    assert.equal((await como(cliente)(request(app).put('/api/prestadores/yo/datos-pago')).send({})).status, 403);
    assert.equal((await como(prestador)(request(app).get('/api/admin/verificaciones'))).status, 403);
    assert.equal((await como(cliente)(request(app).post(`/api/admin/disputas/${solicitudId}/resolver`))
      .send({ decision: 'reembolsar', observacion: 'Intento de un cliente' })).status, 403);
  });

  // ------------------------------------------------------------------ API8: configuración
  test('API8 · cabeceras de seguridad y errores sin detalles internos', async () => {
    const res = await request(app).get('/api/salud');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.ok(res.headers['strict-transport-security']);
    assert.ok(res.headers['content-security-policy']);

    const malJson = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    assert.equal(malJson.status, 400);
    assert.doesNotMatch(JSON.stringify(malJson.body), /at |node_modules|SyntaxError/);
  });

  test('API8 · el servidor no arranca con un JWT_SECRET débil', () => {
    const probar = (secreto) => {
      try {
        execFileSync(process.execPath, ['-e', "import('./src/config/env.js')"], {
          env: { ...process.env, NODE_ENV: 'development', JWT_SECRET: secreto }, stdio: 'pipe',
        });
        return 'arranca';
      } catch (e) {
        return String(e.stderr);
      }
    };
    assert.match(probar('corto'), /al menos 32 caracteres/);
    assert.match(probar('CAMBIAR_POR_UN_SECRETO_LARGO_Y_ALEATORIO_123456'), /al menos 32 caracteres/);
    assert.equal(probar('k'.repeat(16) + randomUUID()), 'arranca');
  });
});
