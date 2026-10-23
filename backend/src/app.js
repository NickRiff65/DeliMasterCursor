import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rutasSalud } from './routes/salud.js';
import { rutasAuth } from './modules/auth/auth.rutas.js';
import { rutasCategorias, rutasComunas } from './modules/categorias/categorias.rutas.js';
import { rutasPrestadores } from './modules/prestadores/prestadores.rutas.js';
import { rutasVerificacionPrestador, rutasVerificacionAdmin } from './modules/verificaciones/verificaciones.rutas.js';
import { rutasSolicitudes } from './modules/solicitudes/solicitudes.rutas.js';
import { rutasMensajes, rutasFotoChat } from './modules/mensajes/mensajes.rutas.js';
import { rutasNotificaciones } from './modules/notificaciones/notificaciones.rutas.js';
import { rutasPagoSolicitud, rutasWebpay, rutasOneclick, rutasTarjeta } from './modules/pagos/pagos.rutas.js';
import {
  rutasBoletas, rutasGastosTrabajo, rutasGastos, rutasImagenBoleta, rutasFinanzas, rutasMaterialesCliente, rutasDinero,
} from './modules/gastos/gastos.rutas.js';
import { rutasAdmin } from './modules/admin/admin.rutas.js';
import { rutasFotosSolicitud, rutasImagenEvidencia } from './modules/evidencias/evidencias.rutas.js';
import { rutaNoEncontrada, manejadorErrores } from './middlewares/errores.js';
import { limiteGeneral } from './middlewares/limites.js';
import { config } from './config/env.js';
import { servirWeb } from './web.js';

