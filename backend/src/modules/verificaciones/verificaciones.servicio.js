import { pool, enTransaccion } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { crearNotificacion } from '../notificaciones/notificaciones.servicio.js';
import { consultarRegistroSec } from './validadorSec.js';

// Dónde debe consultar el administrador según el organismo (no tienen API pública).
export const FUENTES_OFICIALES = {
  SEC: 'https://wlhttp.sec.cl/validadorInstaladores/',
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
                  v.observacion, v.fuente_url, v.creado_en, v.revisado_en, v.metodo_revision,
                  -- una aprobada que ya tiene una renovación aprobada más reciente
                  EXISTS (SELECT 1 FROM verificaciones n
                           WHERE n.prestador_id = v.prestador_id AND n.categoria_id = v.categoria_id
                             AND n.estado = 'aprobada' AND n.creado_en > v.creado_en) AS renovada`;

// ------------------------------------------------------------------ lado del prestador
export async function solicitar(prestadorId, { categoria, numero_registro, codigo_certificado, rut, apellido_paterno, apellido_materno }) {
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

  let id;
  try {
    const { rows } = await pool.query(
      `INSERT INTO verificaciones (prestador_id, categoria_id, organismo, numero_registro, codigo_certificado,
                                   rut, apellido_paterno, apellido_materno)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [prestadorId, cat.id, cat.organismo, numero_registro, codigo_certificado ?? null,
        rut ?? null, apellido_paterno ?? null, apellido_materno ?? null]);
    // Al solicitar, la categoría queda asociada a su ficha (aparecerá en el catálogo al aprobarse).
    await pool.query(
      'INSERT INTO prestador_categorias (prestador_id, categoria_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [prestadorId, cat.id]);
    id = rows[0].id;
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('Ya tienes una solicitud pendiente para esta categoría', 409, 'SOLICITUD_PENDIENTE');
    }
    throw err;
  }
  // Si la consulta falla, la solicitud igual queda registrada para revisión manual
  await verificarConRegistro(id).catch((err) => {
    console.error(JSON.stringify({ evento: 'verificacion_automatica', error: err.message }));
  });
  return obtener(id);
}

// ------------------------------------------------------------------ verificación automática
// El equipo no puede revisar a cada maestro: si el registro oficial confirma los datos, la solicitud se
// aprueba sola y al panel solo llegan las excepciones. Nadie se rechaza sin que lo decida una persona.
const DIAS_VIGENCIA_AUTOMATICA = 90;      // el certificado SEC dura tres meses
const DIAS_ENTRE_REVALIDACIONES = 30;     // así una licencia revocada no sigue visible hasta su vencimiento
const TIEMPO_MAX_CONSULTA_MS = 8_000;
const SERVICIO_SEC = { electricidad: 'ELECTRICO', gas: 'GAS' };

const MOTIVOS = {
  sin_rut: 'El maestro no envió su RUT (versión antigua de la app).',
  otra_cuenta: 'Este RUT ya está verificado en otra cuenta.',
  rut_distinto: 'El RUT no coincide con el que ya tenía verificado.',
  datos_pago: 'El RUT no coincide con el de sus datos de pago.',
  cuenta: 'El apellido enviado no coincide con el nombre de la cuenta.',
  no_disponible: 'No se pudo consultar a la SEC. Revisa el certificado a mano.',
  no_encontrado: 'La SEC no tiene registrado ese RUT con estos datos.',
  no_vigente: 'La SEC informa que el certificado no está vigente.',
  nombre_registro: 'El nombre que informa la SEC no coincide con los apellidos enviados.',
};

// Sin tildes ni mayúsculas, y con espacios en los extremos para comparar palabras completas
const normalizar = (t) => ` ${String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()} `;
const contiene = (texto, parte) => normalizar(texto).includes(normalizar(parte));

async function consultarConTope(v, tiempoMaximoMs) {
  let reloj;
  try {
    return await Promise.race([
      consultarRegistroSec({ servicio: SERVICIO_SEC[v.slug], rut: v.rut, apellidoPaterno: v.apellido_paterno, apellidoMaterno: v.apellido_materno }),
      new Promise((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('La SEC no respondió a tiempo')), tiempoMaximoMs); }),
    ]);
  } catch (err) {
    console.error(JSON.stringify({ evento: 'validador_sec', error: err.message }));
    return { resultado: 'no_disponible' };
  } finally {
    clearTimeout(reloj);
  }
}

