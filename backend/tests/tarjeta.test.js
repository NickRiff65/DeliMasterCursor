import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Tarjeta guardada (Webpay Oneclick): el cliente la registra al pagar la visita y paga el saldo sin
// volver a ingresarla; puede cambiarla o quitarla.
describe('Pago con tarjeta guardada (Webpay Oneclick)', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarPasarela;
  let n = 0;
  let cliente, prestador, solicitudId;
  const VOLVER = 'http://127.0.0.1:8081/solicitud/x';

  // Transbank simulado: inscripciones, cobros y devoluciones
  const tb = {
    inscripciones: [], cobros: [], devoluciones: [], eliminadas: [],
    async iniciarInscripcion({ usuario, email, urlRetorno }) {
      const token = `ins-${randomUUID()}`;
      tb.inscripciones.push({ token, usuario, email, urlRetorno });
      return { token, url: 'https://webpay3gint.transbank.cl/webpayserver/bp_multicode_inscription.cgi' };
    },
    async finalizarInscripcion(token) {
      if (tb.rechazarInscripcion) return { aprobada: false, respuesta: { response_code: -96 } };
      return { aprobada: true, tbkUser: `tbk-${token}`, tipo: 'Visa', ultimos4: tb.ultimos4 ?? '6623', respuesta: {} };
    },
    async eliminarInscripcion(datos) { tb.eliminadas.push(datos); },
    async cobrarTarjeta(datos) {
      tb.cobros.push(datos);
      return { autorizado: !tb.rechazarCobro, codigo: '1415', respuesta: { details: [{ status: tb.rechazarCobro ? 'FAILED' : 'AUTHORIZED' }] } };
    },
    async reembolsarTarjeta(datos) { tb.devoluciones.push(datos); return { type: 'REVERSED' }; },
    async crear() { return { token: `tok-${randomUUID()}`, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' }; },
    async confirmar() { throw new Error('no se usa'); },
    async reembolsar() { throw new Error('no se usa'); },
  };

  before(async () => {
    pool = await prepararBase();
    ({ usarPasarela } = await import('../src/modules/pagos/pasarela.js'));
    usarPasarela(tb);
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarPasarela(null); await pool.end(); });

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `t${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token, email: `t${n}@test.cl` };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const post = (u, ruta, cuerpo = {}) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}${ruta}`)).send(cuerpo);
  const pagar = (medio) => post(cliente, '/pago', { volver_a: VOLVER, medio }).set('Host', '127.0.0.1:3000');
  const ver = async () => (await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}`))).body.solicitud;
  const tarjeta = async () => (await como(cliente)(request(app).get('/api/pagos/tarjeta'))).body.tarjeta;
  const enHoras = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

  // Vuelve de Transbank después de registrar la tarjeta
  async function volverDeInscripcion(urlPago) {
    const token = decodeURIComponent(urlPago.split('/oneclick/ir/')[1]);
    const pagina = await request(app).get(`/api/pagos/oneclick/ir/${encodeURIComponent(token)}`);
    assert.match(pagina.text, /name="TBK_TOKEN" value="ins-/);
    const res = await request(app).post('/api/pagos/oneclick/retorno').type('form').send({ TBK_TOKEN: token });
    assert.equal(res.status, 303);
    return new URL(res.headers.location).searchParams.get('pago');
  }

  beforeEach(async () => {
    await limpiarBase(pool);
    Object.assign(tb, { inscripciones: [], cobros: [], devoluciones: [], eliminadas: [], rechazarInscripcion: false, rechazarCobro: false, ultimos4: null });
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Electricista');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    await pool.query("UPDATE prestadores SET hora_inicio = '00:00', hora_fin = '24:00' WHERE usuario_id = $1", [prestador.id]);
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto en Chillán' });
    await post(cliente, '/asignar', { prestador_id: prestador.id });
    await post(prestador, '/responder', {
      aceptar: true, modalidad: 'visita', tarifa_visita: 25_000, visita_programada_en: enHoras(5),
    });
  });

  test('guarda la tarjeta al pagar la visita y paga el saldo con ella sin volver a ingresarla', async () => {
    assert.equal(await tarjeta(), null);
    const inicio = await pagar('guardar_tarjeta');
    assert.equal(inicio.status, 201, JSON.stringify(inicio.body));
    assert.equal(inicio.body.monto, 25_000);
    assert.equal(tb.inscripciones[0].email, cliente.email);
    assert.equal(await volverDeInscripcion(inicio.body.url_pago), 'aprobado');

    // Tarjeta guardada: se muestra el tipo y los últimos 4 dígitos; el identificador va cifrado
    assert.deepEqual(await tarjeta(), { tipo: 'Visa', ultimos4: '6623', creada_en: (await tarjeta()).creada_en });
    const { rows: [fila] } = await pool.query('SELECT tbk_user FROM tarjetas WHERE usuario_id = $1', [cliente.id]);
    assert.equal(fila.tbk_user.includes('tbk-'), false);
    assert.equal(tb.cobros[0].tbkUser.startsWith('tbk-ins-'), true);
    assert.deepEqual([tb.cobros[0].monto, tb.cobros[0].usuario], [25_000, cliente.id]);
    assert.equal((await ver()).estado, 'visita_pagada');

    // Llegada, cotización y aceptación
    const { codigo_llegada: codigo } = await ver();
    await post(prestador, '/llegada', { codigo });
    await post(prestador, '/cotizacion', { mano_obra: 100_000, detalle: 'Poda completa y retiro de ramas' });
    await post(cliente, '/cotizacion/respuesta', { aceptar: true });

    // Segundo pago: con un toque, sin salir de la app
    const saldo = await pagar('tarjeta_guardada');
    assert.equal(saldo.status, 201, JSON.stringify(saldo.body));
    assert.deepEqual([saldo.body.resultado, saldo.body.concepto, saldo.body.monto], ['aprobado', 'saldo', 75_000]);
    assert.equal(saldo.body.url_pago, undefined);
    assert.equal(tb.cobros.length, 2);
    assert.equal((await ver()).estado, 'pagada');

    const { rows: pagos } = await pool.query(
      'SELECT concepto, medio, estado, orden_hija IS NOT NULL AS con_orden_hija FROM pagos WHERE solicitud_id = $1 ORDER BY creado_en', [solicitudId]);
    assert.deepEqual(pagos, [
      { concepto: 'visita', medio: 'oneclick', estado: 'autorizado', con_orden_hija: true },
      { concepto: 'saldo', medio: 'oneclick', estado: 'autorizado', con_orden_hija: true },
    ]);
    const { rows: [evento] } = await pool.query(
      "SELECT detalle FROM solicitud_eventos WHERE solicitud_id = $1 AND estado_nuevo = 'pagada'", [solicitudId]);
    assert.equal(evento.detalle, 'Tarjeta guardada · saldo · autorización 1415');
  });

  test('si la tarjeta guardada es rechazada, la solicitud sigue esperando el pago', async () => {
    await volverDeInscripcion((await pagar('guardar_tarjeta')).body.url_pago);
    await pool.query("UPDATE solicitudes SET estado = 'confirmada', precio_acordado = 100000 WHERE id = $1", [solicitudId]);
    tb.rechazarCobro = true;
    const res = await pagar('tarjeta_guardada');
    assert.equal(res.body.resultado, 'rechazado');
    assert.equal((await ver()).estado, 'confirmada');
    const { rows: [p] } = await pool.query("SELECT estado FROM pagos WHERE concepto = 'saldo'");
    assert.equal(p.estado, 'rechazado');
  });

  test('si el cliente anula el registro de la tarjeta, no se guarda ni se cobra', async () => {
    tb.rechazarInscripcion = true;
    assert.equal(await volverDeInscripcion((await pagar('guardar_tarjeta')).body.url_pago), 'cancelado');
    assert.equal(await tarjeta(), null);
    assert.equal(tb.cobros.length, 0);
    assert.equal((await ver()).estado, 'visita_por_pagar');
  });

  test('sin tarjeta guardada no se puede pagar con ella; repetir el retorno no cobra dos veces', async () => {
    const sin = await pagar('tarjeta_guardada');
    assert.equal(sin.status, 409);
    assert.equal(sin.body.error.codigo, 'SIN_TARJETA');

    const { url_pago: url } = (await pagar('guardar_tarjeta')).body;
    await volverDeInscripcion(url);
    const token = decodeURIComponent(url.split('/oneclick/ir/')[1]);
    const otraVez = await request(app).post('/api/pagos/oneclick/retorno').type('form').send({ TBK_TOKEN: token });
    assert.equal(new URL(otraVez.headers.location).searchParams.get('pago'), 'procesado');
    assert.equal(tb.cobros.length, 1);
  });

  test('cambiar la tarjeta reemplaza la anterior (también en Transbank) y quitarla la elimina', async () => {
    await volverDeInscripcion((await pagar('guardar_tarjeta')).body.url_pago);
    // Desde Mi cuenta, sin pagar nada
    tb.ultimos4 = '0568';
    const cambio = await como(cliente)(request(app).post('/api/pagos/tarjeta')).set('Host', '127.0.0.1:3000').send({ volver_a: VOLVER });
    assert.equal(cambio.status, 201);
    assert.equal(await volverDeInscripcion(cambio.body.url_pago), 'tarjeta_guardada');
    assert.equal((await tarjeta()).ultimos4, '0568');
    assert.equal(tb.eliminadas.length, 1);                     // la anterior
    assert.equal(tb.eliminadas[0].usuario, cliente.id);

    const quitar = await como(cliente)(request(app).delete('/api/pagos/tarjeta'));
    assert.deepEqual(quitar.body, { tarjeta: null });
    assert.equal(await tarjeta(), null);
    assert.equal(tb.eliminadas.length, 2);
    // Un maestro no tiene tarjeta guardada
    assert.equal((await como(prestador)(request(app).get('/api/pagos/tarjeta'))).status, 403);
  });

  test('una visita pagada con la tarjeta guardada se devuelve por Oneclick si el maestro no llega', async () => {
    await volverDeInscripcion((await pagar('guardar_tarjeta')).body.url_pago);
    await pool.query("UPDATE solicitudes SET visita_programada_en = now() - interval '1 hour' WHERE id = $1", [solicitudId]);
    const res = await post(cliente, '/no-llego');
    assert.equal(res.body.solicitud.estado, 'cancelada');
    const { rows: [p] } = await pool.query("SELECT orden_compra, orden_hija FROM pagos WHERE concepto = 'visita'");
    assert.deepEqual(tb.devoluciones, [{ ordenCompra: p.orden_compra, ordenHija: p.orden_hija, monto: 25_000 }]);
  });
});
