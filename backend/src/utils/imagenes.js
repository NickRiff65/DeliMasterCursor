// Utilidades de imagen: lectura de datos EXIF de un JPEG (sin dependencias) y conversión a WebP.
//
// El EXIF sirve como control antifraude de las fotos de evidencia: una foto tomada con la cámara
// del teléfono trae la fecha original y el modelo del equipo; una captura de pantalla o una imagen
// descargada de internet, no. Eso no prueba fraude por sí solo, pero le avisa al equipo que la
// foto merece una segunda mirada cuando haya una disputa.
import sharp from 'sharp';

// ------------------------------------------------------------------ EXIF (solo JPEG)
// Un JPEG es una serie de segmentos: FF D8 (inicio), luego marcadores FF xx con su largo.
// El EXIF vive en el segmento APP1 (FF E1) que parte con "Exif\0\0", seguido de un bloque TIFF.
const TAMANOS_TIPO = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function lectorTiff(buffer, inicio) {
  const orden = buffer.toString('ascii', inicio, inicio + 2);
  const little = orden === 'II';
  if (!little && orden !== 'MM') return null;
  const u16 = (o) => (little ? buffer.readUInt16LE(o) : buffer.readUInt16BE(o));
  const u32 = (o) => (little ? buffer.readUInt32LE(o) : buffer.readUInt32BE(o));
  if (u16(inicio + 2) !== 42) return null;

  // Valor de una entrada: si no cabe en los 4 bytes del campo, el campo es un desplazamiento
  function valor(entrada, tipo, cantidad) {
    const total = (TAMANOS_TIPO[tipo] ?? 1) * cantidad;
    const desde = total <= 4 ? entrada + 8 : inicio + u32(entrada + 8);
    if (desde < 0 || desde + total > buffer.length) return null;
    switch (tipo) {
      case 2: return buffer.toString('ascii', desde, desde + cantidad).replace(/\0.*$/s, '').trim();
      case 3: return Array.from({ length: cantidad }, (_, i) => u16(desde + i * 2));
      case 4: return Array.from({ length: cantidad }, (_, i) => u32(desde + i * 4));
      case 5: return Array.from({ length: cantidad }, (_, i) => {
        const num = u32(desde + i * 8); const den = u32(desde + i * 8 + 4);
        return den ? num / den : 0;
      });
      default: return null;
    }
  }

  // Lee un directorio (IFD) y devuelve un mapa etiqueta → valor
  function leerIfd(desplazamiento) {
    const base = inicio + desplazamiento;
    if (desplazamiento <= 0 || base + 2 > buffer.length) return {};
    const entradas = u16(base);
    const salida = {};
    for (let i = 0; i < entradas; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > buffer.length) break;
      const v = valor(e, u16(e + 2), u32(e + 4));
      if (v !== null) salida[u16(e)] = v;
    }
    return salida;
  }
  return { leerIfd, primerIfd: u32(inicio + 4) };
}

// "2024:05:01 10:30:00" (formato EXIF) → "2024-05-01T10:30:00" (lo entiende PostgreSQL)
function fechaExifAIso(texto) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ ](\d{2}):(\d{2}):(\d{2})/.exec(texto ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

function coordenada(partes, referencia) {
  if (!Array.isArray(partes) || partes.length < 3) return null;
  const [grados, minutos, segundos] = partes;
  let valor = grados + minutos / 60 + segundos / 3600;
  if (referencia === 'S' || referencia === 'W') valor = -valor;
  return Math.round(valor * 1e7) / 1e7;
}

// Extrae del JPEG: fecha original de la foto, coordenadas GPS y equipo que la tomó.
// Lo que no venga queda en null (no todos los teléfonos guardan el GPS, por ejemplo).
export function extraerExif(buffer) {
  const vacio = { fechaOriginal: null, lat: null, lng: null, dispositivo: null };
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return vacio;
  try {
    let pos = 2;
    while (pos + 4 <= buffer.length) {
      if (buffer[pos] !== 0xff) break;
      const marcador = buffer[pos + 1];
      if (marcador === 0xda || marcador === 0xd9) break;            // empiezan los datos de la imagen
      const largo = buffer.readUInt16BE(pos + 2);
      if (largo < 2) break;
      if (marcador === 0xe1 && buffer.toString('ascii', pos + 4, pos + 10) === 'Exif\0\0') {
        const tiff = lectorTiff(buffer, pos + 10);
        if (!tiff) return vacio;
        const ifd0 = tiff.leerIfd(tiff.primerIfd);
        const exif = ifd0[0x8769] ? tiff.leerIfd(ifd0[0x8769][0]) : {};
        const gps = ifd0[0x8825] ? tiff.leerIfd(ifd0[0x8825][0]) : {};
        const marca = typeof ifd0[0x010f] === 'string' ? ifd0[0x010f] : null;
        const modelo = typeof ifd0[0x0110] === 'string' ? ifd0[0x0110] : null;
        // Muchas cámaras repiten la marca dentro del modelo («Canon» + «Canon EOS R5»): no duplicarla
        const dispositivo = modelo && marca && modelo.toLowerCase().startsWith(marca.toLowerCase())
          ? modelo
          : [marca, modelo].filter(Boolean).join(' ') || null;
        return {
          fechaOriginal: fechaExifAIso(exif[0x9003]),
          lat: coordenada(gps[0x0002], gps[0x0001]),
          lng: coordenada(gps[0x0004], gps[0x0003]),
          dispositivo,
        };
      }
      pos += 2 + largo;
    }
  } catch { /* un EXIF mal formado no debe botar la subida de la foto */ }
  return vacio;
}

// Sospechosa: sin fecha original ni equipo que la tomó. Es lo esperable de una captura de
// pantalla o de una imagen descargada, que no pasaron por la cámara del teléfono.
export function esSospechosa(exif) {
  return !exif || (!exif.fechaOriginal && !exif.dispositivo);
}

// ------------------------------------------------------------------ conversión a WebP
// Toda imagen que se guarda queda en WebP: pesa mucho menos que el JPEG/PNG original y la app
// lo muestra igual. Calidad 82 y lado mayor de 1600 px (sin agrandar las más chicas).
export async function aWebp(buffer) {
  try {
    const convertido = await sharp(buffer)
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { buffer: convertido, ext: 'webp', mime: 'image/webp' };
  } catch {
    return null;   // el almacén cae al original cuando la conversión no resulta
  }
}
