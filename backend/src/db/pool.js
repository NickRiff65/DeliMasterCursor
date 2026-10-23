import pg from 'pg';
import { config } from '../config/env.js';

export const pool = new pg.Pool(config.db);

// Ejecuta `fn` dentro de una transacción: si algo falla, se revierte todo.
// Se usa en cada operación que escribe en más de una tabla (y en todo lo que mueva dinero).
// En `cliente.alConfirmar` se anotan tareas (como los avisos por correo) que solo deben ocurrir
// si la transacción se confirma.
export async function enTransaccion(fn) {
  const cliente = await pool.connect();
  const alConfirmar = [];
  cliente.alConfirmar = alConfirmar;
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    for (const tarea of alConfirmar) tarea();
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    delete cliente.alConfirmar;
    cliente.release();
  }
}

// Ejecuta `tarea` cuando lo escrito con `db` quede confirmado (al instante si no hay transacción)
export function alConfirmar(db, tarea) {
  if (db.alConfirmar) db.alConfirmar.push(tarea);
  else tarea();
}
