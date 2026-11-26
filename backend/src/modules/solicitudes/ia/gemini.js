// Proveedor de IA para la detección por foto: Gemini, de Google (tiene un nivel gratuito para pruebas).
// Ojo con el nivel gratuito: según las condiciones de Google, lo que se envía puede usarse para mejorar
// sus productos y revisarlo personas; por eso la política de privacidad lo informa.
// Recibe las fotos ya preparadas (JPEG en base64) y devuelve la respuesta validada con el esquema,
// o null si un filtro de seguridad la bloqueó, junto con los tokens usados.
import { GoogleGenAI, ApiError, ThinkingLevel } from '@google/genai';
import { z } from 'zod';

// Gemini 3.5 Flash (versión estable): en la prueba del 22-11-2026 con la clave del equipo respondió bien,
// mientras que gemini-3.8-flash estaba saturado («alta demanda») y el alias «gemini-flash-latest» no está
// habilitado para esa clave. Se cambia con GEMINI_MODELO en backend/.env.
export const modeloGemini = (env = process.env) => env.GEMINI_MODELO || 'gemini-3.5-flash';

export const claveGemini = (env = process.env) => Boolean(env.GEMINI_API_KEY);

// Respaldo automático (26-11-2026): en el nivel gratuito cada modelo tiene su propia cuota y a ratos se satura.
// Si el modelo responde 503 (alta demanda), 429 (cuota agotada), 404 (ya no está disponible) o 500, se prueba el
// siguiente de la lista. GEMINI_MODELOS_RESPALDO (separados por coma) cambia la lista; vacía, no hay respaldo.
// En la prueba del 26-11 con la clave del equipo, los dos «lite» respondieron con fotos y el esquema JSON.
export const RESPALDO_GEMINI = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
const ESTADOS_RESPALDO = new Set([404, 429, 500, 503]);

export function modelosGemini(env = process.env) {
  const respaldo = env.GEMINI_MODELOS_RESPALDO !== undefined
    ? env.GEMINI_MODELOS_RESPALDO.split(',').map((m) => m.trim()).filter(Boolean)
    : RESPALDO_GEMINI;
  return [...new Set([modeloGemini(env), ...respaldo])];
}

// Motivos de término que significan que la respuesta se bloqueó por seguridad (no es una falla técnica)
const BLOQUEOS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'RECITATION']);

// JSON Schema que acepta Gemini: el mismo esquema zod de la respuesta, sin la clave «$schema»
function esquemaJson(esquema) {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(esquema);
  return resto;
}

// Si el modelo está saturado (503, frecuente en el nivel gratuito) se reintenta una vez tras ~1 s; el tope
// de consultas (429) no se reintenta aquí para no dejar al cliente esperando (el script de evaluación sí espera)
let cliente = null;
const nuevoCliente = () => new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { timeout: 60_000, retryOptions: { attempts: 2, initialDelay: 1, httpStatusCodes: [500, 503] } },
});

export async function consultarGemini(imagenes, opciones, clienteIa = (cliente ??= nuevoCliente()), modelos = modelosGemini()) {
  let ultimoError;
  for (const modelo of modelos) {
    try {
      return await consultarModelo(clienteIa, modelo, imagenes, opciones);
    } catch (err) {
      if (!(err instanceof ApiError) || !ESTADOS_RESPALDO.has(err.status)) throw err;
      ultimoError = err;
      // Sin fotos ni datos del cliente: solo qué modelo falló y con qué estado
      console.warn(JSON.stringify({ evento: 'ia_fotos_respaldo', modelo, estado: err.status }));
    }
  }
  throw ultimoError;
}

async function consultarModelo(clienteIa, modelo, imagenes, { instrucciones, esquema, texto }) {
  const respuesta = await clienteIa.models.generateContent({
    model: modelo,
    contents: [{
      role: 'user',
      parts: [
        // «Foto N» antes de cada imagen: así la IA puede indicar qué foto muestra cada trabajo
        ...imagenes.flatMap((data, i) => [{ text: `Foto ${i + 1}:` }, { inlineData: { mimeType: 'image/jpeg', data } }]),
        { text: texto },
      ],
    }],
    config: {
      systemInstruction: instrucciones,
      responseMimeType: 'application/json',
      responseJsonSchema: esquemaJson(esquema),
      // Clasificar una foto no necesita un razonamiento largo: con «bajo» responde en pocos segundos
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  const datosUso = respuesta.usageMetadata ?? {};
  const uso = {
    entrada: datosUso.promptTokenCount ?? 0,
    salida: (datosUso.candidatesTokenCount ?? 0) + (datosUso.thoughtsTokenCount ?? 0),
  };
  const version = respuesta.modelVersion ?? modelo;
  const motivo = respuesta.candidates?.[0]?.finishReason;
  if (respuesta.promptFeedback?.blockReason || BLOQUEOS.has(motivo)) return { resultado: null, uso, modelo: version };

  const texto_ = respuesta.text;
  if (!texto_) throw new Error(`Respuesta sin datos (finishReason: ${motivo ?? 'desconocido'})`);
  let datos;
  try {
    datos = JSON.parse(texto_);
  } catch {
    throw new Error(`Respuesta que no es JSON (finishReason: ${motivo ?? 'desconocido'})`);
  }
  return { resultado: esquema.parse(datos), uso, modelo: version };
}

export const describirErrorGemini = (err) => (err instanceof ApiError ? `Gemini ${err.status}` : null);
