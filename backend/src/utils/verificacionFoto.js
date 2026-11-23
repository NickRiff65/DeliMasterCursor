// Verificación de las fotos (solicitud, chat y evidencias): ¿es una foto real, tomada en el momento?
//
// Se usan los datos que la cámara guarda dentro de la foto (EXIF): fecha y hora en que se tomó,
// equipo, programa con que se guardó y, si los trae, la ubicación. Se leen del archivo cuando
// llegan en él; si no (la app reduce la foto antes de subirla y eso los borra), se usan los que la
// app leyó del original y envía aparte. No es una prueba absoluta —los datos se pueden alterar—,
// pero detecta lo común: capturas de pantalla, imágenes descargadas, fotos viejas o editadas.
import { z } from 'zod';
import { distanciaMetros, RADIO_LLEGADA_M } from './geo.js';

export const MINUTOS_EN_EL_MOMENTO = 120;   // tomada hasta 2 horas antes de subirla
export const HORAS_RECIENTE = 24;           // más que esto es una foto antigua
const TOLERANCIA_FUTURO_MIN = 10;           // relojes un poco adelantados
// Programas de edición que suelen quedar escritos en el campo "Software" de la foto
const EDITORES = /photoshop|lightroom|snapseed|picsart|canva|gimp|facetune|meitu|vsco|pixlr|fotor|airbrush|remini|faceapp|editor/i;

// Lo que la app puede enviar junto a la foto (leído del original, antes de reducirla)
export const esquemaMetadatosFoto = z.object({
  tomada_con: z.enum(['camara', 'galeria', 'web']).optional(),
  fecha_original: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Fecha de la foto no válida').optional(),
  dispositivo: z.string().trim().max(120).optional(),
  software: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).strict().optional();

// "Ahora" en hora de Chile y con el formato de la fecha EXIF, que no trae zona horaria
function ahoraEnChile(ahora) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(ahora).replace(' ', 'T');
}
const minutosEntre = (antes, despues) => Math.round((Date.parse(`${despues}Z`) - Date.parse(`${antes}Z`)) / 60_000);

// archivo: lo leído del EXIF del archivo subido · app: los metadatos que envió la app
// lugar: punto del trabajo que marcó el cliente ({ lat, lng }), si lo marcó
export function evaluarFoto({ archivo = {}, app = {}, lugar = null, ahora = new Date() } = {}) {
  const deArchivo = Boolean(archivo.fechaOriginal || archivo.dispositivo);
  const fuente = deArchivo ? archivo : {};
  const fecha = fuente.fechaOriginal ?? app.fecha_original ?? null;
  const dispositivo = fuente.dispositivo ?? app.dispositivo ?? null;
  const software = archivo.software ?? app.software ?? null;
  const lat = archivo.lat ?? app.lat ?? null;
  const lng = archivo.lng ?? app.lng ?? null;

  const motivos = [];
  let minutos = null;
  if (!fecha && !dispositivo) {
    motivos.push('sin_datos');
  } else {
    if (!fecha) motivos.push('sin_fecha');
    else {
      minutos = minutosEntre(fecha, ahoraEnChile(ahora));
      if (minutos < -TOLERANCIA_FUTURO_MIN) motivos.push('fecha_futura');
      else if (minutos > HORAS_RECIENTE * 60) motivos.push('antigua');
    }
    if (software && EDITORES.test(software)) motivos.push('editada');
  }
  let distancia = null;
  if (lat != null && lng != null && lugar?.lat != null && lugar?.lng != null) {
    distancia = distanciaMetros(Number(lugar.lat), Number(lugar.lng), lat, lng);
    if (distancia > RADIO_LLEGADA_M) motivos.push('lejos');
  }
  return {
    estado: motivos.includes('sin_datos') ? 'sin_datos' : motivos.length ? 'revisar' : 'verificada',
    motivos,
    fecha, dispositivo, software, lat, lng, distancia, minutos,
    origen: deArchivo ? 'archivo' : fecha || dispositivo ? 'app' : null,
    tomada_con: app.tomada_con ?? null,
  };
}

const fechaCorta = (fecha) => new Date(`${fecha}Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  .replace('.', '');

// Texto corto para las partes (sin ubicación ni equipo: eso lo ve solo el equipo de DeliMaster)
export function textoVerificacion({ estado, motivos = [], fecha, minutos }) {
  if (estado === 'verificada') {
    return minutos != null && minutos <= MINUTOS_EN_EL_MOMENTO ? 'Foto tomada en el momento' : 'Foto tomada el mismo día';
  }
  if (estado === 'sin_datos') return 'Sin datos de cámara: puede ser una captura o una imagen descargada';
  const textos = {
    antigua: fecha ? `Foto antigua: se tomó el ${fechaCorta(fecha)}` : 'Foto antigua',
    fecha_futura: 'La fecha de la foto no calza con la de hoy',
    sin_fecha: 'La foto no trae la fecha en que se tomó',
    editada: 'La foto fue editada con un programa',
    lejos: 'Se tomó lejos del lugar del trabajo',
  };
  return motivos.map((m) => textos[m]).filter(Boolean).join(' · ');
}
