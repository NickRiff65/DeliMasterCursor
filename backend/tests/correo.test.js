// Correo por la API de Brevo (la opción en Railway, que bloquea SMTP en el plan Hobby)
import './helpers/db.js';   // deja NODE_ENV=test antes de cargar la configuración
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarRemitente, transporteBrevo } from '../src/utils/correo.js';

test('separa el nombre y la dirección del remitente', () => {
  assert.deepEqual(separarRemitente('DeliMaster <hola@delimaster.cl>'), { name: 'DeliMaster', email: 'hola@delimaster.cl' });
  assert.deepEqual(separarRemitente('avisos@delimaster.cl'), { name: 'DeliMaster', email: 'avisos@delimaster.cl' });
  assert.deepEqual(separarRemitente('<solo@delimaster.cl>'), { name: 'DeliMaster', email: 'solo@delimaster.cl' });
});

test('envía el correo a la API de Brevo con la clave en la cabecera y el texto plano', async () => {
  const pedidos = [];
  const enviar = transporteBrevo({
    clave: 'clave-de-prueba',
    remitente: 'DeliMaster <avisos@delimaster.cl>',
    pedir: async (url, opciones) => { pedidos.push({ url, opciones }); return { ok: true, status: 201 }; },
  });
  await enviar({ para: 'ana@correo.cl', asunto: 'Tu código', texto: 'Código: 123456' });

  assert.equal(pedidos.length, 1);
  const { url, opciones } = pedidos[0];
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers['api-key'], 'clave-de-prueba');
  assert.deepEqual(JSON.parse(opciones.body), {
    sender: { name: 'DeliMaster', email: 'avisos@delimaster.cl' },
    to: [{ email: 'ana@correo.cl' }],
    subject: 'Tu código',
    textContent: 'Código: 123456',
  });
});

test('si Brevo rechaza el envío, falla sin exponer el detalle de la respuesta', async () => {
  const enviar = transporteBrevo({
    clave: 'clave-de-prueba',
    pedir: async () => ({ ok: false, status: 401, text: async () => 'detalle interno' }),
  });
  await assert.rejects(enviar({ para: 'ana@correo.cl', asunto: 'x', texto: 'y' }), { message: 'Brevo respondió 401' });
});
