import http from 'node:http';
import { config } from './config/env.js';
import { crearApp } from './app.js';
import { iniciarSocket } from './socket.js';
import { iniciarRelojPlazos } from './tareas/plazos.js';

// Express atiende la API REST y Socket.io comparte el mismo servidor HTTP (mismo puerto)
const servidor = http.createServer(crearApp());
iniciarSocket(servidor);

servidor.listen(config.puerto, () => {
  console.log(`DeliMaster API escuchando en http://localhost:${config.puerto} (${config.entorno})`);
  iniciarRelojPlazos();
});
