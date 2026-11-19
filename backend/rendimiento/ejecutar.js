// Lanza una prueba de rendimiento con k6 contra un servidor de pruebas (nunca contra el real).
//   npm run rendimiento -- carga      (CP-13: 100 usuarios, 10 minutos)
//   npm run rendimiento -- estres     (CP-14: hasta 300 usuarios)
// Antes hay que levantar el servidor de pruebas con la base de carga y los datos de demostración:
//   DB_NAME=delimaster_carga npm run migrate && DB_NAME=delimaster_carga npm run db:demo
//   PORT=3001 DB_NAME=delimaster_carga TRUST_PROXY=1 node --env-file=.env src/server.js
// Guarda el resumen de k6 en rendimiento/resultados/ (texto y JSON) como evidencia.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const prueba = process.argv[2];
if (!['carga', 'estres'].includes(prueba)) {
  console.error('Uso: npm run rendimiento -- carga | estres');
  process.exit(1);
}
const aqui = import.meta.dirname;
const base = process.env.BASE_URL ?? 'http://localhost:3001';
if (/:3000\b/.test(base) || /ts\.net/.test(base)) {
  console.error('✘ Esta prueba no se ejecuta contra el servidor real. Usa el servidor de pruebas (puerto 3001).');
  process.exit(1);
}

// Cuentas de maestro y contraseña de los datos de demostración (se leen del propio archivo de datos)
const demo = readFileSync(path.join(aqui, '..', 'src', 'db', 'datos-demo.js'), 'utf8');
const claveDemo = demo.match(/const CLAVE_DEMO = '([^']+)'/)?.[1];
const maestros = [...demo.matchAll(/email: '([^']+@demo\.cl)', categoria:/g)].map((m) => m[1]);
if (!claveDemo || !maestros.length) {
  console.error('✘ No se encontraron las cuentas de demostración en src/db/datos-demo.js');
  process.exit(1);
}

const k6 = process.env.K6_BIN ?? (existsSync('C:/Program Files/k6/k6.exe') ? 'C:/Program Files/k6/k6.exe' : 'k6');
const salida = path.join(aqui, 'resultados');
mkdirSync(salida, { recursive: true });
const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const json = path.join(salida, `${prueba}_${sello}.json`);

const r = spawnSync(k6, [
  'run', '--no-usage-report', '--quiet', '--summary-export', json,
  '-e', `BASE_URL=${base}`, '-e', `SUFIJO=${sello.replace(/-/g, '')}`,
  ...['USUARIOS', 'SUBIDA', 'SOSTENIDA'].filter((v) => process.env[v]).flatMap((v) => ['-e', `${v}=${process.env[v]}`]),
  path.join(aqui, `${prueba}.js`),
], {
  // Las contraseñas viajan como variables de entorno del proceso, no en la línea de comandos
  env: { ...process.env, CLAVE_DEMO: claveDemo, CLAVE_CARGA: `Carga${randomBytes(6).toString('hex')}9`, MAESTROS: maestros.join(',') },
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
const texto = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`;
writeFileSync(path.join(salida, `${prueba}_${sello}.txt`), texto);
console.log(texto);
console.log(`Resumen guardado en ${path.join(salida, `${prueba}_${sello}`)}.txt y .json`);
process.exitCode = r.status ?? 1;
