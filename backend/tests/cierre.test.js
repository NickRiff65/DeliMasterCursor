import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('Cierre del trabajo y reseñas (HU-06, HU-07)', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool;
  let n = 0;
  let cliente, prestador, otroPrestador;

  before(async () => {
    pool = await prepararBase();
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  async function registrar(rol, nombre) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `k${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    return { id: body.usuario.id, token: body.token };
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const accion = (u, id, nombre, cuerpo = {}) => como(u)(request(app).post(`/api/solicitudes/${id}/${nombre}`)).send(cuerpo);

  // Crea una solicitud pagada de `p`, con el dinero retenido en el ledger (como deja el pago con Webpay)
  async function solicitudPagada(p = prestador, precio = 45000) {
    // La regla de ayudantía (máx. 1 solicitud por día por cliente) contaría las anteriores
    // de esta misma prueba: se corre un día atrás la creación de las que ya armó este cliente.
    await pool.query(
      `UPDATE solicitudes SET creado_en = creado_en - interval '1 day'
        WHERE cliente_id = $1
          AND (creado_en AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date`,
      [cliente.id]);
    const id = randomUUID();
    await como(cliente)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id, descripcion: 'Necesito podar un árbol alto' });
    await accion(cliente, id, 'asignar', { prestador_id: p.id });
    await accion(p, id, 'responder', { aceptar: true, precio });
    await pool.query("UPDATE solicitudes SET estado = 'pagada' WHERE id = $1", [id]);
    const { rows: [pago] } = await pool.query(
      `INSERT INTO pagos (solicitud_id, orden_compra, monto, estado) VALUES ($1, $2, $3, 'autorizado') RETURNING id`,
      [id, `OC-${randomUUID().slice(0, 8)}`, precio]);
    const comision = Math.round(precio * 0.12);
    await pool.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto)
       VALUES ($1, $2, $3, $4, $5, $6)`, [id, pago.id, p.id, precio, comision, precio - comision]);
    return id;
  }
  async function solicitudCerrada(p = prestador) {
    const id = await solicitudPagada(p);
    await accion(p, id, 'finalizar');
    await accion(cliente, id, 'cerrar');
    return id;
  }
  const ledger = async (id) => (await pool.query('SELECT estado, liberado_en FROM ledger_movimientos WHERE solicitud_id = $1', [id])).rows[0];

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez');
    prestador = await registrar('prestador', 'Luis Poda');
    otroPrestador = await registrar('prestador', 'Pedro Poda');
    for (const p of [prestador, otroPrestador]) {
      await como(p)(request(app).put('/api/prestadores/yo')).send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    }
  });

  // ------------------------------------------------------------------ finalizar y cerrar
  test('el prestador marca el trabajo como terminado solo si está pagado', async () => {
    const id = await solicitudPagada();
    assert.equal((await accion(cliente, id, 'finalizar')).status, 403);        // el cliente no puede
    assert.equal((await accion(otroPrestador, id, 'finalizar')).status, 404);  // otro prestador tampoco
    const res = await accion(prestador, id, 'finalizar');
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.estado, 'finalizada');
    assert.ok(res.body.solicitud.cierre_automatico_en);
    assert.equal((await accion(prestador, id, 'finalizar')).status, 409);       // no dos veces
  });

  test('al cerrar, el pago pasa de retenido a liberado y cuenta como trabajo cerrado', async () => {
    const id = await solicitudPagada();
    assert.equal((await accion(cliente, id, 'cerrar')).status, 409);            // aún no termina
    await accion(prestador, id, 'finalizar');
    const res = await accion(cliente, id, 'cerrar');
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.estado, 'cerrada');
    assert.equal(res.body.solicitud.estado_pago, 'liberado');
    assert.equal(res.body.solicitud.monto_neto, 39600);

    assert.equal((await ledger(id)).estado, 'liberado');
    const ev = await pool.query("SELECT estado_anterior, estado_nuevo, monto, actor_id FROM ledger_eventos WHERE estado_nuevo = 'liberado'");
    assert.deepEqual(ev.rows, [{ estado_anterior: 'retenido', estado_nuevo: 'liberado', monto: 39600, actor_id: cliente.id }]);
    const { rows: [p] } = await pool.query('SELECT trabajos_cerrados FROM prestadores WHERE usuario_id = $1', [prestador.id]);
    assert.equal(p.trabajos_cerrados, 1);
  });

  test('si el cliente no responde en 72 horas, el trabajo se cierra solo y se libera el pago', async () => {
    const id = await solicitudPagada();
    await accion(prestador, id, 'finalizar');
    await pool.query("UPDATE solicitudes SET finalizada_en = now() - interval '73 hours' WHERE id = $1", [id]);
    const res = await como(prestador)(request(app).get(`/api/solicitudes/${id}`));
    assert.equal(res.body.solicitud.estado, 'cerrada');
    assert.match(res.body.solicitud.eventos.at(-1).detalle, /Cierre automático/);
    assert.equal((await ledger(id)).estado, 'liberado');
  });

  test('si el cliente reporta un problema, el dinero sigue retenido y no se cierra solo', async () => {
    const id = await solicitudPagada();
    await accion(prestador, id, 'finalizar');
    const corto = await accion(cliente, id, 'reportar', { motivo: 'mal' });
    assert.equal(corto.status, 422);
    const res = await accion(cliente, id, 'reportar', { motivo: 'Dejó ramas sobre el techo y no terminó la poda' });
    assert.equal(res.body.solicitud.estado, 'en_disputa');
    assert.equal(res.body.solicitud.estado_pago, 'retenido');
    await pool.query("UPDATE solicitudes SET finalizada_en = now() - interval '100 hours' WHERE id = $1", [id]);
    await como(cliente)(request(app).get(`/api/solicitudes/${id}`));
    assert.equal((await ledger(id)).estado, 'retenido');
  });

  // ------------------------------------------------------------------ HU-06 / HU-07
  test('solo se puede calificar un trabajo cerrado, una vez', async () => {
    const pagada = await solicitudPagada();
    assert.equal((await accion(cliente, pagada, 'resena', { estrellas: 5 })).status, 409);
    // La pagada ya cumplió su papel: se da por cancelada para que las reglas de ayudantía
    // (1 solicitud al día y sin duplicada activa de la misma categoría) no bloqueen la siguiente.
    await pool.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id = $1", [pagada]);
    const id = await solicitudCerrada();
    const res = await accion(cliente, id, 'resena', { estrellas: 5, comentario: 'Excelente, muy prolijo' });
    assert.equal(res.status, 201);
    assert.deepEqual({ ...res.body.solicitud.resena, creado_en: undefined }, { estrellas: 5, comentario: 'Excelente, muy prolijo', creado_en: undefined });
    const otra = await accion(cliente, id, 'resena', { estrellas: 1 });
    assert.equal(otra.status, 409);
    assert.equal(otra.body.error.codigo, 'YA_CALIFICADO');
  });

  test('valida las estrellas (1 a 5, enteras)', async () => {
    const id = await solicitudCerrada();
    for (const estrellas of [0, 6, 4.5]) {
      assert.equal((await accion(cliente, id, 'resena', { estrellas })).status, 422);
    }
  });

  test('la reputación se recalcula desde las reseñas y aparece en el perfil público', async () => {
    for (const estrellas of [5, 4, 4]) {
      const id = await solicitudCerrada();
      await accion(cliente, id, 'resena', { estrellas, comentario: `Nota ${estrellas}` });
    }
    const perfil = await request(app).get(`/api/prestadores/${prestador.id}`);
    assert.equal(perfil.body.prestador.calificacion_promedio, 4.33);
    assert.equal(perfil.body.prestador.total_resenas, 3);
    assert.equal(perfil.body.prestador.trabajos_cerrados, 3);
    assert.equal(perfil.body.prestador.resenas.length, 3);
    assert.equal(perfil.body.prestador.resenas[0].cliente, 'Ana');   // solo el primer nombre
  });

  test('HU-07: las reseñas cambian el orden del catálogo', async () => {
    const antes = await request(app).get('/api/prestadores?categoria=poda-altura');
    assert.equal(antes.body.prestadores.length, 2);
    // Pedro recibe una mala reseña: Luis (sin reseñas, parte en 4,0) debe quedar primero
    const id = await solicitudCerrada(otroPrestador);
    await accion(cliente, id, 'resena', { estrellas: 1 });
    const despues = await request(app).get('/api/prestadores?categoria=poda-altura');
    assert.deepEqual(despues.body.prestadores.map((p) => p.nombre), ['Luis Poda', 'Pedro Poda']);
  });

  test('el chat se cierra al cerrar el trabajo', async () => {
    const id = await solicitudCerrada();
    const res = await como(cliente)(request(app).post(`/api/solicitudes/${id}/mensajes`)).send({ contenido: 'Gracias' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'CHAT_CERRADO');
  });
});
