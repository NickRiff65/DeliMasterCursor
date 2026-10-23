import { randomBytes } from 'node:crypto';
import { pool, enTransaccion, alConfirmar } from '../../db/pool.js';
import { config } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { pasarela, reembolsarPago } from './pasarela.js';
import { cifrar, descifrar } from '../../utils/cifrado.js';
import { nuevoCodigoLlegada } from '../solicitudes/visita.js';
import { avisar } from '../../utils/avisos.js';
import { notificarCambio } from '../notificaciones/notificaciones.servicio.js';

// Orden de compra para Transbank (máximo 26 caracteres, única)
function nuevaOrdenCompra() {
  return `DM${Date.now().toString(36)}${randomBytes(4).toString('hex')}`.toUpperCase();
}

// Comisión de la plataforma en pesos enteros (el CLP no usa decimales)
export function calcularComision(monto) {
  return Math.round((monto * config.comisionPorcentaje) / 100);
}

// A dónde vuelve el cliente después de pagar. Para evitar redirecciones a sitios ajenos, solo se
// acepta la misma máquina desde la que llamó a la API (app web) o el esquema propio de la app.
export function destinoPermitido(volverA, hostDeLaPeticion) {
  try {
    const u = new URL(volverA);
    if (['delimaster:', 'delimasterpro:', 'exp:'].includes(u.protocol)) return true;
    return ['http:', 'https:'].includes(u.protocol) && u.hostname === hostDeLaPeticion.split(':')[0];
  } catch {
    return false;
  }
}

// Qué se paga en cada estado y cuánto. El monto lo define el servidor, nunca la app:
//  · visita_por_pagar → la visita de diagnóstico (tarifa que fijó el prestador)
//  · confirmada       → el total (precio cerrado) o el saldo (cotización − visita ya pagada)
export function cobroPendiente(s) {
  if (s.estado === 'visita_por_pagar') return { concepto: 'visita', monto: s.tarifa_visita };
  if (s.estado === 'confirmada') {
    return s.modalidad === 'visita'
      ? { concepto: 'saldo', monto: s.precio_acordado - s.tarifa_visita }
      : { concepto: 'total', monto: s.precio_acordado };
  }
  return null;
}

// Estado en que debe seguir la solicitud cuando vuelve la confirmación de cada concepto
const ESTADO_ESPERADO = { visita: 'visita_por_pagar', saldo: 'confirmada', total: 'confirmada' };

