import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Brechas del cruce EF2 ↔ código (noviembre 2026):
// (1) el cliente puede ver su propia reputación en su perfil,
// (2) el catálogo filtra por «en horario» y ordena a elección del cliente (CU-05),
// (3) el maestro tiene agenda de visitas (CU-16),
// (4) el Panel Web tiene vista contable: libro mayor y gastos del período.
describe('Brechas EF2: reputación propia, catálogo, agenda y panel contable', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, firmarToken;
  let n = 0;
  let cliente, prestador, admin;

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
      .send({ rol, ...partirNombre(nombre), email: `b${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin@test.cl', 'x') RETURNING id, rol");
    admin = { id: rows[0].id, token: firmarToken(rows[0]) };
  });

  // ---------------------------------------------------------- (1) reputación propia
  test('el perfil del cliente incluye su reputación como cliente', async () => {
    const antes = await como(cliente)(request(app).get('/api/auth/yo'));
    assert.equal(antes.status, 200);
    assert.equal(antes.body.usuario.calificacion_promedio, null);
    assert.equal(antes.body.usuario.total_resenas, 0);

    await pool.query('UPDATE usuarios SET calificacion_promedio = 4.50, total_resenas = 2 WHERE id = $1', [cliente.id]);
    const despues = await como(cliente)(request(app).get('/api/auth/yo'));
    assert.equal(despues.body.usuario.calificacion_promedio, 4.5);
    assert.equal(despues.body.usuario.total_resenas, 2);
  });

  // ---------------------------------------------------------- (2) catálogo CU-05
  test('el catálogo filtra por «en horario» y acepta el orden del cliente', async () => {
    const hoyIso = ((new Date().getDay() + 6) % 7) + 1; // 1 = lunes … 7 = domingo
    const otroDia = hoyIso === 7 ? 1 : hoyIso + 1;
    // Luis atiende hoy todo el día; Pedro atiende otro día
    await como(prestador)(request(app).put('/api/prestadores/yo'))
      .send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'], horario: { dias: [hoyIso], desde: '08:00', hasta: '24:00' } });
    const pedro = await registrar('prestador', 'Pedro Poda');
    await como(pedro)(request(app).put('/api/prestadores/yo'))
      .send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'], horario: { dias: [otroDia], desde: '08:00', hasta: '24:00' } });

    const todos = await request(app).get('/api/prestadores');
    assert.deepEqual(todos.body.prestadores.map((p) => p.nombre).sort(), ['Luis Poda', 'Pedro Poda']);

    const ahora = await request(app).get('/api/prestadores?disponible_ahora=true');
    assert.deepEqual(ahora.body.prestadores.map((p) => p.nombre), ['Luis Poda']);

    const ordenado = await request(app).get('/api/prestadores?orden=trabajos');
    assert.equal(ordenado.status, 200);
    assert.equal(ordenado.body.prestadores.length, 2);

    const invalido = await request(app).get('/api/prestadores?orden=magia');
    assert.equal(invalido.status, 422);
  });

  // ---------------------------------------------------------- (3) agenda CU-16
  test('la agenda del maestro lista su visita programada y no la de otros', async () => {
    await como(prestador)(request(app).put('/api/prestadores/yo'))
      .send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes'))
      .send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar un árbol alto' });
    await como(cliente)(request(app).post(`/api/solicitudes/${id}/asignar`)).send({ prestador_id: prestador.id });
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await como(prestador)(request(app).post(`/api/solicitudes/${id}/responder`))
      .send({ aceptar: true, modalidad: 'visita', tarifa_visita: 20000, visita_programada_en: manana });
    // El pago de la visita se simula directo en la base: la agenda solo muestra visitas confirmadas
    await pool.query("UPDATE solicitudes SET estado = 'visita_pagada' WHERE id = $1", [id]);

    const { body } = await como(prestador)(request(app).get('/api/prestadores/yo/agenda'));
    assert.equal(body.agenda.length, 1);
    assert.equal(body.agenda[0].id, id);
    assert.equal(body.agenda[0].cliente, 'Ana Pérez');
    assert.equal(body.agenda[0].categoria, 'Poda de altura');

    const ajena = await como(cliente)(request(app).get('/api/prestadores/yo/agenda'));
    assert.equal(ajena.status, 403);
  });

  // ---------------------------------------------------------- (4) panel contable
  test('el panel contable muestra movimientos, totales y gastos del período', async () => {
    // Un movimiento de libro mayor y un gasto con boleta, creados directo en la base
    const pagoId = randomUUID();
    const solicitudId = randomUUID();
    await pool.query(
      `INSERT INTO solicitudes (id, cliente_id, prestador_id, categoria_id, descripcion_original, estado)
       SELECT $1, $2, $3, id, 'Poda de prueba', 'cerrada' FROM categorias WHERE slug = 'poda-altura'`,
      [solicitudId, cliente.id, prestador.id]);
    await pool.query(
      `INSERT INTO pagos (id, solicitud_id, orden_compra, monto, estado) VALUES ($1, $2, 'OC-BRECHA-1', 45000, 'autorizado')`,
      [pagoId, solicitudId]);
    await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto, estado, liberado_en)
       VALUES ($1, $2, $3, 45000, 5400, 39600, 'liberado', now())`,
      [solicitudId, pagoId, prestador.id]);
    await pool.query(
      `INSERT INTO gastos (solicitud_id, prestador_id, monto, origen, descripcion)
       VALUES ($1, $2, 12000, 'manual', 'Cadena de motosierra')`,
      [solicitudId, prestador.id]);

    const { body } = await como(admin)(request(app).get('/api/admin/contabilidad'));
    assert.equal(body.movimientos.length, 1);
    assert.equal(body.movimientos[0].monto_bruto, 45000);
    assert.equal(body.movimientos[0].comision, 5400);
    assert.equal(body.movimientos[0].prestador, 'Luis Poda');
    const totalLiberado = body.totales.find((t) => t.estado === 'liberado');
    assert.equal(totalLiberado.neto, 39600);
    assert.equal(body.gastos.length, 1);
    assert.equal(body.gastos[0].con_boleta, false);

    const fuera = await como(admin)(request(app).get('/api/admin/contabilidad?desde=2020-01-01&hasta=2020-01-31'));
    assert.equal(fuera.body.movimientos.length, 0);

    const prohibido = await como(cliente)(request(app).get('/api/admin/contabilidad'));
    assert.equal(prohibido.status, 403);
  });
});
