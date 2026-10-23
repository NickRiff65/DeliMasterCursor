// Error de negocio con código HTTP. Los errores que no sean AppError se tratan como 500
// y su detalle no se expone al cliente.
export class AppError extends Error {
  constructor(mensaje, status = 400, codigo = 'ERROR_DE_NEGOCIO') {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}
