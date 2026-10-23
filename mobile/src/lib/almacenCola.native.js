// HU-12: almacenamiento de la cola sin conexión en el celular (SQLite, persiste aunque se cierre la app).
// Metro usa este archivo en Android/iOS y almacenCola.web.js en el navegador.
import * as SQLite from 'expo-sqlite';

let db = null;

async function abrir() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('delimaster.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cola_solicitudes (
      id         TEXT PRIMARY KEY,   -- el mismo UUID que se enviará al servidor
      usuario_id TEXT NOT NULL,
      datos      TEXT NOT NULL,      -- JSON con la solicitud
      estado     TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | revisar
      error      TEXT,
      intentos   INTEGER NOT NULL DEFAULT 0,
      creado_en  TEXT NOT NULL
    );
  `);
  return db;
}

const aItem = (fila) => ({ ...fila, datos: JSON.parse(fila.datos) });

export async function guardar(item) {
  const d = await abrir();
  await d.runAsync(
    `INSERT OR REPLACE INTO cola_solicitudes (id, usuario_id, datos, estado, error, intentos, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.usuario_id, JSON.stringify(item.datos), item.estado, item.error ?? null, item.intentos ?? 0, item.creado_en);
}

export async function listar(usuarioId) {
  const d = await abrir();
  const filas = await d.getAllAsync(
    'SELECT * FROM cola_solicitudes WHERE usuario_id = ? ORDER BY creado_en', usuarioId);
  return filas.map(aItem);
}

export async function quitar(id) {
  const d = await abrir();
  await d.runAsync('DELETE FROM cola_solicitudes WHERE id = ?', id);
}
