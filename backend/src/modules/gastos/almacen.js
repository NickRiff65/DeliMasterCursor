// Almacenamiento de imágenes privadas: fotos de boletas (HU-09) y fotos de evidencia de un trabajo.
// En desarrollo se guardan en backend/uploads (excluida de Git). En producción este módulo
// se reemplaza por un almacenamiento de objetos (como indica la arquitectura del informe).
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const SUBIDAS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'uploads');
const MAX_BYTES = 6 * 1024 * 1024;

// Solo imágenes JPEG, PNG o WebP, reconocidas por su contenido (no por lo que diga el cliente)
function tipoDeImagen(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { ext: 'png', mime: 'image/png' };
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export const MIME_POR_EXTENSION = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function decodificarImagen(base64) {
  const limpio = String(base64).replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(limpio, 'base64');
  if (!buffer.length) throw new AppError('La imagen está vacía', 422, 'IMAGEN_INVALIDA');
  if (buffer.length > MAX_BYTES) throw new AppError('La foto es demasiado grande (máximo 6 MB)', 413, 'IMAGEN_MUY_GRANDE');
  const tipo = tipoDeImagen(buffer);
  if (!tipo) throw new AppError('Solo se aceptan fotos JPG, PNG o WebP', 422, 'IMAGEN_INVALIDA');
  return { buffer, ...tipo };
}

// Un almacén por tipo de imagen: carpeta propia y enlaces firmados que solo sirven para ese tipo.
// Las imágenes son privadas: se entregan con un enlace que solo sirve para una imagen y vence en
// 1 hora. Así la app puede mostrarlas en <Image> (que no envía el token de sesión) sin exponerlas.
export function crearAlmacen({ carpeta, prefijo, ruta }) {
  const dir = () => carpeta();
  const firmar = (id, vence) => createHmac('sha256', config.jwtSecret).update(`${prefijo}:${id}:${vence}`).digest('hex');
  return {
    async guardar({ buffer, ext }) {
      await mkdir(dir(), { recursive: true });
      const archivo = `${randomUUID()}.${ext}`;
      await writeFile(path.join(dir(), archivo), buffer);
      return archivo;
    },
    leer: (archivo) => readFile(path.join(dir(), path.basename(archivo))),
    eliminar: (archivo) => unlink(path.join(dir(), path.basename(archivo))).catch(() => {}),
    urlFirmada(urlApi, id, segundos = 3600) {
      const vence = Math.floor(Date.now() / 1000) + segundos;
      return `${urlApi}/${ruta}/${id}/imagen?vence=${vence}&firma=${firmar(id, vence)}`;
    },
    firmaValida(id, vence, firma) {
      if (!/^\d+$/.test(String(vence)) || Number(vence) < Date.now() / 1000) return false;
      const esperada = Buffer.from(firmar(id, vence));
      const recibida = Buffer.from(String(firma ?? ''));
      return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
    },
  };
}

// La carpeta se lee en cada uso para que las pruebas puedan cambiarla con una variable de entorno
export const boletas = crearAlmacen({
  carpeta: () => process.env.CARPETA_BOLETAS ?? path.join(SUBIDAS, 'boletas'), prefijo: 'boleta', ruta: 'boletas',
});
export const evidencias = crearAlmacen({
  carpeta: () => process.env.CARPETA_EVIDENCIAS ?? path.join(SUBIDAS, 'evidencias'), prefijo: 'evidencia', ruta: 'evidencias',
});

// Boletas (HU-09): se mantienen las funciones que ya usa el panel contable
export const { guardar, leer, eliminar, urlFirmada, firmaValida } = boletas;
