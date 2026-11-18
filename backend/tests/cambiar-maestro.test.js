import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// El cliente cambia de maestro mientras el que eligió no responde: la misma solicitud, sin crear otra
describe('Cambiar de maestro antes de que responda', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app;
  let pool;
  let n = 0;
  let cliente, otroCliente, podador, otroPodador;

  before(async () => {
    pool = await prepararBase();
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  async function registrar(rol, nombre, extra = {}) {
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol, ...partirNombre(nombre), email: `cm${n}@test.cl`, password: 'clave1234', acepta_terminos: true, telefono: '912345678', ...extra });
    return { id: body.usuario.id, token: body.token };
  }
  async function prestador(nombre) {
    const p = await registrar('prestador', nombre);
    await request(app).put('/api/prestadores/yo').set('Authorization', `Bearer ${p.token}`)
      .send({ categorias: ['poda-altura'], comunas_atendidas: ['Chillán'] });
    return p;
  }
  const como = (u) => (req) => req.set('Authorization', `Bearer ${u.token}`);
  const crear = (u, cuerpo) => como(u)(request(app).post('/api/solicitudes')).send({ direccion: 'Av. Libertad 1234', id: randomUUID(), ...cuerpo });

  beforeEach(async () => {
    await limpiarBase(pool);
    cliente = await registrar('cliente', 'Ana Pérez', { comuna: 'Chillán' });
    otroCliente = await registrar('cliente', 'Otro Cliente');
    podador = await prestador('Luis Poda');
    otroPodador = await prestador('Carlos Poda');
  });

  // Una solicitud asignada al primer podador, todavía sin respuesta
  async function solicitudAsignada() {
    const { body } = await crear(cliente, { descripcion: 'Necesito podar un árbol muy alto' });
    const id = body.solicitudes[0].id;
    await como(cliente)(request(app).post(`/api/solicitudes/${id}/asignar`)).send({ prestador_id: podador.id });
    return id;
  }

  test('el cliente cambia de maestro: la misma solicitud vuelve a estar disponible, sin crear otra', async () => {
    const id = await solicitudAsignada();
    const res = await como(cliente)(request(app).post(`/api/solicitudes/${id}/cambiar-maestro`)).send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.id, id);
    assert.equal(res.body.solicitud.estado, 'creada');
    assert.equal(res.body.solicitud.prestador, null);
    assert.equal((await pool.query('SELECT 1 FROM solicitudes')).rowCount, 1);
  });

  test('el maestro anterior recibe un aviso y deja de ver la solicitud', async () => {
    const id = await solicitudAsignada();
    await como(cliente)(request(app).post(`/api/solicitudes/${id}/cambiar-maestro`)).send({});

    const aviso = await pool.query("SELECT titulo FROM notificaciones WHERE usuario_id = $1 AND solicitud_id = $2", [podador.id, id]);
    assert.ok(aviso.rows.some((r) => r.titulo === 'El cliente cambió de maestro'));
    const suyas = await como(podador)(request(app).get('/api/solicitudes')).send();
    assert.equal(suyas.body.solicitudes.length, 0);
  });

  test('después puede elegir a otro maestro, que tiene su propio plazo para responder', async () => {
    const id = await solicitudAsignada();
    await como(cliente)(request(app).post(`/api/solicitudes/${id}/cambiar-maestro`)).send({});

    const res = await como(cliente)(request(app).post(`/api/solicitudes/${id}/asignar`)).send({ prestador_id: otroPodador.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.estado, 'asignada');
    assert.equal(res.body.solicitud.prestador.id, otroPodador.id);
    assert.ok(res.body.solicitud.responder_antes_de, 'el nuevo maestro tiene un plazo para responder');
  });

  test('no se puede cambiar cuando el maestro ya respondió y la solicitud avanzó', async () => {
    const id = await solicitudAsignada();
    await pool.query("UPDATE solicitudes SET estado = 'confirmada' WHERE id = $1", [id]);

    const res = await como(cliente)(request(app).post(`/api/solicitudes/${id}/cambiar-maestro`)).send({});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.codigo, 'ESTADO_INVALIDO');
  });

  test('una solicitud que todavía no tiene maestro no necesita cambio', async () => {
    const { body } = await crear(cliente, { descripcion: 'Necesito podar un árbol muy alto' });
    const res = await como(cliente)(request(app).post(`/api/solicitudes/${body.solicitudes[0].id}/cambiar-maestro`)).send({});
    assert.equal(res.status, 409);
  });

  test('otro cliente no puede cambiar la solicitud ajena', async () => {
    const id = await solicitudAsignada();
    const res = await como(otroCliente)(request(app).post(`/api/solicitudes/${id}/cambiar-maestro`)).send({});
    assert.equal(res.status, 404);
    const sigue = await pool.query('SELECT estado, prestador_id FROM solicitudes WHERE id = $1', [id]);
    assert.equal(sigue.rows[0].estado, 'asignada');
    assert.equal(sigue.rows[0].prestador_id, podador.id);
  });
});
