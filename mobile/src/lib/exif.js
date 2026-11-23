// Datos de la cámara (EXIF) de una foto: fecha y hora en que se tomó, equipo, programa con que se
// guardó y ubicación. Se leen del ORIGINAL antes de reducir la foto (reducirla los borra) y viajan
// aparte al servidor, que decide si la foto es real y se tomó en el momento.
//   · En el celular, expo-image-picker entrega el EXIF como objeto (exif: true): metadatosDeExif().
//   · En la web llega el archivo tal cual: se leen sus bytes con metadatosDeJpeg().

// "2026:11:20 11:30:00" → "2026-11-20T11:30:00"
function fechaIso(texto) {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(texto ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

// Coordenada en grados decimales, desde un número, "36/1,36/1,0/1", "36,36,0" o [36, 36, 0]
function coordenada(valor, referencia) {
  if (valor == null || valor === '' || (Array.isArray(valor) && !valor.length)) return null;
  let grados = null;
  if (typeof valor === 'number') grados = valor;
  else {
    const partes = (Array.isArray(valor) ? valor : String(valor ?? '').split(','))
      .map((p) => { const [n, d] = String(p).split('/').map(Number); return d ? n / d : n; });
    if (partes.length && partes.every((p) => Number.isFinite(p))) {
      grados = partes[0] + (partes[1] ?? 0) / 60 + (partes[2] ?? 0) / 3600;
    }
  }
  if (grados == null || !Number.isFinite(grados)) return null;
  if (/^[SW]/i.test(String(referencia ?? '')) && grados > 0) grados = -grados;
  return Math.round(grados * 1e7) / 1e7;
}

const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);

function dispositivoDe(marca, modelo) {
  if (modelo && marca && modelo.toLowerCase().startsWith(marca.toLowerCase())) return modelo;
  return [marca, modelo].filter(Boolean).join(' ') || null;
}

// Solo lo que trae algún valor (el servidor valida cada campo)
function limpiar(m) {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v != null && v !== ''));
}

// EXIF que entrega expo-image-picker: en Android viene plano; en iOS, con sub-diccionarios
// ("{Exif}", "{TIFF}", "{GPS}"). Se buscan los mismos datos en ambas formas.
export function metadatosDeExif(exif) {
  if (!exif || typeof exif !== 'object') return {};
  const exifDict = exif['{Exif}'] ?? {};
  const tiff = exif['{TIFF}'] ?? {};
  const gps = exif['{GPS}'] ?? exif.GPS ?? {};
  const valor = (...claves) => {
    for (const fuente of [exif, exifDict, tiff]) for (const c of claves) if (fuente[c] != null) return fuente[c];
    return null;
  };
  const lat = exif.GPSLatitude != null ? coordenada(exif.GPSLatitude, exif.GPSLatitudeRef) : coordenada(gps.Latitude, gps.LatitudeRef);
  const lng = exif.GPSLongitude != null ? coordenada(exif.GPSLongitude, exif.GPSLongitudeRef) : coordenada(gps.Longitude, gps.LongitudeRef);
  return limpiar({
    fecha_original: fechaIso(valor('DateTimeOriginal', 'DateTimeDigitized')),
    dispositivo: dispositivoDe(texto(valor('Make')), texto(valor('Model'))),
    software: texto(valor('Software')),
    lat: lat != null && Math.abs(lat) <= 90 ? lat : null,
    lng: lng != null && Math.abs(lng) <= 180 ? lng : null,
  });
}

// ------------------------------------------------------------------ EXIF desde los bytes (web)
const TAMANOS_TIPO = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function leerTiff(vista, inicio) {
  const orden = String.fromCharCode(vista.getUint8(inicio), vista.getUint8(inicio + 1));
  const le = orden === 'II';
  if (!le && orden !== 'MM') return null;
  const u16 = (o) => vista.getUint16(o, le);
  const u32 = (o) => vista.getUint32(o, le);
  if (u16(inicio + 2) !== 42) return null;
  const ascii = (desde, n) => {
    let s = '';
    for (let i = 0; i < n && desde + i < vista.byteLength; i++) {
      const c = vista.getUint8(desde + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  function valor(e, tipo, cantidad) {
    const total = (TAMANOS_TIPO[tipo] ?? 1) * cantidad;
    const desde = total <= 4 ? e + 8 : inicio + u32(e + 8);
    if (desde < 0 || desde + total > vista.byteLength) return null;
    if (tipo === 2) return ascii(desde, cantidad);
    if (tipo === 3) return Array.from({ length: cantidad }, (_, i) => u16(desde + i * 2));
    if (tipo === 4) return Array.from({ length: cantidad }, (_, i) => u32(desde + i * 4));
    if (tipo === 5) {
      return Array.from({ length: cantidad }, (_, i) => {
        const d = u32(desde + i * 8 + 4);
        return d ? u32(desde + i * 8) / d : 0;
      });
    }
    return null;
  }
  function ifd(desplazamiento) {
    const base = inicio + desplazamiento;
    if (desplazamiento <= 0 || base + 2 > vista.byteLength) return {};
    const salida = {};
    for (let i = 0; i < u16(base); i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > vista.byteLength) break;
      const v = valor(e, u16(e + 2), u32(e + 4));
      if (v !== null) salida[u16(e)] = v;
    }
    return salida;
  }
  return { ifd, primero: u32(inicio + 4) };
}

// bytes: Uint8Array del archivo JPEG original
export function metadatosDeJpeg(bytes) {
  try {
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
    const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0xff) break;
      const marcador = bytes[pos + 1];
      if (marcador === 0xda || marcador === 0xd9) break;
      const largo = vista.getUint16(pos + 2);
      if (largo < 2) break;
      const cabecera = String.fromCharCode(...bytes.subarray(pos + 4, pos + 10));
      if (marcador === 0xe1 && cabecera === 'Exif\0\0') {
        const tiff = leerTiff(vista, pos + 10);
        if (!tiff) return {};
        const ifd0 = tiff.ifd(tiff.primero);
        const exif = ifd0[0x8769] ? tiff.ifd(ifd0[0x8769][0]) : {};
        const gps = ifd0[0x8825] ? tiff.ifd(ifd0[0x8825][0]) : {};
        return metadatosDeExif({
          DateTimeOriginal: exif[0x9003] ?? exif[0x9004],
          Make: ifd0[0x010f], Model: ifd0[0x0110], Software: ifd0[0x0131],
          GPSLatitude: gps[0x0002], GPSLatitudeRef: gps[0x0001],
          GPSLongitude: gps[0x0004], GPSLongitudeRef: gps[0x0003],
        });
      }
      pos += 2 + largo;
    }
  } catch { /* un EXIF mal formado no impide subir la foto */ }
  return {};
}

// base64 (sin el prefijo data:) → bytes
export function bytesDeBase64(base64) {
  const binario = globalThis.atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
