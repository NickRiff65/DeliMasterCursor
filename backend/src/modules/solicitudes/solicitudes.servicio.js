import { createHash } from 'node:crypto';
import { pool, enTransaccion, alConfirmar } from '../../db/pool.js';
import { config } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { distanciaMetros, RADIO_LLEGADA_M } from '../../utils/geo.js';
import { interpretar } from './interprete.js';
import { sqlVigente } from '../verificaciones/verificaciones.servicio.js';
import { reembolsarPago } from '../pagos/pasarela.js';
import { calcularComision } from '../pagos/pagos.servicio.js';
import { expulsarDeSala } from '../../socket.js';
import { rangoVisita, REGLAS_VISITA } from './visita.js';
import { avisar } from '../../utils/avisos.js';
import { notificarCambio, crearNotificacion } from '../notificaciones/notificaciones.servicio.js';

// ------------------------------------------------------------------ máquina de estados
// Transiciones permitidas. Dos modalidades de cobro, que el prestador elige al aceptar:
//  · precio cerrado:     asignada → confirmada → pagada (el cliente paga el total)
//  · visita + cotización: asignada → visita_por_pagar → visita_pagada → en_diagnostico → cotizada
//                         → confirmada (paga el saldo) → pagada
// Desde "pagada" ambas siguen igual: finalizada → cerrada, o en_disputa.
const TRANSICIONES = {
  creada: ['asignada', 'cancelada'],
  asignada: ['confirmada', 'visita_por_pagar', 'creada', 'cancelada'], // volver a "creada" = rechazo o plazo vencido
  visita_por_pagar: ['visita_pagada', 'cancelada'],
  visita_pagada: ['en_diagnostico', 'cancelada'],
  en_diagnostico: ['cotizada', 'cancelada'],
  cotizada: ['confirmada', 'pagada', 'cancelada'],   // "pagada" directo si la visita cubre el total
  confirmada: ['pagada', 'cancelada'],
  pagada: ['finalizada', 'en_disputa'],
  finalizada: ['cerrada', 'en_disputa'],
  cerrada: [],
  cancelada: [],
  en_disputa: ['cerrada', 'cancelada'],
};

export function puedeTransitar(desde, hacia) {
  return TRANSICIONES[desde]?.includes(hacia) ?? false;
}

async function registrarEvento(db, solicitudId, anterior, nuevo, actorId, detalle = null) {
  await db.query(
    `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, actor_id, detalle)
     VALUES ($1, $2, $3, $4, $5)`,
    [solicitudId, anterior, nuevo, actorId, detalle]);
  // Aviso dentro de la app a la otra parte (en la misma transacción) y por correo, si el cambio se guarda
  await notificarCambio(db, solicitudId, nuevo, anterior, actorId);
  alConfirmar(db, () => avisar(solicitudId, nuevo, anterior));
}

// HU-05: si el prestador no responde a tiempo, la solicitud vuelve a estar disponible
// para que el cliente elija a otro. Se ejecuta antes de leer o modificar solicitudes.
export async function liberarVencidas(db = pool) {
  const { rows } = await db.query(
    `UPDATE solicitudes SET estado = 'creada', prestador_id = NULL, asignada_en = NULL
      WHERE estado = 'asignada' AND asignada_en < now() - make_interval(mins => $1)
      RETURNING id`,
    [config.plazoRespuestaMin]);
  for (const { id } of rows) {
    await registrarEvento(db, id, 'asignada', 'creada', null, 'El maestro no respondió dentro del plazo');
    expulsarDeSala(id);   // el prestador anterior deja de recibir el chat
  }

  // Cierre automático: si el prestador terminó y el cliente no confirma ni reporta un problema
  // dentro del plazo, el trabajo se cierra y el pago se libera (el dinero no queda retenido para siempre).
  const vencidas = await db.query(
    `SELECT id FROM solicitudes
      WHERE estado = 'finalizada' AND finalizada_en < now() - make_interval(hours => $1)`,
    [config.plazoCierreHoras]);
  for (const { id } of vencidas.rows) {
    await enTransaccion(async (tx) => {
      const s = await bloquear(tx, id);
      if (s.estado === 'finalizada') {
        await aplicarCierre(tx, s, null, `Cierre automático: el cliente no respondió en ${config.plazoCierreHoras} h`);
      }
    });
  }
  // Visitas pagadas a las que el prestador nunca llegó: se devuelven solas al cliente
  const sinLlegada = await db.query(
    `SELECT id FROM solicitudes
      WHERE estado = 'visita_pagada' AND visita_programada_en < now() - make_interval(hours => $1)`,
    [REGLAS_VISITA.reembolsoAutomaticoHoras]);
  for (const { id } of sinLlegada.rows) {
    // Si Transbank no responde, se reintenta en la próxima revisión
    await enTransaccion(async (tx) => {
      const s = await bloquear(tx, id);
      if (s.estado === 'visita_pagada') {
        await devolverVisita(tx, s, null,
          `Devolución automática: el maestro no llegó en ${REGLAS_VISITA.reembolsoAutomaticoHoras} h`);
      }
    }).catch(() => {});
  }
  return rows.length + vencidas.rows.length + sinLlegada.rows.length;
}

