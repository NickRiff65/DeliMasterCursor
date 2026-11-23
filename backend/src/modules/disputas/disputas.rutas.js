import { Router } from 'express';
import { z } from 'zod';
import { validar } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { limiteMensajes } from '../../middlewares/limites.js';
import { AppError } from '../../utils/AppError.js';
import * as servicio from './disputas.servicio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idValido(req) {
  if (!UUID.test(req.params.id)) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return req.params.id;
}
const contenido = z.string({ error: 'Escribe un mensaje' }).trim()
  .min(1, 'Escribe un mensaje').max(1000, 'El mensaje es demasiado largo');

// ------------------------------------------------------------------ /api/solicitudes/:id/disputa
// El cliente y el maestro conversan con el equipo, cada uno en su propia conversación
export const rutasDisputaParte = Router({ mergeParams: true });
rutasDisputaParte.use(autenticar, autorizar('cliente', 'prestador'));

rutasDisputaParte.get('/mensajes', async (req, res) => {
  res.json(await servicio.mensajesDeParte(req.usuario, idValido(req)));
});

rutasDisputaParte.post('/mensajes', limiteMensajes, validar(z.object({ contenido })), async (req, res) => {
  res.status(201).json(await servicio.escribirParte(req.usuario, idValido(req), req.body.contenido));
});

// ------------------------------------------------------------------ /api/admin/solicitudes/:id/disputa
export const rutasDisputaAdmin = Router({ mergeParams: true });
rutasDisputaAdmin.use(autenticar, autorizar('admin'));

rutasDisputaAdmin.get('/', async (req, res) => {
  res.json(await servicio.conversacionesAdmin(idValido(req)));
});

rutasDisputaAdmin.post('/', validar(z.object({
  parte: z.enum(['cliente', 'prestador'], { error: 'Indica si escribes al cliente o al maestro' }),
  contenido,
})), async (req, res) => {
  res.status(201).json(await servicio.escribirAdmin(req.usuario, idValido(req), req.body));
});
