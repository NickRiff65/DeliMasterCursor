// Aplica, en orden, los archivos .sql de db/migrations que aún no se han ejecutado.
// Cada migración corre en su propia transacción: o se aplica completa o no se aplica.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrar(pool, { silencioso = false } = {}) {
  const log = silencioso ? () => {} : console.log;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre      TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await pool.query('SELECT nombre FROM schema_migrations');
  const aplicadas = new Set(rows.map((r) => r.nombre));
  const archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.sql')).sort();

  let nuevas = 0;
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = await readFile(path.join(carpeta, archivo), 'utf8');
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [archivo]);
      await cliente.query('COMMIT');
      log(`✔ ${archivo}`);
      nuevas++;
    } catch (err) {
      await cliente.query('ROLLBACK');
      throw new Error(`Falló la migración ${archivo}: ${err.message}`);
    } finally {
      cliente.release();
    }
  }
  log(nuevas ? `${nuevas} migración(es) aplicada(s).` : 'La base de datos ya está al día.');
}

// Ejecución por línea de comandos: npm run migrate
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pool } = await import('./pool.js');
  try {
    await migrar(pool);
  } catch (err) {
    console.error(`✘ ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
