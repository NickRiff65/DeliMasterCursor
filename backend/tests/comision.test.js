import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

// Comisión de DeliMaster: 12 % de cada pago, con un tope de $25.000 por trabajo (decisión del equipo)
describe('Cálculo de la comisión', () => {
  let calcularComision;
  before(async () => {
    ({ calcularComision } = await import('../src/modules/pagos/pagos.servicio.js'));
  });

  test('cobra el 12 % en pesos enteros', () => {
    assert.equal(calcularComision(45_000), 5_400);
    assert.equal(calcularComision(10_001), 1_200);
  });

  test('nunca pasa de $25.000 por trabajo', () => {
    assert.equal(calcularComision(200_000), 24_000);
    assert.equal(calcularComision(300_000), 25_000);
    assert.equal(calcularComision(5_000_000), 25_000);
  });

  test('descuenta lo que el mismo trabajo ya pagó en otro cobro (la visita)', () => {
    assert.equal(calcularComision(375_000, 3_000), 22_000);   // saldo grande después de la visita
    assert.equal(calcularComision(50_000, 20_000), 5_000);    // solo lo que falta para el tope
    assert.equal(calcularComision(80_000, 25_000), 0);        // el tope ya se alcanzó
    assert.equal(calcularComision(10_000, 3_000), 1_200);     // lejos del tope: el 12 % normal
  });
});