// ------------------------------------------------------------------ lectura
// (el plazo es un número de la configuración, no un dato del usuario: es seguro interpolarlo)
const sqlSolicitud = (where, extra = '') => `
  SELECT s.id, s.grupo_id, s.estado, s.descripcion_original AS descripcion, s.comuna,
         s.precio_acordado, s.creado_en, s.creado_en_dispositivo, s.asignada_en, s.confirmada_en,
         s.direccion, s.referencia, s.latitud::float AS latitud, s.longitud::float AS longitud,
         s.direccion_compartida_en,
         CASE WHEN s.estado = 'asignada'
              THEN s.asignada_en + make_interval(mins => ${Number(config.plazoRespuestaMin)}) END AS responder_antes_de,
         s.finalizada_en, s.cerrado_en, s.motivo_disputa,
         CASE WHEN s.estado = 'finalizada'
              THEN s.finalizada_en + make_interval(hours => ${Number(config.plazoCierreHoras)}) END AS cierre_automatico_en,
         -- Modalidad "visita + cotización"
         s.modalidad, s.tarifa_visita, s.visita_programada_en, s.llegada_en, s.codigo_llegada,
         s.llegada_latitud::float AS llegada_latitud, s.llegada_longitud::float AS llegada_longitud, s.llegada_distancia_m,
         CASE WHEN s.estado = 'visita_pagada'
              THEN s.visita_programada_en + make_interval(mins => ${Number(REGLAS_VISITA.toleranciaMin)}) END AS reclamo_no_llego_desde,
         -- Lo que el cliente paga al confirmar: el total, o el saldo (total − visita) si ya pagó la visita
         CASE WHEN s.precio_acordado IS NULL THEN NULL
              WHEN s.modalidad = 'visita' THEN s.precio_acordado - s.tarifa_visita
              ELSE s.precio_acordado END AS monto_por_pagar,
         (SELECT json_build_object('id', q.id, 'mano_obra', q.mano_obra, 'materiales', q.materiales, 'total', q.total,
                                   'detalle', q.detalle, 'estado', q.estado, 'creado_en', q.creado_en,
                                   'respondida_en', q.respondida_en,
                                   'total_anterior', (SELECT x.total FROM cotizaciones x
                                                       WHERE x.solicitud_id = s.id AND x.estado = 'reemplazada'
                                                       ORDER BY x.creado_en DESC LIMIT 1))
            FROM cotizaciones q WHERE q.solicitud_id = s.id AND q.estado <> 'reemplazada'
           ORDER BY q.creado_en DESC LIMIT 1) AS cotizacion,
         -- Estado del dinero en el ledger de garantía (retenido / liberado / transferido / reembolsado):
         -- el del pago principal (total o saldo) y, aparte, el de la visita
         lm.estado AS estado_pago, lm.comision, lm.monto_neto, lm.transferido_en, lm.estado_visita,
         NULLIF(lm.monto_reembolsado, 0) AS monto_reembolsado,
         CASE WHEN r.id IS NULL THEN NULL
              ELSE json_build_object('estrellas', r.estrellas, 'comentario', r.comentario, 'creado_en', r.creado_en) END AS resena,
         CASE WHEN rp.id IS NULL THEN NULL
              ELSE json_build_object('estrellas', rp.estrellas, 'comentario', rp.comentario, 'creado_en', rp.creado_en) END AS resena_prestador,
         c.slug AS categoria, c.nombre AS categoria_nombre,
         -- Solo nombre y reputación: el teléfono, el correo y (hasta concretar) la dirección
         -- nunca se comparten entre las partes. La reputación del cliente la construyen los
         -- maestros que ya trabajaron con él (calificación bilateral).
         json_build_object('id', cu.id, 'nombre', split_part(cu.nombre, ' ', 1),
                           'calificacion_promedio', cu.calificacion_promedio::float,
                           'total_resenas', cu.total_resenas) AS cliente,
         CASE WHEN pu.id IS NULL THEN NULL
              ELSE json_build_object('id', pu.id, 'nombre', pu.nombre) END AS prestador
    FROM solicitudes s
    JOIN categorias c  ON c.id = s.categoria_id
    JOIN usuarios cu   ON cu.id = s.cliente_id
    LEFT JOIN usuarios pu ON pu.id = s.prestador_id
    LEFT JOIN LATERAL (
      SELECT (array_agg(m.estado ORDER BY m.concepto = 'visita'))[1] AS estado,
             (sum(m.comision) FILTER (WHERE m.estado <> 'reembolsado'))::int AS comision,
             (sum(m.monto_neto) FILTER (WHERE m.estado <> 'reembolsado'))::int AS monto_neto,
             max(m.transferido_en) AS transferido_en,
             max(m.estado::text) FILTER (WHERE m.concepto = 'visita') AS estado_visita,
             (sum(m.monto_reembolsado) FILTER (WHERE m.estado <> 'reembolsado'))::int AS monto_reembolsado
        FROM ledger_movimientos m WHERE m.solicitud_id = s.id) lm ON true
    LEFT JOIN resenas r ON r.solicitud_id = s.id
    LEFT JOIN resenas_prestador rp ON rp.solicitud_id = s.id
  ${where} ${extra}`;

// Lo que ve cada parte: el código de llegada solo lo ve el cliente (lo dicta cuando llega el prestador),
// y el prestador recibe el rango permitido para la tarifa de visita mientras decide si acepta.
// Estados en que el maestro ya ve la dirección exacta: hay un pago asegurado (la visita o el trabajo).
// Al primer contacto solo ve la comuna: la dirección es un dato sensible del cliente y además
// compartirla demasiado pronto facilita acordar el trabajo por fuera de la plataforma.
// El cliente también puede compartirla voluntariamente apenas la visita quedó concretada
// (compartirDireccion), lo que queda registrado en direccion_compartida_en.
const ESTADOS_CON_DIRECCION = ['visita_pagada', 'en_diagnostico', 'cotizada', 'pagada', 'finalizada', 'en_disputa'];
export const direccionVisible = (s) =>
  Boolean(s.direccion_compartida_en) || ESTADOS_CON_DIRECCION.includes(s.estado)
  || (s.estado === 'confirmada' && s.modalidad === 'visita');

// Estados desde los que el cliente puede compartir su dirección: el maestro ya aceptó y la
// visita (o el trabajo) quedó acordada. Antes de eso no hay motivo para revelarla.
const ESTADOS_PARA_COMPARTIR = ['confirmada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada', 'pagada'];

function vistaPara(usuario, s) {
  const { codigo_llegada: codigo, ...resto } = s;
  const vista = { ...resto };
  if (usuario.rol === 'prestador') {
    vista.direccion_visible = direccionVisible(s);
    // Antes de eso, solo la comuna (evita que se acuerde el trabajo por fuera de la plataforma)
    if (!vista.direccion_visible) Object.assign(vista, { direccion: null, referencia: null, latitud: null, longitud: null });
  }
  if (usuario.rol === 'cliente' && usuario.id === s.cliente?.id) {
    // El cliente sabe en todo momento si el maestro ya puede ver su dirección y si puede compartirla
    vista.direccion_visible_para_prestador = direccionVisible(s);
    vista.puede_compartir_direccion = ESTADOS_PARA_COMPARTIR.includes(s.estado) && !direccionVisible(s);
  }
  if ((usuario.id === s.cliente?.id || usuario.rol === 'admin') && s.estado === 'visita_pagada') vista.codigo_llegada = codigo;
  if (usuario.rol === 'prestador' && s.estado === 'asignada') vista.rango_visita = rangoVisita(s.comuna);
  return vista;
}

