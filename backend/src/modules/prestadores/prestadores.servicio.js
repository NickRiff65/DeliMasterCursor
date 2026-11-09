import { pool, enTransaccion } from '../../db/pool.js';
import { sqlHorario } from './horario.js';
import { AppError } from '../../utils/AppError.js';
import { sqlVigente } from '../verificaciones/verificaciones.servicio.js';

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
export async function listarCatalogo({ categoria, comuna, pagina, limite }) {
  const { rows } = await pool.query(
    `WITH ${CTE_HABILITADAS}
     SELECT u.id, u.nombre, p.descripcion, p.comunas_atendidas, ${sqlHorario('p')} AS horario,
            p.calificacion_promedio::float AS calificacion_promedio,
            p.total_resenas, p.trabajos_cerrados,
            json_agg(json_build_object('slug', h.slug, 'nombre', h.nombre, 'verificada', h.verificada)
                     ORDER BY h.nombre) AS categorias,
            count(*) OVER () AS total
       FROM prestadores p
       JOIN usuarios u    ON u.id = p.usuario_id
       JOIN habilitadas h ON h.prestador_id = p.usuario_id
      WHERE u.activo AND p.disponible
        AND ($2::text IS NULL OR $2 = ANY (p.comunas_atendidas))
      GROUP BY u.id, p.usuario_id
     HAVING ($1::text IS NULL OR bool_or(h.slug = $1))
      ORDER BY ${SQL_PUNTAJE} DESC, p.trabajos_cerrados DESC, u.creado_en DESC
      LIMIT $3 OFFSET $4`,
    [categoria ?? null, comuna ?? null, limite, (pagina - 1) * limite],
  );
  const total = rows.length ? Number(rows[0].total) : 0;
  return {
    prestadores: rows.map(({ total: _t, ...p }) => p),
    paginacion: { pagina, limite, total, paginas: Math.ceil(total / limite) },
  };
}

// ------------------------------------------------------------------ perfil público (HU-02)
// Nunca incluye teléfono, correo ni datos bancarios (enmascaramiento de datos).
export async function perfilPublico(id) {
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
      `SELECT url, creado_en FROM fotos_trabajo WHERE prestador_id = $1 ORDER BY creado_en DESC LIMIT 12`, [id]),
    pool.query(
      `SELECT v.organismo, c.nombre AS categoria, v.revisado_en, to_char(v.vence_en, 'YYYY-MM-DD') AS vence_en
         FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id
        WHERE v.prestador_id = $1 AND ${sqlVigente('v')} ORDER BY v.revisado_en DESC`, [id]),
  ]);

  return { ...rows[0], resenas: resenas.rows, fotos: fotos.rows, verificaciones: verificaciones.rows };
}

// ------------------------------------------------------------------ ficha propia del prestador
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