// El registro debe informar a la persona que declaró esos apellidos
const coincideConRegistro = (consulta, v) => contiene(consulta.nombre, v.apellido_paterno)
  && (!v.apellido_materno || contiene(consulta.nombre, v.apellido_materno));

function impedimentoPrevio(v) {
  if (!v.rut || !v.apellido_paterno) return MOTIVOS.sin_rut;
  if (v.rut_en_otra_cuenta) return MOTIVOS.otra_cuenta;
  if (v.rut_verificado && v.rut_verificado !== v.rut) return MOTIVOS.rut_distinto;
  if (v.rut_pago && v.rut_pago !== v.rut) return MOTIVOS.datos_pago;
  if (!contiene(v.cuenta, v.apellido_paterno)) return MOTIVOS.cuenta;
  return null;
}

function motivoDeRevision(consulta, v) {
  if (consulta.resultado !== 'vigente') return MOTIVOS[consulta.resultado] ?? MOTIVOS.no_disponible;
  return coincideConRegistro(consulta, v) ? null : MOTIVOS.nombre_registro;
}

const anotarRevisionManual = (id, resultado, motivo) => pool.query(
  `UPDATE verificaciones SET consulta_resultado = $2, consulta_motivo = $3, consultado_en = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END
    WHERE id = $1 AND estado = 'pendiente'`, [id, resultado, motivo]);

async function aprobarAutomaticamente(v) {
  try {
    await enTransaccion(async (db) => {
      const { rowCount } = await db.query(
        `UPDATE verificaciones
            SET estado = 'aprobada', metodo_revision = 'automatica', fuente_url = $2, vence_en = current_date + $3::int,
                revisado_en = now(), revalidado_en = now(), consultado_en = now(),
                consulta_resultado = 'vigente', consulta_motivo = NULL
          WHERE id = $1 AND estado = 'pendiente'`, [v.id, FUENTES_OFICIALES.SEC, DIAS_VIGENCIA_AUTOMATICA]);
      if (!rowCount) return;
      await db.query('UPDATE prestadores SET rut_verificado = $2 WHERE usuario_id = $1', [v.prestador_id, v.rut]);
      await crearNotificacion(db, v.prestador_id, avisoResolucion(v, 'aprobada'));
    });
  } catch (err) {
    if (err.code !== '23505') throw err;
    await anotarRevisionManual(v.id, 'vigente', MOTIVOS.otra_cuenta);   // otra cuenta tomó el RUT recién
  }
}

export async function verificarConRegistro(id, { tiempoMaximoMs = TIEMPO_MAX_CONSULTA_MS } = {}) {
  const { rows: [v] } = await pool.query(
    `SELECT v.id, v.prestador_id, v.organismo, v.rut, v.apellido_paterno, v.apellido_materno,
            c.slug, c.nombre AS categoria, u.nombre AS cuenta, p.rut AS rut_pago, p.rut_verificado,
            EXISTS (SELECT 1 FROM prestadores o WHERE o.rut_verificado = v.rut AND o.usuario_id <> v.prestador_id) AS rut_en_otra_cuenta
       FROM verificaciones v
       JOIN categorias c ON c.id = v.categoria_id
       JOIN usuarios u ON u.id = v.prestador_id
       JOIN prestadores p ON p.usuario_id = v.prestador_id
      WHERE v.id = $1`, [id]);
  if (!SERVICIO_SEC[v.slug]) return;   // SAG y CONAF siguen en revisión manual

  const previo = impedimentoPrevio(v);
  if (previo) {
    await anotarRevisionManual(id, null, previo);
    return;
  }
  const consulta = await consultarConTope(v, tiempoMaximoMs);
  const motivo = motivoDeRevision(consulta, v);
  if (motivo) await anotarRevisionManual(id, consulta.resultado, motivo);
  else await aprobarAutomaticamente(v);
}

