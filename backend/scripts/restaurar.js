// Restaura un respaldo en una base de datos y verifica que quedó utilizable.
//   npm run restaurar -- <archivo.dump> <base_destino>
// Por seguridad no restaura sobre la base en uso (DB_NAME) salvo que se agregue --sobre-la-base-en-uso:
// lo normal es restaurar en una base nueva, comprobarla y recién entonces apuntar el .env a ella.
// Al terminar muestra cuánto tardó y cuántos registros recuperó: es la evidencia del simulacro de
// recuperación (RTO) descrito en el plan de continuidad.
import { existsSync } from 'node:fs';
import { conexion, ejecutar } from './postgres.js';

const [archivo, destino] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const forzar = process.argv.includes('--sobre-la-base-en-uso');
if (!archivo || !destino) {
  console.error('Uso: npm run restaurar -- <archivo.dump> <base_destino>');
  process.exit(1);
}
if (!existsSync(archivo)) {
  console.error(`✘ No existe el respaldo ${archivo}`);
  process.exit(1);
}
if (!/^[a-z_][a-z0-9_]*$/.test(destino)) {
  console.error('✘ El nombre de la base de destino solo puede tener minúsculas, números y guion bajo');
  process.exit(1);
}
if (destino === conexion.base && !forzar) {
  console.error(`✘ "${destino}" es la base en uso. Restaura en otra base o agrega --sobre-la-base-en-uso.`);
  process.exit(1);
}

const sql = (base, consulta) => ejecutar('psql', ['-d', base, '-At', '-v', 'ON_ERROR_STOP=1', '-c', consulta]);
const falla = (paso, r) => {
  console.error(`✘ ${paso}: ${(r.stderr || '').trim()}`);
  process.exit(1);
};

const inicio = Date.now();
let r = sql('postgres', `DROP DATABASE IF EXISTS ${destino}`);
if (r.status !== 0) falla('No se pudo preparar la base de destino', r);
r = sql('postgres', `CREATE DATABASE ${destino}`);
if (r.status !== 0) falla('No se pudo crear la base de destino', r);

r = ejecutar('pg_restore', ['-d', destino, '--no-owner', '--exit-on-error', archivo]);
if (r.status !== 0) falla('pg_restore falló', r);
const segundos = (Date.now() - inicio) / 1000;

// Verificación: tablas principales con datos y migraciones registradas
const conteos = sql(destino, `
  SELECT 'usuarios=' || (SELECT count(*) FROM usuarios)
      || ' solicitudes=' || (SELECT count(*) FROM solicitudes)
      || ' pagos=' || (SELECT count(*) FROM pagos)
      || ' ledger_movimientos=' || (SELECT count(*) FROM ledger_movimientos)
      || ' ledger_eventos=' || (SELECT count(*) FROM ledger_eventos)
      || ' mensajes=' || (SELECT count(*) FROM mensajes)
      || ' migraciones=' || (SELECT count(*) FROM schema_migrations)`);
if (conteos.status !== 0) falla('La base restaurada no se pudo verificar', conteos);

console.log(`✔ Respaldo restaurado en "${destino}" en ${segundos.toFixed(1)} s`);
console.log(`  ${conteos.stdout.trim()}`);
