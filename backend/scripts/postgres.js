// Utilidades compartidas por los comandos de respaldo y restauración: ubican las herramientas de
// PostgreSQL (pg_dump, pg_restore) y les entregan la conexión del .env sin mostrar la contraseña.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const EXE = process.platform === 'win32' ? '.exe' : '';

// PG_BIN en el .env si las herramientas no están en el PATH; en Windows se busca la instalación estándar
export function herramienta(nombre) {
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, nombre + EXE);
  if (process.platform === 'win32') {
    const raiz = 'C:/Program Files/PostgreSQL';
    if (existsSync(raiz)) {
      const versiones = readdirSync(raiz).filter((v) => /^\d+$/.test(v)).sort((a, b) => b - a);
      for (const v of versiones) {
        const ruta = path.join(raiz, v, 'bin', nombre + EXE);
        if (existsSync(ruta)) return ruta;
      }
    }
  }
  return nombre;   // se espera en el PATH (Linux, macOS, PaaS)
}

export const conexion = {
  host: process.env.DB_HOST ?? 'localhost',
  puerto: String(process.env.DB_PORT ?? 5432),
  usuario: process.env.DB_USER ?? 'postgres',
  base: process.env.DB_NAME ?? 'delimaster',
};

// Ejecuta una herramienta de PostgreSQL con la contraseña en PGPASSWORD (nunca en la línea de comandos)
export function ejecutar(nombre, argumentos) {
  const r = spawnSync(herramienta(nombre),
    ['-h', conexion.host, '-p', conexion.puerto, '-U', conexion.usuario, ...argumentos],
    { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }, encoding: 'utf8' });
  if (r.error) throw new Error(`No se pudo ejecutar ${nombre}: ${r.error.message} (define PG_BIN en el .env)`);
  return r;
}
