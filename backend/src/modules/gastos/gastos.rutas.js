import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { validar, validarConsulta } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { AppError } from '../../utils/AppError.js';
import * as servicio from './gastos.servicio.js';
import { limiteBoletas } from '../../middlewares/limites.js';
import { urlApi } from '../../utils/seguridad.js';
import { firmaValida } from './almacen.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (valor, mensaje) => {
  if (!UUID.test(valor)) throw new AppError(mensaje, 404, 'NO_ENCONTRADO');
  return valor;
};

// ------------------------------------------------------------------ /api/solicitudes/:id/boletas
// Se monta antes del lector JSON general para aceptar fotos de hasta ~6 MB solo en esta ruta.
export const rutasBoletas = Router({ mergeParams: true });
rutasBoletas.post('/',
  // Primero la sesión y el límite de uso (solo leen encabezados) y recién después se lee la foto
  autenticar, autorizar('prestador'), limiteBoletas,
  express.json({ limit: '9mb' }),   // 6 MB de imagen ≈ 8 MB en base64
  validar(z.object({ imagen_base64: z.string().min(100, 'Falta la foto de la boleta') })),
  async (req, res) => {
    res.status(201).json(await servicio.leerYGuardarBoleta(
      req.usuario, id(req.params.id, 'Trabajo no encontrado'), req.body.imagen_base64, urlApi(req)));
  });

// ------------------------------------------------------------------ /api/solicitudes/:id/gastos
export const rutasGastosTrabajo = Router({ mergeParams: true });
rutasGastosTrabajo.use(autenticar, autorizar('prestador'));

rutasGastosTrabajo.get('/', async (req, res) => {
  res.json(await servicio.resumenDelTrabajo(req.usuario, id(req.params.id, 'Trabajo no encontrado'), urlApi(req)));
});

const esquemaGasto = z.object({
  monto: z.number().int('El monto debe ser en pesos enteros').min(1, 'El monto debe ser mayor a cero').max(10_000_000),
  descripcion: z.string().trim().max(200).optional(),
  boleta_id: z.uuid().optional(),
});

rutasGastosTrabajo.post('/', validar(esquemaGasto), async (req, res) => {
  const solicitudId = id(req.params.id, 'Trabajo no encontrado');
  await servicio.crearGasto(req.usuario, solicitudId, req.body);
  res.status(201).json(await servicio.resumenDelTrabajo(req.usuario, solicitudId, urlApi(req)));
});

// ------------------------------------------------------------------ /api/solicitudes/:id/materiales
// El cliente ve los gastos en materiales de su trabajo y si tienen boleta
export const rutasMaterialesCliente = Router({ mergeParams: true });
rutasMaterialesCliente.get('/', autenticar, autorizar('cliente'), async (req, res) => {
  res.json(await servicio.materialesParaCliente(req.usuario, id(req.params.id, 'Solicitud no encontrada'), urlApi(req)));
});

// ------------------------------------------------------------------ /api/gastos/:id
export const rutasGastos = Router();
// Adjuntar la boleta a un gasto ingresado a mano
rutasGastos.patch('/:id', autenticar, autorizar('prestador'), validar(z.object({ boleta_id: z.uuid('Boleta no válida') })),
  async (req, res) => {
    const solicitudId = await servicio.adjuntarBoleta(req.usuario, id(req.params.id, 'Gasto no encontrado'), req.body.boleta_id);
    res.json(await servicio.resumenDelTrabajo(req.usuario, solicitudId, urlApi(req)));
  });
rutasGastos.delete('/:id', autenticar, autorizar('prestador'), async (req, res) => {
  await servicio.eliminarGasto(req.usuario, id(req.params.id, 'Gasto no encontrado'));
  res.status(204).end();
});

// ------------------------------------------------------------------ /api/boletas/:id/imagen
// Acceso con enlace firmado y con vencimiento (las boletas son privadas del prestador)
export const rutasImagenBoleta = Router();
rutasImagenBoleta.get('/:id/imagen', async (req, res) => {
  const boletaId = id(req.params.id, 'Boleta no encontrada');
  if (!firmaValida(boletaId, req.query.vence, req.query.firma)) {
    throw new AppError('Enlace vencido o inválido', 403, 'ENLACE_INVALIDO');
  }
  const { buffer, mime } = await servicio.imagenDeBoleta(boletaId);
  // La app (otro origen en web) muestra la foto con <Image>; la firma ya limita el acceso
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'private, max-age=3600').type(mime).send(buffer);
});

// ------------------------------------------------------------------ /api/prestadores/yo/dinero
// Retenido, por transferir y ya transferido (con cada transferencia)
export const rutasDinero = Router();
rutasDinero.get('/', autenticar, autorizar('prestador'), async (req, res) => {
  res.json(await servicio.dineroDelPrestador(req.usuario));
});

// ------------------------------------------------------------------ /api/prestadores/yo/finanzas
export const rutasFinanzas = Router();
const mesActual = () => new Date().toISOString().slice(0, 7);
rutasFinanzas.get('/', autenticar, autorizar('prestador'),
  validarConsulta(z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes con formato AAAA-MM').default(mesActual) })),
  async (req, res) => {
    res.json(await servicio.finanzasDelMes(req.usuario, req.consulta.mes));
  });
