import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Ley N.º 21.719 (derecho de supresión): eliminar la cuenta desde la app
describe('Eliminar la cuenta', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarPasarela, firmarToken, cifrar;
  let n = 0;
  let cliente, prestador;
  const eliminadas = [];

  before(async () => {
    pool = await prepararBase();
    ({ usarPasarela } = await import('../src/modules/pagos/pasarela.js'));
    usarPasarela({ async eliminarInscripcion(d) { eliminadas.push(d); } });
    ({ firmarToken } = await import('../src/modules/auth/auth.servicio.js'));
    ({ cifrar } = await import('../src/utils/cifrado.js'));
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => { usarPasarela(null); await pool.end(); });

  async function registrar(rol, nombre, extra = {}) {
    n++;
    const email = `elim${n}@test.cl`;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email, password: 'clave1234', telefono: '912345678', acepta_terminos: true, comuna: 'Chillán', ...extra });
    return { id: body.usuario.id, token: body.token, email };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const consultar = (u) => como(u)(request(app).get('/api/auth/yo/eliminar'));
  const eliminar = (u, password = 'clave1234') => como(u)(request(app).post('/api/auth/yo/eliminar')).send({ password });

  beforeEach(async () => {
    await limpiarBase(pool);
    eliminadas.length = 0;
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    await como(prestador)(request(app).put('/api/prestadores/yo'))
      .send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'], descripcion: 'Poda segura en altura' });
  });

  test('con la contraseña correcta se borran los datos personales y la cuenta queda cerrada', async () => {
    assert.deepEqual((await consultar(cliente)).body, { puede_eliminar: true, motivo: null });
    // Tenía una tarjeta guardada
    await pool.query("INSERT INTO tarjetas (usuario_id, tbk_user, tipo, ultimos4) VALUES ($1, $2, 'Visa', '6623')",
      [cliente.id, cifrar('tbk-de-ana', 'tarjeta')]);

    const mal = await eliminar(cliente, 'otra-clave');
    assert.equal(mal.status, 422);
    assert.ok(mal.body.error.campos.password);

    const res = await eliminar(cliente);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { eliminada: true });

    const { rows: [u] } = await pool.query(
      'SELECT nombre, email, telefono, comuna, activo, eliminada_en FROM usuarios WHERE id = $1', [cliente.id]);
    assert.equal(u.nombre, 'Cuenta eliminada');
    assert.equal(u.email.includes('elim1'), false);
    assert.deepEqual([u.telefono, u.comuna, u.activo], [null, null, false]);
    assert.ok(u.eliminada_en);
    assert.equal((await pool.query('SELECT 1 FROM tarjetas WHERE usuario_id = $1', [cliente.id])).rowCount, 0);
    assert.deepEqual(eliminadas, [{ tbkUser: 'tbk-de-ana', usuario: cliente.id }]);   // también en Transbank

    // La sesión deja de funcionar, no se puede volver a entrar y el correo queda libre para una cuenta nueva
    assert.equal((await como(cliente)(request(app).get('/api/auth/yo'))).status, 401);
    assert.equal((await request(app).post('/api/auth/login').send({ email: cliente.email, password: 'clave1234' })).status, 401);
    const nueva = await request(app).post('/api/auth/registro')
      .send({ rol: 'cliente', nombre: 'Ana', apellido: 'Pérez', email: cliente.email, password: 'clave1234', acepta_terminos: true });
    assert.equal(nueva.status, 201);
    assert.notEqual(nueva.body.usuario.id, cliente.id);
  });

  test('con una solicitud en curso no se puede eliminar; al cancelarla, sí', async () => {
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar un árbol alto' });
    const consulta = await consultar(cliente);
    assert.equal(consulta.body.puede_eliminar, false);
    assert.match(consulta.body.motivo, /Tienes una solicitud en curso/);
    const res = await eliminar(cliente);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'CUENTA_CON_PENDIENTES');
    assert.equal((await como(cliente)(request(app).get('/api/auth/yo'))).status, 200);   // la cuenta sigue

    await como(cliente)(request(app).post(`/api/solicitudes/${id}/cancelar`)).send({});
    assert.equal((await eliminar(cliente)).status, 200);
  });

  test('el maestro con dinero por recibir espera la transferencia; al eliminar sale del catálogo y se borran sus datos bancarios', async () => {
    // Un trabajo cerrado con el pago liberado, aún sin transferir
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar un árbol alto' });
    await pool.query("UPDATE solicitudes SET estado = 'cerrada', prestador_id = $2, precio_acordado = 40000 WHERE id = $1", [id, prestador.id]);
    const { rows: [pago] } = await pool.query(
      "INSERT INTO pagos (solicitud_id, orden_compra, monto, estado) VALUES ($1, 'OC-ELIM', 40000, 'autorizado') RETURNING id", [id]);
    const { rows: [mov] } = await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto, estado, liberado_en)
       VALUES ($1, $2, $3, 40000, 4800, 35200, 'liberado', now()) RETURNING id`, [id, pago.id, prestador.id]);
    await pool.query("UPDATE prestadores SET rut = '12345678-5', banco = 'BancoEstado', tipo_cuenta = 'CuentaRUT', numero_cuenta = '12345678' WHERE usuario_id = $1", [prestador.id]);

    const espera = await eliminar(prestador);
    assert.equal(espera.status, 409);
    assert.match(espera.body.error.mensaje, /Tienes \$35\.200 por recibir/);

    await pool.query("UPDATE ledger_movimientos SET estado = 'transferido', transferido_en = now(), comprobante = 'TRF-1' WHERE id = $1", [mov.id]);
    assert.equal((await eliminar(prestador)).status, 200);

    const { rows: [p] } = await pool.query(
      'SELECT descripcion, disponible, rut, banco, numero_cuenta, comunas_atendidas FROM prestadores WHERE usuario_id = $1', [prestador.id]);
    assert.deepEqual(p, { descripcion: null, disponible: false, rut: null, banco: null, numero_cuenta: null, comunas_atendidas: [] });
    assert.equal((await request(app).get(`/api/prestadores/${prestador.id}`)).status, 404);
    // El libro contable se conserva (sin nombre)
    const { rows: [m] } = await pool.query('SELECT estado, monto_neto FROM ledger_movimientos WHERE id = $1', [mov.id]);
    assert.deepEqual(m, { estado: 'transferido', monto_neto: 35200 });
  });

  test('una cuenta de administración no se elimina por aquí, y una cuenta eliminada no se puede reactivar', async () => {
    const { rows: [a] } = await pool.query(
      "INSERT INTO usuarios (rol, nombre, email, password_hash) VALUES ('admin', 'Equipo', 'admin-elim@test.cl', 'x') RETURNING id, rol");
    const admin = { id: a.id, token: firmarToken(a) };
    assert.equal((await consultar(admin)).body.puede_eliminar, false);
    assert.equal((await eliminar(admin)).status, 422);

    await eliminar(cliente);
    const reactivar = await como(admin)(request(app).patch(`/api/admin/usuarios/${cliente.id}`)).send({ activo: true });
    assert.equal(reactivar.status, 422);
    assert.match(reactivar.body.error.mensaje, /eliminada por su titular/);
  });
});
