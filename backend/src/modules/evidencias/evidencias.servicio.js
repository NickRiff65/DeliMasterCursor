// Fotos de una solicitud: el cliente muestra lo que necesita (al pedir el trabajo, para que el maestro
// cotice con más exactitud), las partes se envían fotos por el chat y, después, sirven de evidencia
// del trabajo terminado o del problema reportado. El equipo las revisa al resolver una disputa (HU-16).
import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { decodificarImagen, evidencias as almacen, MIME_POR_EXTENSION } from '../gastos/almacen.js';
import { extraerExif } from '../../utils/imagenes.js';
import { evaluarFoto, textoVerificacion } from '../../utils/verificacionFoto.js';

// Mientras la solicitud está activa (desde que se publica hasta que se cierra o se resuelve la disputa)
export const ESTADOS_PARA_SUBIR = [
  'creada', 'asignada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada',
  'confirmada', 'pagada', 'finalizada', 'en_disputa',
];
export const MAX_FOTOS_POR_PERSONA = 12;
export const urlFoto = (urlApi, id) => almacen.urlFirmada(urlApi, id);

async function solicitudDe(usuario, solicitudId) {
  const { rows: [s] } = await pool.query(
    'SELECT id, estado, cliente_id, prestador_id, latitud, longitud FROM solicitudes WHERE id = $1', [solicitudId]);
  const rol = s?.cliente_id === usuario.id ? 'cliente' : s?.prestador_id === usuario.id ? 'prestador' : null;
  // Solo las partes (y el equipo, para revisar) pueden ver las fotos
  if (!s || (!rol && usuario.rol !== 'admin')) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return { s, rol };
}

export async function listar(usuario, solicitudId, urlApi) {
  const { s } = await solicitudDe(usuario, solicitudId);
  const { rows } = await pool.query(
    `SELECT id, rol, autor_id, descripcion, creado_en, sospechosa, verificacion, verificacion_motivos,
            to_char(exif_fecha, 'YYYY-MM-DD"T"HH24:MI:SS') AS exif_fecha, minutos_antes
       FROM evidencias WHERE solicitud_id = $1 ORDER BY creado_en, id`, [solicitudId]);
  return {
    // Cada foto dice si se verificó (real y reciente), sin mostrar su ubicación ni el equipo
    fotos: rows.map(({ autor_id: autor, verificacion, verificacion_motivos: motivos, exif_fecha: fecha, minutos_antes: minutos, ...f }) => ({
      ...f, propia: autor === usuario.id, url: almacen.urlFirmada(urlApi, f.id),
      verificacion: { estado: verificacion, texto: textoVerificacion({ estado: verificacion, motivos, fecha, minutos }) },
    })),
    puede_subir: ESTADOS_PARA_SUBIR.includes(s.estado) && usuario.rol !== 'admin',
    maximo_por_persona: MAX_FOTOS_POR_PERSONA,
  };
}

// Guarda una foto de la solicitud (galería, cámara o chat) y devuelve su id.
// metadatos: lo que la app leyó de la foto original (fecha, equipo, programa, ubicación), porque
// al reducirla antes de subirla se pierden; si el archivo trae su EXIF, manda el del archivo.
export async function guardarFoto(usuario, solicitudId, base64, descripcion, metadatos = {}) {
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
  // El EXIF se lee del archivo ORIGINAL, antes de que el almacén lo convierta a WebP, y se
  // completa con lo que envió la app. Así se decide si la foto es real y reciente (antifraude).
  // Las coordenadas se guardan como respaldo del equipo y nunca se exponen a la otra parte.
  const v = evaluarFoto({
    archivo: extraerExif(imagen.buffer), app: metadatos ?? {},
    lugar: s.latitud != null ? { lat: s.latitud, lng: s.longitud } : null,
  });
  const archivo = await almacen.guardar(imagen);
  try {
    const { rows: [f] } = await pool.query(
      `INSERT INTO evidencias (solicitud_id, autor_id, rol, archivo, descripcion,
                               exif_fecha, exif_lat, exif_lng, exif_dispositivo, exif_software, sospechosa,
                               metadatos_origen, tomada_con, minutos_antes, distancia_m, verificacion, verificacion_motivos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [solicitudId, usuario.id, rol, archivo, descripcion ?? null,
        v.fecha, v.lat, v.lng, v.dispositivo, v.software, v.estado === 'sin_datos',
        v.origen, v.tomada_con, v.minutos, v.distancia, v.estado, v.motivos]);
    return f.id;
  } catch (err) {
    await almacen.eliminar(archivo);   // no dejar archivos huérfanos si falla el registro
    throw err;
  }
}

export async function subir(usuario, solicitudId, { imagen_base64: base64, descripcion, metadatos }, urlApi) {
  await guardarFoto(usuario, solicitudId, base64, descripcion, metadatos);
  return listar(usuario, solicitudId, urlApi);
}

export async function imagen(id) {
  const { rows } = await pool.query('SELECT archivo FROM evidencias WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError('Foto no encontrada', 404, 'FOTO_NO_ENCONTRADA');
  const ext = rows[0].archivo.split('.').pop();
  return { buffer: await almacen.leer(rows[0].archivo), mime: MIME_POR_EXTENSION[ext] };
}

export const firmaValida = (id, vence, firma) => almacen.firmaValida(id, vence, firma);