// ------------------------------------------------------------------ HU-03: iniciar el pago
// Tres formas de pagar:
//  · webpay           → el cliente ingresa su tarjeta en Webpay Plus (no se guarda)
//  · guardar_tarjeta  → registra su tarjeta en Transbank (Oneclick) y, al volver, se cobra con ella
//  · tarjeta_guardada → se cobra al instante con la tarjeta que ya guardó (sin salir de la app)
export async function iniciar(usuario, solicitudId, { volverA, urlApi, medio = 'webpay' }) {
  const { rows } = await pool.query(
    'SELECT id, cliente_id, estado, modalidad, precio_acordado, tarifa_visita FROM solicitudes WHERE id = $1', [solicitudId]);
  const s = rows[0];
  if (!s || s.cliente_id !== usuario.id) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  const cobro = cobroPendiente(s);
  if (!cobro) {
    throw new AppError(
      s.estado === 'pagada' ? 'Esta solicitud ya está pagada' : 'Solo se puede pagar un trabajo aceptado por el maestro',
      409, 'ESTADO_INVALIDO');
  }
  if (medio === 'tarjeta_guardada') return { ...(await cobrarConTarjetaGuardada(usuario, s.id, cobro)), ...cobro };
  if (medio === 'guardar_tarjeta') return { ...(await iniciarInscripcion(usuario, { solicitudId: s.id, volverA, urlApi })), ...cobro };

  const { concepto, monto } = cobro;
  const ordenCompra = nuevaOrdenCompra();
  const { token, url } = await pasarela.crear({
    ordenCompra, sesion: s.id, monto, urlRetorno: `${urlApi}/pagos/webpay/retorno`,
  });

  await enTransaccion(async (db) => {
    // Un intento anterior que el cliente abandonó queda anulado. Es seguro: Webpay revierte
    // solo cualquier transacción que el comercio no confirme (commit).
    await db.query(
      `UPDATE pagos SET estado = 'anulado', respuesta = respuesta || '{"motivo": "reemplazado_por_nuevo_intento"}'::jsonb
        WHERE solicitud_id = $1 AND estado = 'iniciado' AND medio = 'webpay'`, [s.id]);
    await db.query(
      `INSERT INTO pagos (solicitud_id, orden_compra, token_webpay, monto, concepto, respuesta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [s.id, ordenCompra, token, monto, concepto, { url_webpay: url, volver_a: volverA }]);
  });

  return { url_pago: `${urlApi}/pagos/webpay/ir/${encodeURIComponent(token)}`, monto, concepto };
}

// Datos para armar el formulario que lleva al cliente a Webpay
export async function datosParaRedirigir(token) {
  const { rows } = await pool.query(
    "SELECT respuesta->>'url_webpay' AS url, estado FROM pagos WHERE token_webpay = $1", [token]);
  if (!rows[0] || rows[0].estado !== 'iniciado') throw new AppError('Pago no encontrado o ya procesado', 404, 'PAGO_NO_ENCONTRADO');
  return { url: rows[0].url, token };
}

// ------------------------------------------------------------------ HU-03: retorno desde Webpay
// Transbank devuelve al cliente con uno de estos casos:
//   · token_ws                        → el cliente completó el formulario: hay que confirmar (commit)
//   · TBK_TOKEN (+ orden y sesión)    → el cliente anuló el pago en Webpay
//   · solo TBK_ORDEN_COMPRA           → se agotó el tiempo para pagar
// Devuelve { destino, resultado } para redirigir al cliente de vuelta a la app.
export async function procesarRetorno(params) {
  const tokenWs = params.token_ws;
  const tokenAnulado = params.TBK_TOKEN;
  const ordenCompra = params.TBK_ORDEN_COMPRA;

  if (tokenAnulado || (!tokenWs && ordenCompra)) {
    const { rows } = await pool.query(
      `UPDATE pagos SET estado = 'anulado', respuesta = respuesta || $3::jsonb
        WHERE estado = 'iniciado' AND (token_webpay = $1 OR orden_compra = $2)
        RETURNING solicitud_id, respuesta->>'volver_a' AS volver_a`,
      [tokenAnulado ?? null, ordenCompra ?? null, { motivo: tokenAnulado ? 'anulado_por_cliente' : 'tiempo_agotado' }]);
    return { destino: rows[0]?.volver_a ?? null, resultado: 'cancelado' };
  }
  if (!tokenWs) throw new AppError('Retorno de Webpay sin datos', 400, 'RETORNO_INVALIDO');

  const { rows } = await pool.query(
    `SELECT id, solicitud_id, monto, concepto, orden_compra, orden_hija, token_webpay, medio, estado, respuesta->>'volver_a' AS volver_a
       FROM pagos WHERE token_webpay = $1`,
    [tokenWs]);
  const pago = rows[0];
  if (!pago) throw new AppError('Pago no encontrado', 404, 'PAGO_NO_ENCONTRADO');
  // Si el navegador repite el retorno (recarga), no se vuelve a confirmar
  if (pago.estado !== 'iniciado') {
    return { destino: pago.volver_a, resultado: pago.estado === 'autorizado' ? 'aprobado' : 'rechazado' };
  }

  let confirmacion;
  try {
    confirmacion = await pasarela.confirmar(tokenWs);
  } catch (err) {
    await pool.query("UPDATE pagos SET estado = 'rechazado', respuesta = respuesta || $2::jsonb WHERE id = $1",
      [pago.id, { error: err.message }]);
    return { destino: pago.volver_a, resultado: 'rechazado' };
  }

  // El pago solo vale si Transbank lo autorizó por el monto y la orden exactos que se crearon
  const autorizado = confirmacion.response_code === 0 && confirmacion.status === 'AUTHORIZED'
    && Number(confirmacion.amount) === pago.monto && confirmacion.buy_order === pago.orden_compra;
  if (!autorizado) {
    await pool.query("UPDATE pagos SET estado = 'rechazado', respuesta = respuesta || $2::jsonb WHERE id = $1",
      [pago.id, { confirmacion }]);
    return { destino: pago.volver_a, resultado: 'rechazado' };
  }

  const resultado = await aplicarPagoAutorizado(pago, { codigo: confirmacion.authorization_code, respuesta: { confirmacion } });
  return { destino: pago.volver_a, resultado };
}

// Registra un pago que Transbank ya autorizó (Webpay Plus o tarjeta guardada): avanza la solicitud y deja
// el dinero retenido en el ledger. Si la solicitud cambió mientras el cliente pagaba, se le devuelve.
async function aplicarPagoAutorizado(pago, { codigo, respuesta }) {
  const medio = pago.medio === 'oneclick' ? 'Tarjeta guardada' : 'Webpay';
  const resultado = await enTransaccion(async (db) => {
    const { rows: [s] } = await db.query(
      'SELECT id, estado, prestador_id FROM solicitudes WHERE id = $1 FOR UPDATE', [pago.solicitud_id]);

    if (s.estado !== ESTADO_ESPERADO[pago.concepto]) {
      // La solicitud cambió mientras el cliente pagaba (por ejemplo, la canceló): se devuelve el dinero
      await db.query("UPDATE pagos SET estado = 'anulado', respuesta = COALESCE(respuesta, '{}'::jsonb) || $2::jsonb WHERE id = $1",
        [pago.id, { ...respuesta, motivo: `solicitud_${s.estado}`, reembolso: 'solicitado' }]);
      return 'reembolsado';
    }

    await db.query("UPDATE pagos SET estado = 'autorizado', respuesta = COALESCE(respuesta, '{}'::jsonb) || $2::jsonb WHERE id = $1",
      [pago.id, respuesta]);
    // Aviso al maestro (en la app y por correo): le pagaron la visita o el trabajo
    const nuevoEstado = pago.concepto === 'visita' ? 'visita_pagada' : 'pagada';
    alConfirmar(db, () => avisar(s.id, nuevoEstado));
    if (pago.concepto === 'visita') {
      // Visita pagada: queda retenida y el cliente recibe el código que dictará cuando llegue el prestador
      await db.query(
        "UPDATE solicitudes SET estado = 'visita_pagada', codigo_llegada = $2, intentos_codigo = 0 WHERE id = $1",
        [s.id, nuevoCodigoLlegada()]);
      await db.query(
        `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, detalle)
         VALUES ($1, 'visita_por_pagar', 'visita_pagada', $2)`,
        [s.id, `${medio} · visita · autorización ${codigo}`]);
    } else {
      await db.query("UPDATE solicitudes SET estado = 'pagada' WHERE id = $1", [s.id]);
      await db.query(
        `INSERT INTO solicitud_eventos (solicitud_id, estado_anterior, estado_nuevo, detalle)
         VALUES ($1, 'confirmada', 'pagada', $2)`,
        [s.id, `${medio}${pago.concepto === 'saldo' ? ' · saldo' : ''} · autorización ${codigo}`]);
    }

    // Ledger de garantía: el dinero queda "retenido" a favor del prestador hasta que se libere
    // (la visita, al llegar; el trabajo, en el cierre oficial). La comisión se cobra sobre cada pago.
    const comision = calcularComision(pago.monto);
    const { rows: [mov] } = await db.query(
      `INSERT INTO ledger_movimientos (solicitud_id, pago_id, prestador_id, monto_bruto, comision, monto_neto, concepto)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [s.id, pago.id, s.prestador_id, pago.monto, comision, pago.monto - comision, pago.concepto]);
    await db.query(
      `INSERT INTO ledger_eventos (movimiento_id, estado_anterior, estado_nuevo, monto)
       VALUES ($1, NULL, 'retenido', $2)`,
      [mov.id, pago.monto]);
    await notificarCambio(db, s.id, nuevoEstado, ESTADO_ESPERADO[pago.concepto]);
    return 'aprobado';
  });

  if (resultado === 'reembolsado') {
    await reembolsarPago(pago, pago.monto).catch(() => {}); // se reintenta manualmente si falla
  }
  return resultado;
}

