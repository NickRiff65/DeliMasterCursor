process.env.NODE_ENV = 'test';

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { hayBaseDeDatos } from './helpers/db.js';

const { crearApp } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const app = crearApp();
after(() => pool.end());

test('GET /api/salud responde ok y confirma que la base de datos contesta', { skip: !hayBaseDeDatos }, async () => {
  const res = await request(app).get('/api/salud');
  assert.equal(res.status, 200);
  assert.equal(res.body.estado, 'ok');
  assert.equal(res.body.base_datos, 'ok');
  assert.ok(res.body.latencia_bd_ms >= 0);
});

test('si la base de datos no contesta, /api/salud responde 503 (servicio degradado)', async () => {
  const original = pool.query;
  pool.query = async () => { throw new Error('conexión rechazada'); };
  try {
    const res = await request(app).get('/api/salud');
    assert.equal(res.status, 503);
    assert.equal(res.body.estado, 'degradado');
    assert.equal(res.body.base_datos, 'sin conexión');
    assert.doesNotMatch(JSON.stringify(res.body), /rechazada/, 'no expone el detalle del error');
  } finally {
    pool.query = original;
  }
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
