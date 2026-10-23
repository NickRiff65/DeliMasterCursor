import { Router } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { validar } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { AppError } from '../../utils/AppError.js';
import * as servicio from './pagos.servicio.js';
import { limitePagos } from '../../middlewares/limites.js';
import { urlApi } from '../../utils/seguridad.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


// ------------------------------------------------------------------ /api/solicitudes/:id/pago
export const rutasPagoSolicitud = Router({ mergeParams: true });

const esquemaIniciar = z.object({
  volver_a: z.string().max(500, 'Dirección de retorno demasiado larga'),
  // webpay: ingresa la tarjeta · guardar_tarjeta: la registra y paga con ella · tarjeta_guardada: paga con la que guardó
  medio: z.enum(['webpay', 'guardar_tarjeta', 'tarjeta_guardada'], { error: 'Medio de pago no válido' }).default('webpay'),
});

rutasPagoSolicitud.post('/', autenticar, autorizar('cliente'), limitePagos, validar(esquemaIniciar), async (req, res) => {
  if (!UUID.test(req.params.id)) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  if (!servicio.destinoPermitido(req.body.volver_a, req.get('host'))) {
    throw new AppError('Dirección de retorno no permitida', 422, 'RETORNO_NO_PERMITIDO');
  }
  res.status(201).json(await servicio.iniciar(req.usuario, req.params.id,
    { volverA: req.body.volver_a, urlApi: urlApi(req), medio: req.body.medio }));
});

// ------------------------------------------------------------------ /api/pagos/tarjeta (tarjeta guardada)
export const rutasTarjeta = Router();
rutasTarjeta.use(autenticar, autorizar('cliente'));
rutasTarjeta.get('/', async (req, res) => {
  res.json({ tarjeta: await servicio.tarjetaDe(req.usuario.id) });
});
// Guardar o cambiar la tarjeta sin pagar nada (desde Mi cuenta)
rutasTarjeta.post('/', limitePagos, validar(z.object({ volver_a: z.string().max(500) })), async (req, res) => {
  if (!servicio.destinoPermitido(req.body.volver_a, req.get('host'))) {
    throw new AppError('Dirección de retorno no permitida', 422, 'RETORNO_NO_PERMITIDO');
  }
  res.status(201).json(await servicio.iniciarInscripcion(req.usuario, { volverA: req.body.volver_a, urlApi: urlApi(req) }));
});
rutasTarjeta.delete('/', async (req, res) => {
  res.json({ tarjeta: await servicio.quitarTarjeta(req.usuario) });
});

// ------------------------------------------------------------------ /api/pagos/webpay/...
export const rutasWebpay = Router();

// Página intermedia que envía al cliente a Transbank, que exige un POST con el token
// (token_ws para pagar con Webpay Plus, TBK_TOKEN para registrar la tarjeta en Oneclick)
function paginaRedireccion(res, { url, campo, token, texto }) {
  const nonce = randomBytes(16).toString('base64');
  // Política de seguridad específica: solo este script y solo enviar el formulario a Transbank
  res.setHeader('Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action ${new URL(url).origin}`);
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Redirigiendo a Webpay…</title></head>
<body style="font-family:system-ui;text-align:center;padding:48px 16px;color:#1F2937">
  <p>${texto}</p>
  <form id="f" method="post" action="${escapar(url)}">
    <input type="hidden" name="${campo}" value="${escapar(token)}">
    <button type="submit" style="padding:12px 24px;font-size:16px">Continuar</button>
  </form>
  <script nonce="${nonce}">document.getElementById('f').submit();</script>
</body></html>`);
}

rutasWebpay.get('/ir/:token', async (req, res) => {
  const { url, token } = await servicio.datosParaRedirigir(req.params.token);
  paginaRedireccion(res, { url, token, campo: 'token_ws', texto: 'Te estamos llevando a <strong>Webpay</strong> para pagar de forma segura…' });
});

// Retorno desde Webpay: en integración llega por POST (formulario) y en producción puede llegar por GET
async function retorno(req, res) {
  const params = { ...req.query, ...(req.body ?? {}) };
  const { destino, resultado } = await servicio.procesarRetorno(params);
  if (!destino) {
    return res.type('html').send(`<p style="font-family:system-ui;padding:32px">Pago ${resultado}. Ya puedes volver a DeliMaster.</p>`);
  }
  const u = new URL(destino);
  u.searchParams.set('pago', resultado);
  res.redirect(303, u.toString());
}
rutasWebpay.post('/retorno', express.urlencoded({ extended: false }), retorno);
rutasWebpay.get('/retorno', retorno);

// ------------------------------------------------------------------ /api/pagos/oneclick/...
// Registrar la tarjeta en Transbank (Webpay Oneclick) y volver a la app
export const rutasOneclick = Router();
rutasOneclick.get('/ir/:token', async (req, res) => {
  const { url, token } = await servicio.datosInscripcion(req.params.token);
  paginaRedireccion(res, { url, token, campo: 'TBK_TOKEN', texto: 'Te estamos llevando a <strong>Webpay</strong> para guardar tu tarjeta de forma segura…' });
});
async function retornoOneclick(req, res) {
  const { destino, resultado } = await servicio.procesarRetornoInscripcion({ ...req.query, ...(req.body ?? {}) });
  const u = new URL(destino);
  u.searchParams.set('pago', resultado);
  res.redirect(303, u.toString());
}
rutasOneclick.post('/retorno', express.urlencoded({ extended: false }), retornoOneclick);
rutasOneclick.get('/retorno', retornoOneclick);