// ------------------------------------------------------------------ tarjeta guardada (Webpay Oneclick)
const PROPOSITO = 'tarjeta';

// La tarjeta guardada del cliente, para mostrarla (sin el identificador de Transbank)
export async function tarjetaDe(usuarioId) {
  const { rows: [t] } = await pool.query(
    'SELECT tipo, ultimos4, creada_en FROM tarjetas WHERE usuario_id = $1', [usuarioId]);
  return t ?? null;
}

// Cobra al instante con la tarjeta guardada. Devuelve { resultado: 'aprobado' | 'rechazado' }
async function cobrarConTarjetaGuardada(usuario, solicitudId, { concepto, monto }) {
  const { rows: [t] } = await pool.query('SELECT tbk_user FROM tarjetas WHERE usuario_id = $1', [usuario.id]);
  if (!t) throw new AppError('No tienes una tarjeta guardada', 409, 'SIN_TARJETA');

  const pago = await enTransaccion(async (db) => {
    await db.query('SELECT id FROM solicitudes WHERE id = $1 FOR UPDATE', [solicitudId]);
    // Evita cobrar dos veces si el cliente toca el botón dos veces seguidas
    const { rowCount: enCurso } = await db.query(
      `SELECT 1 FROM pagos WHERE solicitud_id = $1 AND concepto = $2 AND medio = 'oneclick' AND estado = 'iniciado'
          AND creado_en > now() - interval '2 minutes'`, [solicitudId, concepto]);
    if (enCurso) throw new AppError('Ya estamos procesando este pago', 409, 'PAGO_EN_CURSO');
    const { rows: [p] } = await db.query(
      `INSERT INTO pagos (solicitud_id, orden_compra, orden_hija, monto, concepto, medio)
       VALUES ($1, $2, $3, $4, $5, 'oneclick')
       RETURNING id, solicitud_id, monto, concepto, medio, orden_compra, orden_hija, token_webpay`,
      [solicitudId, nuevaOrdenCompra(), nuevaOrdenCompra(), monto, concepto]);
    return p;
  });

  let cobro;
  try {
    cobro = await pasarela.cobrarTarjeta({
      usuario: usuario.id, tbkUser: descifrar(t.tbk_user, PROPOSITO), ordenCompra: pago.orden_compra, ordenHija: pago.orden_hija, monto,
    });
  } catch (err) {
    await pool.query("UPDATE pagos SET estado = 'rechazado', respuesta = $2 WHERE id = $1", [pago.id, { error: err.message }]);
    return { resultado: 'rechazado' };
  }
  if (!cobro.autorizado) {
    await pool.query("UPDATE pagos SET estado = 'rechazado', respuesta = $2 WHERE id = $1", [pago.id, { oneclick: cobro.respuesta }]);
    return { resultado: 'rechazado' };
  }
  return { resultado: await aplicarPagoAutorizado(pago, { codigo: cobro.codigo, respuesta: { oneclick: cobro.respuesta } }) };
}

