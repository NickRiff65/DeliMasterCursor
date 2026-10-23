// Registro de eventos de seguridad (OWASP A09: registro y monitoreo).
// Una línea JSON por evento en la salida de errores: el proveedor de hosting la conserva
// y se puede buscar ("evento":"login_fallido") ante un incidente. Nunca se registran
// contraseñas ni tokens.
import { config } from '../config/env.js';

export function registrarEventoSeguridad(evento, datos = {}) {
  if (config.esTest) return;
  console.warn(JSON.stringify({ seguridad: true, evento, fecha: new Date().toISOString(), ...datos }));
}

// Correo parcialmente oculto para los registros ("an***@demo.cl")
export function ocultarCorreo(email) {
  const [usuario, dominio] = String(email ?? '').split('@');
  if (!dominio) return '***';
  return `${usuario.slice(0, 2)}***@${dominio}`;
}

// URL pública de la API: la configurada en producción o la deducida de la petición (red local)
export function urlApi(req) {
  return config.urlPublicaApi ?? `${req.protocol}://${req.get('host')}/api`;
}