// La app se construye por separado del servidor para poder probarla sin abrir un puerto.
export function crearApp() {
  const app = express();
  if (config.confiarEnProxy) app.set('trust proxy', config.confiarEnProxy);   // IP y protocolo reales detrás del PaaS

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        // Fotos elegidas en la versión web (vista previa local) y enlaces firmados de la propia API
        'img-src': ["'self'", 'data:', 'blob:'],
        // La versión web también se usa por http en la red local; forzar https la rompería ahí
        'upgrade-insecure-requests': null,
      },
    },
  }));
  // Sin lista (desarrollo) se acepta cualquier origen; en producción solo los dominios configurados.
  // La API usa tokens en el encabezado, no cookies, por lo que no es vulnerable a CSRF.
  app.use(cors(config.corsOrigenes.length ? { origin: config.corsOrigenes } : {}));
  app.use(limiteGeneral);
  // Las fotos de boletas (HU-09) se aceptan más grandes; esta ruta va antes del lector JSON general
  app.use('/api/solicitudes/:id/boletas', rutasBoletas);
  app.use('/api/solicitudes/:id/fotos', rutasFotosSolicitud);
  app.use('/api/solicitudes/:id/mensajes/foto', rutasFotoChat);
  app.use(express.json({ limit: '1mb' }));

  // Índice de la API: útil en desarrollo; en producción no se publica el inventario de rutas (OWASP API9)
  if (!config.esProduccion) app.get('/api', (_req, res) => {
    res.json({
      servicio: 'DeliMaster API',
      version: '0.10.0',
      rutas: {
        'GET /api/salud': 'Estado del servicio',
        'POST /api/auth/registro': 'Crear cuenta de cliente o prestador (HU-10)',
        'POST /api/auth/login': 'Iniciar sesión (HU-10)',
        'GET /api/auth/yo': 'Datos del usuario con sesión (requiere token)',
        'PUT /api/auth/yo': 'Editar nombre, celular y comuna',
        'POST /api/auth/terminos': 'Aceptar la versión vigente de los términos y la política de privacidad',
        'PUT /api/auth/password': 'Cambiar la contraseña (cierra las demás sesiones)',
        'POST /api/auth/recuperar': 'Pedir un código por correo para recuperar la contraseña',
        'POST /api/auth/restablecer': 'Crear una nueva contraseña con el código recibido',
        'GET /api/categorias': 'Categorías habilitadas',
        'GET /api/comunas': 'Comunas atendidas (Chillán y Coihueco)',
        'GET /api/prestadores?categoria=&comuna=&pagina=': 'Catálogo de prestadores (HU-01, HU-07)',
        'GET /api/prestadores/:id': 'Perfil público del prestador (HU-02)',
        'GET /api/prestadores/yo': 'Ficha del prestador con sesión (requiere token)',
        'PUT /api/prestadores/yo': 'Editar ficha: descripción, comunas, categorías, disponibilidad',
        'GET /api/prestadores/yo/verificaciones': 'Mis solicitudes de verificación (HU-11)',
        'POST /api/prestadores/yo/verificaciones': 'Solicitar verificación SEC/SAG (HU-11)',
        'GET|PUT /api/prestadores/yo/datos-pago': 'Datos bancarios para recibir los pagos (HU-13)',
        'GET /api/admin/verificaciones?estado=pendiente': 'Solicitudes por revisar (admin)',
        'PATCH /api/admin/verificaciones/:id': 'Aprobar o rechazar una verificación, con vencimiento SEC (admin, HU-11, HU-17)',
        'GET /api/admin/resumen': 'Métricas, indicadores y pendientes del equipo (admin, HU-14)',
        'GET /api/admin/disputas?estado=abiertas|resueltas': 'Disputas (admin, HU-16)',
        'GET /api/admin/solicitudes/:id': 'Evidencia completa: chat, pago, ledger e historial (admin)',
        'POST /api/admin/disputas/:id/resolver': 'Liberar el pago al prestador o reembolsar al cliente (admin, HU-16)',
        'GET /api/admin/liquidaciones': 'Pagos liberados por transferir y transferencias hechas (admin, HU-13)',
        'POST /api/admin/liquidaciones/:prestadorId': 'Registrar una transferencia con su comprobante (admin, HU-13)',
        'GET /api/admin/moderacion': 'Usuarios con mensajes bloqueados por el filtro (admin)',
        'PATCH /api/admin/usuarios/:id': 'Activar o desactivar una cuenta (admin)',
        'POST /api/solicitudes/interpretar': 'Vista previa de lo que entendió el sistema (HU-08)',
        'POST /api/solicitudes': 'Crear solicitud en lenguaje natural; idempotente por id (HU-08, HU-12)',
        'GET /api/solicitudes': 'Mis solicitudes (cliente o prestador)',
        'GET /api/solicitudes/:id': 'Detalle e historial de una solicitud',
        'POST /api/solicitudes/:id/asignar': 'El cliente elige un prestador',
        'POST /api/solicitudes/:id/responder': 'El prestador acepta (con precio) o rechaza (HU-05)',
        'POST /api/solicitudes/:id/cancelar': 'El cliente cancela antes del pago',
        'POST /api/solicitudes/:id/finalizar': 'El prestador marca el trabajo como terminado',
        'POST /api/solicitudes/:id/cerrar': 'El cliente confirma el cierre: el pago pasa a liberado',
        'POST /api/solicitudes/:id/reportar': 'El cliente reporta un problema (dinero sigue retenido)',
        'POST /api/solicitudes/:id/resena': 'Calificar un trabajo cerrado (HU-06); recalcula la reputación (HU-07)',
        'GET /api/solicitudes/:id/mensajes': 'Historial del chat (HU-04)',
        'POST /api/solicitudes/:id/mensajes': 'Enviar mensaje con filtro anti-fuga (HU-04)',
        'WebSocket (Socket.io) evento "unirse"': 'Recibir mensajes en tiempo real de una solicitud',
        'POST /api/solicitudes/:id/pago': 'Iniciar pago en garantía con Webpay Plus (HU-03)',
        'GET|POST /api/pagos/webpay/retorno': 'Retorno desde Webpay: confirma el pago y retiene el monto en el ledger',
        'POST /api/solicitudes/:id/boletas': 'Subir foto de boleta: el OCR propone el total (HU-09)',
        'GET|POST /api/solicitudes/:id/gastos': 'Gastos del trabajo y ganancia neta (HU-09)',
        'DELETE /api/gastos/:id': 'Eliminar un gasto',
        'GET /api/prestadores/yo/finanzas?mes=AAAA-MM': 'Panel contable del mes (HU-09)',
        'GET|POST /api/solicitudes/:id/fotos': 'Fotos de evidencia del trabajo o del problema (HU-16)',
        'POST /api/solicitudes/:id/llegada': 'El prestador confirma la llegada con el código y, si hay punto, su GPS',
        'POST /api/solicitudes/:id/cotizacion': 'Cotización después del diagnóstico',
        'POST /api/solicitudes/:id/cotizacion/respuesta': 'El cliente acepta o rechaza la cotización',
        'POST /api/solicitudes/:id/no-llego': 'El cliente pide la devolución de la visita',
        'POST /api/solicitudes/:id/mensajes/foto': 'Foto en el chat',
        'GET /api/notificaciones': 'Avisos de la persona y cuántos no ha leído',
        'POST /api/notificaciones/leidas': 'Marca los avisos como leídos',
        'POST /api/notificaciones/dispositivo': 'Registra el teléfono para avisos con la app cerrada',
        'DELETE /api/notificaciones/dispositivo': 'Deja de enviar avisos a ese teléfono',
        'GET|POST|DELETE /api/pagos/tarjeta': 'Tarjeta guardada con Webpay Oneclick',
        'GET|POST /api/pagos/oneclick/retorno': 'Retorno de la inscripción de la tarjeta',
        'GET /api/solicitudes/:id/materiales': 'Materiales que ve el cliente',
        'GET /api/prestadores/yo/dinero': 'Pagos liberados y transferidos del prestador',
        'PATCH /api/gastos/:id': 'Asocia una boleta a un gasto',
        'GET|POST /api/auth/yo/eliminar': 'Qué impide borrar la cuenta, y borrarla',
      },
    });
  });

  app.use('/api/salud', rutasSalud);
  app.use('/api/auth', rutasAuth);
  app.use('/api/categorias', rutasCategorias);
  app.use('/api/comunas', rutasComunas);
  app.use('/api/prestadores/yo/verificaciones', rutasVerificacionPrestador);
  app.use('/api/prestadores/yo/finanzas', rutasFinanzas);
  app.use('/api/prestadores/yo/dinero', rutasDinero);
  app.use('/api/prestadores', rutasPrestadores);
  app.use('/api/admin/verificaciones', rutasVerificacionAdmin);
  app.use('/api/admin', rutasAdmin);
  app.use('/api/solicitudes/:id/mensajes', rutasMensajes);
  app.use('/api/solicitudes/:id/pago', rutasPagoSolicitud);
  app.use('/api/pagos/webpay', rutasWebpay);
  app.use('/api/pagos/oneclick', rutasOneclick);
  app.use('/api/pagos/tarjeta', rutasTarjeta);
  app.use('/api/notificaciones', rutasNotificaciones);
  app.use('/api/solicitudes/:id/gastos', rutasGastosTrabajo);
  app.use('/api/solicitudes/:id/materiales', rutasMaterialesCliente);
  app.use('/api/gastos', rutasGastos);
  app.use('/api/boletas', rutasImagenBoleta);
  app.use('/api/evidencias', rutasImagenEvidencia);
  app.use('/api/solicitudes', rutasSolicitudes);

  // Versión web de Lite y Pro y panel de administración, si están compilados
  servirWeb(app);

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
