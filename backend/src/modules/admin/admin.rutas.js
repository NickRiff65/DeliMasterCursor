import { Router } from 'express';
import { validar, validarConsulta } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { AppError } from '../../utils/AppError.js';
import { urlApi } from '../../utils/seguridad.js';
import { resolverDisputa } from '../solicitudes/solicitudes.servicio.js';
import {
  esquemaResolverDisputa, esquemaFiltroDisputas, esquemaTransferencia, esquemaEstadoUsuario,
} from './admin.esquemas.js';
import * as servicio from './admin.servicio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exigirId = (nombre, codigo) => (req, _res, next) => {
  if (!UUID.test(req.params.id)) return next(new AppError(`${nombre} no encontrado`, 404, codigo));
  next();
};

// Montado en /api/admin (las verificaciones tienen su propio enrutador en /api/admin/verificaciones)
export const rutasAdmin = Router();
rutasAdmin.use(autenticar, autorizar('admin'));

// HU-14: métricas y pendientes del equipo
rutasAdmin.get('/resumen', async (_req, res) => {
  res.json(await servicio.resumen());
});

// Devolución automática que falló y el equipo hizo a mano en el portal de Transbank
rutasAdmin.post('/pagos/:id/devolucion-manual', exigirId('Pago', 'PAGO_NO_ENCONTRADO'), async (req, res) => {
  await servicio.marcarDevolucionManual(req.usuario.id, req.params.id);
  res.json({ ok: true });
});

// HU-16: disputas
rutasAdmin.get('/disputas', validarConsulta(esquemaFiltroDisputas), async (req, res) => {
  res.json({ disputas: await servicio.listarDisputas(req.consulta) });
});

rutasAdmin.post('/disputas/:id/resolver', exigirId('Solicitud', 'SOLICITUD_NO_ENCONTRADA'),
  validar(esquemaResolverDisputa), async (req, res) => {
    await resolverDisputa(req.usuario, req.params.id, req.body);
    res.json({ solicitud: await servicio.detalleSolicitud(req.usuario, req.params.id, urlApi(req)) });
  });

// Evidencia completa de una solicitud (chat, pago, ledger, historial)
rutasAdmin.get('/solicitudes/:id', exigirId('Solicitud', 'SOLICITUD_NO_ENCONTRADA'), async (req, res) => {
  res.json({ solicitud: await servicio.detalleSolicitud(req.usuario, req.params.id, urlApi(req)) });
});

// HU-13: pagos liberados por transferir y registro de transferencias
rutasAdmin.get('/liquidaciones', async (_req, res) => {
  res.json(await servicio.liquidaciones());
});

rutasAdmin.post('/liquidaciones/:id', exigirId('Prestador', 'PRESTADOR_NO_ENCONTRADO'),
  validar(esquemaTransferencia), async (req, res) => {
    res.status(201).json({ transferencia: await servicio.registrarTransferencia(req.usuario, req.params.id, req.body) });
  });

// Moderación del chat y cuentas
rutasAdmin.get('/moderacion', async (_req, res) => {
  res.json(await servicio.moderacion());
});

rutasAdmin.patch('/usuarios/:id', exigirId('Usuario', 'USUARIO_NO_ENCONTRADO'),
  validar(esquemaEstadoUsuario), async (req, res) => {
    res.json({ usuario: await servicio.cambiarEstadoUsuario(req.usuario, req.params.id, req.body) });
  });
