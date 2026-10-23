import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/AppError.js';
import { calcularComision } from '../pagos/pagos.servicio.js';
import { leerBoleta } from './ocr.js';
import * as almacen from './almacen.js';

// Bajo este nivel de confianza la app pide al prestador revisar el monto con más atención
export const CONFIANZA_MINIMA = 0.6;

// Estados en los que el prestador ya tiene el trabajo y puede ver sus gastos
const ESTADOS_CON_GASTOS = ['confirmada', 'pagada', 'finalizada', 'cerrada', 'en_disputa'];
// Solo mientras hace el trabajo puede agregarlos, quitarlos o adjuntarles la boleta: una vez que lo marca
// como terminado quedan fijos (el cliente los revisa y puede apelarlos; no se pueden inflar ni esconder después)
export const ESTADOS_GASTOS_EDITABLES = ['confirmada', 'pagada'];

async function trabajoDelPrestador(usuario, solicitudId, { editar = false } = {}) {
  const { rows } = await pool.query(
    'SELECT id, estado, prestador_id, precio_acordado FROM solicitudes WHERE id = $1', [solicitudId]);
  const s = rows[0];
  if (!s || s.prestador_id !== usuario.id) throw new AppError('Trabajo no encontrado', 404, 'TRABAJO_NO_ENCONTRADO');
  if (!ESTADOS_CON_GASTOS.includes(s.estado)) {
    throw new AppError('Podrás registrar gastos cuando aceptes el trabajo', 409, 'ESTADO_INVALIDO');
  }
  if (editar && !ESTADOS_GASTOS_EDITABLES.includes(s.estado)) {
    throw new AppError('El trabajo ya está marcado como terminado: los gastos ya no se pueden modificar', 409, 'GASTOS_CERRADOS');
  }
  return s;
}

