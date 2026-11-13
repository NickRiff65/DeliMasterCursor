import { Router } from 'express';
import express from 'express';
import { validar, validarConsulta } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { limiteFotos } from '../../middlewares/limites.js';
import { AppError } from '../../utils/AppError.js';
import { urlApi } from '../../utils/seguridad.js';
import { esquemaCatalogo, esquemaFicha, esquemaDatosPago, esquemaFotoPortafolio } from './prestadores.esquemas.js';
import * as servicio from './prestadores.servicio.js';

export const rutasPrestadores = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// HU-01: catálogo filtrable (público, para que el cliente explore antes de registrarse)
rutasPrestadores.get('/', validarConsulta(esquemaCatalogo), async (req, res) => {
  res.json(await servicio.listarCatalogo(req.consulta));
});

// Ficha del propio prestador (se declara antes de /:id para que "yo" no se tome como id)
rutasPrestadores.get('/yo', autenticar, autorizar('prestador'), async (req, res) => {
  res.json({ ficha: await servicio.obtenerFicha(req.usuario.id) });
});

// CU-16: agenda de visitas del propio prestador
rutasPrestadores.get('/yo/agenda', autenticar, autorizar('prestador'), async (req, res) => {
  res.json({ agenda: await servicio.miAgenda(req.usuario.id) });
});

// Portafolio del maestro: fotos de sus trabajos anteriores (máximo 12)
rutasPrestadores.get('/yo/fotos', autenticar, autorizar('prestador'), async (req, res) => {
  res.json(await servicio.misFotos(req.usuario.id, urlApi(req)));
});

rutasPrestadores.post('/yo/fotos',
  autenticar, autorizar('prestador'), limiteFotos,
  express.json({ limit: '9mb' }),
  validar(esquemaFotoPortafolio),
  async (req, res) => {
    res.status(201).json(await servicio.agregarFoto(req.usuario.id, req.body, urlApi(req)));
  });

rutasPrestadores.delete('/yo/fotos/:fotoId', autenticar, autorizar('prestador'), async (req, res) => {
  if (!UUID.test(req.params.fotoId)) throw new AppError('Foto no encontrada', 404, 'FOTO_NO_ENCONTRADA');
  res.json(await servicio.eliminarFoto(req.usuario.id, req.params.fotoId, urlApi(req)));
});

// Las fotos del portafolio se entregan con enlace firmado y con vencimiento, como las evidencias
rutasPrestadores.get('/fotos/:id/imagen', async (req, res) => {
  if (!UUID.test(req.params.id)) throw new AppError('Foto no encontrada', 404, 'FOTO_NO_ENCONTRADA');
  if (!servicio.firmaPortafolioValida(req.params.id, req.query.vence, req.query.firma)) {
    throw new AppError('Enlace vencido o inválido', 403, 'ENLACE_INVALIDO');
  }
  const { buffer, mime } = await servicio.imagenPortafolio(req.params.id);
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'private, max-age=3600').type(mime).send(buffer);
});

rutasPrestadores.put('/yo', autenticar, autorizar('prestador'), validar(esquemaFicha), async (req, res) => {
  res.json({ ficha: await servicio.actualizarFicha(req.usuario.id, req.body) });
});

// HU-13: datos bancarios para recibir los pagos liberados
rutasPrestadores.get('/yo/datos-pago', autenticar, autorizar('prestador'), async (req, res) => {
  res.json({ datos_pago: await servicio.obtenerDatosPago(req.usuario.id) });
});

rutasPrestadores.put('/yo/datos-pago', autenticar, autorizar('prestador'), validar(esquemaDatosPago), async (req, res) => {
  res.json({ datos_pago: await servicio.guardarDatosPago(req.usuario.id, req.body) });
});

// HU-02: perfil público de un prestador
rutasPrestadores.get('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) throw new AppError('Prestador no encontrado', 404, 'PRESTADOR_NO_ENCONTRADO');
  res.json({ prestador: await servicio.perfilPublico(req.params.id, urlApi(req)) });
});
