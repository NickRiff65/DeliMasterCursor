import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarMensaje } from '../src/modules/mensajes/filtro.js';

// Filtro de groserías y garabatos chilenos del chat: siempre activo, también después del pago
describe('Chat: groserías y garabatos chilenos', () => {
  const bloquea = (texto, opciones) => {
    const r = analizarMensaje(texto, opciones);
    assert.equal(r.bloqueado, true, `debió bloquear: "${texto}"`);
    assert.ok(r.motivos.includes('groseria'), `"${texto}" debió ser groseria; fue ${r.motivos}`);
    assert.match(r.aviso, /no se permiten groserías ni insultos/);
  };
  const permite = (texto) => {
    const r = analizarMensaje(texto);
    assert.equal(r.bloqueado, false, `no debió bloquear: "${texto}" (${r.motivos})`);
  };

  test('bloquea los garabatos chilenos más comunes y sus abreviaturas', () => {
    for (const t of [
      'eres un weón', 'oye huevón', 'qué wea más mala', 'tremendo aweonao', 'culiao', 'ql no llegaste',
      'conchetumare', 'concha de tu madre', 'ctm', 'csm', 'chucha', 'puta la hora', 'hijo de puta',
      'maraco', 'esto es una mierda', 'pichula', 'chúpalo', 'pal pico', 'idiota', 'estúpido',
    ]) bloquea(t);
  });

  test('resiste los trucos para esquivarlo: letras repetidas, números por letras y mayúsculas', () => {
    bloquea('weoooon');
    bloquea('W3ON');
    bloquea('put4 madre');
    bloquea('M I E R D A'.replace(/ /g, ''));
  });

  test('sigue activo después del pago', () => {
    bloquea('eres un weón', { trasPago: true });
  });

  test('no bloquea palabras de los oficios que se parecen', () => {
    permite('se rompió el pico de la llave');
    permite('son 20 mil y pico');
    permite('traigo paja para el jardín');
    permite('necesito un peón para mañana');
    permite('la computadora y la disputa');
    permite('mi perra ladra cuando llegan');
    permite('la manguera está rajada');
    permite('huevos y guía de despacho');
  });

  test('si además trae un teléfono, el aviso explica las dos cosas', () => {
    const r = analizarMensaje('weón llámame al 912345678');
    assert.deepEqual(r.motivos.slice(0, 1), ['groseria']);
    assert.ok(r.motivos.includes('telefono'));
    assert.match(r.aviso, /groserías/);
    assert.match(r.aviso, /números de teléfono/);
  });
});
