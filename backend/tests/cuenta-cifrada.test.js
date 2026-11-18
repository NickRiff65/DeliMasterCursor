import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';
import { cifrarCuenta, leerCuenta, cifrarCuentasEnClaro } from '../src/utils/cuentaBancaria.js';

// La cuenta bancaria del maestro se guarda cifrada (AES-256-GCM) y solo la leen su dueño y el equipo
describe('Cuenta bancaria cifrada en reposo', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, firmarToken;
  let n = 0;
  let maestro, admin;
  const DATOS = { rut: '12.345.678-5', banco: 'BancoEstado', tipo_cuenta: 'CuentaRUT', numero_cuenta: '12345678' };

  before(async () => {
    pool = await prepararBase();
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const enBase = async () => (await pool.query('SELECT numero_cuenta FROM prestadores WHERE usuario_id = $1', [maestro.id])).rows[0].numero_cuenta;

  beforeEach(async () => {
    await limpiarBase(pool);
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol: 'prestador', ...partirNombre('Luis Poda'), email: `cta${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    maestro = { id: body.usuario.id, token: body.token };
    const { rows } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin@test.cl', 'x') RETURNING id, rol");
    admin = { id: rows[0].id, token: firmarToken(rows[0]) };
  });

  test('en la base no queda el número en texto plano, y su dueño lo ve completo', async () => {
    const res = await como(maestro)(request(app).put('/api/prestadores/yo/datos-pago')).send(DATOS);
    assert.equal(res.status, 200);
    assert.equal(res.body.datos_pago.numero_cuenta, '12345678');
    assert.equal(res.body.datos_pago.completos, true);

    const guardado = await enBase();
    assert.doesNotMatch(guardado, /12345678/, 'el número no aparece en la base');
    assert.equal(guardado.split('.').length, 3, 'formato iv.etiqueta.datos');
    assert.equal(leerCuenta(guardado), '12345678');
    // Dos cifrados del mismo número no se parecen (vector de inicialización aleatorio)
    assert.notEqual(cifrarCuenta('12345678'), cifrarCuenta('12345678'));
  });

  test('el equipo ve la cuenta descifrada en las transferencias pendientes', async () => {
    await como(maestro)(request(app).put('/api/prestadores/yo/datos-pago')).send(DATOS);
    const { rows: [cat] } = await pool.query("SELECT id FROM categorias WHERE slug = 'poda-altura'");
    const { rows: [cli] } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('cliente', 'Ana', 'ana@test.cl', 'x') RETURNING id");
    const { rows: [s] } = await pool.query(
      `INSERT INTO solicitudes (id, cliente_id, prestador_id, categoria_id, descripcion_original, comuna, estado, precio_acordado)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Podar un árbol', 'Chillán', 'cerrada', 50000) RETURNING id`, [cli.id, maestro.id, cat.id]);
    const { rows: [pago] } = await pool.query(
      "INSERT INTO pagos (solicitud_id, orden_compra, monto, estado) VALUES ($1, 'DM-CTA-1', 50000, 'autorizado') RETURNING id", [s.id]);
    await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto, estado, liberado_en)
       VALUES ($1, $2, $3, 50000, 6000, 44000, 'liberado', now())`, [s.id, pago.id, maestro.id]);

    const res = await como(admin)(request(app).get('/api/admin/liquidaciones'));
    assert.equal(res.status, 200);
    const fila = res.body.pendientes.find((p) => p.prestador_id === maestro.id);
    assert.equal(fila.numero_cuenta, '12345678');
    assert.equal(fila.datos_completos, true);
  });

  test('las cuentas antiguas en texto plano se cifran una sola vez y siguen siendo legibles', async () => {
    await pool.query("UPDATE prestadores SET rut = '12345678-5', banco = 'BancoEstado', tipo_cuenta = 'CuentaRUT', numero_cuenta = '00987654' WHERE usuario_id = $1", [maestro.id]);
    // Mientras no se convierte, igual se puede leer
    assert.equal((await como(maestro)(request(app).get('/api/prestadores/yo/datos-pago'))).body.datos_pago.numero_cuenta, '00987654');

    assert.equal(await cifrarCuentasEnClaro(pool), 1);
    assert.doesNotMatch(await enBase(), /^\d+$/);
    assert.equal(await cifrarCuentasEnClaro(pool), 0, 'la segunda pasada no toca nada');
    assert.equal((await como(maestro)(request(app).get('/api/prestadores/yo/datos-pago'))).body.datos_pago.numero_cuenta, '00987654');
  });

  test('un dato cifrado con otra clave no se puede leer y la ficha queda como incompleta', async () => {
    const [iv, etiqueta, datos] = cifrarCuenta('12345678').split('.');
    const alterado = [iv, etiqueta, datos.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))].join('.');
    await pool.query("UPDATE prestadores SET rut = '12345678-5', banco = 'BancoEstado', tipo_cuenta = 'CuentaRUT', numero_cuenta = $2 WHERE usuario_id = $1", [maestro.id, alterado]);
    const { body } = await como(maestro)(request(app).get('/api/prestadores/yo/datos-pago'));
    assert.equal(body.datos_pago.numero_cuenta, null);
    assert.equal(body.datos_pago.completos, false);
  });
});