export async function listar(usuario, { estado }) {
  await liberarVencidas();
  const columna = usuario.rol === 'prestador' ? 's.prestador_id' : 's.cliente_id';
  const { rows } = await pool.query(
    sqlSolicitud(`WHERE ${columna} = $1 AND ($2::estado_solicitud IS NULL OR s.estado = $2)`, 'ORDER BY s.creado_en DESC LIMIT 100'),
    [usuario.id, estado ?? null]);
  return rows.map((s) => vistaPara(usuario, s));
}

export async function obtener(usuario, id) {
  await liberarVencidas();
  const { rows } = await pool.query(sqlSolicitud('WHERE s.id = $1'), [id]);
  const s = rows[0];
  // Solo las partes (o un administrador) pueden ver una solicitud
  const participa = s && (s.cliente.id === usuario.id || s.prestador?.id === usuario.id || usuario.rol === 'admin');
  if (!participa) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');

  const eventos = await pool.query(
    `SELECT estado_anterior, estado_nuevo, detalle, creado_en FROM solicitud_eventos
      WHERE solicitud_id = $1 ORDER BY creado_en, id`, [id]);
  return { ...vistaPara(usuario, s), eventos: eventos.rows };
}

// ------------------------------------------------------------------ HU-08: interpretar y crear
async function categoriasParaInterpretar() {
  const { rows } = await pool.query('SELECT id, slug, nombre, palabras_clave, activa FROM categorias');
  return rows;
}

export async function interpretarTexto(descripcion) {
  return interpretar(descripcion, await categoriasParaInterpretar());
}

// Id determinista para cada servicio adicional detectado en un mismo mensaje: así el reenvío
// de una solicitud creada sin conexión produce exactamente los mismos ids (idempotencia).
function idDerivado(idBase, slug) {
  const h = createHash('sha1').update(`${idBase}:${slug}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function crear(usuario, datos) {
  // Reenvío de una solicitud ya recibida (cola sin conexión): se devuelve lo existente
  const existente = await pool.query('SELECT cliente_id, grupo_id FROM solicitudes WHERE id = $1', [datos.id]);
  if (existente.rowCount) {
    if (existente.rows[0].cliente_id !== usuario.id) {
      throw new AppError('Identificador de solicitud ya usado', 409, 'ID_EN_USO');
    }
    const grupo = await pool.query(sqlSolicitud('WHERE s.grupo_id = $1', 'ORDER BY s.creado_en'), [existente.rows[0].grupo_id]);
    return { creada: false, grupo_id: existente.rows[0].grupo_id, solicitudes: grupo.rows };
  }

  const todas = await categoriasParaInterpretar();
  const interpretacion = interpretar(datos.descripcion, todas);
  let elegidas;
  if (datos.categorias) {
    elegidas = todas.filter((c) => datos.categorias.includes(c.slug) && c.activa);
    if (elegidas.length !== datos.categorias.length) {
      const err = new AppError('Hay categorías que no existen o aún no están habilitadas', 422, 'DATOS_INVALIDOS');
      err.campos = { categorias: 'Elige solo servicios disponibles' };
      throw err;
    }
  } else {
    elegidas = todas.filter((c) => interpretacion.categorias.some((d) => d.slug === c.slug));
  }

  if (!elegidas.length) {
    const err = new AppError(
      interpretacion.no_disponibles.length
        ? `Aún no ofrecemos ${interpretacion.no_disponibles.map((c) => c.nombre.toLowerCase()).join(' ni ')} en DeliMaster`
        : 'No logramos identificar el servicio. Elige la categoría.',
      422, 'SIN_CATEGORIA');
    err.campos = { categorias: 'Indica qué servicio necesitas' };
    throw err;
  }

  // Si el texto menciona una comuna donde aún no operamos (y no eligió otra), no se asume la de su perfil
  if (!datos.comuna && !interpretacion.comuna && interpretacion.fuera_de_cobertura) {
    const err = new AppError(`Por ahora DeliMaster atiende solo en Chillán y Coihueco (mencionaste ${interpretacion.fuera_de_cobertura})`,
      422, 'FUERA_DE_COBERTURA');
    err.campos = { comuna: 'Elige Chillán o Coihueco' };
    throw err;
  }
  const comuna = datos.comuna ?? interpretacion.comuna ?? usuario.comuna ?? null;
  if (!comuna) {
    const err = new AppError('Indica en qué comuna necesitas el servicio', 422, 'DATOS_INVALIDOS');
    err.campos = { comuna: 'Indica la comuna' };
    throw err;
  }

  const grupoId = datos.id;
  await enTransaccion(async (db) => {
    for (const [i, cat] of elegidas.entries()) {
      const id = i === 0 ? datos.id : idDerivado(datos.id, cat.slug);
      await db.query(
        `INSERT INTO solicitudes (id, grupo_id, cliente_id, categoria_id, descripcion_original, comuna,
                                  direccion, referencia, latitud, longitud, creado_en_dispositivo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, grupoId, usuario.id, cat.id, datos.descripcion, comuna, datos.direccion, datos.referencia || null,
          datos.latitud ?? null, datos.longitud ?? null, datos.creado_en_dispositivo ?? null]);
      await registrarEvento(db, id, null, 'creada', usuario.id);
    }
  });

  const { rows } = await pool.query(sqlSolicitud('WHERE s.grupo_id = $1', 'ORDER BY s.creado_en'), [grupoId]);
  return { creada: true, grupo_id: grupoId, solicitudes: rows, no_disponibles: interpretacion.no_disponibles };
}

