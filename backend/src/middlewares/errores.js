import { AppError } from '../utils/AppError.js';
import { config } from '../config/env.js';

export function rutaNoEncontrada(req, _res, next) {
  next(new AppError(`No existe la ruta ${req.method} ${req.originalUrl}`, 404, 'RUTA_NO_ENCONTRADA'));
}

// eslint-disable-next-line no-unused-vars
export function manejadorErrores(err, _req, res, _next) {
  if (err instanceof AppError) {
    const error = { codigo: err.codigo, mensaje: err.message };
    if (err.campos) error.campos = err.campos;
    return res.status(err.status).json({ error });
  }
  // JSON mal formado en el cuerpo de la petición
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es JSON válido' } });
  }
  if (config.entorno !== 'test') console.error(err);
  return res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
}
