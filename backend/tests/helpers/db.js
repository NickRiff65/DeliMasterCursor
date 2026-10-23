// Utilidades para pruebas que usan la base de datos de pruebas (DB_NAME_TEST).
process.env.NODE_ENV = 'test';

const password = process.env.DB_PASSWORD;
export const hayBaseDeDatos = Boolean(password) && !password.startsWith('ESCRIBE_AQUI');
export const motivoOmision = 'Sin DB_PASSWORD en .env: se omiten las pruebas con base de datos';

export async function prepararBase() {
  const { pool } = await import('../../src/db/pool.js');
  const { migrar } = await import('../../src/db/migrate.js');
  await migrar(pool, { silencioso: true });
  return pool;
}

// El registro pide el nombre y el apellido por separado: "Luis Poda" → { nombre: 'Luis', apellido: 'Poda' }
// (un nombre de una sola palabra recibe el apellido "Prueba")
export function partirNombre(completo) {
  const [nombre, ...resto] = completo.trim().split(/\s+/);
  return { nombre, apellido: resto.join(' ') || 'Prueba' };
}

// Deja las tablas de datos vacías entre pruebas (las categorías iniciales se conservan).
export async function limpiarBase(pool) {
  await pool.query('TRUNCATE usuarios RESTART IDENTITY CASCADE');
}
