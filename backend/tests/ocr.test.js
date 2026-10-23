// HU-09: extracción del total de una boleta a partir del texto leído (sin base de datos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerTotal } from '../src/modules/gastos/ocr.js';

test('toma el monto de la línea TOTAL, no del subtotal ni del IVA', () => {
  const texto = `FERRETERIA EL MAESTRO
RUT 76.123.456-7
CABLE THHN 2.5MM X 10M 8.990
INTERRUPTOR 16A 4.500
SUBTOTAL 13.490
NETO 12.420
IVA 2.360
TOTAL $ 14.780`;
  assert.deepEqual(extraerTotal(texto), { monto: 14780, confianza: 0.9, fuente: 'linea_total' });
});

test('acepta variantes como "MONTO TOTAL" o "TOTAL A PAGAR" y montos sin puntos', () => {
  assert.equal(extraerTotal('MONTO TOTAL: 23500').monto, 23500);
  assert.equal(extraerTotal('Total a pagar $1.234.567').monto, 1234567);
});

test('si no encuentra "TOTAL", propone el mayor monto con confianza baja', () => {
  const r = extraerTotal('Pintura látex 9.990\nRodillo 3.490');
  assert.deepEqual(r, { monto: 9990, confianza: 0.4, fuente: 'mayor_monto' });
});

test('no confunde el RUT ni el número de boleta con montos razonables en la línea TOTAL', () => {
  const r = extraerTotal('BOLETA N 004512\nRUT 76.123.456-7\nTOTAL 5.990');
  assert.equal(r.monto, 5990);
});

test('sin montos legibles devuelve null (se pide el ingreso manual)', () => {
  assert.deepEqual(extraerTotal('gracias por su compra'), { monto: null, confianza: 0, fuente: null });
  assert.deepEqual(extraerTotal(''), { monto: null, confianza: 0, fuente: null });
});
