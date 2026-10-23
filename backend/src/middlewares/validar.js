import { AppError } from '../utils/AppError.js';

function errorDeValidacion(issues) {
  const campos = {};
  for (const issue of issues) {
    const campo = issue.path.join('.') || '_';
    campos[campo] ??= issue.message;
  }
  const err = new AppError('Hay datos inválidos en la solicitud', 422, 'DATOS_INVALIDOS');
  err.campos = campos;
  return err;
}

// Valida req.body contra un esquema zod y deja el resultado limpio en req.body.
// Los mensajes de error se devuelven por campo para que la app los muestre en el formulario.
export function validar(esquema) {
  return (req, _res, next) => {
    const resultado = esquema.safeParse(req.body ?? {});
    if (!resultado.success) return next(errorDeValidacion(resultado.error.issues));
    req.body = resultado.data;
    next();
  };
}

// Igual que validar, pero para los parámetros de la URL (?categoria=...&comuna=...).
// En Express 5 req.query es de solo lectura, por eso el resultado queda en req.consulta.
export function validarConsulta(esquema) {
  return (req, _res, next) => {
    const resultado = esquema.safeParse(req.query ?? {});
    if (!resultado.success) return next(errorDeValidacion(resultado.error.issues));
    req.consulta = resultado.data;
    next();
  };
}
