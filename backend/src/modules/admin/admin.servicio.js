// Panel Web de Administración: métricas (HU-14), disputas (HU-16), transferencias (HU-13) y moderación.
import { pool, enTransaccion } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { obtener as obtenerSolicitud } from '../solicitudes/solicitudes.servicio.js';
import { DIAS_AVISO_RENOVACION } from '../verificaciones/verificaciones.servicio.js';
import { evidencias as almacenEvidencias, boletas as almacenBoletas } from '../gastos/almacen.js';
import { crearNotificacion } from '../notificaciones/notificaciones.servicio.js';

// Un usuario con esta cantidad de mensajes bloqueados queda marcado para revisión
export const UMBRAL_MODERACION = 3;
// Plazo comprometido para transferir al prestador después del cierre (SLA del informe)
const HORAS_SLA_TRANSFERENCIA = 48;

const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

// ------------------------------------------------------------------ HU-14: resumen y métricas
export async function resumen() {
  const { rows: [d] } = await pool.query(`
    SELECT
      (SELECT count(*) FROM usuarios WHERE rol = 'cliente')::int   AS clientes,
      (SELECT count(*) FROM usuarios WHERE rol = 'prestador')::int AS prestadores,
      -- Conversión de los últimos 90 días: solicitudes asignadas que terminaron pagadas
      (SELECT count(DISTINCT solicitud_id) FROM solicitud_eventos
        WHERE estado_nuevo = 'asignada' AND creado_en > now() - interval '90 days')::int AS asignadas_90d,
      (SELECT count(*) FROM ledger_movimientos lm
        WHERE lm.concepto <> 'visita' AND EXISTS (SELECT 1 FROM solicitud_eventos e WHERE e.solicitud_id = lm.solicitud_id
                         AND e.estado_nuevo = 'asignada' AND e.creado_en > now() - interval '90 days'))::int AS pagadas_90d,
      -- Disputas sobre los servicios que llegaron a terminarse o a disputa
      (SELECT count(DISTINCT solicitud_id) FROM solicitud_eventos WHERE estado_nuevo IN ('finalizada', 'en_disputa'))::int AS terminadas,
      (SELECT count(DISTINCT solicitud_id) FROM solicitud_eventos WHERE estado_nuevo = 'en_disputa')::int AS con_disputa,
      (SELECT count(*) FROM mensajes)::int                AS mensajes,
      (SELECT count(*) FROM mensajes WHERE bloqueado)::int AS mensajes_bloqueados,
      (SELECT count(*) FROM prestadores WHERE total_resenas > 0)::int AS prestadores_con_resenas,
      (SELECT count(*) FROM prestadores WHERE total_resenas > 0 AND calificacion_promedio >= 4)::int AS prestadores_4_estrellas,
      (SELECT count(DISTINCT prestador_id) FROM ledger_movimientos)::int AS prestadores_con_pagos,
      (SELECT count(DISTINCT g.prestador_id) FROM gastos g
        WHERE EXISTS (SELECT 1 FROM ledger_movimientos lm WHERE lm.prestador_id = g.prestador_id))::int AS prestadores_con_gastos,
      -- Pendientes del equipo
      (SELECT count(*) FROM verificaciones WHERE estado = 'pendiente')::int AS verificaciones_pendientes,
      -- certificados por vencer que aún no tienen una renovación aprobada
      (SELECT count(*) FROM verificaciones v WHERE v.estado = 'aprobada' AND v.vence_en IS NOT NULL
          AND v.vence_en BETWEEN current_date AND current_date + ${DIAS_AVISO_RENOVACION}
          AND NOT EXISTS (SELECT 1 FROM verificaciones n
                           WHERE n.prestador_id = v.prestador_id AND n.categoria_id = v.categoria_id
                             AND n.estado = 'aprobada' AND n.creado_en > v.creado_en))::int AS verificaciones_por_vencer,
      (SELECT count(*) FROM solicitudes WHERE estado = 'en_disputa')::int AS disputas_abiertas,
      (SELECT count(DISTINCT prestador_id) FROM ledger_movimientos WHERE estado = 'liberado')::int AS prestadores_por_pagar,
      (SELECT count(*) FROM ledger_movimientos WHERE estado = 'liberado'
          AND liberado_en < now() - make_interval(hours => ${HORAS_SLA_TRANSFERENCIA}))::int AS transferencias_atrasadas,
      (SELECT count(*) FROM (SELECT m.emisor_id FROM mensajes m JOIN usuarios u ON u.id = m.emisor_id
          WHERE m.bloqueado AND u.activo GROUP BY m.emisor_id HAVING count(*) >= ${UMBRAL_MODERACION}) x)::int AS usuarios_por_revisar
  `);

  // Pagos cobrados que Transbank no pudo devolver: el cliente sigue sin su dinero
  const { rows: devoluciones } = await pool.query(
    `SELECT p.id, p.solicitud_id, p.orden_compra, p.monto, u.nombre AS cliente,
            (p.respuesta->>'reembolso_intentos')::int AS intentos, p.respuesta->>'reembolso_error' AS error
       FROM pagos p
       JOIN solicitudes s ON s.id = p.solicitud_id
       JOIN usuarios u ON u.id = s.cliente_id
      WHERE p.estado = 'anulado' AND p.respuesta->>'reembolso' = 'fallido'
      ORDER BY p.creado_en`);

  const { rows: dinero } = await pool.query(
    `SELECT estado, sum(monto_bruto)::int AS bruto, sum(comision)::int AS comision, sum(monto_neto)::int AS neto,
            sum(monto_reembolsado)::int AS reembolsado_parcial, count(*)::int AS cantidad
       FROM ledger_movimientos GROUP BY estado`);
  const porEstado = Object.fromEntries(dinero.map((r) => [r.estado, r]));
  const neto = (e) => porEstado[e]?.neto ?? 0;

  // Servicios cerrados por mes (últimos 6 meses, incluido el actual)
  const { rows: meses } = await pool.query(`
    SELECT to_char(m, 'YYYY-MM') AS mes, count(s.id)::int AS cerrados
      FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
      LEFT JOIN solicitudes s ON s.estado = 'cerrada' AND date_trunc('month', s.cerrado_en) = m
     GROUP BY m ORDER BY m`);
  const [anterior, actual] = meses.slice(-2).map((m) => m.cerrados);
  const crecimiento = anterior > 0 ? Math.round(((actual - anterior) / anterior) * 1000) / 10 : null;

  const kpi = (id, nombre, valor, meta, cumple, formula) => ({ id, nombre, valor, meta, cumple: valor === null ? null : cumple, formula });
  const conversion = porcentaje(d.pagadas_90d, d.asignadas_90d);
  const disputas = porcentaje(d.con_disputa, d.terminadas);
  const cuatroEstrellas = porcentaje(d.prestadores_4_estrellas, d.prestadores_con_resenas);
  const panel = porcentaje(d.prestadores_con_gastos, d.prestadores_con_pagos);
  const bloqueo = porcentaje(d.mensajes_bloqueados, d.mensajes);

  return {
    usuarios: { clientes: d.clientes, prestadores: d.prestadores },
    pendientes: {
      verificaciones: d.verificaciones_pendientes,
      verificaciones_por_vencer: d.verificaciones_por_vencer,
      disputas: d.disputas_abiertas,
      prestadores_por_pagar: d.prestadores_por_pagar,
      transferencias_atrasadas: d.transferencias_atrasadas,
      usuarios_por_revisar: d.usuarios_por_revisar,
    },
    devoluciones_fallidas: devoluciones,
    dinero: {
      retenido: neto('retenido') + (porEstado.retenido?.comision ?? 0),
      por_transferir: neto('liberado'),
      transferido: neto('transferido'),
      // Reembolsos completos más las devoluciones parciales de disputas resueltas en parte
      reembolsado: (porEstado.reembolsado?.bruto ?? 0)
        + dinero.filter((r) => r.estado !== 'reembolsado').reduce((t, r) => t + (r.reembolsado_parcial ?? 0), 0),
      comisiones: (porEstado.liberado?.comision ?? 0) + (porEstado.transferido?.comision ?? 0),
    },
    cerrados_por_mes: meses,
    // Indicadores clave del informe de formulación (Tabla 17)
    indicadores: [
      kpi('crecimiento', 'Crecimiento de servicios cerrados', crecimiento, '≥ 10% mensual', crecimiento >= 10,
        'Cerrados del mes actual frente al mes anterior'),
      kpi('conversion', 'Tasa de conversión', conversion, '≥ 40%', conversion >= 40,
        'Solicitudes asignadas que terminaron pagadas (90 días)'),
      kpi('disputas', 'Tasa de disputas', disputas, '≤ 5%', disputas <= 5,
        'Servicios con disputa sobre servicios terminados'),
      kpi('reputacion', 'Prestadores con 4 estrellas o más', cuatroEstrellas, '≥ 80%', cuatroEstrellas >= 80,
        'Sobre los prestadores que tienen reseñas'),
      kpi('panel_contable', 'Uso del panel contable', panel, '≥ 50%', panel >= 50,
        'Prestadores con trabajos pagados que registraron gastos'),
      kpi('bloqueo_chat', 'Mensajes bloqueados por el filtro', bloqueo, 'Seguimiento', null,
        `Revisar usuarios con ${UMBRAL_MODERACION} o más bloqueos`),
    ],
  };
}