// ------------------------------------------------------------------ HU-09: leer boleta
// Guarda la foto, la lee con el OCR y devuelve el total PROPUESTO. El gasto se crea recién cuando
// el prestador confirma (o corrige) el monto.
export async function leerYGuardarBoleta(usuario, solicitudId, imagenBase64, urlApi) {
  await trabajoDelPrestador(usuario, solicitudId, { editar: true });
  const imagen = almacen.decodificarImagen(imagenBase64);
  const archivo = await almacen.guardar(imagen);
  const lectura = await leerBoleta(imagen.buffer);

  const { rows } = await pool.query(
    `INSERT INTO boletas (prestador_id, solicitud_id, archivo, ocr_monto, ocr_confianza, ocr_lector, ocr_texto)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [usuario.id, solicitudId, archivo, lectura.monto, lectura.confianza, lectura.lector, lectura.texto?.slice(0, 5000) ?? null]);

  return {
    boleta_id: rows[0].id,
    monto_propuesto: lectura.monto,
    confianza: lectura.confianza,
    revisar: lectura.monto == null || lectura.confianza < CONFIANZA_MINIMA,
    lector: lectura.lector,
    imagen_url: almacen.urlFirmada(urlApi, rows[0].id),
  };
}

// ------------------------------------------------------------------ gastos
export async function crearGasto(usuario, solicitudId, { monto, descripcion, boleta_id: boletaId }) {
  await trabajoDelPrestador(usuario, solicitudId, { editar: true });
  let origen = 'manual';
  let confianza = null;

  if (boletaId) {
    const { rows } = await pool.query(
      `SELECT b.ocr_monto, b.ocr_confianza, g.id AS gasto_existente
         FROM boletas b LEFT JOIN gastos g ON g.boleta_id = b.id
        WHERE b.id = $1 AND b.prestador_id = $2 AND b.solicitud_id = $3`,
      [boletaId, usuario.id, solicitudId]);
    if (!rows[0]) throw new AppError('Boleta no encontrada', 404, 'BOLETA_NO_ENCONTRADA');
    if (rows[0].gasto_existente) throw new AppError('Esta boleta ya está registrada', 409, 'BOLETA_USADA');
    // Si el prestador aceptó el monto leído, el origen es OCR; si lo corrigió, es manual
    origen = rows[0].ocr_monto === monto ? 'ocr' : 'manual';
    confianza = rows[0].ocr_confianza;
  }

  const { rows } = await pool.query(
    `INSERT INTO gastos (solicitud_id, prestador_id, monto, origen, confianza_ocr, descripcion, boleta_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [solicitudId, usuario.id, monto, origen, confianza, descripcion ?? null, boletaId ?? null]);
  return rows[0].id;
}

// Adjuntar la boleta a un gasto ingresado a mano: sin boleta, el gasto no está justificado ante el cliente
export async function adjuntarBoleta(usuario, gastoId, boletaId) {
  const { rows: [g] } = await pool.query(
    'SELECT id, solicitud_id, boleta_id FROM gastos WHERE id = $1 AND prestador_id = $2', [gastoId, usuario.id]);
  if (!g) throw new AppError('Gasto no encontrado', 404, 'GASTO_NO_ENCONTRADO');
  await trabajoDelPrestador(usuario, g.solicitud_id, { editar: true });
  if (g.boleta_id) throw new AppError('Este gasto ya tiene su boleta', 409, 'YA_TIENE_BOLETA');
  const { rows: [b] } = await pool.query(
    `SELECT b.id, (SELECT count(*) FROM gastos x WHERE x.boleta_id = b.id)::int AS usos
       FROM boletas b WHERE b.id = $1 AND b.prestador_id = $2 AND b.solicitud_id = $3`,
    [boletaId, usuario.id, g.solicitud_id]);
  if (!b) throw new AppError('Boleta no encontrada', 404, 'BOLETA_NO_ENCONTRADA');
  if (b.usos) throw new AppError('Esta boleta ya está registrada', 409, 'BOLETA_USADA');
  await pool.query('UPDATE gastos SET boleta_id = $2 WHERE id = $1', [gastoId, boletaId]);
  return g.solicitud_id;
}

// El cliente ve los gastos en materiales de su trabajo y cuáles tienen boleta. Los que no la tienen
// no están justificados: puede apelarlos ante el equipo (se abre un reclamo) mientras el trabajo no se cierre.
export async function materialesParaCliente(usuario, solicitudId, urlApi) {
  const { rows: [s] } = await pool.query('SELECT cliente_id, estado FROM solicitudes WHERE id = $1', [solicitudId]);
  if (!s || s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  const { rows } = await pool.query(
    `SELECT id, monto, descripcion, boleta_id, creado_en, rechazado_en IS NOT NULL AS rechazado
       FROM gastos WHERE solicitud_id = $1 ORDER BY creado_en`,
    [solicitudId]);
  const gastos = rows.map(({ boleta_id: boletaId, ...g }) => ({
    ...g, con_boleta: Boolean(boletaId), imagen_url: boletaId ? almacen.urlFirmada(urlApi, boletaId) : null,
  }));
  const validos = gastos.filter((g) => !g.rechazado);
  return {
    gastos,
    total: validos.reduce((t, g) => t + g.monto, 0),
    sin_boleta: validos.filter((g) => !g.con_boleta).length,
    puede_apelar: ['pagada', 'finalizada'].includes(s.estado),
  };
}

// Ingreso neto del prestador por un trabajo: lo que registra el ledger (si ya pagó) o la estimación
function ingresoNeto(precio, netoLedger) {
  if (netoLedger != null) return netoLedger;
  return precio ? precio - calcularComision(precio) : 0;
}

export async function resumenDelTrabajo(usuario, solicitudId, urlApi) {
  const s = await trabajoDelPrestador(usuario, solicitudId);
  const [{ rows: gastos }, { rows: ledger }] = await Promise.all([
    pool.query(
      `SELECT id, monto, origen, confianza_ocr::float AS confianza_ocr, descripcion, boleta_id, creado_en,
              rechazado_en IS NOT NULL AS rechazado, rechazo_motivo
         FROM gastos WHERE solicitud_id = $1 AND prestador_id = $2 ORDER BY creado_en`, [solicitudId, usuario.id]),
    // Suma de los pagos del trabajo (visita y saldo, o el total), sin los devueltos al cliente
    pool.query(
      `SELECT sum(monto_neto)::int AS monto_neto, sum(comision)::int AS comision, sum(monto_bruto)::int AS bruto,
              sum(monto_reembolsado)::int AS reembolsado, count(*)::int AS pagos
         FROM ledger_movimientos WHERE solicitud_id = $1 AND estado <> 'reembolsado'`, [solicitudId]),
  ]);
  const precio = s.precio_acordado ?? 0;
  const pagado = ledger[0]?.pagos ? ledger[0] : { monto_neto: 0, comision: 0, bruto: 0 };
  // Con visita pagada y el saldo aún pendiente, lo que falta se estima con la comisión de siempre
  const pendiente = s.estado === 'confirmada' ? Math.max(0, precio - pagado.bruto) : 0;
  const comisionPendiente = pendiente ? calcularComision(pendiente) : 0;
  const neto = ledger[0]?.pagos ? pagado.monto_neto + pendiente - comisionPendiente : ingresoNeto(precio, null);
  // Los gastos que el equipo rechazó en una disputa ya se devolvieron al cliente: no se descuentan otra vez
  const totalGastos = gastos.filter((g) => !g.rechazado).reduce((t, g) => t + g.monto, 0);
  const totalRechazados = gastos.filter((g) => g.rechazado).reduce((t, g) => t + g.monto, 0);
  return {
    gastos: gastos.map((g) => ({
      ...g, con_boleta: Boolean(g.boleta_id), imagen_url: g.boleta_id ? almacen.urlFirmada(urlApi, g.boleta_id) : null,
    })),
    resumen: {
      precio,
      comision: ledger[0]?.pagos ? pagado.comision + comisionPendiente : (precio ? calcularComision(precio) : 0),
      // Parte devuelta al cliente en una disputa resuelta en parte
      reembolsado: ledger[0]?.reembolsado ?? 0,
      ingreso_neto: neto,
      gastos: totalGastos,
      gastos_rechazados: totalRechazados,
      ganancia_neta: neto - totalGastos,
      ingreso_confirmado: ledger[0]?.pagos > 0 && !pendiente,   // false = aún es una estimación (falta un pago)
    },
    editable: ESTADOS_GASTOS_EDITABLES.includes(s.estado),
  };
}

export async function eliminarGasto(usuario, gastoId) {
  const { rows: [g] } = await pool.query('SELECT solicitud_id FROM gastos WHERE id = $1 AND prestador_id = $2', [gastoId, usuario.id]);
  if (!g) throw new AppError('Gasto no encontrado', 404, 'GASTO_NO_ENCONTRADO');
  await trabajoDelPrestador(usuario, g.solicitud_id, { editar: true });
  const { rows } = await pool.query(
    `DELETE FROM gastos WHERE id = $1 AND prestador_id = $2 RETURNING boleta_id`, [gastoId, usuario.id]);
  if (!rows[0]) throw new AppError('Gasto no encontrado', 404, 'GASTO_NO_ENCONTRADO');
  if (rows[0].boleta_id) {
    const { rows: b } = await pool.query('DELETE FROM boletas WHERE id = $1 RETURNING archivo', [rows[0].boleta_id]);
    if (b[0]) await almacen.eliminar(b[0].archivo);
  }
}

export async function imagenDeBoleta(boletaId) {
  const { rows } = await pool.query('SELECT archivo FROM boletas WHERE id = $1', [boletaId]);
  if (!rows[0]) throw new AppError('Boleta no encontrada', 404, 'BOLETA_NO_ENCONTRADA');
  const ext = rows[0].archivo.split('.').pop();
  return { buffer: await almacen.leer(rows[0].archivo), mime: { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] };
}

// ------------------------------------------------------------------ panel contable (HU-09)
// Resumen de un mes: por cada trabajo, ingreso neto, gastos y ganancia; y los totales.
export async function finanzasDelMes(usuario, mes) {
  const [anio, numMes] = mes.split('-').map(Number);
  const desde = new Date(Date.UTC(anio, numMes - 1, 1));
  const hasta = new Date(Date.UTC(anio, numMes, 1));
  const { rows } = await pool.query(
    `SELECT s.id, s.estado, s.descripcion_original AS descripcion, c.nombre AS categoria,
            split_part(cu.nombre, ' ', 1) AS cliente, s.precio_acordado AS precio,
            COALESCE(s.cerrado_en, s.confirmada_en, s.creado_en) AS fecha,
            lm.monto_neto, COALESCE(g.total, 0)::int AS gastos, COALESCE(g.cantidad, 0)::int AS cantidad_gastos
       FROM solicitudes s
       JOIN categorias c ON c.id = s.categoria_id
       JOIN usuarios cu ON cu.id = s.cliente_id
       LEFT JOIN (SELECT solicitud_id, sum(monto_neto)::int AS monto_neto FROM ledger_movimientos
                    WHERE estado <> 'reembolsado' GROUP BY solicitud_id) lm ON lm.solicitud_id = s.id
       LEFT JOIN (SELECT solicitud_id, sum(monto) AS total, count(*) AS cantidad
                    FROM gastos WHERE prestador_id = $1 AND rechazado_en IS NULL GROUP BY solicitud_id) g ON g.solicitud_id = s.id
      WHERE s.prestador_id = $1
        AND (s.estado IN ('pagada', 'finalizada', 'cerrada', 'en_disputa') OR (s.estado = 'cancelada' AND lm.monto_neto > 0))
        AND COALESCE(s.cerrado_en, s.confirmada_en, s.creado_en) >= $2
        AND COALESCE(s.cerrado_en, s.confirmada_en, s.creado_en) < $3
      ORDER BY fecha DESC`,
    [usuario.id, desde, hasta]);

  const trabajos = rows.map((t) => {
    const neto = ingresoNeto(t.precio, t.monto_neto);
    return { ...t, ingreso_neto: neto, ganancia_neta: neto - t.gastos };
  });
  const suma = (k) => trabajos.reduce((t, x) => t + x[k], 0);
  return {
    mes,
    totales: {
      trabajos: trabajos.length,
      ingreso_neto: suma('ingreso_neto'),
      gastos: suma('gastos'),
      ganancia_neta: suma('ganancia_neta'),
      por_cobrar: trabajos.filter((t) => t.estado !== 'cerrada').reduce((x, t) => x + t.ingreso_neto, 0),
    },
    trabajos,
  };
}

// ------------------------------------------------------------------ "Mi dinero" del maestro
// Cuánto tiene retenido (trabajos pagados que aún no se cierran), cuánto está liberado esperando la
// transferencia y cuánto ya recibió, con el detalle de cada transferencia.
export async function dineroDelPrestador(usuario) {
  const [{ rows: [d] }, { rows: transferencias }] = await Promise.all([
    pool.query(
      `SELECT COALESCE(sum(monto_neto) FILTER (WHERE estado = 'retenido'), 0)::int AS retenido,
              COALESCE(sum(monto_neto) FILTER (WHERE estado = 'liberado'), 0)::int AS por_transferir,
              COALESCE(sum(monto_neto) FILTER (WHERE estado = 'transferido'), 0)::int AS transferido
         FROM ledger_movimientos WHERE prestador_id = $1`, [usuario.id]),
    pool.query(
      `SELECT comprobante, sum(monto_neto)::int AS monto, count(*)::int AS trabajos, max(transferido_en) AS fecha
         FROM ledger_movimientos WHERE prestador_id = $1 AND estado = 'transferido'
        GROUP BY comprobante ORDER BY max(transferido_en) DESC LIMIT 20`, [usuario.id]),
  ]);
  return { ...d, transferencias };
}
