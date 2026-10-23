// Avisos al celular con la app cerrada, por el servicio de Expo (el mismo canal que usan las APK).
// Sin un teléfono registrado no se envía nada: el aviso dentro de la app y el correo siguen igual.
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';

const URL_EXPO = 'https://exp.host/--/api/v2/push/send';

async function envioExpo(mensajes) {
  if (!mensajes.length || config.esTest) return;
  const respuesta = await fetch(URL_EXPO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(mensajes),
  });
  if (!respuesta.ok) throw new Error(`Expo push respondió ${respuesta.status}`);
}

let enviar = envioExpo;

// Solo para pruebas automáticas
export function usarEnvioPush(otro) {
  enviar = otro ?? envioExpo;
}

export async function registrarDispositivo(usuarioId, { token, plataforma }) {
  await pool.query(
    `INSERT INTO dispositivos_push (token, usuario_id, plataforma)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE
       SET usuario_id = EXCLUDED.usuario_id, plataforma = EXCLUDED.plataforma, actualizado_en = now()`,
    [token, usuarioId, plataforma]);
}

export async function quitarDispositivo(usuarioId, token) {
  await pool.query('DELETE FROM dispositivos_push WHERE token = $1 AND usuario_id = $2', [token, usuarioId]);
}

// Se llama después de confirmar la transacción que creó el aviso. Un fallo aquí no deshace el aviso.
export async function enviarPush(usuarioId, { titulo, texto, solicitudId = null }) {
  const { rows } = await pool.query('SELECT token FROM dispositivos_push WHERE usuario_id = $1', [usuarioId]);
  const mensajes = rows.map((r) => ({
    to: r.token,
    title: titulo,
    body: texto,
    sound: 'default',
    data: solicitudId ? { solicitud_id: solicitudId } : {},
  }));
  if (mensajes.length) await enviar(mensajes);
}
