import { pool, enTransaccion } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { crearNotificacion } from '../notificaciones/notificaciones.servicio.js';

// Dónde debe consultar el administrador según el organismo (no tienen API pública).
export const FUENTES_OFICIALES = {
  SEC: 'https://www.sec.cl',
  SAG: 'https://www.sag.gob.cl',
  CONAF: 'https://www.conaf.cl',
};

// HU-17: una verificación habilita al prestador solo mientras está vigente. La de la SEC vence
// con el certificado (tres meses); las demás, si no tienen fecha, no vencen.
export const sqlVigente = (v = 'v') =>
  `${v}.estado = 'aprobada' AND (${v}.vence_en IS NULL OR ${v}.vence_en >= current_date)`;

// Días antes del vencimiento en que el prestador ya puede pedir la renovación
export const DIAS_AVISO_RENOVACION = 15;
// Vigencia máxima del certificado de la SEC (tres meses) con un margen por los días del mes
const MAX_DIAS_VIGENCIA_SEC = 93;

const COLUMNAS = `v.id, c.slug AS categoria, c.nombre AS categoria_nombre, v.organismo, v.numero_registro,
                  v.codigo_certificado, to_char(v.vence_en, 'YYYY-MM-DD') AS vence_en,
                  CASE WHEN v.estado = 'aprobada' AND v.vence_en < current_date THEN 'vencida'
                       ELSE v.estado::text END AS estado,
                  v.observacion, v.fuente_url, v.creado_en, v.revisado_en,
                  -- una aprobada que ya tiene una renovación aprobada más reciente
                  EXISTS (SELECT 1 FROM verificaciones n
                           WHERE n.prestador_id = v.prestador_id AND n.categoria_id = v.categoria_id
                             AND n.estado = 'aprobada' AND n.creado_en > v.creado_en) AS renovada`;

// ------------------------------------------------------------------ lado del prestador
export async function solicitar(prestadorId, { categoria, numero_registro, codigo_certificado }) {
  const { rows: cats } = await pool.query(
    'SELECT id, organismo, requiere_verificacion, activa FROM categorias WHERE slug = $1', [categoria]);
  const cat = cats[0];
  if (!cat || !cat.activa) {
    throw new AppError('La categoría no existe o no está habilitada', 404, 'CATEGORIA_NO_ENCONTRADA');
  }
  if (!cat.requiere_verificacion) {
    throw new AppError('Esta categoría no requiere verificación oficial', 422, 'NO_REQUIERE_VERIFICACION');
  }

  // El certificado de la SEC trae un código (bajo el QR) que el administrador valida en el sitio de la SEC
  if (cat.organismo === 'SEC' && !codigo_certificado) {
    const err = new AppError('Ingresa el código de verificación de tu certificado SEC', 422, 'DATOS_INVALIDOS');
    err.campos = { codigo_certificado: 'Está bajo el código QR del certificado que descargas en sec.cl' };
    throw err;
  }

  // Si ya está verificado, solo puede volver a solicitar cuando su certificado está por vencer o venció
  const { rowCount: vigente } = await pool.query(
    `SELECT 1 FROM verificaciones v
      WHERE v.prestador_id = $1 AND v.categoria_id = $2 AND v.estado = 'aprobada'
        AND (v.vence_en IS NULL OR v.vence_en > current_date + $3::int)`,
    [prestadorId, cat.id, DIAS_AVISO_RENOVACION]);
  if (vigente) {
    throw new AppError('Ya estás verificado en esta categoría', 409, 'YA_VERIFICADO');
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO verificaciones (prestador_id, categoria_id, organismo, numero_registro, codigo_certificado)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [prestadorId, cat.id, cat.organismo, numero_registro, codigo_certificado ?? null]);
    // Al solicitar, la categoría queda asociada a su ficha (aparecerá en el catálogo al aprobarse).
    await pool.query(
      'INSERT INTO prestador_categorias (prestador_id, categoria_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [prestadorId, cat.id]);
    return obtener(rows[0].id);
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('Ya tienes una solicitud pendiente para esta categoría', 409, 'SOLICITUD_PENDIENTE');
    }
    throw err;
  }
}

