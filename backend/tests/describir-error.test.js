// Errores sin mensaje (por ejemplo, la base de datos no responde) deben quedar legibles en el registro
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describirError } from '../src/utils/describirError.js';

test('usa el mensaje del error cuando lo tiene', () => {
  assert.equal(describirError(new Error('tabla inexistente')), 'tabla inexistente');
});

test('describe un AggregateError vacío con el código y la dirección de cada intento', () => {
  const intento = (address) => Object.assign(new Error(''), { code: 'ECONNREFUSED', address, port: 5432 });
  const err = new AggregateError([intento('::1'), intento('127.0.0.1')], '');
  assert.equal(describirError(err), 'ECONNREFUSED ::1:5432, ECONNREFUSED 127.0.0.1:5432');
});

test('sin mensaje ni código, al menos dice el tipo de error', () => {
  assert.equal(describirError(new TypeError('')), 'TypeError');
  assert.equal(describirError(null), 'error desconocido');
});
