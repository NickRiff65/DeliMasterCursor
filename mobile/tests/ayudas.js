import { Text } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import RootLayout from '../src/app/_layout';

// Cambia la app que se prueba: 'lite' (clientes) o 'pro' (prestadores)
export function usarVariante(v) {
  const pro = v === 'pro';
  Object.assign(require('../src/lib/variante'), {
    VARIANTE: v, ES_PRO: pro, ROL_APP: pro ? 'prestador' : 'cliente', NOMBRE_APP: pro ? 'DeliMaster Pro' : 'DeliMaster Lite',
  });
}

export const SIN_CONEXION = Symbol('sin conexión');
export const errorApi = (status, codigo, mensaje, campos) => ({ __status: status, error: { codigo, mensaje, campos } });

// Reemplaza fetch por una API simulada. Cada clave es "MÉTODO /ruta" y su valor es la respuesta,
// errorApi(...), SIN_CONEXION o una función (cuerpo, llamadas) => respuesta. Devuelve las llamadas.
export function simularApi(rutas) {
  const llamadas = [];
  global.fetch = jest.fn(async (url, opciones = {}) => {
    const ruta = url.replace(/^https?:\/\/[^/]+\/api/, '');
    const metodo = opciones.method ?? 'GET';
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
    llamadas.push({ metodo, ruta, cuerpo, headers: opciones.headers ?? {} });
    let r = rutas[`${metodo} ${ruta}`];
    if (typeof r === 'function') r = await r(cuerpo, llamadas);
    if (r === SIN_CONEXION) throw new TypeError('Network request failed');
    const status = r === undefined ? 404 : r.__status ?? 200;
    const datos = r === undefined ? { error: { codigo: 'NO_SIMULADA', mensaje: `Ruta no simulada: ${metodo} ${ruta}` } } : r;
    return { ok: status < 400, status, json: async () => datos };
  });
  return llamadas;
}

export const cliente = {
  id: 'c1', rol: 'cliente', nombre: 'Valentina Rojas', email: 'valentina@demo.cl', comuna: 'Chillán', terminos_pendientes: false,
};
export const prestador = {
  id: 'p1', rol: 'prestador', nombre: 'María González', email: 'maria@demo.cl', comuna: 'Chillán', terminos_pendientes: false,
};

// Simula una sesión guardada en el celular de una vez anterior. La clave del token se fija al
// cargar src/lib/almacen.js con la variante inicial (lite); en almacen.test.js se prueba la de Pro.
const CLAVE_TOKEN = 'delimaster.token.lite';
export const sesionGuardada = (token = 'token-guardado') => SecureStore.__datos.set(CLAVE_TOKEN, token);
export const tokenGuardado = () => SecureStore.__datos.get(CLAVE_TOKEN) ?? null;

// Todas las rutas de src/app. Las que no se prueban se reemplazan por una pantalla que solo dice su nombre.
const RUTAS = [
  'login', 'registro', 'recuperar', 'aceptar-terminos', 'panel', 'ficha', 'verificaciones', 'recibidas',
  'trabajo/[id]', 'finanzas', 'datos-pago', 'index', 'maestros', 'prestador/[id]', 'nueva-solicitud',
  'solicitud/[id]', 'chat/[id]', 'avisos', 'cuenta', 'terminos', 'privacidad',
];
const falsa = (ruta) => function PantallaFalsa() { return <Text>Pantalla {ruta}</Text>; };

// Abre la app real (con su _layout: sesión, cola y rutas protegidas) en la ruta indicada.
// Devuelve ruta(), la dirección actual (con RNTL 14 el render es asíncrono y los métodos de
// expo-router quedan en la promesa, no en screen).
export async function abrirApp({ ruta = '/', pantallas = {} } = {}) {
  const contexto = { _layout: RootLayout };
  for (const r of RUTAS) contexto[r] = pantallas[r] ?? falsa(r);
  const render = renderRouter(contexto, { initialUrl: ruta });
  await render;
  return { ruta: () => render.getPathnameWithParams() };
}