// El equipo devolvió el pago a mano en el portal de Transbank: deja de reintentarse y sale del resumen
// ------------------------------------------------------------------ panel contable (HU-09 / HU-14)
// Libro mayor del período: cada movimiento con su cliente, maestro, bruto, comisión y neto,
// los totales por estado del ledger y los gastos registrados con su boleta (y lo que leyó el OCR).
// Es la vista que el Panel Web no tenía: la contabilidad vivía solo en la app del maestro.
export async function contabilidad({ desde, hasta } = {}) {
  const hoy = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const desdeTxt = desde ?? iso(new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000));
  const hastaTxt = hasta ?? iso(hoy);
  const [movimientos, totales, gastos] = await Promise.all([
    pool.query(
      `SELECT lm.id, lm.creado_en, lm.liberado_en, lm.transferido_en, lm.estado,
              lm.monto_bruto, lm.comision, lm.monto_neto, lm.comprobante, lm.solicitud_id,
              uc.nombre AS cliente, up.nombre AS prestador, cat.nombre AS categoria
         FROM ledger_movimientos lm
         JOIN solicitudes s  ON s.id = lm.solicitud_id
         JOIN usuarios uc    ON uc.id = s.cliente_id
         JOIN usuarios up    ON up.id = lm.prestador_id
         LEFT JOIN categorias cat ON cat.id = s.categoria_id
        WHERE lm.creado_en >= $1::date AND lm.creado_en < ($2::date + 1)
        ORDER BY lm.creado_en DESC
        LIMIT 200`,
      [desdeTxt, hastaTxt],
    ),
    pool.query(
      `SELECT estado, count(*)::int AS cantidad,
              coalesce(sum(monto_bruto), 0)::int AS bruto,
              coalesce(sum(comision), 0)::int AS comision,
              coalesce(sum(monto_neto), 0)::int AS neto
         FROM ledger_movimientos
        WHERE creado_en >= $1::date AND creado_en < ($2::date + 1)
        GROUP BY estado
        ORDER BY estado`,
      [desdeTxt, hastaTxt],
    ),
    pool.query(
      `SELECT g.id, g.creado_en, g.monto, g.origen, g.descripcion, g.solicitud_id,
              up.nombre AS prestador,
              (g.boleta_id IS NOT NULL) AS con_boleta,
              b.ocr_monto, b.ocr_lector
         FROM gastos g
         JOIN usuarios up ON up.id = g.prestador_id
         LEFT JOIN boletas b ON b.id = g.boleta_id
        WHERE g.creado_en >= $1::date AND g.creado_en < ($2::date + 1)
        ORDER BY g.creado_en DESC
        LIMIT 200`,
      [desdeTxt, hastaTxt],
    ),
  ]);
  return {
    rango: { desde: desdeTxt, hasta: hastaTxt },
    totales: totales.rows,
    movimientos: movimientos.rows,
    gastos: gastos.rows,
  };
}

