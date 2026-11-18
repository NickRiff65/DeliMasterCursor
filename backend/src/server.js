import http from 'node:http';
import { config } from './config/env.js';
import { crearApp } from './app.js';
import { iniciarSocket } from './socket.js';
import { iniciarRelojPlazos } from './tareas/plazos.js';
import { iniciarRelojVerificaciones } from './tareas/verificaciones.js';
import { pool } from './db/pool.js';
import { cifrarCuentasEnClaro } from './utils/cuentaBancaria.js';

// Express atiende la API REST y Socket.io comparte el mismo servidor HTTP (mismo puerto)
const servidor = http.createServer(crearApp());
iniciarSocket(servidor);

servidor.listen(config.puerto, () => {
  console.log(`DeliMaster API escuchando en http://localhost:${config.puerto} (${config.entorno})`);
  iniciarRelojPlazos();
  iniciarRelojVerificaciones();
  // Por si quedó alguna cuenta bancaria en texto plano (datos anteriores al cifrado)
  cifrarCuentasEnClaro(pool)
    .then((n) => { if (n) console.log(`${n} cuenta(s) bancaria(s) cifrada(s) al iniciar`); })
    .catch((err) => console.error(`No se pudieron cifrar las cuentas bancarias pendientes: ${err.message}`));
});
