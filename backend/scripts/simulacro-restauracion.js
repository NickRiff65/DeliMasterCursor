// Simulacro de recuperación (CP-16): respalda la base en uso, la restaura en una base nueva, levanta la API
// contra la base restaurada y comprueba que el servicio responde. Informa cuánto tardó cada paso y el total,
// que se compara con el tiempo máximo de recuperación comprometido (RTO).
//   npm run simulacro
// No toca la base en uso: trabaja sobre la base `delimaster_restauracion`, que se crea de nuevo cada vez.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { conexion, ejecutar } from './postgres.js';

const DESTINO = 'delimaster_restauracion';
const aqui = import.meta.dirname;
const pasos = [];
const cronometrar = async (nombre, fn) => {
  const inicio = Date.now();
  const detalle = await fn();
  const segundos = (Date.now() - inicio) / 1000;
  pasos.push({ paso: nombre, segundos: Number(segundos.toFixed(1)), detalle });
  console.log(`✔ ${nombre}: ${segundos.toFixed(1)} s${detalle ? ` · ${detalle}` : ''}`);
};
const node = (args, env = {}) => {
  const r = spawnSync(process.execPath, args, { cwd: path.join(aqui, '..'), env: { ...process.env, ...env }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`);
  return r.stdout.trim();
};
const contar = (base) => {
  const r = ejecutar('psql', ['-d', base, '-At', '-c',
    `SELECT (SELECT count(*) FROM usuarios) || ' usuarios, ' || (SELECT count(*) FROM solicitudes) || ' solicitudes, '
         || (SELECT count(*) FROM pagos) || ' pagos, ' || (SELECT count(*) FROM ledger_movimientos) || ' movimientos del ledger, '
         || (SELECT count(*) FROM ledger_eventos) || ' eventos del ledger, ' || (SELECT count(*) FROM mensajes) || ' mensajes'`]);
  if (r.status !== 0) throw new Error((r.stderr || '').trim());
  return r.stdout.trim();
};

const inicioTotal = Date.now();
let archivo;
let original;
await cronometrar('1. Respaldo de la base en uso (pg_dump)', async () => {
  original = contar(conexion.base);
  node(['scripts/respaldo.js']);
  const carpeta = process.env.CARPETA_RESPALDOS ?? path.join(aqui, '..', 'respaldos');
  archivo = readdirSync(carpeta).filter((n) => n.endsWith('.dump')).sort().map((n) => path.join(carpeta, n)).pop();
  return `${path.basename(archivo)} (${Math.round(statSync(archivo).size / 1024)} KB)`;
});
await cronometrar('2. Restauración en una base nueva (pg_restore)', async () => {
  node(['scripts/restaurar.js', archivo, DESTINO]);
  return DESTINO;
});
await cronometrar('3. Verificación de integridad (mismos registros que el original)', async () => {
  const restaurada = contar(DESTINO);
  if (restaurada !== original) throw new Error(`Los conteos no coinciden.\n  original:   ${original}\n  restaurada: ${restaurada}`);
  return restaurada;
});
await cronometrar('4. API levantada contra la base restaurada y prueba de humo', async () => {
  // Proceso aparte para que la API lea DB_NAME al arrancar, como ocurriría en el equipo de reemplazo
  const salida = node(['--input-type=module', '-e', `
    import request from 'supertest';
    import { crearApp } from './src/app.js';
    import { pool } from './src/db/pool.js';
    const app = crearApp();
    const salud = await request(app).get('/api/salud');
    const catalogo = await request(app).get('/api/prestadores?limite=1');
    const categorias = await request(app).get('/api/categorias');
    console.log([salud.status, salud.body.base_datos, catalogo.status, catalogo.body.paginacion?.total, categorias.status, categorias.body.categorias?.length].join('|'));
    await pool.end();`], { DB_NAME: DESTINO });
  const [salud, bd, catalogo, maestros, categorias, oficios] = salida.split('\n').pop().split('|');
  if (salud !== '200' || bd !== 'ok' || catalogo !== '200' || categorias !== '200') throw new Error(`La API no respondió bien: ${salida}`);
  return `/api/salud 200 (base de datos ok) · catálogo 200 (${maestros} maestros) · ${oficios} oficios`;
});

const total = (Date.now() - inicioTotal) / 1000;
const resumen = { fecha: new Date().toISOString(), base_origen: conexion.base, base_restaurada: DESTINO, pasos, total_segundos: Number(total.toFixed(1)) };
console.log(`\nTiempo total del simulacro: ${total.toFixed(1)} s (${(total / 60).toFixed(1)} min)`);
const salida = path.join(aqui, '..', 'rendimiento', 'resultados');
mkdirSync(salida, { recursive: true });
writeFileSync(path.join(salida, 'simulacro_restauracion.json'), JSON.stringify(resumen, null, 1));
