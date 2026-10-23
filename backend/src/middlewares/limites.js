// Límites de uso (OWASP API4: consumo de recursos sin restricción).
// Protegen las operaciones caras (OCR de boletas) y las que se pueden abusar en masa
// (mensajes, solicitudes, pagos). Se cuentan por usuario cuando hay sesión y por IP si no.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env.js';
import { registrarEventoSeguridad } from '../utils/seguridad.js';

// En las pruebas automáticas se desactivan, salvo en las que prueban justamente los límites
const omitir = () => config.esTest && !process.env.PROBAR_LIMITES;

function crear({ minutos, maximo, nombre, clave, soloFallidos = false }) {
  return rateLimit({
    windowMs: minutos * 60 * 1000,
    limit: maximo,
    skip: omitir,
    keyGenerator: clave ?? ((req) => (req.usuario ? `u:${req.usuario.id}` : ipKeyGenerator(req.ip))),
    skipSuccessfulRequests: soloFallidos,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, _next, opciones) => {
      registrarEventoSeguridad('limite_excedido', { limite: nombre, usuario: req.usuario?.id, ip: req.ip, ruta: req.originalUrl });
      res.status(opciones.statusCode).json({
        error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Hiciste demasiadas solicitudes seguidas; espera unos minutos e intenta de nuevo' },
      });
    },
  });
}

// Toda la API: un techo amplio por IP contra inundaciones (un uso normal no se acerca)
export const limiteGeneral = crear({ minutos: 5, maximo: 1000, nombre: 'general', clave: (req) => ipKeyGenerator(req.ip) });

// Registro e inicio de sesión: por IP (fuerza bruta desde un equipo)…
export const limiteAutenticacionIp = crear({ minutos: 15, maximo: 20, nombre: 'auth_ip', clave: (req) => ipKeyGenerator(req.ip) });
// …y por cuenta: 5 intentos fallidos cada 15 minutos aunque vengan de muchas IP (fuerza bruta distribuida)
export const limiteLoginCuenta = crear({
  minutos: 15, maximo: 5, nombre: 'login_cuenta', soloFallidos: true,
  clave: (req) => `login:${String(req.body?.email ?? '').trim().toLowerCase() || ipKeyGenerator(req.ip)}`,
});

// Operaciones de usuarios con sesión
export const limiteBoletas = crear({ minutos: 10, maximo: 20, nombre: 'ocr_boletas' });      // el OCR usa mucha CPU
export const limiteMensajes = crear({ minutos: 1, maximo: 30, nombre: 'mensajes' });
export const limiteSolicitudes = crear({ minutos: 60, maximo: 30, nombre: 'solicitudes' });  // crear e interpretar
export const limitePagos = crear({ minutos: 10, maximo: 10, nombre: 'iniciar_pago' });

// Cuentas: cambiar la contraseña (5 intentos fallidos) y recuperar el acceso (por correo)
export const limiteCambioPassword = crear({ minutos: 15, maximo: 5, nombre: 'cambio_password', soloFallidos: true });
const porCorreo = (prefijo) => (req) => `${prefijo}:${String(req.body?.email ?? '').trim().toLowerCase() || ipKeyGenerator(req.ip)}`;
export const limiteRecuperacion = crear({ minutos: 15, maximo: 3, nombre: 'recuperacion', clave: porCorreo('recuperar') });
export const limiteRestablecer = crear({ minutos: 15, maximo: 10, nombre: 'restablecer', clave: porCorreo('restablecer') });

// Fotos de evidencia de un trabajo (cada una pesa hasta 6 MB)
export const limiteFotos = crear({ minutos: 10, maximo: 20, nombre: 'fotos_evidencia' });
// Código de llegada: además del tope de 5 intentos por visita, un límite por cuenta
export const limiteCodigoLlegada = crear({ minutos: 15, maximo: 15, nombre: 'codigo_llegada' });
