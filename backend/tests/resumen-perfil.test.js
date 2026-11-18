import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { descripcionBreve, puntosClave } from '../src/utils/resumenPerfil.js';

// Resumen corto del perfil para elegir maestro: lo importante, no el texto completo
describe('Resumen del perfil del maestro', () => {
  test('saca los años de experiencia de su descripción', () => {
    assert.ok(puntosClave({ descripcion: 'Gasfiter con 15 años de experiencia.' }).includes('15 años de experiencia'));
    assert.ok(puntosClave({ descripcion: 'Con experiencia de 8 años en obras.' }).includes('8 años de experiencia'));
  });

  test('reconoce puntualidad, urgencias y garantía', () => {
    const puntos = puntosClave({ descripcion: 'Soy muy puntual. Atiendo urgencias y doy garantía del trabajo.' });
    assert.ok(puntos.includes('Puntual'));
    assert.ok(puntos.includes('Atiende urgencias'));
    assert.ok(puntos.includes('Da garantía'));
  });

  test('muestra como máximo tres puntos, con lo verificado primero', () => {
    const puntos = puntosClave({
      descripcion: 'Puntual, 10 años de experiencia, atiendo urgencias y doy garantía.',
      categorias: [{ slug: 'electricidad', verificada: true }], trabajos_cerrados: 5,
    });
    assert.equal(puntos.length, 3);
    assert.equal(puntos[0], 'Verificado');
  });

  test('los trabajos cerrados se leen en singular o plural', () => {
    assert.deepEqual(puntosClave({ descripcion: '', trabajos_cerrados: 1 }), ['1 trabajo cerrado']);
    assert.deepEqual(puntosClave({ descripcion: '', trabajos_cerrados: 14 }), ['14 trabajos cerrados']);
    assert.deepEqual(puntosClave({ descripcion: '', trabajos_cerrados: 0 }), []);
  });

  test('no inventa nada: sin datos en la descripción no hay puntos de experiencia ni de puntualidad', () => {
    assert.deepEqual(puntosClave({ descripcion: 'Hago trabajos de gasfitería.' }), []);
  });

  test('la descripción breve es la primera frase, recortada si es muy larga', () => {
    assert.equal(descripcionBreve('Gasfiter con 15 años. Atiendo de lunes a viernes.'), 'Gasfiter con 15 años.');
    const larga = 'a'.repeat(200);
    const breve = descripcionBreve(larga);
    assert.equal(breve.length, 110);
    assert.ok(breve.endsWith('…'));
    assert.equal(descripcionBreve(''), null);
    assert.equal(descripcionBreve(null), null);
  });
});