export async function marcarDevolucionManual(adminId, pagoId) {
  const { rowCount } = await pool.query(
    `UPDATE pagos SET respuesta = respuesta || jsonb_build_object('reembolso', 'manual', 'reembolso_manual_por', $2::text, 'reembolso_manual_en', now())
      WHERE id = $1 AND estado = 'anulado' AND respuesta->>'reembolso' = 'fallido'`,
    [pagoId, adminId]);
  if (!rowCount) throw new AppError('Este pago no tiene una devolución pendiente', 404, 'DEVOLUCION_NO_ENCONTRADA');
}

// ------------------------------------------------------------------ HU-16: disputas
export async function listarDisputas({ estado }) {
  if (estado === 'abiertas') {
    const { rows } = await pool.query(`
      SELECT s.id, s.descripcion_original AS descripcion, s.motivo_disputa, s.precio_acordado,
             c.nombre AS categoria, cu.nombre AS cliente, pu.nombre AS prestador,
             e.creado_en AS abierta_en, lm.estado AS estado_pago,
             (SELECT count(*) FROM mensajes m WHERE m.solicitud_id = s.id)::int AS mensajes
        FROM solicitudes s
        JOIN categorias c ON c.id = s.categoria_id
        JOIN usuarios cu ON cu.id = s.cliente_id
        JOIN usuarios pu ON pu.id = s.prestador_id
        LEFT JOIN ledger_movimientos lm ON lm.solicitud_id = s.id AND lm.concepto <> 'visita'
        LEFT JOIN LATERAL (SELECT creado_en FROM solicitud_eventos
                            WHERE solicitud_id = s.id AND estado_nuevo = 'en_disputa'
                            ORDER BY creado_en DESC LIMIT 1) e ON true
       WHERE s.estado = 'en_disputa'
       ORDER BY e.creado_en ASC`);   // las más antiguas primero
    return rows;
  }
  const { rows } = await pool.query(`
    SELECT s.id, s.descripcion_original AS descripcion, s.motivo_disputa, s.precio_acordado,
           c.nombre AS categoria, cu.nombre AS cliente, pu.nombre AS prestador,
           e.estado_nuevo AS resultado, e.detalle AS resolucion, e.creado_en AS resuelta_en, a.nombre AS resuelta_por
      FROM solicitud_eventos e
      JOIN solicitudes s ON s.id = e.solicitud_id
      JOIN categorias c ON c.id = s.categoria_id
      JOIN usuarios cu ON cu.id = s.cliente_id
      JOIN usuarios pu ON pu.id = s.prestador_id
      LEFT JOIN usuarios a ON a.id = e.actor_id
     WHERE e.estado_anterior = 'en_disputa'
     ORDER BY e.creado_en DESC LIMIT 50`);
  return rows;
}

