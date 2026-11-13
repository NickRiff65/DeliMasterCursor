import { pool, enTransaccion } from '../../db/pool.js';
import { sqlHorario } from './horario.js';
import { AppError } from '../../utils/AppError.js';
import { sqlVigente } from '../verificaciones/verificaciones.servicio.js';
import { decodificarImagen, portafolio as almacenPortafolio, MIME_POR_EXTENSION } from '../gastos/almacen.js';

// ------------------------------------------------------------------ reputación (HU-07)
// Promedio bayesiano: cada prestador parte con PESO_PREVIO reseñas "virtuales" de
// CALIFICACION_PREVIA estrellas. Así una sola reseña de 5★ no supera a 40 reseñas de 4,8★,
// y un prestador nuevo y verificado tiene visibilidad inicial razonable.
export const CALIFICACION_PREVIA = 4.0;
export const PESO_PREVIO = 5;

export function puntajeReputacion(promedio, totalResenas) {
  return (PESO_PREVIO * CALIFICACION_PREVIA + Number(promedio) * totalResenas) / (PESO_PREVIO + totalResenas);
}

// Categorías en las que un prestador puede aparecer en el catálogo: las no reguladas,
// y las reguladas solo si tiene una verificación aprobada y vigente para esa categoría (HU-17).
const CTE_HABILITADAS = `
  habilitadas AS (
    SELECT pc.prestador_id, c.slug, c.nombre, c.requiere_verificacion AS verificada
      FROM prestador_categorias pc
      JOIN categorias c ON c.id = pc.categoria_id
     WHERE c.activa
       AND (NOT c.requiere_verificacion OR EXISTS (
             SELECT 1 FROM verificaciones v
              WHERE v.prestador_id = pc.prestador_id
                AND v.categoria_id = c.id
                AND ${sqlVigente('v')}))
  )`;

const SQL_PUNTAJE = `(${PESO_PREVIO} * ${CALIFICACION_PREVIA} + p.calificacion_promedio * p.total_resenas)
                     / (${PESO_PREVIO} + p.total_resenas)`;

// ------------------------------------------------------------------ catálogo (HU-01)
// Órdenes que el cliente puede elegir en el catálogo (CU-05); la reputación es el orden por defecto
const ORDENES_CATALOGO = {
  reputacion: `${SQL_PUNTAJE} DESC, p.trabajos_cerrados DESC, u.creado_en DESC`,
  trabajos: 'p.trabajos_cerrados DESC, p.total_resenas DESC, u.creado_en DESC',
  resenas: 'p.total_resenas DESC, p.trabajos_cerrados DESC, u.creado_en DESC',
};

// ¿Está atendiendo ahora? Día (ISO: 1 = lunes … 7 = domingo) y hora actual de Chile
// dentro de los días y el rango horario que el propio maestro declaró en su ficha.
const SQL_EN_HORARIO = `(
  extract(isodow from (now() AT TIME ZONE 'America/Santiago'))::int = ANY (p.dias_atencion)
  AND (now() AT TIME ZONE 'America/Santiago')::time >= p.hora_inicio
  AND (now() AT TIME ZONE 'America/Santiago')::time < p.hora_fin
)`;

// Maestro nuevo: se registró hace 30 días o menos (la fecha de registro es la de su cuenta)
const SQL_ES_NUEVO = `(u.creado_en > now() - interval '30 days')`;

