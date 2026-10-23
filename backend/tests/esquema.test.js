// Verifica que las reglas de negocio críticas se cumplan en la propia base de datos.
import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase } from './helpers/db.js';

describe('Reglas del esquema de datos', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let pool;
  let clienteId;
  let prestadorId;
  let categoriaId;

  before(async () => { pool = await prepararBase(); });
  after(() => pool.end());

  beforeEach(async () => {
    await limpiarBase(pool);
    const u = await pool.query(
      `INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES
         ('cliente', 'Cliente', 'c@test.cl', 'x'), ('prestador', 'Maestro', 'p@test.cl', 'x')
       RETURNING id`);
    [clienteId, prestadorId] = u.rows.map((r) => r.id);
    await pool.query('INSERT INTO prestadores (usuario_id) VALUES ($1)', [prestadorId]);
    categoriaId = (await pool.query("SELECT id FROM categorias WHERE slug = 'electricidad'")).rows[0].id;
  });

  async function crearSolicitud(estado = 'creada') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO solicitudes (id, cliente_id, prestador_id, categoria_id, descripcion_original, precio_acordado, estado)
       VALUES ($1, $2, $3, $4, 'Se cortó la luz', 40000, $5)`,
      [id, clienteId, prestadorId, categoriaId, estado]);
    return id;
  }

  async function crearMovimiento(solicitudId, { bruto = 40000, comision = 4800, neto = 35200 } = {}) {
    const pago = await pool.query(
      `INSERT INTO pagos (solicitud_id, orden_compra, monto, estado) VALUES ($1, $2, $3, 'autorizado') RETURNING id`,
      [solicitudId, `OC-${randomUUID().slice(0, 8)}`, bruto]);
    const mov = await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [solicitudId, pago.rows[0].id, prestadorId, bruto, comision, neto]);
    return mov.rows[0].id;
  }

  test('HU-12: reenviar una solicitud con el mismo UUID no la duplica', async () => {
    const id = await crearSolicitud();
    await assert.rejects(
      pool.query(`INSERT INTO solicitudes (id, cliente_id, categoria_id, descripcion_original) VALUES ($1, $2, $3, 'otra vez')`,
        [id, clienteId, categoriaId]),
      { code: '23505' });
  });

  test('HU-06: no se puede reseñar un servicio que no está cerrado', async () => {
    const id = await crearSolicitud('finalizada');
    await assert.rejects(
      pool.query('INSERT INTO resenas (solicitud_id, cliente_id, prestador_id, estrellas) VALUES ($1, $2, $3, 5)',
        [id, clienteId, prestadorId]),
      /Solo se pueden reseñar servicios cerrados/);
  });

  test('HU-06: un servicio cerrado sí se puede reseñar, una sola vez', async () => {
    const id = await crearSolicitud('cerrada');
    await pool.query('INSERT INTO resenas (solicitud_id, cliente_id, prestador_id, estrellas) VALUES ($1, $2, $3, 5)',
      [id, clienteId, prestadorId]);
    await assert.rejects(
      pool.query('INSERT INTO resenas (solicitud_id, cliente_id, prestador_id, estrellas) VALUES ($1, $2, $3, 4)',
        [id, clienteId, prestadorId]),
      { code: '23505' });
  });

  test('ledger: el monto bruto debe ser igual a comisión + neto', async () => {
    const id = await crearSolicitud('pagada');
    await assert.rejects(crearMovimiento(id, { bruto: 40000, comision: 4800, neto: 36000 }), /ledger_cuadra/);
  });

  test('ledger: no se puede marcar como transferido sin comprobante', async () => {
    const mov = await crearMovimiento(await crearSolicitud('pagada'));
    await pool.query("UPDATE ledger_movimientos SET estado = 'liberado', liberado_en = now() WHERE id = $1", [mov]);
    await assert.rejects(
      pool.query("UPDATE ledger_movimientos SET estado = 'transferido', transferido_en = now() WHERE id = $1", [mov]),
      /ledger_fechas/);
    await pool.query(
      "UPDATE ledger_movimientos SET estado = 'transferido', transferido_en = now(), comprobante = 'TRF-123' WHERE id = $1", [mov]);
  });

  test('ledger: los movimientos no se pueden borrar', async () => {
    const mov = await crearMovimiento(await crearSolicitud('pagada'));
    await assert.rejects(pool.query('DELETE FROM ledger_movimientos WHERE id = $1', [mov]), /no se pueden eliminar/);
  });

  test('pagos: una solicitud no puede tener dos pagos autorizados', async () => {
    const id = await crearSolicitud('pagada');
    await crearMovimiento(id);
    await assert.rejects(
      pool.query(`INSERT INTO pagos (solicitud_id, orden_compra, monto, estado) VALUES ($1, 'OC-2', 40000, 'autorizado')`, [id]),
      { code: '23505' });
  });
});
