import { Router } from 'express';
import { validar } from '../../middlewares/validar.js';
import { autenticar } from '../../middlewares/autenticacion.js';
import {
  limiteAutenticacionIp, limiteLoginCuenta, limiteCambioPassword, limiteRecuperacion, limiteRestablecer,
} from '../../middlewares/limites.js';
import {
  esquemaRegistro, esquemaLogin, esquemaPerfil, esquemaCambioPassword, esquemaRecuperar, esquemaRestablecer, esquemaTerminos,
  esquemaEliminarCuenta,
} from './auth.esquemas.js';
import * as servicio from './auth.servicio.js';

export const rutasAuth = Router();

// Freno contra fuerza bruta (OWASP API2): por IP y, en el inicio de sesión, también por cuenta
// HU-10: registro de cliente o prestador
rutasAuth.post('/registro', limiteAutenticacionIp, validar(esquemaRegistro), async (req, res) => {
  const resultado = await servicio.registrar(req.body);
  res.status(201).json(resultado);
});

// HU-10: inicio de sesión
rutasAuth.post('/login', limiteAutenticacionIp, limiteLoginCuenta, validar(esquemaLogin), async (req, res) => {
  res.json(await servicio.iniciarSesion(req.body));
});

// Datos del usuario de la sesión actual (la app lo usa al abrirse)
rutasAuth.get('/yo', autenticar, async (req, res) => {
  res.json({ usuario: await servicio.obtenerPerfil(req.usuario.id) });
});

// Editar nombre, celular y comuna
rutasAuth.put('/yo', autenticar, validar(esquemaPerfil), async (req, res) => {
  res.json({ usuario: await servicio.actualizarPerfil(req.usuario.id, req.body) });
});

// Aceptar la versión vigente de los Términos de uso y la Política de privacidad
rutasAuth.post('/terminos', autenticar, validar(esquemaTerminos), async (req, res) => {
  res.json({ usuario: await servicio.aceptarTerminos(req.usuario.id, req.body) });
});

// Cambiar la contraseña: cierra las demás sesiones y devuelve un token nuevo
// Eliminar la cuenta (Ley N.º 21.719): primero se consulta si hay algo pendiente, luego se confirma con la contraseña
rutasAuth.get('/yo/eliminar', autenticar, async (req, res) => {
  res.json(await servicio.puedeEliminar(req.usuario));
});
rutasAuth.post('/yo/eliminar', autenticar, limiteCambioPassword, validar(esquemaEliminarCuenta), async (req, res) => {
  res.json(await servicio.eliminarCuenta(req.usuario, req.body));
});

rutasAuth.put('/password', autenticar, limiteCambioPassword, validar(esquemaCambioPassword), async (req, res) => {
  res.json(await servicio.cambiarPassword(req.usuario.id, req.body));
});

// Recuperar la contraseña: 1) pedir un código por correo · 2) usarlo para crear una nueva
rutasAuth.post('/recuperar', limiteAutenticacionIp, limiteRecuperacion, validar(esquemaRecuperar), async (req, res) => {
  await servicio.solicitarRecuperacion(req.body);
  res.json({ mensaje: 'Si el correo está registrado, te enviamos un código para crear una nueva contraseña.' });
});

rutasAuth.post('/restablecer', limiteAutenticacionIp, limiteRestablecer, validar(esquemaRestablecer), async (req, res) => {
  res.json(await servicio.restablecerPassword(req.body));
});