// ------------------------------------------------------------------ transiciones
// Bloquea la fila (FOR UPDATE) para que dos acciones simultáneas no se pisen.
async function bloquear(db, id) {
  const { rows } = await db.query('SELECT * FROM solicitudes WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return rows[0];
}

function exigirTransicion(s, hacia, mensaje) {
  if (!puedeTransitar(s.estado, hacia)) {
    throw new AppError(mensaje ?? `No se puede pasar de "${s.estado}" a "${hacia}"`, 409, 'ESTADO_INVALIDO');
  }
}

// El cliente elige un prestador del catálogo para su solicitud
export async function asignar(usuario, id, { prestador_id }) {
  await liberarVencidas();
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    exigirTransicion(s, 'asignada', 'Esta solicitud ya tiene un prestador asignado o no está activa');

    // El prestador debe estar activo, disponible y habilitado para esa categoría
    // (si la categoría es regulada, con verificación aprobada y vigente).
    const { rowCount } = await db.query(
      `SELECT 1
         FROM prestadores p
         JOIN usuarios u ON u.id = p.usuario_id
         JOIN prestador_categorias pc ON pc.prestador_id = p.usuario_id AND pc.categoria_id = $2
         JOIN categorias c ON c.id = pc.categoria_id
        WHERE p.usuario_id = $1 AND u.activo AND p.disponible AND c.activa
          AND (NOT c.requiere_verificacion OR EXISTS (
                SELECT 1 FROM verificaciones v
                 WHERE v.prestador_id = p.usuario_id AND v.categoria_id = c.id AND ${sqlVigente('v')}))`,
      [prestador_id, s.categoria_id]);
    if (!rowCount) {
      throw new AppError('Este maestro no está disponible para este servicio', 422, 'PRESTADOR_NO_HABILITADO');
    }

    await db.query(
      `UPDATE solicitudes SET estado = 'asignada', prestador_id = $2, asignada_en = now() WHERE id = $1`,
      [id, prestador_id]);
    await registrarEvento(db, id, s.estado, 'asignada', usuario.id);
  });
  return obtener(usuario, id);
}

const fechaHora = (d) => new Date(d).toLocaleString('es-CL', {
  timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;

function errorDeCampo(mensaje, campo, codigo = 'DATOS_INVALIDOS') {
  const err = new AppError(mensaje, 422, codigo);
  err.campos = { [campo]: mensaje };
  return err;
}

// HU-05: el prestador acepta o rechaza la asignación dentro del plazo. Al aceptar elige la modalidad:
//  · precio_cerrado: indica el precio del trabajo (el cliente paga el total).
//  · visita: indica la tarifa de visita (dentro del rango de la comuna) y cuándo irá a diagnosticar.
export async function responder(usuario, id, { aceptar, modalidad = 'precio_cerrado', precio, tarifa_visita, visita_programada_en }) {
  await liberarVencidas();
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.prestador_id !== usuario.id) {
      // También cubre el caso en que el plazo venció y la solicitud se liberó
      throw new AppError('Esta solicitud ya no está asignada a ti', 409, 'NO_ASIGNADA');
    }
    if (s.estado !== 'asignada') throw new AppError('Ya respondiste esta solicitud', 409, 'ESTADO_INVALIDO');

    if (aceptar && modalidad === 'visita') {
      const rango = rangoVisita(s.comuna);
      if (tarifa_visita < rango.min || tarifa_visita > rango.max) {
        throw errorDeCampo(`En ${s.comuna} la visita debe estar entre ${pesos(rango.min)} y ${pesos(rango.max)}`, 'tarifa_visita');
      }
      const cuando = new Date(visita_programada_en);
      const minutos = (cuando.getTime() - Date.now()) / 60_000;
      if (minutos < 15) throw errorDeCampo('La visita debe ser al menos 15 minutos después de ahora', 'visita_programada_en');
      if (minutos > REGLAS_VISITA.maxDiasProgramacion * 24 * 60) {
        throw errorDeCampo(`La visita se puede agendar con hasta ${REGLAS_VISITA.maxDiasProgramacion} días de anticipación`, 'visita_programada_en');
      }
      // Dentro de los días y horas de atención que el maestro eligió (en hora de Chile)
      const { rows: [enHorario] } = await db.query(
        `SELECT EXTRACT(ISODOW FROM l.t)::smallint = ANY (p.dias_atencion)
                AND l.t::time >= p.hora_inicio AND l.t::time < p.hora_fin AS ok
           FROM prestadores p, (SELECT $2::timestamptz AT TIME ZONE 'America/Santiago' AS t) l
          WHERE p.usuario_id = $1`, [usuario.id, cuando]);
      if (!enHorario?.ok) {
        throw errorDeCampo('La visita debe quedar dentro de tu horario de atención (puedes cambiarlo en tu ficha)', 'visita_programada_en');
      }
      await db.query(
        `UPDATE solicitudes SET estado = 'visita_por_pagar', modalidad = 'visita', tarifa_visita = $2,
                                visita_programada_en = $3, confirmada_en = now()
          WHERE id = $1`, [id, tarifa_visita, cuando]);
      await registrarEvento(db, id, 'asignada', 'visita_por_pagar', usuario.id,
        `Visita de diagnóstico: ${pesos(tarifa_visita)} · ${fechaHora(cuando)}`);
    } else if (aceptar) {
      await db.query(
        `UPDATE solicitudes SET estado = 'confirmada', precio_acordado = $2, confirmada_en = now() WHERE id = $1`,
        [id, precio]);
      await registrarEvento(db, id, 'asignada', 'confirmada', usuario.id, `Precio: ${pesos(precio)}`);
    } else {
      await db.query(
        `UPDATE solicitudes SET estado = 'creada', prestador_id = NULL, asignada_en = NULL WHERE id = $1`, [id]);
      await registrarEvento(db, id, 'asignada', 'creada', usuario.id, 'El maestro rechazó el trabajo');
    }
  });
  if (!aceptar) expulsarDeSala(id);   // quien rechazó deja de recibir el chat en tiempo real
  return aceptar ? obtener(usuario, id) : { id, estado: 'creada' };
}