// El cliente registra (o cambia) su tarjeta en la página de Transbank. Si lo hace para pagar una
// solicitud, el cobro se hace al volver.
export async function iniciarInscripcion(usuario, { solicitudId = null, volverA, urlApi }) {
  const { rows: [u] } = await pool.query('SELECT email FROM usuarios WHERE id = $1', [usuario.id]);
  const { token, url } = await pasarela.iniciarInscripcion({
    usuario: usuario.id, email: u.email, urlRetorno: `${urlApi}/pagos/oneclick/retorno`,
  });
  await pool.query(
    'INSERT INTO inscripciones (token, usuario_id, url_webpay, solicitud_id, volver_a) VALUES ($1, $2, $3, $4, $5)',
    [token, usuario.id, url, solicitudId, volverA]);
  return { url_pago: `${urlApi}/pagos/oneclick/ir/${encodeURIComponent(token)}` };
}

// Datos para el formulario que lleva al cliente a registrar su tarjeta (Transbank exige un POST con TBK_TOKEN)
export async function datosInscripcion(token) {
  const { rows: [i] } = await pool.query('SELECT url_webpay, estado FROM inscripciones WHERE token = $1', [token]);
  if (!i || i.estado !== 'iniciada') throw new AppError('Inscripción no encontrada o ya procesada', 404, 'INSCRIPCION_NO_ENCONTRADA');
  return { url: i.url_webpay, token };
}

