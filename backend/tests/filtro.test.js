// HU-04: pruebas del filtro anti-fuga (sin base de datos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarMensaje, analizarConContexto } from '../src/modules/mensajes/filtro.js';

const bloquea = (texto, motivo) => {
  const r = analizarMensaje(texto);
  assert.equal(r.bloqueado, true, `debió bloquear: "${texto}"`);
  if (motivo) assert.ok(r.motivos.includes(motivo), `"${texto}" debió marcarse como ${motivo}; fue ${r.motivos}`);
};
const permite = (texto) => {
  const r = analizarMensaje(texto);
  assert.equal(r.bloqueado, false, `no debió bloquear: "${texto}" (${r.motivos})`);
};

test('bloquea teléfonos en sus formatos habituales', () => {
  bloquea('mi número es +56 9 8765 4321', 'telefono');
  bloquea('llámame al 987654321', 'telefono');
  bloquea('9-87-65-43-21', 'telefono');
  bloquea('9.8765.4321', 'telefono');
  bloquea('(42) 2 123 456', 'telefono');
});

test('bloquea teléfonos escritos en palabras', () => {
  bloquea('nueve ocho siete seis cinco cuatro tres dos uno', 'telefono');
  bloquea('9 ocho 7 seis 5 cuatro 3 dos 1', 'telefono');
});

test('bloquea correos, aunque escriban "arroba" y "punto"', () => {
  bloquea('escríbeme a juan.soto@gmail.com', 'correo');
  bloquea('juansoto arroba gmail punto com', 'correo');
});

test('bloquea datos bancarios e intentos de pago por fuera', () => {
  bloquea('te paso mi cuenta rut', 'datos_bancarios');
  bloquea('mejor transfiéreme directo y te hago descuento', 'datos_bancarios');
  bloquea('deposita en BancoEstado', 'datos_bancarios');
  bloquea('mi rut 12.345.678-9');
});

test('bloquea contactos por otras aplicaciones y enlaces', () => {
  bloquea('háblame por wsp', 'contacto_externo');
  bloquea('agrégame a WhatsApp', 'contacto_externo');
  bloquea('mira mis trabajos en instagram', 'contacto_externo');
  bloquea('ve mi página www.maestrojuan.cl', 'enlace');
});

test('permite una conversación normal de trabajo', () => {
  permite('Hola, ¿puede venir mañana a las 10?');
  permite('El árbol mide como 8 metros, tiene ramas sobre el techo');
  permite('Serían $45.000 con materiales incluidos');
  permite('Cobro 45000 pesos, demoro dos horas');
  permite('Llego en 20 minutos, voy con 2 ayudantes');
  permite('Necesito una escalera de 6 metros');
});

test('el aviso explica qué se bloqueó', () => {
  const r = analizarMensaje('mi wsp es 987654321');
  assert.match(r.aviso, /teléfono/);
  assert.match(r.aviso, /otras aplicaciones/);
});

// Casos encontrados probando la app (captura del equipo)
test('bloquea dígitos separados por cualquier símbolo', () => {
  bloquea('2*1*2*3*2*3*2*1-0', 'telefono');
  bloquea('9_8_7_6_5_4_3_2', 'telefono');
  bloquea('9#87#65#43#21', 'telefono');
  bloquea('9, 8, 7, 6, 5, 4, 3, 2', 'telefono');
  bloquea('dos 1 3 cuatro 4 cuatro 5 1 guion 1 es mi rut', 'telefono');
});

test('bloquea la intención de pagar por fuera, aunque no haya datos', () => {
  bloquea('si, pero podemos hacer el pago sin la aplicacion', 'pago_externo');
  bloquea('mejor págame en efectivo cuando llegue', 'pago_externo');
  bloquea('así nos ahorramos la comisión', 'pago_externo');
  bloquea('arreglemos por fuera de la app', 'pago_externo');
  bloquea('te paso mi rut', 'datos_bancarios');
});

test('una lista de precios no se confunde con un teléfono', () => {
  permite('Cobro 45000, materiales 20000');
  permite('Mano de obra 30000; materiales 15000');
  permite('Son 3 árboles, el más alto de 12 metros, en 2 horas');
});

test('detecta datos enviados por partes en varios mensajes', () => {
  // Igual que en la captura: "ese" / "es" / "mi" / "rut" en mensajes separados
  const r = analizarConContexto('rut', ['ese', 'es', 'mi']);
  assert.equal(r.bloqueado, true);
  assert.match(r.aviso, /varios mensajes/);

  const digitos = ['2', '1', '3', '4', '4', '4', '5'];
  assert.equal(analizarConContexto('1', digitos).bloqueado, true);   // el octavo dígito se bloquea
  assert.equal(analizarConContexto('1', digitos.slice(0, 3)).bloqueado, false);
});

test('el contexto no bloquea una conversación normal', () => {
  const anteriores = ['Hola, puedo ir el sábado', 'Llego a las 10', 'Voy con 2 ayudantes'];
  assert.equal(analizarConContexto('Serían $45.000 en total', anteriores).bloqueado, false);
});