const visitaDe = (pagos, ledger) => {
  const pago = pagos.find((p) => p.concepto === 'visita');
  return pago ? { pago, ledger: ledger.find((m) => m.concepto === 'visita') ?? null } : null;
};

// Toda la evidencia de una solicitud para el equipo: partes con contacto, chat completo
// (incluidos los mensajes bloqueados), pago, ledger, fotos e historial.
export async function detalleSolicitud(admin, id, urlApi) {
  const solicitud = await obtenerSolicitud(admin, id);
  const [partes, mensajes, pagos, ledger, fotos, gastos] = await Promise.all([
    pool.query(
      `SELECT json_build_object('id', cu.id, 'nombre', cu.nombre, 'email', cu.email, 'telefono', cu.telefono, 'activo', cu.activo) AS cliente,
              CASE WHEN pu.id IS NULL THEN NULL ELSE
                json_build_object('id', pu.id, 'nombre', pu.nombre, 'email', pu.email, 'telefono', pu.telefono, 'activo', pu.activo,
                                  'calificacion_promedio', p.calificacion_promedio::float, 'total_resenas', p.total_resenas) END AS prestador
         FROM solicitudes s JOIN usuarios cu ON cu.id = s.cliente_id
         LEFT JOIN usuarios pu ON pu.id = s.prestador_id
         LEFT JOIN prestadores p ON p.usuario_id = s.prestador_id
        WHERE s.id = $1`, [id]),
    pool.query(
      `SELECT m.id, m.contenido, m.bloqueado, m.motivo_bloqueo, m.creado_en,
              CASE WHEN m.emisor_id = s.cliente_id THEN 'cliente' ELSE 'prestador' END AS emisor
         FROM mensajes m JOIN solicitudes s ON s.id = m.solicitud_id
        WHERE m.solicitud_id = $1 ORDER BY m.creado_en, m.id`, [id]),
    pool.query(
      `SELECT DISTINCT ON (concepto) concepto, orden_compra, monto, estado, creado_en, medio,
              respuesta -> 'confirmacion' ->> 'authorization_code' AS codigo_autorizacion
         FROM pagos WHERE solicitud_id = $1 AND estado IN ('autorizado', 'anulado')
        ORDER BY concepto, creado_en DESC`, [id]),
    pool.query(
      `SELECT lm.id, lm.concepto, lm.estado, lm.monto_bruto, lm.comision, lm.monto_neto, lm.monto_reembolsado, lm.comprobante,
              lm.liberado_en, lm.transferido_en,
              COALESCE((SELECT json_agg(json_build_object('estado_anterior', le.estado_anterior, 'estado_nuevo', le.estado_nuevo,
                                                          'monto', le.monto, 'creado_en', le.creado_en, 'actor', u.nombre,
                                                          'detalle', le.detalle)
                                        ORDER BY le.creado_en, le.id)
                          FROM ledger_eventos le LEFT JOIN usuarios u ON u.id = le.actor_id
                         WHERE le.movimiento_id = lm.id), '[]') AS eventos
         FROM ledger_movimientos lm WHERE lm.solicitud_id = $1`, [id]),
    pool.query('SELECT id, rol, descripcion, creado_en FROM evidencias WHERE solicitud_id = $1 ORDER BY creado_en, id', [id]),
    // Gastos en materiales del maestro: el equipo ve cuáles tienen boleta (los sin boleta se pueden devolver)
    pool.query(
      `SELECT id, monto, descripcion, boleta_id, creado_en, rechazado_en IS NOT NULL AS rechazado
         FROM gastos WHERE solicitud_id = $1 ORDER BY creado_en`, [id]),
  ]);
  return {
    ...solicitud,
    ...partes.rows[0],
    mensajes: mensajes.rows,
    // Pago del trabajo (total o saldo) y, en la modalidad con visita, el de la visita aparte
    pago: pagos.rows.find((p) => p.concepto !== 'visita') ?? null,
    ledger: ledger.rows.find((m) => m.concepto !== 'visita') ?? null,
    visita: visitaDe(pagos.rows, ledger.rows),
    // Fotos de evidencia del cliente y del prestador, con enlace firmado que vence en una hora
    fotos: fotos.rows.map((f) => ({ ...f, url: almacenEvidencias.urlFirmada(urlApi, f.id) })),
    gastos: gastos.rows.map(({ boleta_id: boletaId, ...g }) => ({
      ...g, con_boleta: Boolean(boletaId), imagen_url: boletaId ? almacenBoletas.urlFirmada(urlApi, boletaId) : null,
    })),
  };
}

