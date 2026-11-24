// Texto legible de un error para el registro del servidor. Algunos errores llegan sin mensaje: por
// ejemplo, si PostgreSQL no responde, Node entrega un AggregateError vacío con un error por cada
// dirección que intentó (::1 y 127.0.0.1). Se informa el código y la dirección, nunca la contraseña.
export function describirError(err) {
  if (!err) return 'error desconocido';
  if (err.message) return err.message;
  const partes = (err.errors?.length ? err.errors : [err])
    .map((e) => [e.code, e.address && `${e.address}${e.port ? `:${e.port}` : ''}`].filter(Boolean).join(' '))
    .filter(Boolean);
  return partes.length ? partes.join(', ') : (err.name || 'error sin mensaje');
}
