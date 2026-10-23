import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Mejoras pedidas por el equipo: dirección exacta del servicio, gastos rechazados en una disputa que no
// se descuentan dos veces, avisos dentro de la app (pago liberado, transferencia) y "Mi dinero" del maestro.
describe('Dirección, gastos rechazados, avisos y dinero del maestro', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarPasarela, firmarToken;
  let n = 0;
  let cliente, prestador, admin, solicitudId;

  before(async () => {
    pool = await prepararBase();
    ({ usarPasarela } = await import('../src/modules/pagos/pasarela.js'));
    usarPasarela({ async reembolsar() { return { type: 'NULLIFIED' }; } });
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarPasarela(null); await pool.end(); });

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `m${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const ver = async (u) => (await como(u)(request(app).get(`/api/solicitudes/${solicitudId}`))).body.solicitud;
  const avisos = async (u) => (await como(u)(request(app).get('/api/notificaciones'))).body;
  const estado = (e) => pool.query('UPDATE solicitudes SET estado = $2 WHERE id = $1', [solicitudId, e]);

  // Pago aprobado del trabajo (como lo deja Webpay), con su movimiento retenido en el ledger
  async function pagado(precio = 50000) {
    const { rows: [pago] } = await pool.query(
      `INSERT INTO pagos (solicitud_id, orden_compra, token_webpay, monto, estado) VALUES ($1, $2, $3, $4, 'autorizado') RETURNING id`,
      [solicitudId, `OC-${randomUUID().slice(0, 8)}`, `tok-${randomUUID().slice(0, 8)}`, precio]);
    const comision = Math.round(precio * 0.12);
    await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto)
       VALUES ($1, $2, $3, $4, $5, $6)`, [solicitudId, pago.id, prestador.id, precio, comision, precio - comision]);
    await estado('pagada');
  }

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    await pool.query('UPDATE prestadores SET rut = $2, banco = $3, tipo_cuenta = $4, numero_cuenta = $5 WHERE usuario_id = $1',
      [prestador.id, '12.345.678-5', 'BancoEstado', 'CuentaRUT', '12345678']);
    const { rows: [a] } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin-m@test.cl', 'x') RETURNING id, rol");
    admin = { id: a.id, token: firmarToken(a) };
    solicitudId = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({
      id: solicitudId, descripcion: 'Necesito podar un árbol alto', direccion: 'Av. Libertad 1234, casa 5',
      referencia: 'Portón verde', latitud: -36.6066, longitud: -72.1034,
    });
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/asignar`)).send({ prestador_id: prestador.id });
  });

  // ------------------------------------------------------------------ 1. dirección exacta
  test('la dirección es obligatoria y debe estar en Chillán o Coihueco', async () => {
    const pedir = (extra) => como(cliente)(request(app).post('/api/solicitudes')).send({ id: randomUUID(), descripcion: 'Necesito podar un árbol alto', ...extra });
    const sin = await pedir({});
    assert.equal(sin.status, 422);
    assert.ok(sin.body.error.campos.direccion);
    const lejos = await pedir({ direccion: 'Alameda 100', latitud: -33.45, longitud: -70.66 });   // Santiago
    assert.equal(lejos.status, 422);
    assert.match(lejos.body.error.campos.latitud, /fuera de Chillán y Coihueco/);
  });

  test('el maestro ve la dirección exacta recién cuando el pago está asegurado; el cliente siempre', async () => {
    assert.equal((await ver(cliente)).direccion, 'Av. Libertad 1234, casa 5');
    let s = await ver(prestador);
    assert.deepEqual([s.direccion, s.referencia, s.latitud, s.direccion_visible], [null, null, null, false]);
    assert.equal(s.comuna, 'Chillán');   // antes de eso, solo la comuna

    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 50000 });
    assert.equal((await ver(prestador)).direccion, null);   // aceptó, pero el cliente aún no paga
    await pagado();
    s = await ver(prestador);
    assert.deepEqual([s.direccion, s.referencia, s.latitud, s.longitud, s.direccion_visible],
      ['Av. Libertad 1234, casa 5', 'Portón verde', -36.6066, -72.1034, true]);
  });

  // ------------------------------------------------------------------ 2. gastos rechazados
  test('un gasto rechazado en la disputa se devuelve al cliente y deja de descontarse al maestro', async () => {
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 50000 });
    await pagado();
    const g = await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/gastos`)).send({ monto: 8000, descripcion: 'Cuerda' });
    const gastoId = g.body.gastos[0].id;
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/finalizar`));
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/reportar`)).send({ motivo: 'La cuerda no tiene boleta' });

    const resolver = (cuerpo) => como(admin)(request(app).post(`/api/admin/disputas/${solicitudId}/resolver`))
      .send({ decision: 'parcial', monto_reembolso: 8000, observacion: 'La cuerda no tiene boleta: se devuelve', ...cuerpo });
    assert.equal((await resolver({ gastos_rechazados: [randomUUID()] })).status, 422);   // un gasto de otro trabajo
    const res = await resolver({ gastos_rechazados: [gastoId] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.solicitud.gastos[0].rechazado, true);

    // El maestro recibe 42.000 − comisión y la cuerda ya no se le descuenta como gasto
    const { body } = await como(prestador)(request(app).get(`/api/solicitudes/${solicitudId}/gastos`));
    assert.equal(body.gastos[0].rechazado, true);
    assert.deepEqual(
      [body.resumen.reembolsado, body.resumen.ingreso_neto, body.resumen.gastos, body.resumen.gastos_rechazados, body.resumen.ganancia_neta],
      [8000, 42000 - 5040, 0, 8000, 42000 - 5040]);
    // El cliente lo ve como rechazado y fuera del total
    const materiales = (await como(cliente)(request(app).get(`/api/solicitudes/${solicitudId}/materiales`))).body;
    assert.deepEqual([materiales.gastos[0].rechazado, materiales.total, materiales.sin_boleta], [true, 0, 0]);
  });

  // ------------------------------------------------------------------ 3. avisos y dinero
  test('cada parte recibe sus avisos (nunca de lo que hizo ella misma) y puede marcarlos como leídos', async () => {
    const delMaestro = await avisos(prestador);
    assert.equal(delMaestro.no_leidas, 1);
    assert.equal(delMaestro.notificaciones[0].titulo, 'Tienes una nueva solicitud');
    assert.equal(delMaestro.notificaciones[0].solicitud_id, solicitudId);
    assert.equal((await avisos(cliente)).no_leidas, 0);   // eligió ella: no se le avisa a sí misma

    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 50000 });
    assert.equal((await avisos(cliente)).notificaciones[0].titulo, 'Luis aceptó tu solicitud');

    const leidas = await como(prestador)(request(app).post('/api/notificaciones/leidas'));
    assert.equal(leidas.body.no_leidas, 0);
    assert.ok(leidas.body.notificaciones[0].leida_en);
  });

  test('el maestro recibe un aviso cuando se libera su pago y cuando se lo transfieren, y ve su dinero', async () => {
    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/responder`)).send({ aceptar: true, precio: 50000 });
    await pagado();
    const dinero = async () => (await como(prestador)(request(app).get('/api/prestadores/yo/dinero'))).body;
    assert.deepEqual(await dinero(), { retenido: 44000, por_transferir: 0, transferido: 0, transferencias: [] });

    await como(prestador)(request(app).post(`/api/solicitudes/${solicitudId}/finalizar`));
    await como(cliente)(request(app).post(`/api/solicitudes/${solicitudId}/cerrar`));
    const liberado = (await avisos(prestador)).notificaciones[0];
    assert.equal(liberado.titulo, '💰 Tu pago quedó liberado');
    assert.match(liberado.texto, /Se liberaron \$44\.000/);
    assert.equal(liberado.tipo, 'pago');
    assert.deepEqual(await dinero(), { retenido: 0, por_transferir: 44000, transferido: 0, transferencias: [] });

    const { rows: [mov] } = await pool.query('SELECT id FROM ledger_movimientos WHERE solicitud_id = $1', [solicitudId]);
    const t = await como(admin)(request(app).post(`/api/admin/liquidaciones/${prestador.id}`))
      .send({ movimientos: [mov.id], comprobante: 'TRF-2026-001' });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    const transferido = (await avisos(prestador)).notificaciones[0];
    assert.equal(transferido.titulo, '🏦 Te transferimos tu pago');
    assert.match(transferido.texto, /Te transferimos \$44\.000 por 1 trabajo\. Comprobante TRF-2026-001/);

    const d = await dinero();
    assert.deepEqual([d.retenido, d.por_transferir, d.transferido], [0, 0, 44000]);
    assert.deepEqual([d.transferencias[0].comprobante, d.transferencias[0].monto, d.transferencias[0].trabajos], ['TRF-2026-001', 44000, 1]);
  });
});