export async function listarPropias(prestadorId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id
      WHERE v.prestador_id = $1 ORDER BY v.creado_en DESC`, [prestadorId]);
  return rows;
}

async function obtener(id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id WHERE v.id = $1`, [id]);
  return rows[0];
}

// ------------------------------------------------------------------ lado del administrador
export async function listarParaRevision({ estado }) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS}, u.id AS prestador_id, u.nombre AS prestador_nombre,
            r.nombre AS revisado_por
       FROM verificaciones v
       JOIN categorias c ON c.id = v.categoria_id
       JOIN usuarios u   ON u.id = v.prestador_id
       LEFT JOIN usuarios r ON r.id = v.revisado_por
      WHERE v.estado = $1
      ORDER BY v.creado_en ${estado === 'pendiente' ? 'ASC' : 'DESC'}`, // pendientes: las más antiguas primero
    [estado]);
  return rows.map((v) => ({ ...v, fuente_sugerida: FUENTES_OFICIALES[v.organismo] }));
}

export async function resolver(id, adminId, { decision, fuente_url, observacion, vence_en }) {
  const { rows: [actual] } = await pool.query('SELECT organismo, estado FROM verificaciones WHERE id = $1', [id]);
  if (!actual) throw new AppError('Solicitud de verificación no encontrada', 404, 'VERIFICACION_NO_ENCONTRADA');
  if (actual.estado !== 'pendiente') throw new AppError('Esta solicitud ya fue resuelta', 409, 'YA_RESUELTA');
  if (decision === 'aprobada') validarVencimiento(actual.organismo, vence_en);

  await enTransaccion(async (db) => {
    // La condición estado = 'pendiente' en el UPDATE evita que dos administradores
    // resuelvan la misma solicitud al mismo tiempo.
    const { rows } = await db.query(
      `UPDATE verificaciones v
          SET estado = $2, fuente_url = COALESCE($3, fuente_url), observacion = $4,
              revisado_por = $5, revisado_en = now(), vence_en = $6
        WHERE v.id = $1 AND v.estado = 'pendiente'
        RETURNING v.id, v.organismo, v.prestador_id,
                  (SELECT c.nombre FROM categorias c WHERE c.id = v.categoria_id) AS categoria`,
      [id, decision, fuente_url ?? null, observacion ?? null, adminId, decision === 'aprobada' ? vence_en ?? null : null]);

    if (!rows[0]) {
      const { rowCount } = await db.query('SELECT 1 FROM verificaciones WHERE id = $1', [id]);
      throw rowCount
        ? new AppError('Esta solicitud ya fue resuelta', 409, 'YA_RESUELTA')
        : new AppError('Solicitud de verificación no encontrada', 404, 'VERIFICACION_NO_ENCONTRADA');
    }
    // Si no se indicó fuente, se deja la oficial del organismo como respaldo de dónde se consultó.
    if (!fuente_url) {
      await db.query('UPDATE verificaciones SET fuente_url = COALESCE(fuente_url, $2) WHERE id = $1',
        [id, FUENTES_OFICIALES[rows[0].organismo]]);
    }
    await crearNotificacion(db, rows[0].prestador_id, avisoResolucion(rows[0], decision, observacion));
  });
  return obtener(id);
}

// ------------------------------------------------------------------ automatización de vencimientos
// La SEC y el SAG no tienen API pública para consultar ni renovar certificados, por lo que la
// revisión de fondo sigue siendo humana (resolver). Lo que sí se automatiza es todo lo demás:
//  · el catálogo ya oculta solo las categorías vencidas (sqlVigente se aplica en cada consulta);
//  · este barrido avisa al prestador ANTES de que venza (dentro de la ventana de renovación,
//    para que alcance a subir el certificado nuevo) y OTRA VEZ al vencer, explicándole que su
//    categoría dejó de mostrarse hasta que renueve.
// Cada aviso se marca en la propia fila (migración 021) para no repetirlo en cada revisión.
export async function revisarVencimientos(db = pool) {
  const fecha = (f) => new Date(`${f}T00:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

  const porVencer = await db.query(
    `SELECT v.id, v.prestador_id, v.organismo, to_char(v.vence_en, 'YYYY-MM-DD') AS vence_en, c.nombre AS categoria_nombre
       FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id
      WHERE v.estado = 'aprobada' AND v.aviso_por_vencer_en IS NULL
        AND v.vence_en IS NOT NULL
        AND v.vence_en >= current_date
        AND v.vence_en <= current_date + $1::int`,
    [DIAS_AVISO_RENOVACION]);
  for (const v of porVencer.rows) {
    await crearNotificacion(db, v.prestador_id, {
      titulo: `Tu certificado ${v.organismo} está por vencer`,
      texto: `Tu verificación de ${v.categoria_nombre} vence el ${fecha(v.vence_en)}. Ya puedes subir el certificado nuevo desde tu ficha: si vence, la categoría deja de mostrarse en el catálogo hasta que lo renueves.`,
      tipo: 'verificacion',
    });
    await db.query('UPDATE verificaciones SET aviso_por_vencer_en = now() WHERE id = $1', [v.id]);
  }

  const vencidas = await db.query(
    `SELECT v.id, v.prestador_id, v.organismo, to_char(v.vence_en, 'YYYY-MM-DD') AS vence_en, c.nombre AS categoria_nombre
       FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id
      WHERE v.estado = 'aprobada' AND v.aviso_vencida_en IS NULL
        AND v.vence_en IS NOT NULL AND v.vence_en < current_date`);
  for (const v of vencidas.rows) {
    await crearNotificacion(db, v.prestador_id, {
      titulo: `Tu verificación ${v.organismo} venció`,
      texto: `El certificado de ${v.categoria_nombre} venció el ${fecha(v.vence_en)}, por lo que esa categoría ya no se muestra en el catálogo. Sube el certificado renovado desde tu ficha para volver a aparecer.`,
      tipo: 'verificacion',
    });
    await db.query('UPDATE verificaciones SET aviso_vencida_en = now() WHERE id = $1', [v.id]);
  }

  return { porVencer: porVencer.rowCount, vencidas: vencidas.rowCount };
}

