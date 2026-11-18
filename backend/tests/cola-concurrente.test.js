import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

// Defecto encontrado en la medición de sincronización (rendimiento/sincronizacion.js): si la app enviaba la
// misma solicitud dos veces a la vez, una de las respuestas era un error 500. El dato no se duplicaba, pero
// el teléfono recibía un error que no correspondía.
describe('Cola sin conexión: envíos simultáneos de la misma solicitud', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool;
  let n = 0;
  let cliente;

  before(async () => {
    pool = await prepararBase();
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(() => pool.end());

  beforeEach(async () => {
    await limpiarBase(pool);
    n++;
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol: 'cliente', ...partirNombre('Ana Pérez'), email: `cc${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    cliente = { id: body.usuario.id, token: body.token };
  });

  const enviar = (datos) => request(app).post('/api/solicitudes').set('Authorization', `Bearer ${cliente.token}`).send(datos);

  test('dos envíos a la vez: uno crea (201), el otro se reconoce como reenvío (200) y queda una sola solicitud', async () => {
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      await pool.query('DELETE FROM solicitud_eventos; DELETE FROM solicitudes');
      const datos = { id: randomUUID(), descripcion: 'Se me quemó un enchufe y saltó el automático', comuna: 'Chillán', direccion: 'Av. Libertad 1234' };
      const [a, b] = await Promise.all([enviar(datos), enviar(datos)]);
      assert.deepEqual([a.status, b.status].sort(), [200, 201], `vuelta ${vuelta}: ${a.status} y ${b.status}`);
      assert.equal(a.body.solicitudes[0].id, datos.id);
      assert.equal(b.body.solicitudes[0].id, datos.id);
      const { rows: [{ c }] } = await pool.query('SELECT count(*)::int AS c FROM solicitudes WHERE id = $1', [datos.id]);
      assert.equal(c, 1);
    }
  });

  test('el identificador de otra persona sigue rechazándose (409), también en envíos simultáneos', async () => {
    const datos = { id: randomUUID(), descripcion: 'Se me quemó un enchufe y saltó el automático', comuna: 'Chillán', direccion: 'Av. Libertad 1234' };
    assert.equal((await enviar(datos)).status, 201);
    const { body } = await request(app).post('/api/auth/registro')
      .send({ rol: 'cliente', ...partirNombre('Otra Persona'), email: `cc-otra${n}@test.cl`, password: 'clave1234', acepta_terminos: true, comuna: 'Chillán' });
    const ajena = await request(app).post('/api/solicitudes').set('Authorization', `Bearer ${body.token}`).send(datos);
    assert.equal(ajena.status, 409);
    assert.equal(ajena.body.error.codigo, 'ID_EN_USO');
  });

  test('los límites reales siguen aplicando: otra solicitud distinta el mismo día se rechaza', async () => {
    const base = { descripcion: 'Se me quemó un enchufe y saltó el automático', comuna: 'Chillán', direccion: 'Av. Libertad 1234' };
    assert.equal((await enviar({ ...base, id: randomUUID() })).status, 201);
    const otra = await enviar({ ...base, id: randomUUID(), descripcion: 'Necesito pintar el living completo' });
    assert.equal(otra.status, 409);
  });
});