// Vuelta desde Transbank: si la tarjeta quedó registrada se guarda (reemplaza la anterior) y, si era
// para pagar una solicitud, se cobra. Devuelve { destino, resultado } para volver a la app.
export async function procesarRetornoInscripcion(params) {
  const token = params.TBK_TOKEN;
  if (!token) throw new AppError('Retorno de Transbank sin datos', 400, 'RETORNO_INVALIDO');
  // Se marca como procesada antes de nada: si el navegador repite el retorno, no se cobra dos veces
  const { rows: [i] } = await pool.query(
    "UPDATE inscripciones SET estado = 'completada' WHERE token = $1 AND estado = 'iniciada' RETURNING usuario_id, solicitud_id, volver_a",
    [token]);
  if (!i) {
    const { rows: [previa] } = await pool.query('SELECT volver_a FROM inscripciones WHERE token = $1', [token]);
    if (!previa) throw new AppError('Inscripción no encontrada', 404, 'INSCRIPCION_NO_ENCONTRADA');
    return { destino: previa.volver_a, resultado: 'procesado' };
  }

  let inscripcion;
  try {
    inscripcion = await pasarela.finalizarInscripcion(token);
  } catch (err) {
    inscripcion = { aprobada: false, respuesta: { error: err.message } };
  }
  if (!inscripcion.aprobada) {
    await pool.query("UPDATE inscripciones SET estado = 'rechazada', respuesta = $2 WHERE token = $1", [token, inscripcion.respuesta]);
    return { destino: i.volver_a, resultado: 'cancelado' };
  }

  // Guarda la tarjeta nueva; la anterior (si había) se elimina también en Transbank
  const { rows: [anterior] } = await pool.query('SELECT tbk_user FROM tarjetas WHERE usuario_id = $1', [i.usuario_id]);
  await pool.query(
    `INSERT INTO tarjetas (usuario_id, tbk_user, tipo, ultimos4) VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_id) DO UPDATE SET tbk_user = $2, tipo = $3, ultimos4 = $4, creada_en = now()`,
    [i.usuario_id, cifrar(inscripcion.tbkUser, PROPOSITO), inscripcion.tipo, inscripcion.ultimos4]);
  await pool.query('UPDATE inscripciones SET respuesta = $2 WHERE token = $1', [token, { tipo: inscripcion.tipo, ultimos4: inscripcion.ultimos4 }]);
  if (anterior) eliminarEnTransbank(i.usuario_id, anterior.tbk_user);

  if (!i.solicitud_id) return { destino: i.volver_a, resultado: 'tarjeta_guardada' };
  const { rows: [s] } = await pool.query(
    'SELECT id, cliente_id, estado, modalidad, precio_acordado, tarifa_visita FROM solicitudes WHERE id = $1', [i.solicitud_id]);
  const cobro = s && s.cliente_id === i.usuario_id ? cobroPendiente(s) : null;
  if (!cobro) return { destino: i.volver_a, resultado: 'tarjeta_guardada' };   // ya se pagó por otro lado
  try {
    const { resultado } = await cobrarConTarjetaGuardada({ id: i.usuario_id }, s.id, cobro);
    return { destino: i.volver_a, resultado };
  } catch {
    return { destino: i.volver_a, resultado: 'rechazado' };   // por ejemplo, un pago que ya estaba en curso
  }
}

// Quita la tarjeta guardada (Mi cuenta → Tarjeta guardada)
export async function quitarTarjeta(usuario) {
  const { rows: [t] } = await pool.query('DELETE FROM tarjetas WHERE usuario_id = $1 RETURNING tbk_user', [usuario.id]);
  if (t) eliminarEnTransbank(usuario.id, t.tbk_user);
  return null;
}

// Se pide a Transbank que olvide la tarjeta. Si no responde, igual deja de usarse en DeliMaster
// (el identificador no sirve sin las credenciales del comercio).
function eliminarEnTransbank(usuarioId, tbkUserCifrado) {
  const avisar = (err) => console.error(`[tarjetas] Transbank no eliminó la inscripción de ${usuarioId}: ${err.message}`);
  try {
    Promise.resolve(pasarela.eliminarInscripcion({ tbkUser: descifrar(tbkUserCifrado, PROPOSITO), usuario: usuarioId })).catch(avisar);
  } catch (err) {
    avisar(err);   // por ejemplo, un identificador que ya no se puede descifrar (cambió el secreto del servidor)
  }
}
