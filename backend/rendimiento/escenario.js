// Escenario común de las pruebas de rendimiento (k6): lo que hace una persona real en DeliMaster.
// · 4 de cada 5 usuarios virtuales son clientes (Lite): inician sesión, revisan sus solicitudes y avisos,
//   exploran el catálogo, abren un perfil y publican una solicitud (una por cliente, como en la app).
// · 1 de cada 5 es un maestro (Pro): inicia sesión, revisa su panel, solicitudes recibidas, dinero y agenda.
// Entre pantallas hay pausas de 1 a 3 segundos, como al usar la app. Cada usuario virtual llega con su
// propia dirección IP (X-Forwarded-For), igual que en internet, así los límites de uso quedan activos.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3001';
const CLAVE_CARGA = __ENV.CLAVE_CARGA;                 // cuentas de cliente creadas para la prueba
const CLAVE_DEMO = __ENV.CLAVE_DEMO;                   // cuentas de maestro de los datos de demostración
const MAESTROS = (__ENV.MAESTROS || '').split(',').filter(Boolean);
const SUFIJO = __ENV.SUFIJO || 'x';

const ip = (n) => `10.${Math.floor(n / 250) % 250}.${n % 250}.7`;
const correo = (n) => `carga${n}.${SUFIJO}@carga.test`;
const opciones = (n, punto, token) => ({
  headers: {
    'Content-Type': 'application/json', 'X-Forwarded-For': ip(n),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  tags: { punto },
});
const pausa = () => sleep(1 + Math.random() * 2);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(Math.random() * 16);
  return (c === 'x' ? r : (r % 4) + 8).toString(16);
});

const NECESIDADES = [
  'Se me quemó un enchufe y saltó el automático',
  'Necesito podar un árbol muy alto que está sobre el techo',
  'Se rompió una cañería y está saliendo agua en la cocina',
  'Hay que pintar el living y dos dormitorios',
];

// Se ejecuta una vez antes de la prueba: crea una cuenta de cliente por usuario virtual y lee el catálogo
export function prepararDatos(usuarios) {
  for (let n = 1; n <= usuarios; n++) {
    const r = http.post(`${BASE}/api/auth/registro`, JSON.stringify({
      rol: 'cliente', nombre: 'Carga', apellido: 'Prueba', email: correo(n), password: CLAVE_CARGA,
      acepta_terminos: true, comuna: n % 4 === 0 ? 'Coihueco' : 'Chillán',
    }), opciones(n, 'preparacion'));
    if (r.status !== 201) throw new Error(`No se pudo crear la cuenta ${n}: ${r.status} ${r.body}`);
  }
  const cat = http.get(`${BASE}/api/prestadores?limite=50`, opciones(0, 'preparacion'));
  return { maestros: cat.json('prestadores').map((p) => p.id) };
}

// Estado de cada usuario virtual (k6 mantiene una copia de este módulo por usuario)
let token = null;
let miSolicitud = null;

function iniciarSesion(n, esMaestro) {
  const email = esMaestro ? MAESTROS[Math.floor(n / 5) % MAESTROS.length] : correo(n);
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: esMaestro ? CLAVE_DEMO : CLAVE_CARGA }),
    opciones(n, 'inicio_sesion'));
  check(r, { 'inicio de sesión 200': (x) => x.status === 200 });
  token = r.status === 200 ? r.json('token') : null;
}

const ver = (n, punto, ruta) => {
  const r = http.get(`${BASE}${ruta}`, opciones(n, punto, token));
  check(r, { [`${punto} 200`]: (x) => x.status === 200 });
  return r;
};

function comoCliente(n, datos) {
  ver(n, 'mis_solicitudes', '/api/solicitudes');
  ver(n, 'avisos', '/api/notificaciones');
  pausa();

  ver(n, 'catalogo', `/api/prestadores?comuna=${n % 4 === 0 ? 'Coihueco' : 'Chill%C3%A1n'}&orden=reputacion&pagina=1&limite=20`);
  pausa();
  if (datos.maestros.length) {
    ver(n, 'perfil_maestro', `/api/prestadores/${datos.maestros[Math.floor(Math.random() * datos.maestros.length)]}`);
    pausa();
  }

  if (!miSolicitud) {
    // Publica su solicitud: primero la app muestra lo que entendió y luego la crea (una por cliente)
    const descripcion = NECESIDADES[n % NECESIDADES.length];
    const i = http.post(`${BASE}/api/solicitudes/interpretar`, JSON.stringify({ descripcion }), opciones(n, 'interpretar', token));
    check(i, { 'interpretar 200': (x) => x.status === 200 });
    pausa();
    const id = uuid();
    const c = http.post(`${BASE}/api/solicitudes`, JSON.stringify({
      id, descripcion, comuna: n % 4 === 0 ? 'Coihueco' : 'Chillán', direccion: `Av. Libertad ${1000 + n}`,
      creado_en_dispositivo: new Date().toISOString(),
    }), opciones(n, 'crear_solicitud', token));
    check(c, { 'crear solicitud 201': (x) => x.status === 201 });
    if (c.status === 201) miSolicitud = c.json('solicitudes.0.id');
  } else {
    ver(n, 'detalle_solicitud', `/api/solicitudes/${miSolicitud}`);
  }
  pausa();
}

function comoMaestro(n) {
  ver(n, 'panel_maestro', '/api/prestadores/yo');
  ver(n, 'recibidas', '/api/solicitudes?estado=asignada');
  ver(n, 'avisos', '/api/notificaciones');
  pausa();
  ver(n, 'dinero_maestro', '/api/prestadores/yo/dinero');
  ver(n, 'agenda_maestro', '/api/prestadores/yo/agenda');
  pausa();
  pausa();
}

export function recorrido(datos) {
  const n = __VU;
  const esMaestro = MAESTROS.length > 0 && n % 5 === 0;
  if (!token) {
    iniciarSesion(n, esMaestro);
    if (!token) { sleep(2); return; }
    ver(n, 'categorias', '/api/categorias');
    ver(n, 'comunas', '/api/comunas');
  }
  if (esMaestro) comoMaestro(n);
  else comoCliente(n, datos);
}

// Puntos de la API que se miden por separado (percentil 95 de cada uno)
export const PUNTOS = [
  'inicio_sesion', 'categorias', 'comunas', 'catalogo', 'perfil_maestro', 'mis_solicitudes', 'avisos',
  'interpretar', 'crear_solicitud', 'detalle_solicitud', 'panel_maestro', 'recibidas', 'dinero_maestro', 'agenda_maestro',
];
