// Tiempo real con Socket.io (HU-04).
// Los mensajes se envían por la API REST (que valida y filtra); Socket.io solo avisa
// al instante a quienes tienen el chat abierto. Cada solicitud es una "sala".
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config/env.js';
import { pool } from './db/pool.js';
import { cuentaActiva } from './middlewares/autenticacion.js';

let io = null;

const sala = (solicitudId) => `solicitud:${solicitudId}`;

export function iniciarSocket(servidorHttp) {
  io = new Server(servidorHttp, { cors: { origin: config.corsOrigenes.length ? config.corsOrigenes : '*' } });

  // Solo usuarios con sesión válida pueden conectarse
  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token ?? '', config.jwtSecret, { algorithms: ['HS256'] });
      const usuario = await cuentaActiva(payload.sub, payload.iat);   // ni cuentas desactivadas ni sesiones cerradas
      if (!usuario) return next(new Error('NO_AUTENTICADO'));
      socket.data.usuario = usuario;
      next();
    } catch {
      next(new Error('NO_AUTENTICADO'));
    }
  });

  io.on('connection', (socket) => {
    // Cada persona recibe sus avisos en su propia sala
    socket.join(`usuario:${socket.data.usuario.id}`);

    // Unirse al chat de una solicitud: solo el cliente y el prestador asignado
    socket.on('unirse', async (solicitudId, responder = () => {}) => {
      try {
        const { rows } = await pool.query(
          'SELECT 1 FROM solicitudes WHERE id = $1 AND (cliente_id = $2 OR prestador_id = $2)',
          [solicitudId, socket.data.usuario.id]);
        if (!rows.length) return responder({ ok: false });
        await socket.join(sala(solicitudId));
        responder({ ok: true });
      } catch {
        responder({ ok: false });
      }
    });

    socket.on('salir', (solicitudId) => socket.leave(sala(solicitudId)));
  });

  return io;
}

// Saca a todos de la sala del chat: se usa cuando la solicitud cambia de prestador o se cancela,
// para que quien ya no participa deje de recibir los mensajes en tiempo real (OWASP API1)
export function expulsarDeSala(solicitudId) {
  io?.in(sala(solicitudId)).socketsLeave(sala(solicitudId));
}

// Avisa un mensaje nuevo a quienes tienen abierto el chat de esa solicitud
export function emitirMensaje(solicitudId, mensaje) {
  io?.to(sala(solicitudId)).emit('mensaje', mensaje);
}

// Aviso nuevo para una persona (si tiene la app abierta)
export function emitirNotificacion(usuarioId, notificacion) {
  io?.to(`usuario:${usuarioId}`).emit('notificacion', notificacion);
}

export function cerrarSocket() {
  io?.close();
  io = null;
}
