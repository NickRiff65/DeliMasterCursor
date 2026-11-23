import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import './helpers/db.js';   // deja NODE_ENV=test antes de cargar la configuración

// Proveedores de IA de la detección por foto: cuál se elige según backend/.env y cómo se arma cada
// consulta. Usan clientes falsos: nunca se llama a Anthropic ni a Google.
const esquema = z.object({
  categoria: z.enum(['electricidad', 'ninguna']),
  confianza: z.enum(['alta', 'media', 'baja']),
  descripcion: z.string(),
  peligro: z.string().nullable(),
  pregunta: z.string().nullable(),
});
const opciones = { instrucciones: 'Instrucciones de prueba', esquema, texto: 'Esta es la foto del problema.' };
const respuesta = { categoria: 'electricidad', confianza: 'alta', descripcion: 'Enchufe quemado.', peligro: null, pregunta: null };

describe('Proveedores de IA para la detección por foto', () => {
  let elegirProveedor, consultarClaude, consultarGemini;
  before(async () => {
    ({ elegirProveedor } = await import('../src/modules/solicitudes/interpreteFoto.js'));
    ({ consultarClaude } = await import('../src/modules/solicitudes/ia/claude.js'));
    ({ consultarGemini } = await import('../src/modules/solicitudes/ia/gemini.js'));
  });

  test('elige el proveedor indicado en IA_PROVEEDOR, o el primero que tenga clave', () => {
    assert.equal(elegirProveedor({}), null);
    assert.equal(elegirProveedor({ GEMINI_API_KEY: 'g' }), 'gemini');
    assert.equal(elegirProveedor({ ANTHROPIC_API_KEY: 'a' }), 'claude');
    assert.equal(elegirProveedor({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }), 'claude');
    assert.equal(elegirProveedor({ IA_PROVEEDOR: 'Gemini', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }), 'gemini');
    // El proveedor pedido sin su clave, o uno que no existe: no hay detección (no se cambia a otro en silencio)
    assert.equal(elegirProveedor({ IA_PROVEEDOR: 'gemini', ANTHROPIC_API_KEY: 'a' }), null);
    assert.equal(elegirProveedor({ IA_PROVEEDOR: 'otro', GEMINI_API_KEY: 'g' }), null);
  });

  test('Gemini: envía las fotos, las instrucciones y el esquema JSON, y valida la respuesta', async () => {
    let pedido;
    const cliente = { models: { generateContent: async (p) => {
      pedido = p;
      return {
        text: JSON.stringify(respuesta), modelVersion: 'gemini-3.8-flash',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1300, candidatesTokenCount: 60, thoughtsTokenCount: 200 },
      };
    } } };
    const r = await consultarGemini(['FOTO1', 'FOTO2'], opciones, cliente);
    assert.deepEqual(r, { resultado: respuesta, uso: { entrada: 1300, salida: 260 }, modelo: 'gemini-3.8-flash' });
    assert.equal(pedido.model, 'gemini-3.5-flash');
    assert.deepEqual(pedido.config.thinkingConfig, { thinkingLevel: 'LOW' });
    assert.deepEqual(pedido.contents[0].parts, [
      { text: 'Foto 1:' }, { inlineData: { mimeType: 'image/jpeg', data: 'FOTO1' } },
      { text: 'Foto 2:' }, { inlineData: { mimeType: 'image/jpeg', data: 'FOTO2' } },
      { text: 'Esta es la foto del problema.' },
    ]);
    assert.equal(pedido.config.systemInstruction, 'Instrucciones de prueba');
    assert.equal(pedido.config.responseMimeType, 'application/json');
    assert.equal(pedido.config.responseJsonSchema.$schema, undefined);
    assert.deepEqual(pedido.config.responseJsonSchema.properties.categoria.enum, ['electricidad', 'ninguna']);
  });

  test('Gemini: un bloqueo de seguridad no es un error; una respuesta inválida, sí', async () => {
    const con = (r) => ({ models: { generateContent: async () => r } });
    assert.equal((await consultarGemini(['F'], opciones, con({ candidates: [{ finishReason: 'IMAGE_SAFETY' }] }))).resultado, null);
    assert.equal((await consultarGemini(['F'], opciones, con({ promptFeedback: { blockReason: 'SAFETY' } }))).resultado, null);
    await assert.rejects(consultarGemini(['F'], opciones, con({ text: 'no es json', candidates: [{ finishReason: 'STOP' }] })), /no es JSON/);
    await assert.rejects(consultarGemini(['F'], opciones, con({ text: JSON.stringify({ categoria: 'otra' }), candidates: [{ finishReason: 'STOP' }] })));
  });

  test('Claude: usa Opus 5.5 con respaldo automático y devuelve la respuesta validada', async () => {
    let pedido;
    const cliente = { beta: { messages: { parse: async (p) => {
      pedido = p;
      return { parsed_output: respuesta, stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1500, output_tokens: 300 } };
    } } } };
    const r = await consultarClaude(['FOTO1'], opciones, cliente);
    assert.deepEqual(r, { resultado: respuesta, uso: { entrada: 1500, salida: 300 }, modelo: 'claude-opus-5-5' });
    assert.equal(pedido.model, 'claude-opus-5-5');
    assert.equal(pedido.fallbacks, 'default');
    assert.equal(pedido.system, 'Instrucciones de prueba');
    assert.deepEqual(pedido.messages[0].content.slice(0, 2), [
      { type: 'text', text: 'Foto 1:' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'FOTO1' } },
    ]);

    const declinada = { beta: { messages: { parse: async () => ({ parsed_output: null, stop_reason: 'refusal', model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 0 } }) } } };
    assert.equal((await consultarClaude(['F'], opciones, declinada)).resultado, null);
  });
});