export async function listarCatalogo({ categoria, comuna, pagina, limite, orden = 'reputacion', disponible_ahora = false, nuevos = false }) {
  const ordenSql = ORDENES_CATALOGO[orden] ?? ORDENES_CATALOGO.reputacion;
  const { rows } = await pool.query(
    `WITH ${CTE_HABILITADAS}
     SELECT u.id, u.nombre, p.descripcion, p.comunas_atendidas, ${sqlHorario('p')} AS horario,
            p.calificacion_promedio::float AS calificacion_promedio,
            p.total_resenas, p.trabajos_cerrados,
            ${SQL_ES_NUEVO} AS es_nuevo,
            json_agg(json_build_object('slug', h.slug, 'nombre', h.nombre, 'verificada', h.verificada)
                     ORDER BY h.nombre) AS categorias,
            count(*) OVER () AS total
       FROM prestadores p
       JOIN usuarios u    ON u.id = p.usuario_id
       JOIN habilitadas h ON h.prestador_id = p.usuario_id
      WHERE u.activo AND p.disponible
        AND ($2::text IS NULL OR $2 = ANY (p.comunas_atendidas))
        AND (NOT $5::boolean OR ${SQL_EN_HORARIO})
        AND (NOT $6::boolean OR ${SQL_ES_NUEVO})
      GROUP BY u.id, p.usuario_id
     HAVING ($1::text IS NULL OR bool_or(h.slug = $1))
      ORDER BY ${ordenSql}
      LIMIT $3 OFFSET $4`,
    [categoria ?? null, comuna ?? null, limite, (pagina - 1) * limite, disponible_ahora, nuevos],
  );
  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    prestadores: rows.map(({ total: _t, ...p }) => p),
    paginacion: { pagina, limite, total, paginas: Math.ceil(total / limite) },
  };
}

// ------------------------------------------------------------------ portafolio del maestro
// Fotos de trabajos anteriores que el maestro muestra en su perfil (su «catálogo tipo CV»).
// En la tabla se guarda el nombre del archivo (las subidas por la API) o una URL externa
// (las cargadas por el equipo); al entregarlas, las propias se resuelven a un enlace firmado,
// igual que las demás imágenes privadas de la plataforma.
export const MAX_FOTOS_PORTAFOLIO = 12;

const esUrlExterna = (url) => /^https?:\/\//.test(url ?? '');
const urlDeFoto = (urlApi, f) => (esUrlExterna(f.url) || !urlApi ? f.url : almacenPortafolio.urlFirmada(urlApi, f.id));

export async function misFotos(id, urlApi) {
  const { rows } = await pool.query(
    'SELECT id, url, creado_en FROM fotos_trabajo WHERE prestador_id = $1 ORDER BY creado_en DESC, id DESC LIMIT $2',
    [id, MAX_FOTOS_PORTAFOLIO]);
  return { fotos: rows.map((f) => ({ ...f, url: urlDeFoto(urlApi, f) })), maximo: MAX_FOTOS_PORTAFOLIO };
}

export async function agregarFoto(id, { imagen_base64: base64 }, urlApi) {
  const { rows: [{ n }] } = await pool.query(
    'SELECT count(*)::int AS n FROM fotos_trabajo WHERE prestador_id = $1', [id]);
  if (n >= MAX_FOTOS_PORTAFOLIO) {
    throw new AppError(`Puedes tener hasta ${MAX_FOTOS_PORTAFOLIO} fotos en tu portafolio`, 409, 'LIMITE_FOTOS');
  }
  const imagen = decodificarImagen(base64);
  const archivo = await almacenPortafolio.guardar(imagen);   // queda convertida a WebP
  try {
    await pool.query('INSERT INTO fotos_trabajo (prestador_id, url) VALUES ($1, $2)', [id, archivo]);
  } catch (err) {
    await almacenPortafolio.eliminar(archivo);
    throw err;
  }
  return misFotos(id, urlApi);
}

export async function eliminarFoto(id, fotoId, urlApi) {
  // Solo las fotos propias: las de otro maestro se responden como si no existieran
  const { rows: [f] } = await pool.query(
    'DELETE FROM fotos_trabajo WHERE id = $1 AND prestador_id = $2 RETURNING url', [fotoId, id]);
  if (!f) throw new AppError('Foto no encontrada', 404, 'FOTO_NO_ENCONTRADA');
  if (!esUrlExterna(f.url)) await almacenPortafolio.eliminar(f.url);
  return misFotos(id, urlApi);
}

export async function imagenPortafolio(fotoId) {
  const { rows } = await pool.query('SELECT url FROM fotos_trabajo WHERE id = $1', [fotoId]);
  if (!rows[0] || esUrlExterna(rows[0].url)) throw new AppError('Foto no encontrada', 404, 'FOTO_NO_ENCONTRADA');
  const ext = rows[0].url.split('.').pop();
  return { buffer: await almacenPortafolio.leer(rows[0].url), mime: MIME_POR_EXTENSION[ext] };
}

export const firmaPortafolioValida = (id, vence, firma) => almacenPortafolio.firmaValida(id, vence, firma);