// ------------------------------------------------------------------ HU-13: liquidaciones a prestadores
export async function liquidaciones() {
  const { rows: pendientes } = await pool.query(`
    SELECT u.id AS prestador_id, u.nombre, u.email, p.rut, p.banco, p.tipo_cuenta, p.numero_cuenta,
           (p.rut IS NOT NULL AND p.banco IS NOT NULL AND p.tipo_cuenta IS NOT NULL AND p.numero_cuenta IS NOT NULL) AS datos_completos,
           sum(lm.monto_neto)::int AS total, count(*)::int AS cantidad,
           min(lm.liberado_en) AS liberado_desde,
           bool_or(lm.liberado_en < now() - make_interval(hours => ${HORAS_SLA_TRANSFERENCIA})) AS atrasado,
           json_agg(json_build_object('id', lm.id, 'solicitud_id', lm.solicitud_id, 'categoria', c.nombre, 'concepto', lm.concepto,
                                      'monto_bruto', lm.monto_bruto, 'comision', lm.comision, 'monto_neto', lm.monto_neto,
                                      'liberado_en', lm.liberado_en) ORDER BY lm.liberado_en) AS movimientos
      FROM ledger_movimientos lm
      JOIN usuarios u ON u.id = lm.prestador_id
      JOIN prestadores p ON p.usuario_id = lm.prestador_id
      JOIN solicitudes s ON s.id = lm.solicitud_id
      JOIN categorias c ON c.id = s.categoria_id
     WHERE lm.estado = 'liberado'
     GROUP BY u.id, p.usuario_id
     ORDER BY min(lm.liberado_en)`);

  const { rows: historial } = await pool.query(`
    SELECT lm.comprobante, u.nombre AS prestador, sum(lm.monto_neto)::int AS total, count(*)::int AS cantidad,
           max(lm.transferido_en) AS transferido_en
      FROM ledger_movimientos lm JOIN usuarios u ON u.id = lm.prestador_id
     WHERE lm.estado = 'transferido'
     GROUP BY lm.comprobante, u.id
     ORDER BY max(lm.transferido_en) DESC LIMIT 30`);
  return { pendientes, historial, sla_horas: HORAS_SLA_TRANSFERENCIA };
}

