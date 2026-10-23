import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { emitirMensaje } from '../../socket.js';
import { analizarConContexto } from './filtro.js';
import { guardarFoto, urlFoto } from '../evidencias/evidencias.servicio.js';

// Estados en los que se puede escribir (hay prestador asignado y la solicitud sigue viva)
const ESTADOS_CON_CHAT = [
  'asignada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada',
  'confirmada', 'pagada', 'finalizada', 'en_disputa',
];
// Estados en los que el filtro anti-fuga está activo: el pago del trabajo aún no está asegurado
// (en la modalidad con visita, el riesgo de "págame por fuera" es mayor durante el diagnóstico)
const ESTADOS_CON_FILTRO = ['asignada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada', 'confirmada'];

async function solicitudDelChat(usuario, solicitudId) {
  const { rows } = await pool.query(
    'SELECT id, estado, cliente_id, prestador_id FROM solicitudes WHERE id = $1', [solicitudId]);
  const s = rows[0];
  // Solo el cliente y el prestador asignado actualmente
  if (!s || (s.cliente_id !== usuario.id && s.prestador_id !== usuario.id)) {
    throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  }
  return s;
}

const COLUMNAS = `m.id, m.solicitud_id, m.emisor_id, split_part(u.nombre, ' ', 1) AS emisor_nombre,
                  m.contenido, m.bloqueado, m.motivo_bloqueo, m.creado_en, m.foto_id`;

// Las fotos se entregan con un enlace firmado que vence en una hora
const conFoto = (urlApi) => (m) => (m.foto_id ? { ...m, foto_url: urlFoto(urlApi, m.foto_id) } : m);

export async function listar(usuario, solicitudId, urlApi) {
  const s = await solicitudDelChat(usuario, solicitudId);
  // Los mensajes bloqueados solo los ve quien los escribió
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} FROM mensajes m JOIN usuarios u ON u.id = m.emisor_id
      WHERE m.solicitud_id = $1 AND (NOT m.bloqueado OR m.emisor_id = $2)
      ORDER BY m.creado_en, m.id`,
    [solicitudId, usuario.id]);
  return {
    mensajes: rows.map(conFoto(urlApi)),
    puede_escribir: ESTADOS_CON_CHAT.includes(s.estado),
    filtro_activo: ESTADOS_CON_FILTRO.includes(s.estado),
  };
}

export async function enviar(usuario, solicitudId, contenido, urlApi) {
  const s = await solicitudDelChat(usuario, solicitudId);
  if (!ESTADOS_CON_CHAT.includes(s.estado)) {
    throw new AppError('El chat de esta solicitud está cerrado', 409, 'CHAT_CERRADO');
  }

  // Antes del pago se aplica el filtro completo; después, solo contra pagos por fuera y datos bancarios
  const trasPago = !ESTADOS_CON_FILTRO.includes(s.estado);
  let analisis = { bloqueado: false, motivos: [], aviso: null };
  {
    // Se revisa junto a los últimos mensajes entregados de la misma persona (datos enviados por partes)
    const { rows: recientes } = await pool.query(
      `SELECT contenido FROM (
         SELECT contenido, creado_en FROM mensajes
          WHERE solicitud_id = $1 AND emisor_id = $2 AND NOT bloqueado
            AND creado_en > now() - interval '15 minutes'
          ORDER BY creado_en DESC LIMIT 8
       ) ultimos ORDER BY creado_en`,
      [solicitudId, usuario.id]);
    analisis = analizarConContexto(contenido, recientes.map((r) => r.contenido), { trasPago });
  }

  const insertado = await pool.query(
    `INSERT INTO mensajes (solicitud_id, emisor_id, contenido, bloqueado, motivo_bloqueo)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [solicitudId, usuario.id, contenido, analisis.bloqueado, analisis.motivos.join(',') || null]);
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} FROM mensajes m JOIN usuarios u ON u.id = m.emisor_id WHERE m.id = $1`,
    [insertado.rows[0].id]);
  const mensaje = rows[0];

  // Un mensaje bloqueado no llega a la otra persona
  if (!mensaje.bloqueado) emitirMensaje(solicitudId, mensaje);
  return { mensaje: conFoto(urlApi)(mensaje), aviso: analisis.aviso };
}

// Enviar una foto por el chat (por ejemplo, del árbol o de la falla) para cotizar con más exactitud.
// Queda también entre las fotos de la solicitud. La imagen no pasa por el filtro de texto: el equipo
// puede revisarla si hay una disputa.
export async function enviarFoto(usuario, solicitudId, base64, urlApi) {
  const s = await solicitudDelChat(usuario, solicitudId);
  if (!ESTADOS_CON_CHAT.includes(s.estado)) {
    throw new AppError('El chat de esta solicitud está cerrado', 409, 'CHAT_CERRADO');
  }
  const fotoId = await guardarFoto(usuario, solicitudId, base64, 'Enviada por el chat');
  const { rows: [{ id }] } = await pool.query(
    `INSERT INTO mensajes (solicitud_id, emisor_id, contenido, foto_id) VALUES ($1, $2, '📷 Foto', $3) RETURNING id`,
    [solicitudId, usuario.id, fotoId]);
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} FROM mensajes m JOIN usuarios u ON u.id = m.emisor_id WHERE m.id = $1`, [id]);
  // Por Socket.io va sin enlace: cada app lo pide con su propia dirección al recibirlo
  emitirMensaje(solicitudId, rows[0]);
  return { mensaje: conFoto(urlApi)(rows[0]) };
}
