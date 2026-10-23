import { Router } from 'express';
import { validar, validarConsulta } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { AppError } from '../../utils/AppError.js';
import { esquemaSolicitud, esquemaFiltroAdmin, esquemaResolucion } from './verificaciones.esquemas.js';
import * as servicio from './verificaciones.servicio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Montado en /api/prestadores/yo/verificaciones
export const rutasVerificacionPrestador = Router();
rutasVerificacionPrestador.use(autenticar, autorizar('prestador'));

rutasVerificacionPrestador.get('/', async (req, res) => {
  res.json({ verificaciones: await servicio.listarPropias(req.usuario.id) });
});

rutasVerificacionPrestador.post('/', validar(esquemaSolicitud), async (req, res) => {
  res.status(201).json({ verificacion: await servicio.solicitar(req.usuario.id, req.body) });
});

// Montado en /api/admin/verificaciones
export const rutasVerificacionAdmin = Router();
rutasVerificacionAdmin.use(autenticar, autorizar('admin'));

rutasVerificacionAdmin.get('/', validarConsulta(esquemaFiltroAdmin), async (req, res) => {
  res.json({ verificaciones: await servicio.listarParaRevision(req.consulta) });
});

rutasVerificacionAdmin.patch('/:id', validar(esquemaResolucion), async (req, res) => {
  if (!UUID.test(req.params.id)) {
    throw new AppError('Solicitud de verificación no encontrada', 404, 'VERIFICACION_NO_ENCONTRADA');
  }
  res.json({ verificacion: await servicio.resolver(req.params.id, req.usuario.id, req.body) });
});
