import { io } from 'socket.io-client';
import { API_URL } from './config';
import { obtenerToken } from './api';

// Conexión en tiempo real (HU-04). El servidor Socket.io comparte puerto con la API.
const URL_SOCKET = API_URL.replace(/\/api\/?$/, '');

let socket = null;
let tokenDelSocket = null;

// Devuelve la conexión abierta con la sesión actual (la crea o la renueva si cambió el usuario)
export function obtenerSocket() {
  const token = obtenerToken();
  if (socket && tokenDelSocket === token) return socket;
  socket?.disconnect();
  tokenDelSocket = token;
  socket = io(URL_SOCKET, { auth: { token }, transports: ['websocket'] });
  return socket;
}

export function desconectarSocket() {
  socket?.disconnect();
  socket = null;
  tokenDelSocket = null;
}