// El cliente cancela antes de pagar el trabajo (después del pago se usa el flujo de disputa).
// Con la visita pagada: si cancela con anticipación se le devuelve; si no, la recibe el prestador.
export async function cancelar(usuario, id, { motivo }) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    const cancelables = ['creada', 'asignada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'cotizada', 'confirmada'];
    if (!cancelables.includes(s.estado)) {
      throw new AppError('Esta solicitud ya no se puede cancelar', 409, 'ESTADO_INVALIDO');
    }
    if (s.estado === 'visita_pagada') {
      const horasAntes = (new Date(s.visita_programada_en).getTime() - Date.now()) / 3_600_000;
      if (horasAntes >= REGLAS_VISITA.cancelacionSinCostoHoras) {
        await devolverVisita(db, s, usuario.id, `Cancelada con anticipación: se devuelve la visita${motivo ? ` · ${motivo}` : ''}`);
        return;
      }
      await liberarVisita(db, s.id, usuario.id);
      await db.query(`UPDATE solicitudes SET estado = 'cancelada' WHERE id = $1`, [id]);
      await registrarEvento(db, id, s.estado, 'cancelada', usuario.id,
        `Cancelada con menos de ${REGLAS_VISITA.cancelacionSinCostoHoras} h: la visita queda para el maestro${motivo ? ` · ${motivo}` : ''}`);
      return;
    }
    if (s.estado === 'cotizada') {
      await db.query(
        "UPDATE cotizaciones SET estado = 'rechazada', respondida_en = now() WHERE solicitud_id = $1 AND estado = 'pendiente'", [id]);
    }
    await db.query(`UPDATE solicitudes SET estado = 'cancelada' WHERE id = $1`, [id]);
    await registrarEvento(db, id, s.estado, 'cancelada', usuario.id, motivo ?? null);
  });
  expulsarDeSala(id);
  return obtener(usuario, id);
}

// ------------------------------------------------------------------ modalidad "visita + cotización"
// Cambia el estado de un movimiento del ledger y deja la auditoría
async function moverLedger(db, movimiento, de, a, actorId) {
  await db.query(
    `UPDATE ledger_movimientos SET estado = $2::estado_ledger,
            liberado_en = CASE WHEN $2::estado_ledger = 'liberado' THEN now() ELSE liberado_en END
      WHERE id = $1`, [movimiento.id, a]);
  await db.query(
    `INSERT INTO ledger_eventos (movimiento_id, estado_anterior, estado_nuevo, monto, actor_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [movimiento.id, de, a, a === 'reembolsado' ? movimiento.monto_bruto : movimiento.monto_neto, actorId]);
}

// La visita pasa al prestador: llegó (código válido) o el cliente canceló sobre la hora
async function liberarVisita(db, solicitudId, actorId) {
  const { rows: [mov] } = await db.query(
    `SELECT id, monto_neto, monto_bruto FROM ledger_movimientos
      WHERE solicitud_id = $1 AND concepto = 'visita' AND estado = 'retenido' FOR UPDATE`, [solicitudId]);
  if (mov) await moverLedger(db, mov, 'retenido', 'liberado', actorId);
}

// Devuelve la visita al cliente por Webpay (el prestador no llegó o el cliente canceló a tiempo)
// y cancela la solicitud. Primero Transbank: si el reembolso falla, la transacción se revierte.
async function devolverVisita(db, s, actorId, detalle) {
  const { rows: [mov] } = await db.query(
    `SELECT lm.id, lm.monto_bruto, lm.monto_neto, p.id AS pago_id, p.token_webpay, p.medio, p.orden_compra, p.orden_hija
       FROM ledger_movimientos lm JOIN pagos p ON p.id = lm.pago_id
      WHERE lm.solicitud_id = $1 AND lm.concepto = 'visita' AND lm.estado = 'retenido' FOR UPDATE OF lm`, [s.id]);
  if (!mov) throw new AppError('La visita de esta solicitud no está retenida', 409, 'ESTADO_INVALIDO');
  let reembolso;
  try {
    reembolso = await reembolsarPago(mov, mov.monto_bruto);
  } catch {
    throw new AppError('Transbank no aceptó la devolución; inténtalo de nuevo más tarde', 502, 'REEMBOLSO_FALLIDO');
  }
  await moverLedger(db, mov, 'retenido', 'reembolsado', actorId);
  await db.query(
    `UPDATE pagos SET estado = 'anulado', respuesta = COALESCE(respuesta, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [mov.pago_id, { reembolso: reembolso ?? 'aceptado' }]);
  await db.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id = $1", [s.id]);
  await registrarEvento(db, s.id, s.estado, 'cancelada', actorId, detalle);
}

// El prestador llegó: ingresa el código que le dicta el cliente. Si el cliente marcó el lugar
// en el mapa, además tiene que estar a menos de RADIO_LLEGADA_M metros. Con el código correcto
// (y dentro de esa zona, cuando hay punto) la visita se le libera.
export async function confirmarLlegada(usuario, id, { codigo, latitud, longitud }) {
  const resultado = await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.prestador_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (s.estado !== 'visita_pagada') {
      throw new AppError('Esta solicitud no tiene una visita pagada pendiente', 409, 'ESTADO_INVALIDO');
    }
    if (s.intentos_codigo >= REGLAS_VISITA.maxIntentosCodigo) {
      throw new AppError('Ingresaste mal el código demasiadas veces. Escríbele al equipo de DeliMaster.', 429, 'CODIGO_BLOQUEADO');
    }
    if (codigo !== s.codigo_llegada) {
      // El intento fallido se guarda (por eso el error se lanza después de la transacción)
      const { rows: [r] } = await db.query(
        'UPDATE solicitudes SET intentos_codigo = intentos_codigo + 1 WHERE id = $1 RETURNING intentos_codigo', [id]);
      return { incorrecto: true, quedan: REGLAS_VISITA.maxIntentosCodigo - r.intentos_codigo };
    }
    // El código ya es el correcto: un error de ubicación no gasta intentos (la transacción se revierte).
    let distancia = null;
    if (s.latitud != null && s.longitud != null) {
      if (latitud == null || longitud == null) {
        throw errorDeCampo('Comparte tu ubicación para confirmar que llegaste al lugar del trabajo', 'latitud', 'UBICACION_REQUERIDA');
      }
      distancia = distanciaMetros(Number(s.latitud), Number(s.longitud), latitud, longitud);
      if (distancia > RADIO_LLEGADA_M) {
        throw errorDeCampo(
          `Estás a ${distancia.toLocaleString('es-CL')} m del lugar. Acércate: la llegada se confirma dentro de ${RADIO_LLEGADA_M.toLocaleString('es-CL')} m.`,
          'latitud', 'FUERA_DE_ZONA');
      }
    }
    await db.query(
      `UPDATE solicitudes
          SET estado = 'en_diagnostico', llegada_en = now(),
              llegada_latitud = $2, llegada_longitud = $3, llegada_distancia_m = $4
        WHERE id = $1`,
      [id, latitud ?? null, longitud ?? null, distancia]);
    const donde = distancia == null ? '' : ` a ${distancia.toLocaleString('es-CL')} m del lugar`;
    await registrarEvento(db, id, 'visita_pagada', 'en_diagnostico', usuario.id, `Llegada confirmada con el código del cliente${donde}`);
    await liberarVisita(db, id, usuario.id);
    return { incorrecto: false };
  });
  if (resultado.incorrecto) {
    throw errorDeCampo(
      resultado.quedan > 0
        ? `Código incorrecto. Te ${resultado.quedan === 1 ? 'queda 1 intento' : `quedan ${resultado.quedan} intentos`}.`
        : 'Código incorrecto. Ya no quedan intentos: escríbele al equipo de DeliMaster.',
      'codigo', 'CODIGO_INCORRECTO');
  }
  return obtener(usuario, id);
}

