import express, { Router } from 'express';
import { z } from 'zod';
import { validar } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { urlApi } from '../../utils/seguridad.js';
import { AppError } from '../../utils/AppError.js';
import * as servicio from './mensajes.servicio.js';
import { limiteMensajes, limiteFotos } from '../../middlewares/limites.js';

// Montado en /api/solicitudes/:id/mensajes
export const rutasMensajes = Router({ mergeParams: true });
rutasMensajes.use(autenticar);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idValido(req) {
  if (!UUID.test(req.params.id)) throw new AppError('Solicitud no encontrada', 404, 'SOLICITUD_NO_ENCONTRADA');
  return req.params.id;
}

const esquemaMensaje = z.object({
  contenido: z.string().trim().min(1, 'Escribe un mensaje').max(1000, 'El mensaje es demasiado largo'),
});

rutasMensajes.get('/', async (req, res) => {
  res.json(await servicio.listar(req.usuario, idValido(req), urlApi(req)));
});

// HU-04: enviar un mensaje (pasa por el filtro anti-fuga)
rutasMensajes.post('/', limiteMensajes, validar(esquemaMensaje), async (req, res) => {
  res.status(201).json(await servicio.enviar(req.usuario, idValido(req), req.body.contenido, urlApi(req)));
});

// Foto por el chat. Se monta en /api/solicitudes/:id/mensajes/foto antes del lector JSON general
// (acepta imágenes de hasta ~6 MB solo en esta ruta).
export const rutasFotoChat = Router({ mergeParams: true });
rutasFotoChat.post('/', autenticar, autorizar('cliente', 'prestador'), limiteFotos,
  express.json({ limit: '9mb' }),
  validar(z.object({ imagen_base64: z.string().min(100, 'Falta la foto') })),
  async (req, res) => {
    res.status(201).json(await servicio.enviarFoto(req.usuario, idValido(req), req.body.imagen_base64, urlApi(req)));
  });
