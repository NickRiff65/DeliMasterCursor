// Cliente de la API de DeliMaster (VITE_API_URL la reemplaza):
// - En desarrollo (npm.cmd run dev, puerto 5173): el mismo equipo en el puerto 3000, así el panel
//   funciona en cualquier red sin configurar nada.
// - Compilado y entregado por el servidor en /admin: la misma dirección de la página.
const BASE = import.meta.env.VITE_API_URL
  ?? (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3000/api` : `${location.origin}/api`);

export class ApiError extends Error {
  constructor(status, { codigo, mensaje, campos } = {}) {
    super(mensaje ?? 'Ocurrió un error inesperado');
    this.status = status;
    this.codigo = codigo ?? 'ERROR';
    this.campos = campos ?? {};
  }
}

let token = null;
let alExpirar = () => {};
export const usarToken = (t) => { token = t; };
export const alPerderSesion = (fn) => { alExpirar = fn; };

async function solicitud(metodo, ruta, cuerpo) {
  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ApiError(0, { codigo: 'SIN_CONEXION', mensaje: 'No hay conexión con la API de DeliMaster. ¿Está encendido el backend?' });
  }
  const datos = await res.json().catch(() => ({}));
  if (res.status === 401 && token) alExpirar();
  if (!res.ok) throw new ApiError(res.status, datos.error);
  return datos;
}

export const api = {
  get: (ruta) => solicitud('GET', ruta),
  post: (ruta, cuerpo) => solicitud('POST', ruta, cuerpo ?? {}),
  patch: (ruta, cuerpo) => solicitud('PATCH', ruta, cuerpo ?? {}),
};
