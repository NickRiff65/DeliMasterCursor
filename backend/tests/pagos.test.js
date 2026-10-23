import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('HU-03 · Pago en garantía con Webpay', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarPasarela;
  let n = 0;
  let cliente, otroCliente, prestador, solicitudId;

  // Pasarela simulada: se comporta como Transbank según lo que cada prueba configure
  const simulada = {
    respuesta: null,          // lo que devolverá confirmar()
    reembolsos: [],
    async crear({ ordenCompra, monto }) {
      simulada.ultima = { ordenCompra, monto };
      return { token: `tok-${randomUUID()}`, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' };
    },
    async confirmar() { return simulada.respuesta; },
    async reembolsar(token, monto) { simulada.reembolsos.push({ token, monto }); return { type: 'REVERSED' }; },
  };
  const aprobado = () => ({
    response_code: 0, status: 'AUTHORIZED', amount: simulada.ultima.monto,
    buy_order: simulada.ultima.ordenCompra, authorization_code: '1213',
  });

  before(async () => {
    pool = await prepararBase();
    ({ usarPasarela } = await import('../src/modules/pagos/pasarela.js'));
    usarPasarela(simulada);
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarPasarela(null); await pool.end(); });

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `p${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const VOLVER = 'http://127.0.0.1:8081/solicitud/x';
  const iniciar = (u = cliente, volver_a = VOLVER) =>
    como(u)(request(app).post(`/api/solicitudes/${solicitudId}/pago`)).set('Host', '127.0.0.1:3000').send({ volver_a });
  const tokenDe = (r) => decodeURIComponent(r.body.url_pago.split('/ir/')[1]);
  const consultar = async (sql) => (await pool.query(sql, [solicitudId])).rows;

  beforeEach(async () => {
    await limpiarBase(pool);
    simulada.reembolsos = [];
    cliente = await registrar('cliente', 'Ana Pérez');
    otroCliente = await registrar('cliente', 'Otro');
    prestador = await registrar('prestador', 'Luis Poda');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 45000 });
  });

  test('inicia el pago por el precio aceptado y entrega la página que lleva a Webpay', async () => {
    const res = await iniciar();
    assert.equal(res.status, 201);
    assert.equal(res.body.monto, 45000);
    assert.equal(simulada.ultima.monto, 45000);     // el monto lo decide el servidor
    const [pago] = await consultar('SELECT estado, monto FROM pagos WHERE solicitud_id = $1');
    assert.deepEqual(pago, { estado: 'iniciado', monto: 45000 });

    const pagina = await request(app).get(new URL(res.body.url_pago).pathname);
    assert.equal(pagina.status, 200);
    assert.match(pagina.text, /name="token_ws" value="tok-/);
    assert.match(pagina.headers['content-security-policy'], /form-action https:\/\/webpay3gint\.transbank\.cl/);
  });

  test('no se puede pagar una solicitud ajena, sin aceptar, ni volver a un sitio externo', async () => {
    assert.equal((await iniciar(otroCliente)).status, 404);
    const externo = await iniciar(cliente, 'https://sitio-falso.com/robar');
    assert.equal(externo.status, 422);
    assert.equal(externo.body.error.codigo, 'RETORNO_NO_PERMITIDO');
    await pool.query("UPDATE solicitudes SET estado = 'asignada', precio_acordado = NULL WHERE id = $1", [solicitudId]);
    assert.equal((await iniciar()).status, 409);
  });

  test('pago aprobado: solicitud pagada y monto retenido en el ledger con la comisión separada', async () => {
    const token = tokenDe(await iniciar());
    simulada.respuesta = aprobado();
    const res = await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, `${VOLVER}?pago=aprobado`);

    const [s] = await consultar('SELECT estado FROM solicitudes WHERE id = $1');
    assert.equal(s.estado, 'pagada');
    const [mov] = await consultar('SELECT monto_bruto, comision, monto_neto, estado, prestador_id FROM ledger_movimientos WHERE solicitud_id = $1');
    assert.deepEqual({ ...mov, prestador_id: undefined },
      { monto_bruto: 45000, comision: 5400, monto_neto: 39600, estado: 'retenido', prestador_id: undefined });
    assert.equal(mov.prestador_id, prestador.id);
    const eventos = await pool.query('SELECT estado_nuevo, monto FROM ledger_eventos');
    assert.deepEqual(eventos.rows, [{ estado_nuevo: 'retenido', monto: 45000 }]);
  });

  test('si el navegador repite el retorno, no se duplica el pago ni el ledger', async () => {
    const token = tokenDe(await iniciar());
    simulada.respuesta = aprobado();
    await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    const otra = await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    assert.match(otra.headers.location, /pago=aprobado/);
    assert.equal((await consultar('SELECT 1 FROM ledger_movimientos WHERE solicitud_id = $1')).length, 1);
  });

  test('pago rechazado por el banco: la solicitud sigue esperando el pago', async () => {
    const token = tokenDe(await iniciar());
    simulada.respuesta = { ...aprobado(), response_code: -1, status: 'FAILED' };
    const res = await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    assert.match(res.headers.location, /pago=rechazado/);
    assert.equal((await consultar('SELECT estado FROM solicitudes WHERE id = $1'))[0].estado, 'confirmada');
    assert.equal((await consultar('SELECT estado FROM pagos WHERE solicitud_id = $1'))[0].estado, 'rechazado');
    // puede volver a intentarlo
    assert.equal((await iniciar()).status, 201);
  });

  test('no acepta una confirmación por un monto distinto al cobrado', async () => {
    const token = tokenDe(await iniciar());
    simulada.respuesta = { ...aprobado(), amount: 100 };
    const res = await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    assert.match(res.headers.location, /pago=rechazado/);
    assert.equal((await consultar('SELECT 1 FROM ledger_movimientos WHERE solicitud_id = $1')).length, 0);
  });

  test('el cliente anula en Webpay o se agota el tiempo: el pago queda anulado', async () => {
    const token = tokenDe(await iniciar());
    const anulado = await request(app).post('/api/pagos/webpay/retorno').type('form')
      .send({ TBK_TOKEN: token, TBK_ORDEN_COMPRA: simulada.ultima.ordenCompra, TBK_ID_SESION: solicitudId });
    assert.match(anulado.headers.location, /pago=cancelado/);

    await iniciar();
    const tiempo = await request(app).post('/api/pagos/webpay/retorno').type('form')
      .send({ TBK_ORDEN_COMPRA: simulada.ultima.ordenCompra, TBK_ID_SESION: solicitudId });
    assert.match(tiempo.headers.location, /pago=cancelado/);
    const estados = (await consultar('SELECT estado FROM pagos WHERE solicitud_id = $1 ORDER BY creado_en')).map((p) => p.estado);
    assert.deepEqual(estados, ['anulado', 'anulado']);
  });

  test('si la solicitud se canceló mientras pagaba, se devuelve el dinero', async () => {
    const token = tokenDe(await iniciar());
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/cancelar`)).send({});
    simulada.respuesta = aprobado();
    await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    assert.deepEqual(simulada.reembolsos, [{ token, monto: 45000 }]);
    assert.equal((await consultar('SELECT 1 FROM ledger_movimientos WHERE solicitud_id = $1')).length, 0);
  });

  test('al reintentar el pago, el intento abandonado queda anulado', async () => {
    const primero = tokenDe(await iniciar());
    await iniciar();
    const pagos = await consultar('SELECT token_webpay, estado FROM pagos WHERE solicitud_id = $1 ORDER BY creado_en');
    assert.deepEqual(pagos.map((p) => p.estado), ['anulado', 'iniciado']);
    // si el primer intento volviera desde Webpay, no se confirma
    simulada.respuesta = aprobado();
    const tarde = await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: primero });
    assert.match(tarde.headers.location, /pago=rechazado/);
    assert.equal((await consultar('SELECT 1 FROM ledger_movimientos WHERE solicitud_id = $1')).length, 0);
  });

  test('una solicitud pagada ya no se puede cancelar ni volver a pagar', async () => {
    const token = tokenDe(await iniciar());
    simulada.respuesta = aprobado();
    await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    assert.equal((await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/cancelar`)).send({})).status, 409);
    const otra = await iniciar();
    assert.equal(otra.status, 409);
    assert.match(otra.body.error.mensaje, /ya está pagada/);
  });
});
