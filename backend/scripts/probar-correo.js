// Prueba la configuración de correo del .env (SMTP_HOST, SMTP_USUARIO, SMTP_CLAVE…):
//   npm run probar-correo -- --para persona@ejemplo.cl
// Sin SMTP_HOST o sin SMTP_CLAVE, el correo se muestra en esta consola (modo desarrollo).
import { enviarCorreo, smtpConfigurado } from '../src/utils/correo.js';

const i = process.argv.indexOf('--para');
const para = i > -1 ? process.argv[i + 1] : process.env.SMTP_USUARIO;
if (!para) {
  console.error('Indica a quién enviar la prueba: npm run probar-correo -- --para persona@ejemplo.cl');
  process.exit(1);
}
if (!smtpConfigurado()) {
  console.log(process.env.SMTP_HOST
    ? 'Falta SMTP_CLAVE en el .env (la contraseña de aplicación de Google): el correo se muestra aquí y no se envía.'
    : 'No hay SMTP_HOST en el .env: el correo se muestra aquí y no se envía de verdad.');
}

try {
  await enviarCorreo({
    para,
    asunto: 'DeliMaster · Prueba de correo',
    texto: 'Hola:\n\nSi lees esto, DeliMaster ya puede enviar correos: códigos para recuperar la contraseña '
      + 'y avisos de cada etapa de las solicitudes.\n\n— Equipo DeliMaster\n',
  });
  console.log(smtpConfigurado() ? `Listo: correo de prueba enviado a ${para}` : 'Listo (modo consola): completa SMTP_CLAVE en el .env para enviarlo de verdad');
} catch (err) {
  console.error(`No se pudo enviar el correo: ${err.message}`);
  if (/535|Username and Password not accepted|Invalid login/i.test(err.message)) {
    console.error('Gmail rechazó el usuario o la clave: usa una "contraseña de aplicación" (requiere verificación en dos pasos), no la contraseña normal.');
  }
  process.exit(1);
}