// La app promete avisar al maestro cuando el equipo revise su solicitud
function avisoResolucion({ categoria, organismo }, decision, observacion) {
  return decision === 'aprobada'
    ? { titulo: `✅ Quedaste verificado en ${categoria}`,
      texto: `Revisamos tu registro en ${organismo}. Ya puedes aparecer en el catálogo para este servicio.` }
    : { titulo: `No pudimos verificarte en ${categoria}`,
      texto: `Motivo: ${observacion} Revisa tus datos y envía una nueva solicitud desde Mis verificaciones.` };
}

// La SEC exige fecha de vencimiento (la del certificado, máximo tres meses); los demás organismos, solo si la hay.
function validarVencimiento(organismo, venceEn) {
  const campo = (mensaje) => {
    const err = new AppError(mensaje, 422, 'DATOS_INVALIDOS');
    err.campos = { vence_en: mensaje };
    return err;
  };
  if (!venceEn) {
    if (organismo === 'SEC') throw campo('Indica la fecha de vencimiento que aparece en el certificado SEC');
    return;
  }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((new Date(`${venceEn}T00:00:00`) - hoy) / 86_400_000);
  if (dias < 0) throw campo('El certificado ya está vencido');
  if (organismo === 'SEC' && dias > MAX_DIAS_VIGENCIA_SEC) {
    throw campo('El certificado SEC tiene una vigencia máxima de tres meses: revisa la fecha');
  }
}
