// Envío de correos (código de recuperación de contraseña y avisos de cada etapa de una solicitud).
// Con SMTP configurado (servidor y clave) se envía de verdad; sin él (desarrollo) el correo se muestra
// en la consola del servidor, para que el equipo pueda probar el flujo sin una cuenta de correo.
import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

function transporteSmtp() {
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE },
  });
  return ({ para, asunto, texto }) => transporte.sendMail({
    from: process.env.CORREO_REMITENTE ?? 'DeliMaster <no-responder@delimaster.cl>', to: para, subject: asunto, text: texto,
  });
}

async function transporteConsola({ para, asunto, texto }) {
  if (config.esTest) return;
  console.log(`\n──────── Correo de desarrollo (sin SMTP configurado) ────────\nPara: ${para}\nAsunto: ${asunto}\n\n${texto}\n─────────────────────────────────────────────────────────────\n`);
}

export const smtpConfigurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_CLAVE);

let transporte = smtpConfigurado() ? transporteSmtp() : transporteConsola;

export const enviarCorreo = (mensaje) => transporte(mensaje);

// Solo para pruebas automáticas
export function usarTransporteCorreo(otro) {
  transporte = otro ?? (smtpConfigurado() ? transporteSmtp() : transporteConsola);
}
