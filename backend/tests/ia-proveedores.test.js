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

  test('Gemini: si el modelo está saturado, sin cuota o ya no existe, prueba el siguiente de la lista', async (t) => {
    const { ApiError } = await import('@google/genai');
    const { modelosGemini } = await import('../src/modules/solicitudes/ia/gemini.js');
    t.mock.method(console, 'warn', () => {});
    const conFallas = (fallas, pedidos) => ({ models: { generateContent: async (p) => {
      pedidos.push(p.model);
      if (fallas[p.model]) throw new ApiError({ message: 'falla simulada', status: fallas[p.model] });
      return { text: JSON.stringify(respuesta), candidates: [{ finishReason: 'STOP' }] };
    } } });

    // Saturado (503) y sin cuota (429): responde el tercer modelo y ya no se consultan los demás
    let pedidos = [];
    const r = await consultarGemini(['F'], opciones, conFallas({ a: 503, b: 429 }, pedidos), ['a', 'b', 'c', 'd']);
    assert.deepEqual(pedidos, ['a', 'b', 'c']);
    assert.equal(r.modelo, 'c');
    assert.deepEqual(r.resultado, respuesta);

    // Un error que no es de capacidad (clave inválida) no se tapa probando otros modelos
    pedidos = [];
    await assert.rejects(consultarGemini(['F'], opciones, conFallas({ a: 401 }, pedidos), ['a', 'b']), (e) => e.status === 401);
    assert.deepEqual(pedidos, ['a']);

    // Si fallan todos, se informa el último error (el servicio responde «no pudimos analizar la foto»)
    pedidos = [];
    await assert.rejects(consultarGemini(['F'], opciones, conFallas({ a: 503, b: 404 }, pedidos), ['a', 'b']), (e) => e.status === 404);
    assert.deepEqual(pedidos, ['a', 'b']);

    // La lista: el modelo principal y luego el respaldo, sin repetidos; GEMINI_MODELOS_RESPALDO vacía = sin respaldo
    assert.deepEqual(modelosGemini({}), ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);
    assert.deepEqual(modelosGemini({ GEMINI_MODELO: 'gemini-3.1-flash-lite' }), ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash']);
    assert.deepEqual(modelosGemini({ GEMINI_MODELOS_RESPALDO: '' }), ['gemini-3.5-flash']);
    assert.deepEqual(modelosGemini({ GEMINI_MODELO: 'x', GEMINI_MODELOS_RESPALDO: ' y , x ' }), ['x', 'y']);
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
