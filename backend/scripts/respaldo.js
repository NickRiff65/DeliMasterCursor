// Respaldo de la base de datos (y, con --con-archivos, de las fotos y boletas subidas).
//   npm run respaldo                    → backend/respaldos/delimaster_AAAA-MM-DD_HHMM.dump
//   npm run respaldo -- --con-archivos  → además copia backend/uploads a respaldos/uploads_AAAA-MM-DD_HHMM
// Conserva los últimos RESPALDOS_A_CONSERVAR (14 por defecto) y borra los más antiguos.
// Pensado para ejecutarse una vez al día (Programador de tareas de Windows en el piloto; tarea
// programada del proveedor en producción): con un respaldo diario, la pérdida máxima es de 24 horas (RPO).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { conexion, ejecutar } from './postgres.js';

const CARPETA = process.env.CARPETA_RESPALDOS ?? path.resolve(import.meta.dirname, '..', 'respaldos');
const CONSERVAR = Number(process.env.RESPALDOS_A_CONSERVAR ?? 14);
const conArchivos = process.argv.includes('--con-archivos');

const ahora = new Date();
const dos = (n) => String(n).padStart(2, '0');
const sello = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}_${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;

mkdirSync(CARPETA, { recursive: true });
const archivo = path.join(CARPETA, `${conexion.base}_${sello}.dump`);
const inicio = Date.now();
const r = ejecutar('pg_dump', ['-Fc', '-f', archivo, conexion.base]);
if (r.status !== 0) {
  console.error(`✘ pg_dump falló: ${(r.stderr || '').trim()}`);
  process.exit(1);
}
console.log(`✔ Respaldo de "${conexion.base}": ${archivo} (${Math.round(statSync(archivo).size / 1024)} KB, ${((Date.now() - inicio) / 1000).toFixed(1)} s)`);

if (conArchivos) {
  const subidas = path.resolve(import.meta.dirname, '..', 'uploads');
  if (existsSync(subidas)) {
    const destino = path.join(CARPETA, `uploads_${sello}`);
    cpSync(subidas, destino, { recursive: true });
    console.log(`✔ Fotos y boletas copiadas a ${destino}`);
  }
}

// Rotación: se conservan los más recientes de cada tipo
for (const patron of [/\.dump$/, /^uploads_/]) {
  const antiguos = readdirSync(CARPETA).filter((n) => patron.test(n)).sort().reverse().slice(CONSERVAR);
  for (const n of antiguos) {
    rmSync(path.join(CARPETA, n), { recursive: true, force: true });
    console.log(`  (rotación) eliminado ${n}`);
  }
}
