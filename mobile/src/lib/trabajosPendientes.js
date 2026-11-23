// Trabajos que la IA encontró en las mismas fotos pero que son de otro oficio (por ejemplo, una llave que
// gotea y un vidrio roto). Cada solicitud es para un solo trabajo: se publica el principal y los otros
// quedan aquí, con sus fotos, su descripción y el mismo lugar, para pedirlos con un toque.
// Vive en memoria mientras la app está abierta (las fotos pesan demasiado para guardarlas en el celular).
//
// pendiente = {
//   separadaDe: id de la primera solicitud (el servidor las cuenta como un mismo pedido del día),
//   ultima: id de la última solicitud publicada (en su pantalla se ofrece pedir el siguiente trabajo),
//   lugar: { comuna, direccion, referencia, gps },
//   trabajos: [{ categoria: { slug, nombre }, descripcion, fotos: [{ base64, uri, metadatos }] }],
// }
let pendiente = null;

export const tomarPendiente = () => pendiente;

export function guardarPendiente(datos) {
  pendiente = datos?.trabajos?.length ? datos : null;
}

export function descartarPendiente() {
  pendiente = null;
}