// ------------------------------------------------------------------ perfil público (HU-02)
// Nunca incluye teléfono, correo ni datos bancarios (enmascaramiento de datos).
export async function perfilPublico(id, urlApi) {
  const { rows } = await pool.query(
    `WITH ${CTE_HABILITADAS}
     SELECT u.id, u.nombre, p.descripcion, p.comunas_atendidas, p.disponible, ${sqlHorario('p')} AS horario,
            p.calificacion_promedio::float AS calificacion_promedio,
            p.total_resenas, p.trabajos_cerrados, u.creado_en AS miembro_desde,
            COALESCE((SELECT json_agg(json_build_object('slug', h.slug, 'nombre', h.nombre, 'verificada', h.verificada)
                                      ORDER BY h.nombre)
                        FROM habilitadas h WHERE h.prestador_id = p.usuario_id), '[]') AS categorias
       FROM prestadores p
       JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.usuario_id = $1 AND u.activo`,
    [id],
  );
  if (!rows[0]) throw new AppError('Prestador no encontrado', 404, 'PRESTADOR_NO_ENCONTRADO');

  const [resenas, fotos, verificaciones] = await Promise.all([
    // Solo el primer nombre de quien reseña, por privacidad
    pool.query(
      `SELECT r.estrellas, r.comentario, r.creado_en, split_part(u.nombre, ' ', 1) AS cliente
         FROM resenas r JOIN usuarios u ON u.id = r.cliente_id
        WHERE r.prestador_id = $1 ORDER BY r.creado_en DESC LIMIT 5`, [id]),
    pool.query(
      `SELECT id, url, creado_en FROM fotos_trabajo WHERE prestador_id = $1 ORDER BY creado_en DESC LIMIT 12`, [id]),
    pool.query(
      `SELECT v.organismo, c.nombre AS categoria, v.revisado_en, to_char(v.vence_en, 'YYYY-MM-DD') AS vence_en
         FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id
        WHERE v.prestador_id = $1 AND ${sqlVigente('v')} ORDER BY v.revisado_en DESC`, [id]),
  ]);

  return {
    ...rows[0],
    resenas: resenas.rows,
    fotos: fotos.rows.map((f) => ({ ...f, url: urlDeFoto(urlApi, f) })),
    verificaciones: verificaciones.rows,
  };
}

// ------------------------------------------------------------------ ficha propia del prestador
// ------------------------------------------------------------------ agenda del maestro (CU-16)
// Sus próximas visitas programadas, desde el inicio del día de hoy (hora de Chile) en adelante:
// la visita pagada que aún no confirma, y los trabajos que nacieron de una visita ya realizada.
export async function miAgenda(id) {
  const { rows } = await pool.query(
    `SELECT s.id, s.estado, s.visita_programada_en, s.tarifa_visita, s.comuna, s.descripcion_original AS descripcion,
            cat.nombre AS categoria, u.nombre AS cliente
       FROM solicitudes s
       JOIN usuarios u   ON u.id = s.cliente_id
       JOIN categorias cat ON cat.id = s.categoria_id      WHERE s.prestador_id = $1
        AND s.visita_programada_en IS NOT NULL
        AND s.estado IN ('visita_pagada', 'en_diagnostico', 'cotizada', 'confirmada')
        AND s.visita_programada_en >= ((now() AT TIME ZONE 'America/Santiago')::date::timestamp AT TIME ZONE 'America/Santiago')
      ORDER BY s.visita_programada_en ASC
      LIMIT 50`,
    [id],
  );
  return rows;
}

