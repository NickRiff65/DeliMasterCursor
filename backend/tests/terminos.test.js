// Pruebas sin base de datos: la versión de los términos debe ser la misma en la API y en las apps.
// Si no coinciden, la app envía una versión que la API rechaza y nadie puede pasar de la pantalla
// "Términos actualizados".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const version = async (ruta) => {
  const texto = await readFile(new URL(ruta, import.meta.url), 'utf8');
  return texto.match(/export const VERSION_TERMINOS = '([^']+)'/)?.[1];
};

test('la API y las apps publican la misma versión de los términos', async () => {
  const api = await version('../src/modules/auth/auth.servicio.js');
  const apps = await version('../../mobile/src/legal/textos.js');
  assert.ok(api, 'no se encontró VERSION_TERMINOS en el backend');
  assert.equal(apps, api, `la app usa la versión ${apps} y la API la ${api}`);
});
