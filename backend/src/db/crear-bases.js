// Crea las bases de datos de desarrollo y de pruebas si aún no existen.
// Uso: npm run db:crear  (lee DB_HOST, DB_USER, DB_PASSWORD, DB_NAME y DB_NAME_TEST del .env)
import pg from 'pg';

const nombres = [process.env.DB_NAME ?? 'delimaster', process.env.DB_NAME_TEST ?? 'delimaster_test'];

const admin = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'postgres',
});

try {
  await admin.connect();
  for (const nombre of nombres) {
    if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) throw new Error(`Nombre de base no válido: ${nombre}`);
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (rowCount) {
      console.log(`• ${nombre} ya existe`);
    } else {
      await admin.query(`CREATE DATABASE ${nombre}`);
      console.log(`✔ ${nombre} creada`);
    }
  }
} catch (err) {
  if (err.code === '28P01') {
    console.error('✘ Contraseña incorrecta: revisa DB_PASSWORD en el archivo .env');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('✘ No se pudo conectar a PostgreSQL: verifica que el servicio esté iniciado y el puerto sea 5432');
  } else {
    console.error(`✘ ${err.message}`);
  }
  process.exitCode = 1;
} finally {
  await admin.end();
}
