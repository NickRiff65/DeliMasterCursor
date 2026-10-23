import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { pool } from '../db/pool.js';
import { registrarEventoSeguridad } from '../utils/seguridad.js';

// Exige un JWT válido en el encabezado "Authorization: Bearer <token>" y una cuenta activa.
// Deja en req.usuario el id y el rol del usuario autenticado.
// La cuenta se revisa en cada petición: si el equipo la desactiva (moderación), las sesiones
// abiertas dejan de funcionar de inmediato y no recién cuando expira el token.
export async function autenticar(req, _res, next) {
  const [tipo, token] = (req.headers.authorization ?? '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return next(new AppError('Debes iniciar sesión', 401, 'NO_AUTENTICADO'));
  }
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    const expirado = err.name === 'TokenExpiredError';
    return next(new AppError(expirado ? 'La sesión expiró, vuelve a iniciar sesión' : 'Sesión inválida',
      401, expirado ? 'SESION_EXPIRADA' : 'SESION_INVALIDA'));
  }
  try {
    const { usuario, motivo } = await revisarCuenta(payload.sub, payload.iat);
    if (motivo === 'sesion_cerrada') {
      return next(new AppError('Tu sesión se cerró porque se cambió la contraseña. Vuelve a iniciar sesión.', 401, 'SESION_EXPIRADA'));
    }
    if (!usuario) {
      registrarEventoSeguridad('sesion_de_cuenta_desactivada', { usuario: payload.sub, ruta: req.originalUrl });
      return next(new AppError('Tu cuenta está desactivada o ya no existe', 401, 'CUENTA_DESACTIVADA'));
    }
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

// Revisa que la cuenta exista, esté activa y que el token sea posterior al último cierre de sesiones
// (por ejemplo, un cambio de contraseña). Devuelve { usuario: { id, rol } } o { motivo }.
export async function revisarCuenta(id, emitidoEn) {
  const { rows } = await pool.query(
    'SELECT id, rol, activo, extract(epoch FROM sesiones_desde)::bigint AS sesiones_desde FROM usuarios WHERE id = $1', [id]);
  const c = rows[0];
  if (!c || !c.activo) return { motivo: 'desactivada' };
  if (c.sesiones_desde && Number(emitidoEn ?? 0) < Number(c.sesiones_desde)) return { motivo: 'sesion_cerrada' };
  return { usuario: { id: c.id, rol: c.rol } };
}

// Id y rol vigentes de una cuenta activa con un token válido (null si no)
export async function cuentaActiva(id, emitidoEn) {
  return (await revisarCuenta(id, emitidoEn)).usuario ?? null;
}

// Restringe una ruta a ciertos roles. Usar siempre después de autenticar.
export function autorizar(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      registrarEventoSeguridad('acceso_denegado', { usuario: req.usuario?.id, rol: req.usuario?.rol, ruta: req.originalUrl });
      return next(new AppError('No tienes permiso para esta acción', 403, 'SIN_PERMISO'));
    }
    next();
  };
}
