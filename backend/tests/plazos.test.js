// El reloj de plazos no espera a que alguien abra la app.
process.env.NODE_ENV = 'test';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRelojPlazos } from '../src/tareas/plazos.js';

test('revisa los plazos al encender el reloj', () => {
  let veces = 0;
  const detener = crearRelojPlazos(() => { veces += 1; }, { intervaloMs: 60_000 });
  assert.equal(veces, 1);
  detener();
});

test('vuelve a revisar en cada intervalo y un fallo no lo detiene', async () => {
  const veces = [];
  let tick;
  const detener = crearRelojPlazos(() => {
    veces.push('tick');
    if (veces.length === 2) throw new Error('sin base');
  }, {
    intervaloMs: 1000,
    programar: (fn) => {
      tick = fn;
      return { unref() {} };
    },
  });
  assert.deepEqual(veces, ['tick']);
  tick();
  await new Promise((resolver) => setImmediate(resolver));
  assert.deepEqual(veces, ['tick', 'tick']);
  tick();
  assert.equal(veces.length, 3);
  detener();
});
