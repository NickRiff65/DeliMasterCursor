import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hayBaseDeDatos, motivoOmision, prepararBase, limpiarBase, partirNombre } from './helpers/db.js';

describe('Avisos push con la app cerrada', { skip: !hayBaseDeDatos && motivoOmision }, () => {
  let app, pool, usarEnvioPush;
  const enviados = [];

  before(async () => {
    pool = await prepararBase();
    ({ usarEnvioPush } = await import('../src/utils/push.js'));
    usarEnvioPush(async (mensajes) => { enviados.push(...mensajes); });
    const { crearApp } = await import('../src/app.js');
    app = crearApp();
  });
  after(async () => {
    usarEnvioPush(null);
    await pool.end();
  });

  test('registra el teléfono y el aviso sale hacia ese token', async () => {
    await limpiarBase(pool);
    enviados.length = 0;
    const { body } = await request(app).post('/api/auth/registro').send({
      rol: 'cliente', ...partirNombre('Ana Pérez'), email: 'push@test.cl', password: 'clave1234',
      acepta_terminos: true, comuna: 'Chillán',
    });
    const token = 'ExponentPushToken[equipo-demo]';
    const alta = await request(app).post('/api/notificaciones/dispositivo')
      .set('Authorization', `Bearer ${body.token}`).send({ token, plataforma: 'android' });
    assert.equal(alta.status, 204);

    const malo = await request(app).post('/api/notificaciones/dispositivo')
      .set('Authorization', `Bearer ${body.token}`).send({ token: 'no-es-token', plataforma: 'android' });
    assert.equal(malo.status, 422);

    const { crearNotificacion } = await import('../src/modules/notificaciones/notificaciones.servicio.js');
    await crearNotificacion(pool, body.usuario.id, { titulo: 'Te eligieron', texto: 'Hay un trabajo en Chillán' });
    await new Promise((resolver) => setTimeout(resolver, 200));
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, token);
    assert.equal(enviados[0].title, 'Te eligieron');
    assert.equal(enviados[0].body, 'Hay un trabajo en Chillán');
  });
});