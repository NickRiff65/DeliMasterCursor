import { API_URL } from './config';

// Error con el formato de la API: { codigo, mensaje, campos }
export class ApiError extends Error {
  constructor(status, { codigo, mensaje, campos } = {}) {
    super(mensaje ?? 'Ocurrió un error inesperado');
    this.status = status;
    this.codigo = codigo ?? 'ERROR';
    this.campos = campos ?? {};
  }
}

let tokenActual = null;
export function usarToken(token) {
  tokenActual = token;
}
export function obtenerToken() {
  return tokenActual;
}

async function solicitud(metodo, ruta, cuerpo) {
  let res;
  try {
    res = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        ...(tokenActual ? { Authorization: `Bearer ${tokenActual}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ApiError(0, {
      codigo: 'SIN_CONEXION',
      mensaje: 'No pudimos conectarnos con DeliMaster. Revisa tu conexión a internet.',
    });
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, datos.error);
  return datos;
}

export const api = {
  get: (ruta) => solicitud('GET', ruta),
  post: (ruta, cuerpo) => solicitud('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => solicitud('PUT', ruta, cuerpo),
  patch: (ruta, cuerpo) => solicitud('PATCH', ruta, cuerpo),
  delete: (ruta) => solicitud('DELETE', ruta),
};

// Arma "?categoria=x&comuna=y" omitiendo valores vacíos
export function consulta(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? `?${q}` : '';
}