// Registra que el equipo transfirió al prestador: los pagos elegidos pasan de "liberado" a "transferido"
export async function registrarTransferencia(admin, prestadorId, { movimientos, comprobante }) {
  return enTransaccion(async (db) => {
    const { rows: [p] } = await db.query(
      'SELECT rut, banco, tipo_cuenta, numero_cuenta FROM prestadores WHERE usuario_id = $1', [prestadorId]);
    if (!p) throw new AppError('Prestador no encontrado', 404, 'PRESTADOR_NO_ENCONTRADO');
    if (!p.rut || !p.banco || !p.tipo_cuenta || !p.numero_cuenta) {
      throw new AppError('El prestador aún no registra sus datos bancarios completos', 422, 'DATOS_BANCARIOS_INCOMPLETOS');
    }

    const { rows } = await db.query(
      `UPDATE ledger_movimientos
          SET estado = 'transferido', transferido_en = now(), comprobante = $3
        WHERE id = ANY ($2::uuid[]) AND prestador_id = $1 AND estado = 'liberado'
        RETURNING id, monto_neto`,
      [prestadorId, movimientos, comprobante]);
    // Todos o ninguno: si algún pago ya se transfirió o no es de este prestador, no se registra nada
    if (rows.length !== movimientos.length) {
      throw new AppError('Alguno de los pagos ya fue transferido o no corresponde a este prestador', 409, 'MOVIMIENTOS_INVALIDOS');
    }
    for (const m of rows) {
      await db.query(
        `INSERT INTO ledger_eventos (movimiento_id, estado_anterior, estado_nuevo, monto, actor_id)
         VALUES ($1, 'liberado', 'transferido', $2, $3)`, [m.id, m.monto_neto, admin.id]);
    }
    const total = rows.reduce((t, m) => t + m.monto_neto, 0);
    // Aviso al maestro: el dinero ya está en su cuenta
    await crearNotificacion(db, prestadorId, {
      tipo: 'pago',
      titulo: '🏦 Te transferimos tu pago',
      texto: `Te transferimos $${total.toLocaleString('es-CL')} por ${rows.length === 1 ? '1 trabajo' : `${rows.length} trabajos`}. `
        + `Comprobante ${comprobante}.`,
    });
    return { comprobante, cantidad: rows.length, total };
  });
}