// Lo aprobado automáticamente se vuelve a consultar cada mes. Si la SEC no responde no cambia nada:
// sin nuevas confirmaciones, la verificación vence sola y la categoría se oculta.
export async function revalidarAutomaticas({ tiempoMaximoMs = TIEMPO_MAX_CONSULTA_MS } = {}) {
  const { rows } = await pool.query(
    `SELECT v.id, v.prestador_id, v.organismo, v.rut, v.apellido_paterno, v.apellido_materno, c.slug, c.nombre AS categoria
       FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id
      WHERE v.estado = 'aprobada' AND v.metodo_revision = 'automatica' AND v.rut IS NOT NULL
        AND v.revalidado_en < now() - make_interval(days => $1)
        AND ${SIN_RENOVACION}`, [DIAS_ENTRE_REVALIDACIONES]);
  const totales = { revisadas: rows.length, renovadas: 0, revocadas: 0 };
  for (const v of rows) {
    const consulta = await consultarConTope(v, tiempoMaximoMs);
    if (consulta.resultado === 'vigente' && coincideConRegistro(consulta, v)) {
      await pool.query(
        `UPDATE verificaciones
            SET vence_en = current_date + $2::int, revalidado_en = now(), consultado_en = now(),
                aviso_por_vencer_en = NULL, aviso_vencida_en = NULL
          WHERE id = $1`, [v.id, DIAS_VIGENCIA_AUTOMATICA]);
      totales.renovadas++;
    } else if (['no_vigente', 'no_encontrado'].includes(consulta.resultado)) {
      await enTransaccion(async (db) => {
        await db.query(
          `UPDATE verificaciones
              SET estado = 'rechazada', observacion = $2, vence_en = NULL, revisado_en = now(),
                  consulta_resultado = $3, consultado_en = now()
            WHERE id = $1`, [v.id, MOTIVOS[consulta.resultado], consulta.resultado]);
        await crearNotificacion(db, v.prestador_id, {
          titulo: `Ya no pudimos confirmar tu registro en ${v.categoria}`,
          texto: `${MOTIVOS[consulta.resultado]} Dejamos de mostrarte en ese servicio: envía una nueva solicitud desde Mis verificaciones.`,
          tipo: 'verificacion',
        });
      });
      totales.revocadas++;
    }
  }
  return totales;
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
            v.rut, v.apellido_paterno, v.apellido_materno, v.consulta_resultado, v.consulta_motivo,
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
        RETURNING v.id, v.organismo, v.prestador_id, v.rut,
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
    if (decision === 'aprobada' && rows[0].rut) {
      try {
        await db.query('UPDATE prestadores SET rut_verificado = $2 WHERE usuario_id = $1', [rows[0].prestador_id, rows[0].rut]);
      } catch (err) {
        if (err.code === '23505') throw new AppError('Ese RUT ya está verificado en otra cuenta', 409, 'RUT_EN_OTRA_CUENTA');
        throw err;
      }
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
// Un certificado viejo no genera avisos si el maestro ya tiene otro aprobado que dura más:
// la categoría sigue habilitada y el aviso sería falso.
const SIN_RENOVACION = `NOT EXISTS (SELECT 1 FROM verificaciones n
                                     WHERE n.prestador_id = v.prestador_id AND n.categoria_id = v.categoria_id
                                       AND n.id <> v.id AND n.estado = 'aprobada'
                                       AND (n.vence_en IS NULL OR n.vence_en > v.vence_en))`;

export async function revisarVencimientos(db = pool) {
  const fecha = (f) => new Date(`${f}T00:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

  const porVencer = await db.query(
    `SELECT v.id, v.prestador_id, v.organismo, to_char(v.vence_en, 'YYYY-MM-DD') AS vence_en, c.nombre AS categoria_nombre
       FROM verificaciones v JOIN categorias c ON c.id = v.categoria_id
      WHERE v.estado = 'aprobada' AND v.aviso_por_vencer_en IS NULL
        AND v.vence_en IS NOT NULL
        AND v.vence_en >= current_date
        AND v.vence_en <= current_date + $1::int
        AND ${SIN_RENOVACION}`,
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
        AND v.vence_en IS NOT NULL AND v.vence_en < current_date
        AND ${SIN_RENOVACION}`);
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
    ? { titulo: `✅ Quedaste verificado en ${categoria}`, tipo: 'verificacion',
      texto: `Revisamos tu registro en ${organismo}. Ya puedes aparecer en el catálogo para este servicio.` }
    : { titulo: `No pudimos verificarte en ${categoria}`, tipo: 'verificacion',
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
