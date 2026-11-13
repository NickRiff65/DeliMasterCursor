import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Tres pedidos del equipo: (1) automatizar el ciclo de vida de las verificaciones SEC,
// (2) la dirección del cliente no se revela al primer contacto, solo al concretar la visita,
// (3) calificación bilateral: el maestro también califica al cliente.
describe('Privacidad de la dirección, calificación bilateral y vencimientos SEC', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool;
  let n = 0;
  let cliente, prestador;

  before(async () => {
    pool = await prepararBase();
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `s${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const accion = (u, id, nombre, cuerpo = {}) => como(u)(request(app).post(`/api/solicitudes/${id}/${nombre}`)).send(cuerpo);
  const ver = (u, id) => como(u)(request(app).get(`/api/solicitudes/${id}`));

  // Solicitud asignada y aceptada con precio cerrado: queda en estado "confirmada" (aún sin pagar)
  async function solicitudConfirmada() {
    // La regla de ayudantía (máx. 1 solicitud por día por cliente) contaría las anteriores
    // de esta misma prueba: se corre un día atrás la creación de las que ya armó este cliente.
    await pool.query(
      `UPDATE solicitudes SET creado_en = creado_en - interval '1 day'
        WHERE cliente_id = $1
          AND (creado_en AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date`,
      [cliente.id]);
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes'))
      .send({ direccion: 'Av. Libertad 1234', referencia: 'Casa esquina', id, descripcion: 'Necesito podar un árbol alto' });
    await accion(cliente, id, 'asignar', { prestador_id: prestador.id });
    await accion(prestador, id, 'responder', { aceptar: true, precio: 45000 });
    return id;
  }
  // Como solicitudConfirmada, pero con el pago hecho y el dinero retenido en el ledger (lo que
  // el cierre necesita para liberar), siguiendo el mismo atajo que las pruebas de cierre.
  async function solicitudPagada() {
    const id = await solicitudConfirmada();
    const precio = 45000;
    await pool.query("UPDATE solicitudes SET estado = 'pagada' WHERE id = $1", [id]);
    const { rows: [pago] } = await pool.query(
      `INSERT INTO pagos (solicitud_id, orden_compra, monto, estado) VALUES ($1, $2, $3, 'autorizado') RETURNING id`,
      [id, `OC-${randomUUID().slice(0, 8)}`, precio]);
    const comision = Math.round(precio * 0.12);
    await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto)
       VALUES ($1, $2, $3, $4, $5, $6)`, [id, pago.id, prestador.id, precio, comision, precio - comision]);
    return id;
  }
  async function solicitudCerrada() {
    const id = await solicitudPagada();
    await accion(prestador, id, 'finalizar');
    await accion(cliente, id, 'cerrar');
    return id;
  }

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    await como(prestador)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
  });

  // ---------------------------------------------------------- (2) dirección protegida
  test('al primer contacto el maestro solo ve la comuna, no la dirección del cliente', async () => {
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes'))
      .send({ direccion: 'Av. Libertad 1234', referencia: 'Casa esquina', id, descripcion: 'Necesito podar un árbol alto' });
    await accion(cliente, id, 'asignar', { prestador_id: prestador.id });

    const vista = (await ver(prestador, id)).body.solicitud;
    assert.equal(vista.direccion_visible, false);
    assert.equal(vista.direccion, null);
    assert.equal(vista.referencia, null);
    assert.equal(vista.latitud, null);
    assert.equal(vista.comuna, 'Chillán');

    // El cliente sí ve su propia dirección y sabe que aún no se comparte
    const vistaCliente = (await ver(cliente, id)).body.solicitud;
    assert.equal(vistaCliente.direccion, 'Av. Libertad 1234');
    assert.equal(vistaCliente.direccion_visible_para_prestador, false);
  });

  test('el cliente no puede compartir su dirección antes de que se concrete la visita', async () => {
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes'))
      .send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar un árbol alto' });
    await accion(cliente, id, 'asignar', { prestador_id: prestador.id });
    const res = await accion(cliente, id, 'compartir-direccion');
    assert.equal(res.status, 409);
    assert.equal((await ver(prestador, id)).body.solicitud.direccion, null);
  });

  test('concretada la visita, el cliente puede compartir su dirección y el maestro la ve', async () => {
    const id = await solicitudConfirmada();
    assert.equal((await ver(prestador, id)).body.solicitud.direccion, null);   // confirmada ≠ pagada
    assert.equal((await ver(cliente, id)).body.solicitud.puede_compartir_direccion, true);

    const res = await accion(cliente, id, 'compartir-direccion');
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.direccion_visible_para_prestador, true);

    const vista = (await ver(prestador, id)).body.solicitud;
    assert.equal(vista.direccion_visible, true);
    assert.equal(vista.direccion, 'Av. Libertad 1234');
    assert.equal(vista.referencia, 'Casa esquina');

    // Queda en el historial y el maestro recibió el aviso una sola vez
    assert.match(res.body.solicitud.eventos.at(-1).detalle, /compartió su dirección/);
    const avisos = await pool.query(
      "SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND titulo LIKE '%compartió su dirección%'", [prestador.id]);
    assert.equal(avisos.rows[0].n, 1);
    await accion(cliente, id, 'compartir-direccion');   // repetir no duplica el aviso
    const avisos2 = await pool.query(
      "SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND titulo LIKE '%compartió su dirección%'", [prestador.id]);
    assert.equal(avisos2.rows[0].n, 1);
  });

  test('sin compartir, la dirección se revela sola cuando el pago queda asegurado', async () => {
    const id = await solicitudConfirmada();
    await pool.query("UPDATE solicitudes SET estado = 'pagada' WHERE id = $1", [id]);
    const vista = (await ver(prestador, id)).body.solicitud;
    assert.equal(vista.direccion_visible, true);
    assert.equal(vista.direccion, 'Av. Libertad 1234');
  });

  // ---------------------------------------------------------- (3) calificación bilateral
  test('el maestro califica al cliente al cerrar y eso construye la reputación del cliente', async () => {
    const id = await solicitudCerrada();
    const res = await accion(prestador, id, 'resena-cliente', { estrellas: 5, comentario: 'Puntual y clara con lo que necesitaba' });
    assert.equal(res.status, 201);
    assert.equal(res.body.solicitud.resena_prestador.estrellas, 5);
    assert.equal(res.body.solicitud.cliente.calificacion_promedio, 5);
    assert.equal(res.body.solicitud.cliente.total_resenas, 1);

    // Otro maestro ve esa reputación en su solicitud antes de aceptar
    const { rows: [u] } = await pool.query('SELECT calificacion_promedio::float AS p, total_resenas FROM usuarios WHERE id = $1', [cliente.id]);
    assert.equal(u.p, 5);
    assert.equal(u.total_resenas, 1);
  });

  test('la calificación al cliente exige trabajo cerrado, al prestador del trabajo y una sola vez', async () => {
    const confirmada = await solicitudConfirmada();
    const antes = await accion(prestador, confirmada, 'resena-cliente', { estrellas: 4 });
    assert.equal(antes.status, 409);   // aún no cierra
    // La confirmada ya cumplió su papel: se da por cancelada para que las reglas de
    // ayudantía (1 al día, sin duplicada activa) no bloqueen la siguiente solicitud.
    await pool.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id = $1", [confirmada]);

    const id = await solicitudPagada();
    await accion(prestador, id, 'finalizar');
    await accion(cliente, id, 'cerrar');
    assert.equal((await accion(cliente, id, 'resena-cliente', { estrellas: 4 })).status, 403);   // el cliente no se califica a sí mismo
    assert.equal((await accion(prestador, id, 'resena-cliente', { estrellas: 4 })).status, 201);
    const repetida = await accion(prestador, id, 'resena-cliente', { estrellas: 3 });
    assert.equal(repetida.status, 409);
    assert.equal(repetida.body.error.codigo, 'YA_CALIFICADO');
  });

  // ---------------------------------------------------------- (1) vencimientos SEC automáticos
  test('el barrido avisa una sola vez antes del vencimiento y al vencer la verificación', async () => {
    const { revisarVencimientos } = await import('../src/modules/verificaciones/verificaciones.servicio.js');
    const insertar = (slug, organismo, dias, codigo) => pool.query(
      `INSERT INTO verificaciones (prestador_id, categoria_id, organismo, numero_registro, codigo_certificado, estado, vence_en, revisado_en)
       SELECT $1, id, $2, 'SEC-1', $3, 'aprobada', current_date + $4::int, now() FROM categorias WHERE slug = $5`,
      [prestador.id, organismo, codigo, dias, slug]);
    await insertar('electricidad', 'SEC', 10, 'QR-POR-VENCER');
    await insertar('gas', 'SEC', -2, 'QR-VENCIDA');
    await insertar('tala', 'CONAF', 60, 'QR-LEJANA');   // fuera de la ventana: no debe avisar

    const r1 = await revisarVencimientos(pool);
    assert.deepEqual(r1, { porVencer: 1, vencidas: 1 });
    const avisos = await pool.query(
      "SELECT titulo FROM notificaciones WHERE usuario_id = $1 AND tipo = 'verificacion' ORDER BY titulo", [prestador.id]);
    assert.equal(avisos.rowCount, 2);
    assert.match(avisos.rows[0].titulo, /está por vencer|venció/);
    assert.match(avisos.rows[1].titulo, /está por vencer|venció/);

    const r2 = await revisarVencimientos(pool);   // es idempotente: no repite avisos
    assert.deepEqual(r2, { porVencer: 0, vencidas: 0 });
  });

  test('un certificado viejo no avisa si el maestro ya lo renovó', async () => {
    const { revisarVencimientos } = await import('../src/modules/verificaciones/verificaciones.servicio.js');
    const insertar = (dias, codigo) => pool.query(
      `INSERT INTO verificaciones (prestador_id, categoria_id, organismo, numero_registro, codigo_certificado, estado, vence_en, revisado_en)
       SELECT $1, id, 'SEC', 'SEC-1', $2, 'aprobada', current_date + $3::int, now() FROM categorias WHERE slug = 'electricidad'`,
      [prestador.id, codigo, dias]);
    await insertar(-2, 'QR-ANTERIOR');
    await insertar(10, 'QR-RENOVADA-QUE-VENCE-PRONTO');
    await insertar(80, 'QR-RENOVADA');
    assert.deepEqual(await revisarVencimientos(pool), { porVencer: 0, vencidas: 0 });
    const { rowCount } = await pool.query("SELECT 1 FROM notificaciones WHERE usuario_id = $1 AND tipo = 'verificacion'", [prestador.id]);
    assert.equal(rowCount, 0);
  });
});
