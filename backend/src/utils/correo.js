// Envío de correos (código de recuperación de contraseña y avisos de cada etapa de una solicitud).
// Se usa el primero que esté configurado:
//   1. API de Brevo (BREVO_API_KEY), por HTTPS. Es la opción en la nube: Railway (plan Hobby) bloquea
//      los puertos SMTP, y Brevo envía hasta 300 correos al día gratis.
//   2. SMTP (SMTP_HOST y SMTP_CLAVE), por ejemplo Gmail con una contraseña de aplicación, en el PC.
//   3. Ninguno (desarrollo): el correo se muestra en la consola del servidor para probar el flujo.
//      En producción no se muestra el contenido, porque incluye códigos de recuperación.
import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

const REMITENTE = 'DeliMaster <no-responder@delimaster.cl>';
const URL_BREVO = 'https://api.brevo.com/v3/smtp/email';

// "DeliMaster <hola@dominio.cl>" o solo "hola@dominio.cl"
export function separarRemitente(texto = REMITENTE) {
  const m = String(texto).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || 'DeliMaster', email: m[2].trim() } : { name: 'DeliMaster', email: String(texto).trim() };
}

export function transporteBrevo({ clave = process.env.BREVO_API_KEY, remitente = process.env.CORREO_REMITENTE, pedir = fetch } = {}) {
  return async ({ para, asunto, texto }) => {
    const respuesta = await pedir(URL_BREVO, {
      method: 'POST',
      headers: { 'api-key': clave, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: separarRemitente(remitente ?? REMITENTE), to: [{ email: para }], subject: asunto, textContent: texto }),
      signal: AbortSignal.timeout(15_000),
    });
    // El detalle del error de Brevo puede incluir datos de la cuenta: solo se informa el código
    if (!respuesta.ok) throw new Error(`Brevo respondió ${respuesta.status}`);
  };
}

function transporteSmtp() {
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE },
  });
  return ({ para, asunto, texto }) => transporte.sendMail({
    from: process.env.CORREO_REMITENTE ?? REMITENTE, to: para, subject: asunto, text: texto,
  });
}

async function transporteConsola({ para, asunto, texto }) {
  if (config.esTest) return;
  if (config.esProduccion) {
    console.warn(JSON.stringify({ evento: 'correo_no_enviado', motivo: 'sin BREVO_API_KEY ni SMTP configurado', asunto }));
    return;
  }
  console.log(`\n──────── Correo de desarrollo (sin correo configurado) ────────\nPara: ${para}\nAsunto: ${asunto}\n\n${texto}\n─────────────────────────────────────────────────────────────\n`);
}

export const apiCorreoConfigurada = () => Boolean(process.env.BREVO_API_KEY);
export const smtpConfigurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_CLAVE);

const elegir = () => (apiCorreoConfigurada() ? transporteBrevo() : smtpConfigurado() ? transporteSmtp() : transporteConsola);

let transporte = elegir();

export const enviarCorreo = (mensaje) => transporte(mensaje);

// Solo para pruebas automáticas
export function usarTransporteCorreo(otro) {
  transporte = otro ?? elegir();
}
