// Pruebas sin base de datos: la API entrega también la versión web de Lite, Pro y el panel.
process.env.NODE_ENV = 'test';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'delimaster-web-'));
function sitio(nombre) {
  const carpeta = path.join(raiz, nombre);
  fs.mkdirSync(path.join(carpeta, '_expo'), { recursive: true });
  fs.writeFileSync(path.join(carpeta, 'index.html'), `<!doctype html><title>${nombre}</title>`);
  fs.writeFileSync(path.join(carpeta, '_expo', 'app-abc123.js'), `console.log('${nombre}')`);
  return carpeta;
}

let app;
before(async () => {
  process.env.CARPETA_WEB_LITE = sitio('lite');
  process.env.CARPETA_WEB_PRO = sitio('pro');
  process.env.CARPETA_WEB_ADMIN = sitio('admin');
  const { crearApp } = await import('../src/app.js');
  app = crearApp();
});
after(() => fs.rmSync(raiz, { recursive: true, force: true }));

const html = (ruta) => request(app).get(ruta).set('Accept', 'text/html');

test('cada versión web se entrega en su dirección, también al recargar una pantalla interna', async () => {
  for (const [ruta, titulo] of [
    ['/', 'lite'], ['/solicitud/123', 'lite'], ['/pro', 'pro'], ['/pro/trabajo/9', 'pro'],
    ['/admin', 'admin'], ['/admin/disputas', 'admin'],
  ]) {
    const res = await html(ruta);
    assert.equal(res.status, 200, ruta);
    assert.match(res.text, new RegExp(`<title>${titulo}</title>`), ruta);
    assert.equal(res.headers['cache-control'], 'no-cache', ruta);
  }
});

test('los archivos de cada app se sirven con caché y desde su propia carpeta', async () => {
  const res = await request(app).get('/pro/_expo/app-abc123.js');
  assert.equal(res.status, 200);
  assert.match(res.text, /'pro'/);
  assert.match(res.headers['cache-control'], /max-age=604800/);
});

test('la API sigue respondiendo en JSON, incluso en rutas que no existen', async () => {
  assert.ok((await request(app).get('/api')).body.rutas);
  const res = await html('/api/no-existe');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.codigo, 'RUTA_NO_ENCONTRADA');
  assert.equal((await request(app).post('/cualquier-cosa')).status, 404);
});

test('la política de seguridad permite usar la versión web por http en la red local', async () => {
  const csp = (await html('/')).headers['content-security-policy'];
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.match(csp, /script-src 'self'/);
});
