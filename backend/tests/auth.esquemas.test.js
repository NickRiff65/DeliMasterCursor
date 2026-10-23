// Pruebas de validación que no necesitan base de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esquemaPassword, esquemaRegistro } from '../src/modules/auth/auth.esquemas.js';

test('contraseñas válidas e inválidas', () => {
  assert.equal(esquemaPassword.safeParse('clave1234').success, true);
  assert.equal(esquemaPassword.safeParse('corta1').success, false);       // < 8
  assert.equal(esquemaPassword.safeParse('solamenteletras').success, false);
  assert.equal(esquemaPassword.safeParse('1234567890').success, false);
  assert.equal(esquemaPassword.safeParse('a1'.repeat(37)).success, false); // > 72
});

test('normaliza correo y teléfono chileno', () => {
  const r = esquemaRegistro.parse({
    rol: 'cliente', nombre: '  Luis  ', apellido: ' Soto   Pérez ', email: ' LUIS@Mail.CL ', password: 'abc12345', telefono: '+56 9 8765-4321', acepta_terminos: true,
  });
  assert.equal(r.email, 'luis@mail.cl');
  assert.equal(r.nombre, 'Luis');
  assert.equal(r.apellido, 'Soto Pérez');
  assert.equal(r.telefono, '+56987654321');
});

test('rechaza teléfonos que no son celulares chilenos', () => {
  const r = esquemaRegistro.safeParse({
    rol: 'cliente', nombre: 'Luis', apellido: 'Soto', email: 'luis@mail.cl', password: 'abc12345', telefono: '422123456',
  });
  assert.equal(r.success, false);
});
