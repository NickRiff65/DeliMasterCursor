// Copia un respaldo de la base del PC (npm run respaldo) a la base PostgreSQL de Railway y compara
// cuántos registros quedaron. La dirección de la base la entrega la CLI de Railway, sin mostrarla:
//   railway run --service Postgres -- node --env-file=backend/.env backend/scripts/subir-base-railway.js backend/respaldos/<archivo>.dump
// Reemplaza lo que haya en la base de Railway (--clean): se usa una vez, antes de abrir el servicio.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ejecutar, herramienta } from './postgres.js';

const archivo = process.argv[2];
const url = process.env.DATABASE_PUBLIC_URL;
if (!archivo || !existsSync(archivo)) {
  console.error('✘ Indica el respaldo: node backend/scripts/subir-base-railway.js backend/respaldos/<archivo>.dump');
  process.exit(1);
}
if (!url) {
  console.error('✘ Falta DATABASE_PUBLIC_URL: ejecútalo con «railway run --service Postgres -- ...»');
  process.exit(1);
}

// La URL incluye la contraseña: va a la herramienta, nunca a la consola. Se quitan las variables PG* que
// inyecta Railway para que no se mezclen con la conexión.
const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG')));
const remoto = (nombre, argumentos) => spawnSync(herramienta(nombre), argumentos, { env: entorno, encoding: 'utf8' });

const CONTEO = "SELECT 'usuarios', count(*) FROM usuarios UNION ALL SELECT 'solicitudes', count(*) FROM solicitudes "
  + "UNION ALL SELECT 'pagos', count(*) FROM pagos UNION ALL SELECT 'mensajes', count(*) FROM mensajes "
  + "UNION ALL SELECT 'migraciones', count(*) FROM schema_migrations";

console.log('Restaurando en Railway… (puede tardar un minuto)');
const inicio = Date.now();
const r = remoto('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-acl', '-d', url, archivo]);
if (r.error) {
  console.error(`✘ No se pudo ejecutar pg_restore: ${r.error.message}`);
  process.exit(1);
}
// pg_restore avisa como error cosas inofensivas (por ejemplo, el comentario de una extensión): se muestran
// solo las líneas de error, sin la dirección de la base, y se decide con el conteo.
const errores = (r.stderr ?? '').split('\n').filter((l) => /error/i.test(l)).map((l) => l.replaceAll(url, '<railway>'));
if (errores.length) console.log(`Avisos de pg_restore (${errores.length}):\n  ` + errores.slice(0, 10).join('\n  '));

const contar = (salida) => Object.fromEntries((salida ?? '').trim().split('\n').filter(Boolean).map((l) => l.split('|')));
const enRailway = contar(remoto('psql', ['-d', url, '-At', '-c', CONTEO]).stdout);
const enPc = contar(ejecutar('psql', ['-d', process.env.DB_NAME ?? 'delimaster', '-At', '-c', CONTEO]).stdout);

let iguales = true;
console.log('\nTabla         PC   Railway');
for (const tabla of ['usuarios', 'solicitudes', 'pagos', 'mensajes', 'migraciones']) {
  const ok = enPc[tabla] !== undefined && enPc[tabla] === enRailway[tabla];
  iguales &&= ok;
  console.log(`${tabla.padEnd(12)} ${String(enPc[tabla] ?? '?').padStart(4)} ${String(enRailway[tabla] ?? '?').padStart(8)}  ${ok ? '✔' : '✘'}`);
}
console.log(`\n${iguales ? '✔ La base quedó igual que en el PC' : '✘ Hay diferencias: revisar antes de abrir el servicio'} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
process.exit(iguales ? 0 : 1);
