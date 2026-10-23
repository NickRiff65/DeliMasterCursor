// Pruebas unitarias sin base de datos.
process.env.NODE_ENV = 'test';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarComuna, COMUNAS } from '../src/utils/comunas.js';
import { distanciaMetros, RADIO_LLEGADA_M } from '../src/utils/geo.js';

const { puntajeReputacion } = await import('../src/modules/prestadores/prestadores.servicio.js');

test('DeliMaster opera en Chillán y Coihueco', () => {
  assert.deepEqual(COMUNAS, ['Chillán', 'Coihueco']);
});

test('normaliza comunas sin importar tildes, mayúsculas ni espacios; las demás no se aceptan', () => {
  assert.equal(normalizarComuna('chillan'), 'Chillán');
  assert.equal(normalizarComuna('  COIHUECO '), 'Coihueco');
  assert.equal(normalizarComuna('Chillán Viejo'), null);
  assert.equal(normalizarComuna('San Carlos'), null);
  assert.equal(normalizarComuna('Santiago'), null);
});

test('la llegada se mide en metros y 1,5 km queda dentro de la zona', () => {
  assert.equal(distanciaMetros(-36.6066, -72.1034, -36.6066, -72.1034), 0);
  assert.ok(distanciaMetros(-36.6066, -72.1034, -36.61, -72.1034) < RADIO_LLEGADA_M);
  assert.ok(distanciaMetros(-36.6066, -72.1034, -36.63, -72.1034) > RADIO_LLEGADA_M);
});

test('puntaje de reputación: un prestador nuevo parte en 4,0', () => {
  assert.equal(puntajeReputacion(0, 0), 4);
});

test('puntaje de reputación: el volumen de reseñas pesa', () => {
  assert.ok(puntajeReputacion(4.8, 40) > puntajeReputacion(5, 1));
  assert.ok(puntajeReputacion(3, 10) < puntajeReputacion(0, 0));
});
