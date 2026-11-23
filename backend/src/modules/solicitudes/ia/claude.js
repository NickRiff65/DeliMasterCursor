// Proveedor de IA para la detección por foto: Claude Opus 5.5, de Anthropic (de pago por uso).
// Recibe las fotos ya preparadas (JPEG en base64) y devuelve la respuesta validada con el esquema,
// o null si el modelo declinó analizarlas, junto con los tokens usados.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

export const MODELO_CLAUDE = 'claude-opus-5-5';
// Precio por millón de tokens (US$) para calcular el costo en el script de evaluación
export const PRECIO_CLAUDE = { entrada: 4, salida: 20 };

export const claveClaude = (env = process.env) => Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);

// El cliente se crea al primer uso y lee la clave de ANTHROPIC_API_KEY (backend/.env)
let cliente = null;

export async function consultarClaude(imagenes, { instrucciones, esquema, texto }, clienteIa = (cliente ??= new Anthropic({ timeout: 60_000, maxRetries: 1 }))) {
  const respuesta = await clienteIa.beta.messages.parse({
    model: MODELO_CLAUDE,
    max_tokens: 4000,
    // Si un filtro de seguridad declina la consulta, la API la repite en otro modelo dentro de la misma llamada
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(esquema) },
    system: instrucciones,
    messages: [{
      role: 'user',
      content: [
        // «Foto N» antes de cada imagen: así la IA puede indicar qué foto muestra cada trabajo
        ...imagenes.flatMap((data, i) => [
          { type: 'text', text: `Foto ${i + 1}:` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        ]),
        { type: 'text', text: texto },
      ],
    }],
  });
  const uso = { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens };
  // Con el respaldo automático, «refusal» solo llega si también declinó el modelo de respaldo
  if (respuesta.stop_reason === 'refusal') return { resultado: null, uso, modelo: respuesta.model };
  if (!respuesta.parsed_output) throw new Error(`Respuesta sin datos (stop_reason: ${respuesta.stop_reason})`);
  return { resultado: respuesta.parsed_output, uso, modelo: respuesta.model };
}

export const describirErrorClaude = (err) => (err instanceof Anthropic.APIError ? `Anthropic ${err.status}` : null);
