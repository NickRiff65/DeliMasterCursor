process.env.NODE_ENV = 'test';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

const { crearApp } = await import('../src/app.js');
const app = crearApp();

test('GET /api/salud responde ok', async () => {
  const res = await request(app).get('/api/salud');
  assert.equal(res.status, 200);
  assert.equal(res.body.estado, 'ok');
});

test('GET /api muestra el índice de rutas', async () => {
  const res = await request(app).get('/api');
  assert.equal(res.status, 200);
  assert.ok(res.body.rutas['POST /api/auth/login']);
});

test('una ruta inexistente responde 404 con formato de error', async () => {
  const res = await request(app).get('/api/no-existe');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.codigo, 'RUTA_NO_ENCONTRADA');
});

test('un JSON mal formado responde 400', async () => {
  const res = await request(app)
    .post('/api/salud')
    .set('Content-Type', 'application/json')
    .send('{mal json');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.codigo, 'JSON_INVALIDO');
});
