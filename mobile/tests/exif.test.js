import { bytesDeBase64, metadatosDeExif, metadatosDeJpeg } from '../src/lib/exif';

// Datos de la cámara de una foto, leídos del original antes de reducirla (ver lib/exif.js)
describe('EXIF que entrega expo-image-picker', () => {
  test('Android: viene plano, con la ubicación en grados decimales', () => {
    expect(metadatosDeExif({
      DateTimeOriginal: '2026:11:20 11:30:00', Make: 'samsung', Model: 'SM-A515F', Software: 'A515FXXU5',
      GPSLatitude: 36.6066, GPSLatitudeRef: 'S', GPSLongitude: 72.1034, GPSLongitudeRef: 'W',
    })).toEqual({
      fecha_original: '2026-11-20T11:30:00', dispositivo: 'samsung SM-A515F', software: 'A515FXXU5', lat: -36.6066, lng: -72.1034,
    });
  });

  test('iOS: viene con sub-diccionarios {Exif}, {TIFF} y {GPS}', () => {
    expect(metadatosDeExif({
      '{Exif}': { DateTimeOriginal: '2026:11:20 09:05:10' },
      '{TIFF}': { Make: 'Apple', Model: 'iPhone 13', Software: '17.1' },
      '{GPS}': { Latitude: 36.6, LatitudeRef: 'S', Longitude: 72.1, LongitudeRef: 'W' },
    })).toEqual({ fecha_original: '2026-11-20T09:05:10', dispositivo: 'Apple iPhone 13', software: '17.1', lat: -36.6, lng: -72.1 });
  });

  test('sin EXIF (captura o imagen descargada) no informa nada', () => {
    expect(metadatosDeExif(null)).toEqual({});
    expect(metadatosDeExif({})).toEqual({});
  });
});

// JPEG mínimo con EXIF (como el de una cámara): fecha, marca, modelo y GPS, en formato little-endian
function jpegConExif() {
  const texto = (s) => [...s, '\0'].map((c) => c.charCodeAt(0));
  const marca = texto('Canon'); const modelo = texto('Canon EOS R5'); const fecha = texto('2026:11:10 15:30:45');
  const ifd0 = 8; let p = ifd0 + 2 + 4 * 12 + 4;
  const offMarca = p; p += marca.length;
  const offModelo = p; p += modelo.length;
  const offExif = p; p += 2 + 12 + 4;
  const offFecha = p; p += fecha.length;
  const offGps = p; p += 2 + 4 * 12 + 4;
  const offLat = p; p += 24;
  const offLng = p; p += 24;
  const tiff = new Uint8Array(p);
  const v = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49], 0); v.setUint16(2, 42, true); v.setUint32(4, ifd0, true);
  const entrada = (off, tag, tipo, cant, valor) => {
    v.setUint16(off, tag, true); v.setUint16(off + 2, tipo, true); v.setUint32(off + 4, cant, true);
    if (Array.isArray(valor)) tiff.set(valor, off + 8); else v.setUint32(off + 8, valor, true);
  };
  v.setUint16(ifd0, 4, true);
  entrada(ifd0 + 2, 0x010f, 2, marca.length, offMarca);
  entrada(ifd0 + 14, 0x0110, 2, modelo.length, offModelo);
  entrada(ifd0 + 26, 0x8769, 4, 1, offExif);
  entrada(ifd0 + 38, 0x8825, 4, 1, offGps);
  tiff.set(marca, offMarca); tiff.set(modelo, offModelo);
  v.setUint16(offExif, 1, true);
  entrada(offExif + 2, 0x9003, 2, fecha.length, offFecha);
  tiff.set(fecha, offFecha);
  const racional = (off, num) => { v.setUint32(off, num, true); v.setUint32(off + 4, 1, true); };
  racional(offLat, 36); racional(offLat + 8, 36); racional(offLat + 16, 0);
  racional(offLng, 72); racional(offLng + 8, 6); racional(offLng + 16, 0);
  v.setUint16(offGps, 4, true);
  entrada(offGps + 2, 0x0001, 2, 2, [0x53, 0, 0, 0]);   // S
  entrada(offGps + 14, 0x0002, 5, 3, offLat);
  entrada(offGps + 26, 0x0003, 2, 2, [0x57, 0, 0, 0]);  // W
  entrada(offGps + 38, 0x0004, 5, 3, offLng);
  const app1 = [...texto('Exif'), 0, ...tiff];
  const largo = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, largo >> 8, largo & 0xff, ...app1, 0xff, 0xd9]);
}

describe('EXIF desde los bytes del archivo (versión web)', () => {
  test('lee fecha, equipo y ubicación de un JPEG con EXIF', () => {
    expect(metadatosDeJpeg(jpegConExif())).toEqual({
      fecha_original: '2026-11-10T15:30:45', dispositivo: 'Canon EOS R5', lat: -36.6, lng: -72.1,
    });
  });

  test('un archivo sin EXIF o que no es JPEG no informa nada', () => {
    expect(metadatosDeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 1]))).toEqual({});
    expect(metadatosDeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({});
  });

  test('convierte el base64 del archivo a bytes', () => {
    expect([...bytesDeBase64('/9j/4QA=')]).toEqual([0xff, 0xd8, 0xff, 0xe1, 0x00]);
  });
});
