import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Modalidad "visita + cotización": el cliente paga la visita, el prestador la recibe al llegar
// (código de llegada), cotiza en la app y, si el cliente acepta, se paga el saldo con garantía.
describe('Visita de diagnóstico y cotización en la app', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarPasarela;
  let n = 0;
  let cliente, prestador, intruso, solicitudId;

  const simulada = {
    reembolsos: [],
    async crear({ ordenCompra, monto }) {
      simulada.ultima = { ordenCompra, monto };
      return { token: `tok-${randomUUID()}`, url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' };
    },
    async confirmar() {
      return { response_code: 0, status: 'AUTHORIZED', amount: simulada.ultima.monto, buy_order: simulada.ultima.ordenCompra, authorization_code: '1213' };
    },
    async reembolsar(token, monto) { simulada.reembolsos.push({ token, monto }); return { type: 'REVERSED' }; },
  };

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
      .send({ rol, ...partirNombre(nombre), email: `v${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const post = (u, ruta, cuerpo = {}) => como(u)(request(app).post(`/api/solicitudes/${solicitudId}${ruta}`)).send(cuerpo);
  const ver = async (u = cliente) => (await como(u)(request(app).get(`/api/solicitudes/${solicitudId}`))).body.solicitud;
  const enHoras = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
  const ledger = async () => (await pool.query(
    'SELECT concepto, estado, monto_bruto, comision, monto_neto FROM ledger_movimientos WHERE solicitud_id = $1 ORDER BY creado_en',
    [solicitudId])).rows;

  // Paga lo que corresponda (visita o saldo) pasando por la Webpay simulada
  async function pagar() {
    const inicio = await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/pago`))
      .set('Host', '127.0.0.1:3000').send({ volver_a: 'http://127.0.0.1:8081/solicitud/x' });
    assert.equal(inicio.status, 201, JSON.stringify(inicio.body));
    const token = decodeURIComponent(inicio.body.url_pago.split('/ir/')[1]);
    await request(app).post('/api/pagos/webpay/retorno').type('form').send({ token_ws: token });
    return inicio.body;
  }

  const aceptarConVisita = (cuerpo = {}) => post(prestador, '/responder', {
    aceptar: true, modalidad: 'visita', tarifa_visita: 25_000, visita_programada_en: enHoras(5), ...cuerpo,
  });

  // Lleva la solicitud hasta "en diagnóstico": visita aceptada, pagada y llegada confirmada
  async function hastaDiagnostico() {
    await aceptarConVisita();
    await pagar();
    const { codigo_llegada } = await ver();
    const llegada = await post(prestador, '/llegada', { codigo: codigo_llegada });
    assert.equal(llegada.status, 200, JSON.stringify(llegada.body));
  }

  beforeEach(async () => {
    await limpiarBase(pool);
    simulada.reembolsos = [];
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Electricista');
    intruso = await registrar('prestador', 'Otro Prestador');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    // Para que las pruebas no dependan de la hora en que se ejecutan, este maestro atiende las 24 horas
    // (en la app el horario se elige desde las 08:00)
    await pool.query("UPDATE prestadores SET hora_inicio = '00:00', hora_fin = '24:00' WHERE usuario_id = $1", [prestador.id]);
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar un árbol alto en Chillán' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
  });

  test('el prestador ve el rango de la visita y acepta con tarifa y fecha dentro de lo permitido', async () => {
    assert.deepEqual((await ver(prestador)).rango_visita, { min: 15_000, max: 35_000, zona: 'urbana' });

    const cara = await aceptarConVisita({ tarifa_visita: 80_000 });
    assert.equal(cara.status, 422);
    assert.match(cara.body.error.campos.tarifa_visita, /entre \$15\.000 y \$35\.000/);
    const pasada = await aceptarConVisita({ visita_programada_en: enHoras(-1) });
    assert.equal(pasada.status, 422);
    assert.ok(pasada.body.error.campos.visita_programada_en);
    assert.equal((await post(prestador, '/responder', { aceptar: true, modalidad: 'visita' })).status, 422);

    const ok = await aceptarConVisita();
    assert.equal(ok.status, 200);
    assert.equal(ok.body.solicitud.estado, 'visita_por_pagar');
    assert.equal(ok.body.solicitud.modalidad, 'visita');
    assert.equal(ok.body.solicitud.tarifa_visita, 25_000);
  });

  test('la visita se agenda dentro de los días y horas de atención del maestro (hora de Chile)', async () => {
    // Pasado mañana, a las 03:00 y a las 10:00 de Chile
    const pasadoManana = (horas) => pool.query(
      `SELECT (date_trunc('day', now() AT TIME ZONE 'America/Santiago') + interval '2 days' + make_interval(hours => $1))
                AT TIME ZONE 'America/Santiago' AS t`, [horas]).then((r) => r.rows[0].t.toISOString());
    const horario = (sql) => pool.query(`UPDATE prestadores SET ${sql} WHERE usuario_id = $1`, [prestador.id]);
    await horario("hora_inicio = '08:00', hora_fin = '12:00'");

    const madrugada = await aceptarConVisita({ visita_programada_en: await pasadoManana(3) });
    assert.equal(madrugada.status, 422);
    assert.match(madrugada.body.error.campos.visita_programada_en, /dentro de tu horario de atención/);
    assert.equal((await aceptarConVisita({ visita_programada_en: await pasadoManana(12) })).status, 422);   // ya terminó

    // Ese día no atiende
    await horario(`dias_atencion = (SELECT array_agg(d)::smallint[] FROM generate_series(1, 7) d
                     WHERE d <> EXTRACT(ISODOW FROM now() AT TIME ZONE 'America/Santiago' + interval '2 days'))`);
    assert.equal((await aceptarConVisita({ visita_programada_en: await pasadoManana(10) })).status, 422);

    await horario("dias_atencion = '{1,2,3,4,5,6,7}'");
    const ok = await aceptarConVisita({ visita_programada_en: await pasadoManana(10) });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test('pagar la visita la deja retenida y entrega un código que solo ve el cliente', async () => {
    await aceptarConVisita();
    const pago = await pagar();
    assert.deepEqual([pago.concepto, pago.monto], ['visita', 25_000]);

    const delCliente = await ver(cliente);
    assert.equal(delCliente.estado, 'visita_pagada');
    assert.match(delCliente.codigo_llegada, /^[0-9]{4}$/);
    assert.equal(delCliente.estado_visita, 'retenido');
    assert.equal((await ver(prestador)).codigo_llegada, undefined);   // el prestador no lo puede ver

    assert.deepEqual(await ledger(), [{ concepto: 'visita', estado: 'retenido', monto_bruto: 25_000, comision: 3000, monto_neto: 22_000 }]);
  });

  test('con el código correcto la visita se libera al prestador; con códigos incorrectos se bloquea a los 5 intentos', async () => {
    await aceptarConVisita();
    await pagar();
    const { codigo_llegada: codigo } = await ver();
    const otro = codigo === '0000' ? '1111' : '0000';

    assert.equal((await post(intruso, '/llegada', { codigo })).status, 404);
    const malo = await post(prestador, '/llegada', { codigo: otro });
    assert.equal(malo.status, 422);
    assert.match(malo.body.error.campos.codigo, /quedan 4 intentos/);

    const bien = await post(prestador, '/llegada', { codigo });
    assert.equal(bien.body.solicitud.estado, 'en_diagnostico');
    assert.ok(bien.body.solicitud.llegada_en);
    assert.equal((await ledger())[0].estado, 'liberado');
  });

  test('si el cliente marcó el lugar, la llegada exige estar a menos de 1.500 m', async () => {
    await aceptarConVisita();
    await pagar();
    await pool.query('UPDATE solicitudes SET latitud = $2, longitud = $3 WHERE id = $1', [solicitudId, -36.6066, -72.1034]);
    const { codigo_llegada: codigo } = await ver();

    const sinGps = await post(prestador, '/llegada', { codigo });
    assert.equal(sinGps.status, 422);
    assert.match(sinGps.body.error.campos.latitud, /Comparte tu ubicación/);

    const lejos = await post(prestador, '/llegada', { codigo, latitud: -36.63, longitud: -72.1034 });
    assert.equal(lejos.status, 422);
    assert.match(lejos.body.error.campos.latitud, /1\.500 m/);
    assert.equal((await ver()).estado, 'visita_pagada');

    const cerca = await post(prestador, '/llegada', { codigo, latitud: -36.6066, longitud: -72.1034 });
    assert.equal(cerca.status, 200, JSON.stringify(cerca.body));
    assert.equal(cerca.body.solicitud.llegada_distancia_m, 0);
    assert.equal(cerca.body.solicitud.estado, 'en_diagnostico');
  });

  test('tras 5 códigos incorrectos ya no se puede confirmar la llegada', async () => {
    await aceptarConVisita();
    await pagar();
    const { codigo_llegada: codigo } = await ver();
    const otro = codigo === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) await post(prestador, '/llegada', { codigo: otro });
    const bloqueado = await post(prestador, '/llegada', { codigo });
    assert.equal(bloqueado.status, 429);
    assert.equal(bloqueado.body.error.codigo, 'CODIGO_BLOQUEADO');
  });

  test('cotización aceptada: el cliente paga el saldo y la comisión queda sobre el total', async () => {
    await hastaDiagnostico();
    const corta = await post(prestador, '/cotizacion', { mano_obra: 10_000, detalle: 'Poda de dos ramas grandes' });
    assert.equal(corta.status, 422);   // menos que la visita ya pagada
    const q = await post(prestador, '/cotizacion', { mano_obra: 100_000, materiales: 20_000, detalle: 'Poda completa y retiro de ramas' });
    assert.equal(q.status, 201);
    assert.equal(q.body.solicitud.estado, 'cotizada');
    assert.equal(q.body.solicitud.cotizacion.total, 120_000);

    const acepta = await post(cliente, '/cotizacion/respuesta', { aceptar: true });
    assert.equal(acepta.body.solicitud.estado, 'confirmada');
    assert.equal(acepta.body.solicitud.precio_acordado, 120_000);
    assert.equal(acepta.body.solicitud.monto_por_pagar, 95_000);   // total − visita

    // Con la visita pagada y el saldo pendiente, el panel del maestro estima sobre el total (no solo la visita)
    const gastos = (await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}/gastos`))).body.resumen;
    assert.deepEqual(gastos, {
      precio: 120_000, comision: 3_000 + Math.round(95_000 * 0.12), reembolsado: 0, ingreso_neto: 120_000 - 3_000 - Math.round(95_000 * 0.12),
      gastos: 0, gastos_rechazados: 0, ganancia_neta: 120_000 - 3_000 - Math.round(95_000 * 0.12), ingreso_confirmado: false,
    });

    const saldo = await pagar();
    assert.deepEqual([saldo.concepto, saldo.monto], ['saldo', 95_000]);
    assert.equal((await ver()).estado, 'pagada');

    // Terminar y cerrar libera el saldo; la visita ya estaba liberada desde la llegada
    await post(prestador, '/finalizar');
    await post(cliente, '/cerrar');
    const movs = await ledger();
    assert.deepEqual(movs.map((m) => [m.concepto, m.estado]), [['visita', 'liberado'], ['saldo', 'liberado']]);
    const comision = movs.reduce((t, m) => t + m.comision, 0);
    assert.equal(comision, Math.round(120_000 * 0.12));            // 12 % del total del trabajo
    assert.equal((await ver(prestador)).monto_neto, 120_000 - comision);
  });

  test('el maestro corrige la cotización antes de que el cliente responda; el cliente no acepta una que no vio', async () => {
    await hastaDiagnostico();
    const primera = await post(prestador, '/cotizacion', { mano_obra: 100_000, detalle: 'Poda completa y retiro de ramas' });
    const vista = primera.body.solicitud.cotizacion;
    assert.equal(vista.total_anterior, null);

    const corregida = await post(prestador, '/cotizacion', { mano_obra: 80_000, materiales: 10_000, detalle: 'Poda completa (sin retiro de ramas)' });
    assert.equal(corregida.status, 201, JSON.stringify(corregida.body));
    assert.equal(corregida.body.solicitud.estado, 'cotizada');
    assert.equal(corregida.body.solicitud.cotizacion.total, 90_000);
    assert.equal(corregida.body.solicitud.cotizacion.total_anterior, 100_000);
    const { rows: versiones } = await pool.query('SELECT total, estado FROM cotizaciones WHERE solicitud_id = $1 ORDER BY creado_en', [solicitudId]);
    assert.deepEqual(versiones, [{ total: 100_000, estado: 'reemplazada' }, { total: 90_000, estado: 'pendiente' }]);

    // El cliente tenía en pantalla la primera: se le avisa del cambio y no se acepta a ciegas
    const aCiegas = await post(cliente, '/cotizacion/respuesta', { aceptar: true, cotizacion_id: vista.id });
    assert.equal(aCiegas.status, 409);
    assert.equal(aCiegas.body.error.codigo, 'COTIZACION_CAMBIO');
    assert.match(aCiegas.body.error.mensaje, /ahora es de \$90\.000/);

    const acepta = await post(cliente, '/cotizacion/respuesta', { aceptar: true, cotizacion_id: corregida.body.solicitud.cotizacion.id });
    assert.equal(acepta.body.solicitud.estado, 'confirmada');
    assert.equal(acepta.body.solicitud.precio_acordado, 90_000);
    // Ya aceptada, no se puede corregir
    const tarde = await post(prestador, '/cotizacion', { mano_obra: 150_000, detalle: 'Ahora cobro más por el trabajo' });
    assert.equal(tarde.status, 409);
    assert.match(tarde.body.error.mensaje, /ya aceptó la cotización/);
  });

  test('si el cliente rechaza la cotización, termina y el prestador conserva la visita', async () => {
    await hastaDiagnostico();
    await post(prestador, '/cotizacion', { mano_obra: 200_000, detalle: 'Poda completa con grúa' });
    const rechaza = await post(cliente, '/cotizacion/respuesta', { aceptar: false });
    assert.equal(rechaza.body.solicitud.estado, 'cancelada');
    assert.equal(rechaza.body.solicitud.cotizacion.estado, 'rechazada');
    assert.deepEqual((await ledger()).map((m) => [m.concepto, m.estado]), [['visita', 'liberado']]);
    assert.equal(simulada.reembolsos.length, 0);

    // El ingreso de la visita aparece en el panel contable del prestador
    const mes = new Date().toISOString().slice(0, 7);
    const finanzas = await como(prestador)(request(app).get(`/api/prestadores/yo/finanzas?mes=${mes}`));
    assert.equal(finanzas.body.totales.ingreso_neto, 22_000);
  });

  test('si la visita cubre el total, al aceptar no hay saldo que pagar', async () => {
    await hastaDiagnostico();
    await post(prestador, '/cotizacion', { mano_obra: 25_000, detalle: 'Era solo un ajuste menor' });
    const acepta = await post(cliente, '/cotizacion/respuesta', { aceptar: true });
    assert.equal(acepta.body.solicitud.estado, 'pagada');
  });

  test('si el prestador no llega, pasada la tolerancia el cliente recupera la visita', async () => {
    await aceptarConVisita({ visita_programada_en: enHoras(5) });
    await pagar();
    const antes = await post(cliente, '/no-llego');
    assert.equal(antes.status, 409);
    assert.equal(antes.body.error.codigo, 'AUN_EN_PLAZO');

    // La hora de la visita ya pasó hace una hora
    await pool.query("UPDATE solicitudes SET visita_programada_en = now() - interval '1 hour' WHERE id = $1", [solicitudId]);
    const despues = await post(cliente, '/no-llego');
    assert.equal(despues.status, 200);
    assert.equal(despues.body.solicitud.estado, 'cancelada');
    assert.deepEqual(simulada.reembolsos.map((r) => r.monto), [25_000]);
    assert.equal((await ledger())[0].estado, 'reembolsado');
  });

  test('una visita a la que nadie llegó se devuelve sola a las 24 horas', async () => {
    await aceptarConVisita();
    await pagar();
    await pool.query("UPDATE solicitudes SET visita_programada_en = now() - interval '25 hours' WHERE id = $1", [solicitudId]);
    assert.equal((await ver()).estado, 'cancelada');
    assert.deepEqual(simulada.reembolsos.map((r) => r.monto), [25_000]);
  });

  test('cancelar con anticipación devuelve la visita; sobre la hora, la recibe el prestador', async () => {
    await aceptarConVisita({ visita_programada_en: enHoras(5) });
    await pagar();
    const aTiempo = await post(cliente, '/cancelar', { motivo: 'Lo solucioné' });
    assert.equal(aTiempo.body.solicitud.estado, 'cancelada');
    assert.deepEqual(simulada.reembolsos.map((r) => r.monto), [25_000]);

    // Otra solicitud, cancelada una hora antes de la visita
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: solicitudId, descripcion: 'Necesito podar otro árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
    await aceptarConVisita({ visita_programada_en: enHoras(1) });
    await pagar();
    const tarde = await post(cliente, '/cancelar');
    assert.equal(tarde.body.solicitud.estado, 'cancelada');
    assert.equal(simulada.reembolsos.length, 1);                   // no hubo una segunda devolución
    assert.equal((await ledger())[0].estado, 'liberado');
  });

  test('en una disputa por el trabajo se devuelve el saldo, no la visita', async () => {
    await hastaDiagnostico();
    await post(prestador, '/cotizacion', { mano_obra: 120_000, detalle: 'Poda completa y retiro' });
    await post(cliente, '/cotizacion/respuesta', { aceptar: true });
    await pagar();
    await post(cliente, '/reportar', { motivo: 'Dejó las ramas tiradas en el patio' });

    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin@test.cl', 'x') RETURNING id, rol");
    const { firmarToken } = await import('../src/modules/auth/auth.servicio.js');
    const admin = { token: firmarToken(rows[0]) };
    const res = await como(admin)(request(app).post(`/api/admin/disputas/${solicitudId}/resolver`))
      .send({ decision: 'reembolsar', observacion: 'Las fotos muestran el patio sin limpiar' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(simulada.reembolsos.map((r) => r.monto), [95_000]);
    assert.deepEqual((await ledger()).map((m) => [m.concepto, m.estado]), [['visita', 'liberado'], ['saldo', 'reembolsado']]);
    assert.equal(res.body.solicitud.visita.pago.monto, 25_000);    // el equipo ve la visita aparte
  });

  test('el precio cerrado sigue funcionando como antes', async () => {
    await post(prestador, '/responder', { aceptar: true, precio: 45_000 });
    const pago = await pagar();
    assert.deepEqual([pago.concepto, pago.monto], ['total', 45_000]);
    assert.equal((await ver()).estado, 'pagada');
  });
});
