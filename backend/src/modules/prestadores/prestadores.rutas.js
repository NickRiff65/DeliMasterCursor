import { Router } from 'express';
import { validar, validarConsulta } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { AppError } from '../../utils/AppError.js';
import { esquemaCatalogo, esquemaFicha, esquemaDatosPago } from './prestadores.esquemas.js';
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
  res.json({ prestador: await servicio.perfilPublico(req.params.id) });
});
