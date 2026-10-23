import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { validar } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { limiteFotos } from '../../middlewares/limites.js';
import { AppError } from '../../utils/AppError.js';
import { urlApi } from '../../utils/seguridad.js';
import * as servicio from './evidencias.servicio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (valor, mensaje, codigo) => {
  if (!UUID.test(valor)) throw new AppError(mensaje, 404, codigo);
  return valor;
};

// ------------------------------------------------------------------ /api/solicitudes/:id/fotos
// Se monta antes del lector JSON general para aceptar fotos de hasta ~6 MB solo en esta ruta.
export const rutasFotosSolicitud = Router({ mergeParams: true });

rutasFotosSolicitud.get('/', autenticar, async (req, res) => {
  res.json(await servicio.listar(req.usuario, id(req.params.id, 'Solicitud no encontrada', 'SOLICITUD_NO_ENCONTRADA'), urlApi(req)));
});

rutasFotosSolicitud.post('/',
  // Primero la sesión y el límite de uso (solo leen encabezados) y recién después se lee la foto
  autenticar, autorizar('cliente', 'prestador'), limiteFotos,
  express.json({ limit: '9mb' }),
  validar(z.object({
    imagen_base64: z.string().min(100, 'Falta la foto'),
    descripcion: z.string().trim().max(200, 'La descripción no puede superar 200 caracteres').optional(),
  })),
  async (req, res) => {
    const solicitudId = id(req.params.id, 'Solicitud no encontrada', 'SOLICITUD_NO_ENCONTRADA');
    res.status(201).json(await servicio.subir(req.usuario, solicitudId, req.body, urlApi(req)));
  });

// ------------------------------------------------------------------ /api/evidencias/:id/imagen
// Acceso con enlace firmado y con vencimiento (las fotos son privadas de las partes y del equipo)
export const rutasImagenEvidencia = Router();
rutasImagenEvidencia.get('/:id/imagen', async (req, res) => {
  const fotoId = id(req.params.id, 'Foto no encontrada', 'FOTO_NO_ENCONTRADA');
  if (!servicio.firmaValida(fotoId, req.query.vence, req.query.firma)) {
    throw new AppError('Enlace vencido o inválido', 403, 'ENLACE_INVALIDO');
  }
  const { buffer, mime } = await servicio.imagen(fotoId);
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'private, max-age=3600').type(mime).send(buffer);
});