export async function obtenerFicha(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, p.descripcion, p.comunas_atendidas, p.disponible, ${sqlHorario('p')} AS horario,
            p.calificacion_promedio::float AS calificacion_promedio, p.total_resenas, p.trabajos_cerrados,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'slug', c.slug, 'nombre', c.nombre,
                       'requiere_verificacion', c.requiere_verificacion, 'organismo', c.organismo,
                       -- estado de la verificación más reciente (null si nunca la ha solicitado);
                       -- una aprobada cuyo certificado venció se informa como "vencida" (HU-17)
                       'verificacion', (SELECT CASE WHEN v.estado = 'aprobada' AND v.vence_en < current_date
                                                    THEN 'vencida' ELSE v.estado::text END
                                          FROM verificaciones v
                                         WHERE v.prestador_id = p.usuario_id AND v.categoria_id = c.id
                                         ORDER BY v.creado_en DESC LIMIT 1),
                       'vence_en', (SELECT to_char(v.vence_en, 'YYYY-MM-DD') FROM verificaciones v
                                     WHERE v.prestador_id = p.usuario_id AND v.categoria_id = c.id
                                     ORDER BY v.creado_en DESC LIMIT 1))
                     ORDER BY c.nombre)
                FROM prestador_categorias pc JOIN categorias c ON c.id = pc.categoria_id
               WHERE pc.prestador_id = p.usuario_id), '[]') AS categorias
       FROM prestadores p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.usuario_id = $1`,
    [id],
  );
  if (!rows[0]) throw new AppError('No tienes una ficha de prestador', 404, 'FICHA_NO_ENCONTRADA');
  return rows[0];
}

export async function actualizarFicha(id, { descripcion, comunas_atendidas, categorias, disponible, horario }) {
  await enTransaccion(async (db) => {
    await db.query(
      `UPDATE prestadores SET
         descripcion       = COALESCE($2, descripcion),
         comunas_atendidas = COALESCE($3, comunas_atendidas),
         disponible        = COALESCE($4, disponible),
         dias_atencion     = COALESCE($5::smallint[], dias_atencion),
         hora_inicio       = COALESCE($6::time, hora_inicio),
         hora_fin          = COALESCE($7::time, hora_fin)
       WHERE usuario_id = $1`,
      [id, descripcion ?? null, comunas_atendidas ?? null, disponible ?? null,
        horario?.dias ?? null, horario?.desde ?? null, horario?.hasta ?? null],
    );

    if (categorias) {
      const { rows } = await db.query(
        'SELECT id, slug FROM categorias WHERE slug = ANY ($1) AND activa', [categorias]);
      const validas = new Set(rows.map((r) => r.slug));
      const invalidas = categorias.filter((c) => !validas.has(c));
      if (invalidas.length) {
        const err = new AppError('Hay categorías que no existen o aún no están habilitadas', 422, 'DATOS_INVALIDOS');
        err.campos = { categorias: `No disponibles: ${invalidas.join(', ')}` };
        throw err;
      }
      await db.query('DELETE FROM prestador_categorias WHERE prestador_id = $1', [id]);
      await db.query(
        `INSERT INTO prestador_categorias (prestador_id, categoria_id)
         SELECT $1, unnest($2::int[])`,
        [id, rows.map((r) => r.id)],
      );
    }
  });
  return obtenerFicha(id);
}

// ------------------------------------------------------------------ HU-13: datos para recibir pagos
// Solo los ve el propio prestador y el equipo (para transferir); nunca el cliente.
export async function obtenerDatosPago(id) {
  const { rows } = await pool.query(
    'SELECT rut, banco, tipo_cuenta, numero_cuenta FROM prestadores WHERE usuario_id = $1', [id]);
  if (!rows[0]) throw new AppError('No tienes una ficha de prestador', 404, 'FICHA_NO_ENCONTRADA');
  const completos = Boolean(rows[0].rut && rows[0].banco && rows[0].tipo_cuenta && rows[0].numero_cuenta);
  return { ...rows[0], completos };
}

export async function guardarDatosPago(id, { rut, banco, tipo_cuenta, numero_cuenta }) {
  // Quien se verificó con un RUT solo puede cobrar en una cuenta de ese mismo RUT
  const { rows: [p] } = await pool.query('SELECT rut_verificado FROM prestadores WHERE usuario_id = $1', [id]);
  if (p?.rut_verificado && p.rut_verificado !== rut) {
    const err = new AppError('La cuenta debe estar a nombre del RUT con que te verificaste', 422, 'DATOS_INVALIDOS');
    err.campos = { rut: 'Debe ser el RUT con que te verificaste' };
    throw err;
  }
  await pool.query(
    'UPDATE prestadores SET rut = $2, banco = $3, tipo_cuenta = $4, numero_cuenta = $5 WHERE usuario_id = $1',
    [id, rut, banco, tipo_cuenta, numero_cuenta]);
  return obtenerDatosPago(id);
}
