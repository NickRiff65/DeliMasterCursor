import { Router } from 'express';
import { autenticar } from '../../middlewares/autenticacion.js';
import { validar } from '../../middlewares/validar.js';
import * as servicio from './notificaciones.servicio.js';
import { registrarDispositivo, quitarDispositivo } from '../../utils/push.js';
import { esquemaDispositivo, esquemaQuitarDispositivo } from './notificaciones.esquemas.js';

// /api/notificaciones: avisos de la persona (ambas apps)
export const rutasNotificaciones = Router();
rutasNotificaciones.use(autenticar);
rutasNotificaciones.get('/', async (req, res) => {
  res.json(await servicio.listar(req.usuario));
});
// Al abrir la lista de avisos, quedan todos como leídos
rutasNotificaciones.post('/leidas', async (req, res) => {
  res.json(await servicio.marcarLeidas(req.usuario));
});
// El celular registra su token de Expo para recibir avisos con la app cerrada
rutasNotificaciones.post('/dispositivo', validar(esquemaDispositivo), async (req, res) => {
  await registrarDispositivo(req.usuario.id, req.body);
  res.status(204).end();
});
rutasNotificaciones.delete('/dispositivo', validar(esquemaQuitarDispositivo), async (req, res) => {
  await quitarDispositivo(req.usuario.id, req.body.token);
  res.status(204).end();
});