// ------------------------------------------------------------------ moderación del chat
export async function moderacion() {
  const { rows } = await pool.query(`
    SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.desactivado_motivo, u.desactivado_en,
           u.eliminada_en IS NOT NULL AS eliminada, count(*)::int AS bloqueados,
           (SELECT count(*) FROM mensajes t WHERE t.emisor_id = u.id)::int AS enviados,
           max(m.creado_en) AS ultimo_bloqueo,
           (SELECT array_agg(DISTINCT motivo)
              FROM mensajes b, unnest(string_to_array(b.motivo_bloqueo, ',')) AS motivo
             WHERE b.emisor_id = u.id AND b.bloqueado) AS motivos,
           (SELECT json_agg(x ORDER BY x.creado_en DESC) FROM (
              SELECT b.contenido, b.motivo_bloqueo, b.creado_en, b.solicitud_id FROM mensajes b
               WHERE b.emisor_id = u.id AND b.bloqueado ORDER BY b.creado_en DESC LIMIT 3) x) AS ultimos
      FROM mensajes m
      JOIN usuarios u ON u.id = m.emisor_id
     WHERE m.bloqueado
     GROUP BY u.id
     ORDER BY count(*) DESC, max(m.creado_en) DESC
     LIMIT 100`);
  return {
    umbral: UMBRAL_MODERACION,
    usuarios: rows.map((u) => ({ ...u, revisar: u.activo && u.bloqueados >= UMBRAL_MODERACION })),
  };
}

export async function cambiarEstadoUsuario(admin, id, { activo, motivo }) {
  if (id === admin.id) throw new AppError('No puedes desactivar tu propia cuenta', 422, 'ACCION_NO_PERMITIDA');
  const { rows: [u] } = await pool.query('SELECT rol, eliminada_en FROM usuarios WHERE id = $1', [id]);
  if (!u) throw new AppError('Usuario no encontrado', 404, 'USUARIO_NO_ENCONTRADO');
  if (u.eliminada_en) throw new AppError('Esta cuenta fue eliminada por su titular y no se puede reactivar', 422, 'ACCION_NO_PERMITIDA');
  if (u.rol === 'admin') throw new AppError('Las cuentas de administración no se gestionan desde aquí', 422, 'ACCION_NO_PERMITIDA');

  const { rows } = await pool.query(
    `UPDATE usuarios SET activo = $2,
            desactivado_motivo = CASE WHEN $2 THEN NULL ELSE $3 END,
            desactivado_por    = CASE WHEN $2 THEN NULL ELSE $4::uuid END,
            desactivado_en     = CASE WHEN $2 THEN NULL ELSE now() END
      WHERE id = $1
      RETURNING id, nombre, rol, activo, desactivado_motivo, desactivado_en`,
    [id, activo, motivo ?? null, admin.id]);
  return rows[0];
}