// Después del diagnóstico, el prestador cotiza en la app. El total incluye la visita ya pagada.
// El maestro envía la cotización después del diagnóstico. Mientras el cliente no responda, puede
// corregirla: la anterior queda "reemplazada" y el cliente ve la nueva (y cuánto era antes).
export const MAX_CORRECCIONES_COTIZACION = 5;

export async function cotizar(usuario, id, { mano_obra, materiales = 0, detalle }) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.prestador_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (!['en_diagnostico', 'cotizada'].includes(s.estado)) {
      throw new AppError(s.estado === 'confirmada' || s.estado === 'pagada'
        ? 'El cliente ya aceptó la cotización: ya no se puede corregir'
        : 'Solo puedes cotizar después de confirmar tu llegada con el código', 409, 'ESTADO_INVALIDO');
    }
    const total = mano_obra + materiales;
    if (total < s.tarifa_visita) {
      throw errorDeCampo(`El total debe ser al menos la visita (${pesos(s.tarifa_visita)}), que ya está pagada`, 'mano_obra');
    }

    let anterior = null;
    if (s.estado === 'cotizada') {
      const { rows: [q] } = await db.query(
        `SELECT id, total, (SELECT count(*) FROM cotizaciones WHERE solicitud_id = $1 AND estado = 'reemplazada')::int AS correcciones
           FROM cotizaciones WHERE solicitud_id = $1 AND estado = 'pendiente' FOR UPDATE`, [id]);
      if (q.correcciones >= MAX_CORRECCIONES_COTIZACION) {
        throw new AppError(`Ya corregiste la cotización ${MAX_CORRECCIONES_COTIZACION} veces`, 409, 'LIMITE_CORRECCIONES');
      }
      await db.query("UPDATE cotizaciones SET estado = 'reemplazada' WHERE id = $1", [q.id]);
      anterior = q.total;
    }
    await db.query(
      `INSERT INTO cotizaciones (solicitud_id, prestador_id, mano_obra, materiales, total, detalle)
       VALUES ($1, $2, $3, $4, $5, $6)`, [id, usuario.id, mano_obra, materiales, total, detalle]);
    if (anterior === null) {
      await db.query("UPDATE solicitudes SET estado = 'cotizada' WHERE id = $1", [id]);
      await registrarEvento(db, id, 'en_diagnostico', 'cotizada', usuario.id,
        `Cotización: ${pesos(total)} (saldo ${pesos(total - s.tarifa_visita)})`);
    } else {
      await registrarEvento(db, id, 'cotizada', 'cotizada', usuario.id,
        `Cotización corregida: ${pesos(total)} (antes ${pesos(anterior)}) · saldo ${pesos(total - s.tarifa_visita)}`);
    }
  });
  return obtener(usuario, id);
}

// El cliente acepta la cotización (paga el saldo con garantía) o la rechaza (la visita queda para el prestador)
export async function responderCotizacion(usuario, id, { aceptar, cotizacion_id: vista }) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (s.estado !== 'cotizada') throw new AppError('No hay una cotización por responder', 409, 'ESTADO_INVALIDO');
    const { rows: [q] } = await db.query(
      "SELECT id, total FROM cotizaciones WHERE solicitud_id = $1 AND estado = 'pendiente' FOR UPDATE", [id]);
    // El maestro la corrigió mientras el cliente miraba la anterior: debe revisar la nueva antes de responder
    if (vista && vista !== q.id) {
      throw new AppError(`El maestro corrigió la cotización: ahora es de ${pesos(q.total)}. Revísala antes de responder.`,
        409, 'COTIZACION_CAMBIO');
    }

    await db.query('UPDATE cotizaciones SET estado = $2, respondida_en = now() WHERE id = $1',
      [q.id, aceptar ? 'aceptada' : 'rechazada']);
    if (!aceptar) {
      await db.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id = $1", [id]);
      await registrarEvento(db, id, 'cotizada', 'cancelada', usuario.id, 'Cotización rechazada: la visita queda para el maestro');
      return;
    }
    const saldo = q.total - s.tarifa_visita;
    // Si la visita ya cubre el total, no hay nada más que pagar: el trabajo puede comenzar
    const estado = saldo > 0 ? 'confirmada' : 'pagada';
    await db.query('UPDATE solicitudes SET estado = $2, precio_acordado = $3, confirmada_en = now() WHERE id = $1',
      [id, estado, q.total]);
    await registrarEvento(db, id, 'cotizada', estado, usuario.id,
      saldo > 0
        ? `Cotización aceptada: ${pesos(q.total)} · saldo por pagar ${pesos(saldo)}`
        : 'Cotización aceptada: la visita cubre el total');
  });
  if (!aceptar) expulsarDeSala(id);
  return obtener(usuario, id);
}

// El prestador no llegó: pasada la tolerancia, el cliente recupera la visita al instante
export async function reclamarNoLlego(usuario, id) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (s.estado !== 'visita_pagada') throw new AppError('Esta solicitud no tiene una visita pendiente', 409, 'ESTADO_INVALIDO');
    const desde = new Date(new Date(s.visita_programada_en).getTime() + REGLAS_VISITA.toleranciaMin * 60_000);
    if (Date.now() < desde.getTime()) {
      throw new AppError(`Podrás pedir la devolución desde el ${fechaHora(desde)}`, 409, 'AUN_EN_PLAZO');
    }
    await devolverVisita(db, s, usuario.id, 'El maestro no llegó: se devuelve la visita al cliente');
  });
  expulsarDeSala(id);
  return obtener(usuario, id);
}

