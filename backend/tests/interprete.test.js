// HU-08: pruebas del intérprete de lenguaje natural (sin base de datos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretar, detectarComuna, comunaFueraDeCobertura } from '../src/modules/solicitudes/interprete.js';

// Mismas palabras clave que la migración 004; activas = fase 1 del lanzamiento
const categorias = [
  { slug: 'electricidad', nombre: 'Electricidad', activa: true,
    palabras_clave: ['electricista', 'electricidad', 'electrico', 'electrica', 'enchufe', 'luz', 'cortocircuito', 'tablero', 'automatico', 'cable', 'interruptor', 'lampara'] },
  { slug: 'poda-altura', nombre: 'Poda de altura', activa: true, palabras_clave: ['poda', 'podar', 'arbol', 'rama', 'ramas', 'altura'] },
  { slug: 'mecanica', nombre: 'Mecánica', activa: false, palabras_clave: ['mecanico', 'mecanica', 'auto', 'motor', 'frenos', 'vehiculo', 'camioneta', 'embrague'] },
  { slug: 'tala', nombre: 'Tala y volteo de árboles', activa: false, palabras_clave: ['tala', 'talar', 'cortar arbol', 'botar arbol', 'volteo'] },
  { slug: 'riego', nombre: 'Riego tecnificado', activa: false, palabras_clave: ['riego', 'regar', 'regadio', 'goteo', 'aspersor', 'canal'] },
  { slug: 'cercos', nombre: 'Cercos eléctricos y perimetrales', activa: false, palabras_clave: ['cerco', 'alambrado', 'ganado', 'cerco electrico'] },
];
const slugs = (lista) => lista.map((c) => c.slug);

test('detecta un servicio escrito con tildes y plurales', () => {
  const r = interpretar('Se me quemaron dos enchufes y saltó el automático', categorias);
  assert.deepEqual(slugs(r.categorias), ['electricidad']);
});

test('"problema eléctrico" se reconoce como electricidad', () => {
  assert.deepEqual(slugs(interpretar('Tengo un problema eléctrico en la cocina', categorias).categorias), ['electricidad']);
});

test('el ejemplo del informe: varios servicios y la comuna en una sola frase', () => {
  const r = interpretar('Necesito cortar un árbol y hacer canales de regadío en Coihueco', categorias);
  assert.deepEqual(slugs(r.categorias), ['poda-altura']);
  // tala y riego se detectan, pero aún no están habilitados en esta fase
  assert.deepEqual(slugs(r.no_disponibles).sort(), ['riego', 'tala']);
  assert.equal(r.comuna, 'Coihueco');
});

test('"automático" no se confunde con "auto" (mecánica)', () => {
  const r = interpretar('Se cae el automático cada vez que prendo el horno', categorias);
  assert.deepEqual(slugs(r.categorias), ['electricidad']);
  assert.deepEqual(r.no_disponibles, []);
});

test('palabras cortas solo coinciden exactas', () => {
  assert.deepEqual(slugs(interpretar('Se fue la luz en toda la casa', categorias).categorias), ['electricidad']);
  assert.deepEqual(interpretar('Necesito a alguien para mi auto', categorias).categorias, []);
  assert.deepEqual(slugs(interpretar('Necesito a alguien para mi auto', categorias).no_disponibles), ['mecanica']);
});

test('un texto sin relación no detecta nada', () => {
  const r = interpretar('Hola, quiero información', categorias);
  assert.deepEqual(r.categorias, []);
  assert.deepEqual(r.no_disponibles, []);
  assert.equal(r.comuna, null);
});

test('detecta Chillán o Coihueco, y reconoce las comunas donde aún no operamos', () => {
  assert.equal(detectarComuna('en CHILLÁN centro'), 'Chillán');
  assert.equal(detectarComuna('una parcela en coihueco'), 'Coihueco');
  // "Chillán Viejo" es otra comuna: no se confunde con Chillán
  assert.equal(detectarComuna('vivo en chillan viejo, cerca de la plaza'), null);
  assert.equal(comunaFueraDeCobertura('vivo en chillan viejo, cerca de la plaza'), 'Chillán Viejo');
  assert.equal(comunaFueraDeCobertura('trabajo en San Carlos'), 'San Carlos');
  assert.equal(comunaFueraDeCobertura('en Coihueco'), null);
  assert.equal(detectarComuna('en Santiago'), null);
  assert.equal(comunaFueraDeCobertura('en Santiago'), null);   // fuera de Ñuble: no se reconoce
});
