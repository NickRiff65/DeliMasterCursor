// Cifrado de datos sensibles que se guardan en la base (por ejemplo, el identificador de la tarjeta
// guardada que entrega Transbank). AES-256-GCM con una clave derivada del secreto del servidor:
// si alguien copia la base de datos, sin el .env no puede usar esos identificadores.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config/env.js';

const clave = (proposito) => Buffer.from(hkdfSync('sha256', config.jwtSecret, 'delimaster', `cifrado:${proposito}`, 32));

// Devuelve "iv.etiqueta.texto" en base64url
export function cifrar(texto, proposito) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', clave(proposito), iv);
  const datos = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return [iv, cifrador.getAuthTag(), datos].map((b) => b.toString('base64url')).join('.');
}

export function descifrar(cifrado, proposito) {
  const [iv, etiqueta, datos] = cifrado.split('.').map((p) => Buffer.from(p, 'base64url'));
  const descifrador = createDecipheriv('aes-256-gcm', clave(proposito), iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(datos), descifrador.final()]).toString('utf8');
}
