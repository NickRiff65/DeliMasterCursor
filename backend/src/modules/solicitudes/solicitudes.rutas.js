import { Router } from 'express';
import { validar, validarConsulta } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { AppError } from '../../utils/AppError.js';
import { pool } from '../../db/pool.js';
import {
  esquemaInterpretar, esquemaCrear, esquemaAsignar, esquemaResponder, esquemaCancelar, esquemaListado,
  esquemaReportar, esquemaResena, esquemaLlegada, esquemaCotizacion, esquemaRespuestaCotizacion,
} from './solicitudes.esquemas.js';
import * as servicio from './solicitudes.servicio.js';
import { limiteSolicitudes, limiteCodigoLlegada } from '../../middlewares/limites.js';

export const rutasSolicitudes = Router();
rutasSolicitudes.use(autenticar);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idValido(req) {
  if (!UUID.test(req.params.id)) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return req.params.id;
}

// HU-08: vista previa de lo que entendió el sistema, antes de crear la solicitud
rutasSolicitudes.post('/interpretar', autorizar('cliente'), limiteSolicitudes, validar(esquemaInterpretar), async (req, res) => {
  res.json(await servicio.interpretarTexto(req.body.descripcion));
});

// HU-08 / HU-12: crear solicitud (idempotente por id)
rutasSolicitudes.post('/', autorizar('cliente'), limiteSolicitudes, validar(esquemaCrear), async (req, res) => {
  const { rows } = await pool.query('SELECT id, comuna FROM usuarios WHERE id = $1', [req.usuario.id]);
  const resultado = await servicio.crear({ ...req.usuario, comuna: rows[0]?.comuna }, req.body);
  res.status(resultado.creada ? 201 : 200).json(resultado);
});

// Mis solicitudes (cliente: las que creó · prestador: las que le asignaron)
rutasSolicitudes.get('/', autorizar('cliente', 'prestador'), validarConsulta(esquemaListado), async (req, res) => {
  res.json({ solicitudes: await servicio.listar(req.usuario, req.consulta) });
});

rutasSolicitudes.get('/:id', async (req, res) => {
  res.json({ solicitud: await servicio.obtener(req.usuario, idValido(req)) });
});

// El cliente elige un prestador del catálogo
rutasSolicitudes.post('/:id/asignar', autorizar('cliente'), validar(esquemaAsignar), async (req, res) => {
  res.json({ solicitud: await servicio.asignar(req.usuario, idValido(req), req.body) });
});

// HU-05: el prestador acepta o rechaza
rutasSolicitudes.post('/:id/responder', autorizar('prestador'), validar(esquemaResponder), async (req, res) => {
  res.json({ solicitud: await servicio.responder(req.usuario, idValido(req), req.body) });
});

rutasSolicitudes.post('/:id/cancelar', autorizar('cliente'), validar(esquemaCancelar), async (req, res) => {
  res.json({ solicitud: await servicio.cancelar(req.usuario, idValido(req), req.body) });
});

// El prestador marca el trabajo como terminado (solicitud pagada)
rutasSolicitudes.post('/:id/finalizar', autorizar('prestador'), async (req, res) => {
  res.json({ solicitud: await servicio.finalizar(req.usuario, idValido(req)) });
});

// El cliente confirma el cierre: se libera el pago retenido
rutasSolicitudes.post('/:id/cerrar', autorizar('cliente'), async (req, res) => {
  res.json({ solicitud: await servicio.cerrar(req.usuario, idValido(req)) });
});

// El cliente reporta un problema: el dinero sigue retenido para revisión
rutasSolicitudes.post('/:id/reportar', autorizar('cliente'), validar(esquemaReportar), async (req, res) => {
  res.json({ solicitud: await servicio.reportar(req.usuario, idValido(req), req.body) });
});

// Modalidad "visita + cotización"
// El prestador llegó: ingresa el código del cliente y recibe la visita
rutasSolicitudes.post('/:id/llegada', autorizar('prestador'), limiteCodigoLlegada, validar(esquemaLlegada), async (req, res) => {
  res.json({ solicitud: await servicio.confirmarLlegada(req.usuario, idValido(req), req.body) });
});

// Cotización después del diagnóstico
rutasSolicitudes.post('/:id/cotizacion', autorizar('prestador'), validar(esquemaCotizacion), async (req, res) => {
  res.status(201).json({ solicitud: await servicio.cotizar(req.usuario, idValido(req), req.body) });
});

// El cliente acepta (paga el saldo) o rechaza la cotización
rutasSolicitudes.post('/:id/cotizacion/respuesta', autorizar('cliente'), validar(esquemaRespuestaCotizacion), async (req, res) => {
  res.json({ solicitud: await servicio.responderCotizacion(req.usuario, idValido(req), req.body) });
});

// El prestador no llegó: el cliente recupera la visita
rutasSolicitudes.post('/:id/no-llego', autorizar('cliente'), async (req, res) => {
  res.json({ solicitud: await servicio.reclamarNoLlego(req.usuario, idValido(req)) });
});

// HU-06: reseña del trabajo cerrado
rutasSolicitudes.post('/:id/resena', autorizar('cliente'), validar(esquemaResena), async (req, res) => {
  res.status(201).json({ solicitud: await servicio.resenar(req.usuario, idValido(req), req.body) });
});
