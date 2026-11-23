// Arma las variables del servicio DeliMaster en Railway a partir del backend/.env del PC, para pegarlas
// en Railway (servicio → Variables → Raw Editor). No muestra ningún valor en la consola.
//   npm run variables-railway   →   railway-variables.env (en la raíz del repositorio, excluido de Git)
// Después de pegarlas, BORRA ese archivo: contiene las claves del servidor.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const origen = path.join(raiz, 'backend', '.env');
const destino = path.join(raiz, 'railway-variables.env');

if (!existsSync(origen)) {
  console.error('✘ No existe backend/.env');
  process.exit(1);
}

const local = {};
for (const linea of readFileSync(origen, 'utf8').split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) local[m[1]] = m[2];
}

// En Railway: el puerto lo entrega la plataforma, la base es la del servicio Postgres, los puertos SMTP
// están bloqueados (plan Hobby) y TRUST_PROXY cambia porque el proxy es el de Railway, no Tailscale.
const OMITIR = new Set(['PORT', 'NODE_ENV', 'TRUST_PROXY', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_NAME_TEST',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USUARIO', 'SMTP_CLAVE', 'PG_BIN', 'CARPETA_RESPALDOS', 'PROBAR_LIMITES', 'ADMIN_PASSWORD',
  'CARPETA_WEB_ADMIN', 'CARPETA_WEB_LITE', 'CARPETA_WEB_PRO', 'CARPETA_BOLETAS', 'CARPETA_EVIDENCIAS', 'CARPETA_PORTAFOLIO']);

if (!local.JWT_SECRET) {
  console.error('✘ backend/.env no tiene JWT_SECRET: sin el mismo secreto no se pueden leer las cuentas bancarias cifradas');
  process.exit(1);
}

const fijas = [
  ['NODE_ENV', 'production'],
  ['TRUST_PROXY', '1'],
  ['DATABASE_URL', '${{Postgres.DATABASE_URL}}'],
  ['URL_PUBLICA_API', 'https://${{RAILWAY_PUBLIC_DOMAIN}}/api'],
  ['CORS_ORIGENES', 'https://${{RAILWAY_PUBLIC_DOMAIN}}'],
  ['CARPETA_BOLETAS', '/data/uploads/boletas'],
  ['CARPETA_EVIDENCIAS', '/data/uploads/evidencias'],
  ['CARPETA_PORTAFOLIO', '/data/uploads/portafolio'],
];
const copiadas = Object.entries(local).filter(([k]) => !OMITIR.has(k));
const brevo = local.BREVO_API_KEY ? [] : [['BREVO_API_KEY', '']];

const lineas = [
  '# Variables de DeliMaster para Railway. Pegar en el servicio → Variables → Raw Editor y BORRAR este archivo.',
  '# JWT_SECRET debe ser el mismo del PC: con él se cifran las cuentas bancarias y la tarjeta guardada.',
  ...[...fijas, ...copiadas, ...brevo].map(([k, v]) => `${k}=${v}`),
  '',
];
writeFileSync(destino, lineas.join('\n'));

console.log(`✔ ${path.relative(raiz, destino)} creado con ${fijas.length + copiadas.length + brevo.length} variables (sin mostrar valores):`);
console.log('  ' + [...fijas, ...copiadas, ...brevo].map(([k]) => k).join(', '));
if (brevo.length) console.log('  ! BREVO_API_KEY quedó vacía: complétala en Railway con la clave de Brevo para que salgan los correos.');