// ------------------------------------------------------------------ cierre del trabajo
// Cierre oficial: la solicitud pasa a "cerrada" y el dinero retenido pasa a "liberado" en el ledger,
// listo para que el equipo lo transfiera al prestador (HU-13). Se usa en el cierre manual y en el automático.
async function aplicarCierre(db, s, actorId, detalle = null) {
  await db.query("UPDATE solicitudes SET estado = 'cerrada', cerrado_en = now() WHERE id = $1", [s.id]);

  const { rows } = await db.query(
    `UPDATE ledger_movimientos SET estado = 'liberado', liberado_en = now()
      WHERE solicitud_id = $1 AND estado = 'retenido'
      RETURNING id, monto_neto`, [s.id]);
  for (const mov of rows) {
    await db.query(
      `INSERT INTO ledger_eventos (movimiento_id, estado_anterior, estado_nuevo, monto, actor_id)
       VALUES ($1, 'retenido', 'liberado', $2, $3)`, [mov.id, mov.monto_neto, actorId]);
  }
  // Solo los trabajos cerrados en la plataforma cuentan para la reputación (HU-07)
  await db.query('UPDATE prestadores SET trabajos_cerrados = trabajos_cerrados + 1 WHERE usuario_id = $1', [s.prestador_id]);
  // Al final: el aviso al maestro informa cuánto se le liberó
  await registrarEvento(db, s.id, s.estado, 'cerrada', actorId, detalle);
}

// El prestador indica que terminó el trabajo (solo después de que el cliente pagó)
export async function finalizar(usuario, id) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.prestador_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (s.estado !== 'pagada') {
      throw new AppError('Solo puedes marcar como terminado un trabajo ya pagado por el cliente', 409, 'ESTADO_INVALIDO');
    }
    await db.query("UPDATE solicitudes SET estado = 'finalizada', finalizada_en = now() WHERE id = $1", [id]);
    await registrarEvento(db, id, 'pagada', 'finalizada', usuario.id);
  });
  return obtener(usuario, id);
}

// El cliente confirma que el trabajo quedó bien: cierre oficial y liberación del pago
export async function cerrar(usuario, id) {
  await liberarVencidas();
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (s.estado !== 'finalizada') {
      throw new AppError(
        s.estado === 'cerrada' ? 'Este trabajo ya está cerrado' : 'El maestro aún no marca el trabajo como terminado',
        409, 'ESTADO_INVALIDO');
    }
    await aplicarCierre(db, s, usuario.id);
  });
  return obtener(usuario, id);
}

// El cliente reporta un problema en vez de cerrar: el dinero sigue retenido hasta que el equipo resuelva
export async function reportar(usuario, id, { motivo }) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (!['pagada', 'finalizada'].includes(s.estado)) {
      throw new AppError('Solo se puede reportar un problema en un trabajo pagado y aún no cerrado', 409, 'ESTADO_INVALIDO');
    }
    await db.query("UPDATE solicitudes SET estado = 'en_disputa', motivo_disputa = $2 WHERE id = $1", [id, motivo]);
    await registrarEvento(db, id, s.estado, 'en_disputa', usuario.id, motivo);
  });
  return obtener(usuario, id);
}

// ------------------------------------------------------------------ HU-16: resolución de disputas
// El equipo revisa la evidencia (chat, fotos e historial) y decide:
//  - liberar: el trabajo se da por bien hecho; se cierra y el pago queda liberado para el prestador.
//  - reembolsar: se devuelve el pago del trabajo al cliente por Webpay y la solicitud se cancela
//    (en la modalidad con visita, la visita ya la recibió el prestador por diagnosticar).
export async function resolverDisputa(admin, id, { decision, observacion, monto_reembolso: devolver, gastos_rechazados: rechazados = [] }) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.estado !== 'en_disputa') {
      throw new AppError('Esta solicitud no tiene una disputa abierta', 409, 'ESTADO_INVALIDO');
    }
    if (decision === 'liberar') {
      await aplicarCierre(db, s, admin.id, `Disputa resuelta a favor del prestador: ${observacion}`);
      return;
    }

    const { rows: [mov] } = await db.query(
      `SELECT lm.id, lm.estado, lm.monto_bruto, p.id AS pago_id, p.token_webpay, p.medio, p.orden_compra, p.orden_hija
         FROM ledger_movimientos lm JOIN pagos p ON p.id = lm.pago_id
        WHERE lm.solicitud_id = $1 AND lm.concepto <> 'visita' FOR UPDATE OF lm`, [id]);
    if (!mov || mov.estado !== 'retenido') {
      throw new AppError('El pago de esta solicitud no está retenido', 409, 'ESTADO_INVALIDO');
    }

    // Devolución parcial: el cliente recupera una parte (por ejemplo, los materiales sin boleta), el
    // resto se libera al maestro y el trabajo se cierra. La comisión se calcula sobre lo que queda.
    if (decision === 'parcial') {
      if (devolver >= mov.monto_bruto) {
        throw errorDeCampo(`Para devolver los ${pesos(mov.monto_bruto)} completos, elige «Reembolsar»`, 'monto_reembolso');
      }
      let reembolso;
      try {
        reembolso = await reembolsarPago(mov, devolver);
      } catch {
        throw new AppError('Transbank no aceptó la devolución parcial (algunas tarjetas solo permiten devolver el total); '
          + 'inténtalo más tarde o elige otra decisión', 502, 'REEMBOLSO_FALLIDO');
      }
      // Gastos que el maestro no justificó: se devuelven al cliente y dejan de contar como gasto suyo
      if (rechazados.length) {
        const { rowCount } = await db.query(
          `UPDATE gastos SET rechazado_en = now(), rechazo_motivo = $3
            WHERE solicitud_id = $1 AND id = ANY ($2::uuid[]) AND rechazado_en IS NULL`, [id, rechazados, observacion]);
        if (rowCount !== rechazados.length) {
          throw errorDeCampo('Alguno de los gastos elegidos no es de este trabajo', 'gastos_rechazados');
        }
      }
      const queda = mov.monto_bruto - devolver;
      const comision = calcularComision(queda);
      await db.query(
        'UPDATE ledger_movimientos SET monto_reembolsado = $2, comision = $3, monto_neto = $4 WHERE id = $1',
        [mov.id, devolver, comision, queda - comision]);
      await db.query(
        `INSERT INTO ledger_eventos (movimiento_id, estado_anterior, estado_nuevo, monto, actor_id, detalle)
         VALUES ($1, 'retenido', 'reembolsado', $2, $3, 'Devolución parcial al cliente')`, [mov.id, devolver, admin.id]);
      await db.query(
        `UPDATE pagos SET respuesta = COALESCE(respuesta, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
        [mov.pago_id, { reembolso_parcial: { monto: devolver, respuesta: reembolso ?? 'aceptado' } }]);
      await aplicarCierre(db, s, admin.id,
        `Disputa resuelta en parte: se devolvieron ${pesos(devolver)} al cliente y ${pesos(queda)} se liberan al maestro. ${observacion}`);
      return;
    }

    // Primero Transbank: si el reembolso falla, la transacción se revierte y la disputa sigue abierta
    let reembolso;
    try {
      reembolso = await reembolsarPago(mov, mov.monto_bruto);
    } catch {
      throw new AppError('Transbank no aceptó el reembolso; inténtalo de nuevo más tarde', 502, 'REEMBOLSO_FALLIDO');
    }
    await db.query("UPDATE ledger_movimientos SET estado = 'reembolsado' WHERE id = $1", [mov.id]);
    await db.query(
      `INSERT INTO ledger_eventos (movimiento_id, estado_anterior, estado_nuevo, monto, actor_id)
       VALUES ($1, 'retenido', 'reembolsado', $2, $3)`, [mov.id, mov.monto_bruto, admin.id]);
    await db.query(
      `UPDATE pagos SET estado = 'anulado', respuesta = COALESCE(respuesta, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [mov.pago_id, { reembolso: reembolso ?? 'aceptado' }]);
    await db.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id = $1", [id]);
    await registrarEvento(db, id, 'en_disputa', 'cancelada', admin.id,
      `Disputa resuelta a favor del cliente (reembolso): ${observacion}`);
  });
  return obtener(admin, id);
}

