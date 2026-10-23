// Avisos por correo en los momentos clave de una solicitud: al maestro cuando lo eligen o le pagan, y al
// cliente cuando el maestro responde, cotiza o termina. Se envían después de guardar el cambio y nunca
// hacen fallar la operación: si el correo no sale, solo queda anotado en el registro del servidor.
// Por privacidad no incluyen teléfonos, correos ni direcciones de la otra parte.
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { enviarCorreo } from './correo.js';

// En las pruebas automáticas están apagados, salvo en las que los revisan
let activos = !config.esTest;
export function activarAvisos(valor = true) {
  activos = valor;
}

const pesos = (n) => `$${Number(n).toLocaleString('es-CL')}`;
const fecha = (f) => new Date(f).toLocaleString('es-CL', {
  timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
const resumen = (s) => (s.descripcion.length > 60 ? `${s.descripcion.slice(0, 57).trimEnd()}…` : s.descripcion);

// Qué se avisa en cada estado nuevo, a quién y con qué texto (s = datos de la solicitud)
const AVISOS = {
  asignada: {
    para: 'prestador',
    asunto: () => 'Tienes una nueva solicitud',
    texto: (s) => `${s.cliente} te eligió para este trabajo en ${s.comuna}:\n\n"${resumen(s)}"\n\n`
      + 'Ábrelo en DeliMaster Pro para aceptarlo o rechazarlo. Si no respondes a tiempo, la solicitud vuelve a quedar libre.',
  },
  visita_por_pagar: {
    para: 'cliente',
    asunto: () => 'El maestro aceptó tu solicitud',
    texto: (s) => `${s.prestador} aceptó tu solicitud y propone una visita de diagnóstico el ${fecha(s.visita_programada_en)}.\n\n`
      + `Paga la visita (${pesos(s.tarifa_visita)}) en DeliMaster Lite para confirmarla. El dinero queda retenido y se `
      + 'libera solo cuando el maestro llega; si no llega, se te devuelve.',
  },
  confirmada: {
    para: 'cliente',
    asunto: (s) => (s.anterior === 'cotizada' ? 'Cotización aceptada: falta pagar el saldo' : 'El maestro aceptó tu solicitud'),
    texto: (s) => (s.anterior === 'cotizada'
      ? `Aceptaste la cotización de ${s.prestador} por ${pesos(s.precio_acordado)}. Paga el saldo `
        + `(${pesos(s.precio_acordado - s.tarifa_visita)}) en DeliMaster Lite para que comience el trabajo.`
      : `${s.prestador} aceptó tu solicitud por ${pesos(s.precio_acordado)}.`)
      + '\n\nEl pago queda retenido por DeliMaster y se libera al maestro cuando confirmes que el trabajo quedó bien.',
  },
  visita_pagada: {
    para: 'prestador',
    asunto: () => 'El cliente pagó la visita',
    texto: (s) => `${s.cliente} pagó la visita de diagnóstico del ${fecha(s.visita_programada_en)}.\n\n`
      + 'Cuando llegues, pídele el código de llegada y escríbelo en DeliMaster Pro: así se libera el pago de la visita.',
  },
  cotizada: {
    para: 'cliente',
    asunto: (s) => (s.anterior === 'cotizada' ? 'El maestro corrigió la cotización' : 'Recibiste la cotización del maestro'),
    texto: (s) => `${s.prestador} ${s.anterior === 'cotizada' ? 'corrigió' : 'te envió'} la cotización del trabajo:\n\n"${resumen(s)}"\n\n`
      + 'Revísala en DeliMaster Lite para aceptarla o rechazarla.',
  },
  pagada: {
    para: 'prestador',
    asunto: () => 'El cliente pagó el trabajo',
    texto: (s) => `${s.cliente} pagó el trabajo en ${s.comuna}:\n\n"${resumen(s)}"\n\n`
      + 'El dinero queda retenido por DeliMaster y se te libera cuando el cliente confirme el término. '
      + 'Registra tus gastos en materiales con su boleta y marca el trabajo como terminado al finalizar.',
  },
  finalizada: {
    para: 'cliente',
    asunto: () => 'El maestro terminó el trabajo',
    texto: (s) => `${s.prestador} marcó el trabajo como terminado.\n\n`
      + 'Entra a DeliMaster Lite para confirmarlo y calificarlo. Si algo quedó mal, repórtalo desde la misma solicitud '
      + 'antes de confirmar: el equipo lo revisa y el pago sigue retenido mientras tanto.',
  },
  cerrada: {
    para: 'prestador',
    asunto: () => 'Trabajo cerrado: tu pago fue liberado',
    texto: (s) => `El trabajo "${resumen(s)}" quedó cerrado y tu pago fue liberado. El equipo lo transferirá a tu cuenta `
      + 'en la próxima liquidación.',
  },
  creada: {
    para: 'cliente',
    solo: (anterior) => anterior === 'asignada',   // el maestro rechazó o no respondió (no al publicarla)
    asunto: () => 'Tu solicitud vuelve a estar disponible',
    texto: (s) => `${s.detalle ?? 'El maestro no pudo tomar tu solicitud'}.\n\n`
      + 'Entra a DeliMaster Lite y elige otro maestro para tu solicitud.',
  },
  en_disputa: {
    para: 'prestador',
    asunto: () => 'El cliente reportó un problema',
    texto: (s) => `${s.cliente} reportó un problema con el trabajo "${resumen(s)}". El equipo de DeliMaster lo está `
      + 'revisando y te contactará. El pago sigue retenido hasta que se resuelva.',
  },
};

async function datosDe(solicitudId) {
  const { rows: [s] } = await pool.query(
    `SELECT s.id, s.descripcion_original AS descripcion, s.comuna, s.precio_acordado, s.tarifa_visita,
            s.visita_programada_en, split_part(cu.nombre, ' ', 1) AS cliente, cu.email AS email_cliente,
            pu.nombre AS prestador, pu.email AS email_prestador,
            (SELECT detalle FROM solicitud_eventos e WHERE e.solicitud_id = s.id ORDER BY e.creado_en DESC LIMIT 1) AS detalle
       FROM solicitudes s
       JOIN usuarios cu ON cu.id = s.cliente_id
       LEFT JOIN usuarios pu ON pu.id = s.prestador_id
      WHERE s.id = $1`, [solicitudId]);
  return s;
}

// Envía el aviso que corresponde al estado nuevo (si hay uno). Devuelve la promesa para las pruebas,
// pero quien lo llama no la espera.
export function avisar(solicitudId, nuevo, anterior = null) {
  const aviso = AVISOS[nuevo];
  if (!activos || !aviso || (aviso.solo && !aviso.solo(anterior))) return Promise.resolve();
  return (async () => {
    const s = await datosDe(solicitudId);
    const para = aviso.para === 'cliente' ? s?.email_cliente : s?.email_prestador;
    if (!para) return;
    const nombre = aviso.para === 'cliente' ? s.cliente : s.prestador.split(' ')[0];
    const datos = { ...s, anterior };
    await enviarCorreo({
      para,
      asunto: `DeliMaster · ${aviso.asunto(datos)}`,
      texto: `Hola, ${nombre}:\n\n${aviso.texto(datos)}\n\n— Equipo DeliMaster\n`
        + 'Recibes este correo porque tienes una solicitud activa en DeliMaster.',
    });
  })().catch((err) => {
    console.error(`[avisos] No se pudo enviar el aviso "${nuevo}" de la solicitud ${solicitudId}: ${err.message}`);
  });
}
