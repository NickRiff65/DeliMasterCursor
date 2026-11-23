// HU-16 · Chat de las disputas: mientras una disputa está abierta, el equipo de DeliMaster conversa
// por separado con el cliente y con el maestro para reunir más antecedentes antes de resolver.
// Cada conversación es privada entre el equipo y esa parte (el cliente no ve la del maestro).
import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { crearNotificacion } from '../notificaciones/notificaciones.servicio.js';

const COLUMNAS = 'id, de_equipo, contenido, creado_en';

async function solicitud(id) {
  const { rows: [s] } = await pool.query(
    'SELECT id, estado, cliente_id, prestador_id FROM solicitudes WHERE id = $1', [id]);
  if (!s) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return s;
}

const conversacion = async (solicitudId, parte) => (await pool.query(
  `SELECT ${COLUMNAS} FROM mensajes_disputa WHERE solicitud_id = $1 AND parte = $2 ORDER BY creado_en, id`,
  [solicitudId, parte])).rows;

// ------------------------------------------------------------------ cliente y maestro
async function parteDe(usuario, solicitudId) {
  const s = await solicitud(solicitudId);
  const parte = s.cliente_id === usuario.id ? 'cliente' : s.prestador_id === usuario.id ? 'prestador' : null;
  if (!parte) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return { s, parte };
}

// Su conversación con el equipo: se puede escribir mientras la disputa está abierta y leer después
export async function mensajesDeParte(usuario, solicitudId) {
  const { s, parte } = await parteDe(usuario, solicitudId);
  return { mensajes: await conversacion(solicitudId, parte), puede_escribir: s.estado === 'en_disputa' };
}

export async function escribirParte(usuario, solicitudId, contenido) {
  const { s, parte } = await parteDe(usuario, solicitudId);
  if (s.estado !== 'en_disputa') throw new AppError('La disputa ya se resolvió: la conversación quedó cerrada', 409, 'DISPUTA_CERRADA');
  await pool.query(
    'INSERT INTO mensajes_disputa (solicitud_id, parte, autor_id, de_equipo, contenido) VALUES ($1, $2, $3, false, $4)',
    [solicitudId, parte, usuario.id, contenido]);
  return mensajesDeParte(usuario, solicitudId);
}

// ------------------------------------------------------------------ equipo de DeliMaster
export async function conversacionesAdmin(solicitudId) {
  const s = await solicitud(solicitudId);
  return {
    cliente: await conversacion(solicitudId, 'cliente'),
    prestador: await conversacion(solicitudId, 'prestador'),
    puede_escribir: s.estado === 'en_disputa',
  };
}

export async function escribirAdmin(admin, solicitudId, { parte, contenido }) {
  const s = await solicitud(solicitudId);
  if (s.estado !== 'en_disputa') throw new AppError('La disputa ya se resolvió: la conversación quedó cerrada', 409, 'DISPUTA_CERRADA');
  const destinatario = parte === 'cliente' ? s.cliente_id : s.prestador_id;
  if (!destinatario) throw new AppError('Esta solicitud no tiene maestro', 409, 'SIN_PRESTADOR');
  await pool.query(
    'INSERT INTO mensajes_disputa (solicitud_id, parte, autor_id, de_equipo, contenido) VALUES ($1, $2, $3, true, $4)',
    [solicitudId, parte, admin.id, contenido]);
  // La parte recibe un aviso: el equipo necesita su respuesta para resolver
  await crearNotificacion(pool, destinatario, {
    titulo: 'DeliMaster te escribió sobre el reclamo',
    texto: contenido.length > 140 ? `${contenido.slice(0, 137)}…` : contenido,
    solicitudId,
  });
  return conversacionesAdmin(solicitudId);
}
