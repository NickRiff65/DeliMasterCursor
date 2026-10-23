// HU-09: lectura automática de boletas (OCR).
// - Con GOOGLE_VISION_API_KEY en .env → Google Cloud Vision (la opción definida en el informe).
// - Sin clave → Tesseract, lector gratuito y local (desarrollo y demostraciones, sin cuenta ni tarjeta).
// Siempre hay respaldo manual: el lector solo PROPONE el monto y el prestador lo confirma o corrige.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_TESSERACT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.cache', 'tesseract');

// ------------------------------------------------------------------ extracción del total
// Montos chilenos: "14.780", "$14.780", "14780". Sin decimales.
function montos(linea) {
  return [...linea.matchAll(/\$?\s*(\d{1,3}(?:\.\d{3})+|\d{3,7})(?!\d)/g)]
    .map((m) => Number(m[1].replace(/\./g, '')))
    .filter((n) => n >= 100 && n <= 10_000_000);
}

// Busca el total de una boleta en el texto leído. Prefiere la línea que dice "TOTAL"
// (y no "SUBTOTAL"); si no la encuentra, propone el mayor monto con confianza baja.
export function extraerTotal(texto) {
  const lineas = (texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const conTotal = lineas.filter((l) => /\btotal\b/i.test(l) && !/sub\s*-?\s*total/i.test(l));
  const candidatos = conTotal.flatMap(montos);
  if (candidatos.length) return { monto: Math.max(...candidatos), confianza: 0.9, fuente: 'linea_total' };

  const todos = lineas.flatMap(montos);
  if (todos.length) return { monto: Math.max(...todos), confianza: 0.4, fuente: 'mayor_monto' };
  return { monto: null, confianza: 0, fuente: null };
}

// ------------------------------------------------------------------ lectores
const googleVision = {
  nombre: 'google_vision',
  async leer(imagen) {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imagen.toString('base64') },
          features: [{ type: 'TEXT_DETECTION' }],
          imageContext: { languageHints: ['es'] },
        }],
      }),
    });
    if (!res.ok) throw new Error(`Google Cloud Vision respondió ${res.status}`);
    const datos = await res.json();
    return { texto: datos.responses?.[0]?.fullTextAnnotation?.text ?? '', confianzaLector: null };
  },
};

let trabajador = null; // se reutiliza: crear el lector toma unos segundos
const tesseract = {
  nombre: 'tesseract',
  async leer(imagen) {
    if (!trabajador) {
      const { createWorker } = await import('tesseract.js');
      trabajador = await createWorker('spa', 1, { cachePath: CACHE_TESSERACT });
    }
    const { data } = await trabajador.recognize(imagen);
    return { texto: data.text, confianzaLector: data.confidence / 100 };
  },
};

let lectorDePrueba = null;
function lectorActual() {
  if (lectorDePrueba) return lectorDePrueba;
  return process.env.GOOGLE_VISION_API_KEY ? googleVision : tesseract;
}

// Lee una boleta y propone el total. Nunca lanza error: si falla, devuelve monto null
// para que la app pida el ingreso manual.
export async function leerBoleta(imagen) {
  const lector = lectorActual();
  try {
    const { texto, confianzaLector } = await lector.leer(imagen);
    const total = extraerTotal(texto);
    const confianza = confianzaLector == null ? total.confianza : Math.min(total.confianza, confianzaLector);
    return { ...total, confianza: Math.round(confianza * 1000) / 1000, texto, lector: lector.nombre };
  } catch (err) {
    return { monto: null, confianza: 0, fuente: null, texto: '', lector: lector.nombre, error: err.message };
  }
}

// Solo para pruebas automáticas
export function usarLector(otro) {
  lectorDePrueba = otro;
}

export async function cerrarLector() {
  await trabajador?.terminate();
  trabajador = null;
}