// ------------------------------------------------------------------ HU-06: reseña
export async function resenar(usuario, id, { estrellas, comentario }) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (s.estado !== 'cerrada') {
      throw new AppError('Solo puedes calificar un trabajo cerrado oficialmente', 409, 'ESTADO_INVALIDO');
    }
    try {
      await db.query(
        `INSERT INTO resenas (solicitud_id, cliente_id, prestador_id, estrellas, comentario)
         VALUES ($1, $2, $3, $4, $5)`, [id, usuario.id, s.prestador_id, estrellas, comentario ?? null]);
    } catch (err) {
      if (err.code === '23505') throw new AppError('Ya calificaste este trabajo', 409, 'YA_CALIFICADO');
      throw err;
    }
    // HU-07: la reputación se recalcula desde las reseñas reales (no se acumula a mano)
    await db.query(
      `UPDATE prestadores p SET
         calificacion_promedio = r.promedio, total_resenas = r.total
         FROM (SELECT round(avg(estrellas)::numeric, 2) AS promedio, count(*)::int AS total
                 FROM resenas WHERE prestador_id = $1) r
        WHERE p.usuario_id = $1`, [s.prestador_id]);
  });
  return obtener(usuario, id);
}

// ------------------------------------------------------------------ privacidad: compartir la dirección
// El cliente comparte voluntariamente su dirección exacta con el maestro una vez que la visita
// (o el trabajo) ya quedó concretada. No es un cambio de estado: queda registrado con su momento
// y en el historial, y el maestro recibe un aviso. Sin compartir, la dirección se sigue
// revelando automáticamente cuando el pago queda asegurado (direccionVisible).
export async function compartirDireccion(usuario, id) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (!ESTADOS_PARA_COMPARTIR.includes(s.estado)) {
      throw new AppError('Todavía no puedes compartir tu dirección: primero debe concretarse la visita o el trabajo', 409, 'ESTADO_INVALIDO');
    }
    if (direccionVisible(s)) return;   // ya la compartió o ya es visible por el pago: no se duplica el aviso
    await db.query('UPDATE solicitudes SET direccion_compartida_en = now() WHERE id = $1', [id]);
    // No es un cambio de estado, por lo que no pasa por registrarEvento (dispararía los avisos
    // del estado como si hubiera ocurrido de nuevo): se anota el hecho en el historial y listo.
    await db.query(
      `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, actor_id, detalle)
       VALUES ($1, $2, $2, $3, $4)`,
      [id, s.estado, usuario.id, 'El cliente compartió su dirección exacta con el maestro']);
    await crearNotificacion(db, s.prestador_id, {
      titulo: 'El cliente compartió su dirección',
      texto: 'Ya puedes ver la dirección exacta del trabajo en el detalle de la solicitud.',
      solicitudId: id,
    });
  });
  return obtener(usuario, id);
}

// ------------------------------------------------------------------ calificación del cliente (bilateral)
// Espejo de resenar (HU-06) en el sentido contrario: al cerrar el trabajo, el maestro también
// califica al cliente. Esa reputación la ven los demás maestros en la solicitud antes de
// aceptar, igual que los clientes ven la del maestro en el catálogo (HU-07).
export async function resenarCliente(usuario, id, { estrellas, comentario }) {
  await enTransaccion(async (db) => {
    const s = await bloquear(db, id);
    if (s.prestador_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
    if (s.estado !== 'cerrada') {
      throw new AppError('Solo puedes calificar al cliente de un trabajo cerrado oficialmente', 409, 'ESTADO_INVALIDO');
    }
    try {
      await db.query(
        `INSERT INTO resenas_prestador (solicitud_id, prestador_id, cliente_id, estrellas, comentario)
         VALUES ($1, $2, $3, $4, $5)`, [id, usuario.id, s.cliente_id, estrellas, comentario ?? null]);
    } catch (err) {
      if (err.code === '23505') throw new AppError('Ya calificaste a este cliente', 409, 'YA_CALIFICADO');
      throw err;
    }
    // La reputación del cliente se recalcula desde sus calificaciones reales (no se acumula a mano)
    await db.query(
      `UPDATE usuarios u SET
         calificacion_promedio = r.promedio, total_resenas = r.total
         FROM (SELECT round(avg(estrellas)::numeric, 2) AS promedio, count(*)::int AS total
                 FROM resenas_prestador WHERE cliente_id = $1) r
        WHERE u.id = $1`, [s.cliente_id]);
  });
  return obtener(usuario, id);
}
