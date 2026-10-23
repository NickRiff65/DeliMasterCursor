// Avisos dentro de la app: lo importante de cada solicitud llega a la otra parte (el maestro aceptó, te
// pagaron, el pago quedó liberado, te transferimos…) con un contador de no leídos. Se guardan en la misma
// transacción que el cambio (si el cambio no se guarda, no hay aviso) y, al confirmarse, se envían en
// tiempo real a quien tenga la app abierta. Nunca incluyen teléfonos, correos ni direcciones.
import { pool, alConfirmar } from '../../db/pool.js';
import { emitirNotificacion } from '../../socket.js';
import { enviarPush } from '../../utils/push.js';

const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;
const fecha = (f) => new Date(f).toLocaleString('es-CL', {
  timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const resumen = (s) => (s.descripcion.length > 50 ? `${s.descripcion.slice(0, 47).trimEnd()}…` : s.descripcion);

export async function crearNotificacion(db, usuarioId, { titulo, texto, solicitudId = null, tipo = 'solicitud' }) {
  const { rows: [n] } = await db.query(
    `INSERT INTO notificaciones (usuario_id, titulo, texto, solicitud_id, tipo) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, titulo, texto, solicitud_id, tipo, leida_en, creado_en`,
    [usuarioId, titulo, texto, solicitudId, tipo]);
  alConfirmar(db, () => {
    emitirNotificacion(usuarioId, n);
    enviarPush(usuarioId, { titulo, texto, solicitudId }).catch((err) => {
      console.error(JSON.stringify({ evento: 'push', error: err.message }));
    });
  });
  return n;
}

// Qué avisar en cada cambio de estado y a quién. s = datos de la solicitud (vistos dentro de la transacción)
function avisosDe(nuevo, anterior, s) {
  const maestro = s.prestador?.split(' ')[0];
  const reembolso = s.monto_reembolsado ? ` (se devolvieron ${pesos(s.monto_reembolsado)} al cliente)` : '';
  switch (nuevo) {
    case 'asignada':
      return [{ para: 'prestador', titulo: 'Tienes una nueva solicitud', texto: `${s.cliente} te eligió: "${resumen(s)}" en ${s.comuna}. Respóndela pronto.` }];
    case 'visita_por_pagar':
      return [{ para: 'cliente', titulo: `${maestro} aceptó tu solicitud`, texto: `Propone la visita de diagnóstico el ${fecha(s.visita_programada_en)}. Págala para confirmarla.` }];
    case 'confirmada':
      return anterior === 'cotizada'
        ? [{ para: 'prestador', titulo: 'Aceptaron tu cotización', texto: `${s.cliente} aceptó tu cotización de ${pesos(s.precio_acordado)}. Falta que pague el saldo.` }]
        : [{ para: 'cliente', titulo: `${maestro} aceptó tu solicitud`, texto: `Cobra ${pesos(s.precio_acordado)}. Paga para que comience: el dinero queda retenido hasta el cierre.` }];
    case 'visita_pagada':
      return [{ para: 'prestador', titulo: 'Te pagaron la visita', texto: `${s.cliente} pagó la visita del ${fecha(s.visita_programada_en)}. Cuando llegues, pídele el código de llegada.`, tipo: 'pago' }];
    case 'cotizada':
      return [{ para: 'cliente', titulo: anterior === 'cotizada' ? `${maestro} corrigió la cotización` : `Recibiste la cotización de ${maestro}`, texto: `"${resumen(s)}". Revísala para aceptarla o rechazarla.` }];
    case 'pagada':
      return [{ para: 'prestador', titulo: 'Te pagaron el trabajo', texto: `${s.cliente} pagó "${resumen(s)}". El dinero queda retenido por DeliMaster hasta el cierre.`, tipo: 'pago' }];
    case 'finalizada':
      return [{ para: 'cliente', titulo: `${maestro} terminó el trabajo`, texto: 'Confírmalo y califícalo. Si algo quedó mal, repórtalo antes de confirmar.' }];
    case 'cerrada':
      return [
        { para: 'prestador', titulo: '💰 Tu pago quedó liberado', texto: `Se liberaron ${pesos(s.neto_liberado)} por "${resumen(s)}"${reembolso}. Te los transferimos dentro de 48 horas hábiles.`, tipo: 'pago' },
        anterior === 'en_disputa'
          ? { para: 'cliente', titulo: 'Resolvimos tu reclamo', texto: s.monto_reembolsado ? `Te devolvimos ${pesos(s.monto_reembolsado)} a la tarjeta con que pagaste. El trabajo quedó cerrado.` : 'El equipo revisó el caso y el pago se liberó al maestro. El trabajo quedó cerrado.' }
          : { para: 'cliente', titulo: 'Trabajo cerrado', texto: `"${resumen(s)}" quedó cerrado y el pago se liberó a ${maestro}.` },
      ];
    case 'creada':
      return anterior === 'asignada'
        ? [{ para: 'cliente', titulo: 'Elige otro maestro', texto: `${s.detalle ?? 'El maestro no pudo tomar tu solicitud'}. Tu solicitud vuelve a estar disponible.` }]
        : [];
    case 'en_disputa':
      return [{ para: 'prestador', titulo: 'El cliente reportó un problema', texto: `${s.cliente} reportó un problema con "${resumen(s)}". El pago sigue retenido mientras el equipo revisa.` }];
    case 'cancelada':
      return anterior === 'en_disputa'
        ? [
          { para: 'cliente', titulo: 'Resolvimos tu reclamo', texto: 'El equipo te devolvió el pago a la tarjeta con que pagaste.' },
          { para: 'prestador', titulo: 'Reclamo resuelto a favor del cliente', texto: `El pago de "${resumen(s)}" se devolvió al cliente.` },
        ]
        : [
          { para: 'cliente', titulo: 'Solicitud cancelada', texto: `"${resumen(s)}"${s.detalle ? `: ${s.detalle}` : ''}.` },
          { para: 'prestador', titulo: 'Solicitud cancelada', texto: `"${resumen(s)}"${s.detalle ? `: ${s.detalle}` : ''}.` },
        ];
    default:
      return [];
  }
}

// Avisa a cada parte lo que corresponde al cambio de estado. Nunca a quien hizo el cambio.
export async function notificarCambio(db, solicitudId, nuevo, anterior, actorId = null) {
  const { rows: [s] } = await db.query(
    `SELECT s.id, s.descripcion_original AS descripcion, s.comuna, s.precio_acordado, s.visita_programada_en,
            s.cliente_id, s.prestador_id, split_part(cu.nombre, ' ', 1) AS cliente, pu.nombre AS prestador,
            (SELECT detalle FROM solicitud_eventos e WHERE e.solicitud_id = s.id ORDER BY e.id DESC LIMIT 1) AS detalle,
            (SELECT COALESCE(sum(monto_neto), 0)::int FROM ledger_movimientos m
              WHERE m.solicitud_id = s.id AND m.estado IN ('liberado', 'transferido')) AS neto_liberado,
            (SELECT COALESCE(sum(monto_reembolsado), 0)::int FROM ledger_movimientos m WHERE m.solicitud_id = s.id) AS monto_reembolsado
       FROM solicitudes s
       JOIN usuarios cu ON cu.id = s.cliente_id
       LEFT JOIN usuarios pu ON pu.id = s.prestador_id
      WHERE s.id = $1`, [solicitudId]);
  if (!s) return;
  for (const aviso of avisosDe(nuevo, anterior, s)) {
    const usuarioId = aviso.para === 'cliente' ? s.cliente_id : s.prestador_id;
    if (!usuarioId || usuarioId === actorId) continue;
    await crearNotificacion(db, usuarioId, { titulo: aviso.titulo, texto: aviso.texto, solicitudId, tipo: aviso.tipo });
  }
}

// ------------------------------------------------------------------ lectura
export async function listar(usuario) {
  const [{ rows }, { rows: [c] }] = await Promise.all([
    pool.query(
      `SELECT id, titulo, texto, solicitud_id, tipo, leida_en, creado_en FROM notificaciones
        WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC LIMIT 50`, [usuario.id]),
    pool.query('SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL', [usuario.id]),
  ]);
  return { notificaciones: rows, no_leidas: c.n };
}

export async function marcarLeidas(usuario) {
  await pool.query('UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL', [usuario.id]);
  return listar(usuario);
}
