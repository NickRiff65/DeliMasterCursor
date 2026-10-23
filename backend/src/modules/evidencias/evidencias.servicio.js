// Fotos de una solicitud: el cliente muestra lo que necesita (al pedir el trabajo, para que el maestro
// cotice con más exactitud), las partes se envían fotos por el chat y, después, sirven de evidencia
// del trabajo terminado o del problema reportado. El equipo las revisa al resolver una disputa (HU-16).
import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { decodificarImagen, evidencias as almacen, MIME_POR_EXTENSION } from '../gastos/almacen.js';

// Mientras la solicitud está activa (desde que se publica hasta que se cierra o se resuelve la disputa)
export const ESTADOS_PARA_SUBIR = [
  'creada', 'asignada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada',
  'confirmada', 'pagada', 'finalizada', 'en_disputa',
];
export const MAX_FOTOS_POR_PERSONA = 12;
export const urlFoto = (urlApi, id) => almacen.urlFirmada(urlApi, id);

async function solicitudDe(usuario, solicitudId) {
  const { rows: [s] } = await pool.query(
    'SELECT id, estado, cliente_id, prestador_id FROM solicitudes WHERE id = $1', [solicitudId]);
  const rol = s?.cliente_id === usuario.id ? 'cliente' : s?.prestador_id === usuario.id ? 'prestador' : null;
  // Solo las partes (y el equipo, para revisar) pueden ver las fotos
  if (!s || (!rol && usuario.rol !== 'admin')) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return { s, rol };
}

export async function listar(usuario, solicitudId, urlApi) {
  const { s } = await solicitudDe(usuario, solicitudId);
  const { rows } = await pool.query(
    `SELECT id, rol, autor_id, descripcion, creado_en FROM evidencias
      WHERE solicitud_id = $1 ORDER BY creado_en, id`, [solicitudId]);
  return {
    fotos: rows.map(({ autor_id: autor, ...f }) => ({
      ...f, propia: autor === usuario.id, url: almacen.urlFirmada(urlApi, f.id),
    })),
    puede_subir: ESTADOS_PARA_SUBIR.includes(s.estado) && usuario.rol !== 'admin',
    maximo_por_persona: MAX_FOTOS_POR_PERSONA,
  };
}

// Guarda una foto de la solicitud (galería, cámara o chat) y devuelve su id
export async function guardarFoto(usuario, solicitudId, base64, descripcion) {
  const { s, rol } = await solicitudDe(usuario, solicitudId);
  if (!rol) throw new AppError('Solo el cliente y el maestro pueden subir fotos', 403, 'SIN_PERMISO');
  if (!ESTADOS_PARA_SUBIR.includes(s.estado)) {
    throw new AppError('Esta solicitud ya no admite fotos nuevas', 409, 'ESTADO_INVALIDO');
  }
  const { rows: [{ n }] } = await pool.query(
    'SELECT count(*)::int AS n FROM evidencias WHERE solicitud_id = $1 AND autor_id = $2', [solicitudId, usuario.id]);
  if (n >= MAX_FOTOS_POR_PERSONA) {
    throw new AppError(`Puedes subir hasta ${MAX_FOTOS_POR_PERSONA} fotos por trabajo`, 409, 'LIMITE_FOTOS');
  }

  const imagen = decodificarImagen(base64);
  const archivo = await almacen.guardar(imagen);
  try {
    const { rows: [f] } = await pool.query(
      `INSERT INTO evidencias (solicitud_id, autor_id, rol, archivo, descripcion) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [solicitudId, usuario.id, rol, archivo, descripcion ?? null]);
    return f.id;
  } catch (err) {
    await almacen.eliminar(archivo);   // no dejar archivos huérfanos si falla el registro
    throw err;
  }
}

export async function subir(usuario, solicitudId, { imagen_base64: base64, descripcion }, urlApi) {
  await guardarFoto(usuario, solicitudId, base64, descripcion);
  return listar(usuario, solicitudId, urlApi);
}

export async function imagen(id) {
  const { rows } = await pool.query('SELECT archivo FROM evidencias WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError('Foto no encontrada', 404, 'FOTO_NO_ENCONTRADA');
  const ext = rows[0].archivo.split('.').pop();
  return { buffer: await almacen.leer(rows[0].archivo), mime: MIME_POR_EXTENSION[ext] };
}

export const firmaValida = (id, vence, firma) => almacen.firmaValida(id, vence, firma);
