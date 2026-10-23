import { screen, userEvent } from 'expo-router/testing-library';
import Login from '../src/app/login';
import AceptarTerminos from '../src/app/aceptar-terminos';
import {
  abrirApp, simularApi, errorApi, usarVariante, sesionGuardada, tokenGuardado, cliente, prestador,
} from './ayudas';
import { VERSION_TERMINOS } from '../src/legal/textos';

// Rutas protegidas del _layout: cada app muestra solo lo que corresponde a la sesión y al rol
describe('Navegación según la sesión', () => {
  test('sin sesión cualquier ruta privada lleva al inicio de sesión', async () => {
    simularApi({});
    const app = await abrirApp({ ruta: '/maestros', pantallas: { login: Login } });
    expect(await screen.findByText('DeliMaster Lite')).toBeOnTheScreen();
    expect(screen.getByText('Maestros y trabajos de campo verificados en Chillán')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/login');
  });

  test('los términos y la privacidad se pueden leer sin iniciar sesión', async () => {
    simularApi({});
    await abrirApp({ ruta: '/terminos' });
    expect(await screen.findByText('Pantalla terminos')).toBeOnTheScreen();
  });

  test('con una sesión guardada se entra directo al catálogo', async () => {
    sesionGuardada('token-valido');
    const llamadas = simularApi({ 'GET /auth/yo': { usuario: cliente } });
    await abrirApp({ ruta: '/' });
    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(llamadas[0].headers.Authorization).toBe('Bearer token-valido');
  });

  test('un token vencido se descarta y se pide iniciar sesión', async () => {
    sesionGuardada('token-vencido');
    simularApi({ 'GET /auth/yo': errorApi(401, 'TOKEN_INVALIDO', 'Sesión expirada') });
    await abrirApp({ ruta: '/', pantallas: { login: Login } });
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
    expect(tokenGuardado()).toBeNull();
  });

  test('quien tiene términos pendientes solo puede aceptarlos o cerrar sesión', async () => {
    sesionGuardada();
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: { ...cliente, terminos_pendientes: true } },
      'POST /auth/terminos': { usuario: cliente },
    });
    const app = await abrirApp({ ruta: '/maestros', pantallas: { 'aceptar-terminos': AceptarTerminos } });
    expect(await screen.findByText('Hola, Valentina')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/aceptar-terminos');

    const aceptar = screen.getByRole('button', { name: 'Aceptar y continuar' });
    expect(aceptar).toBeDisabled();
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox'));
    await user.press(aceptar);

    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === '/auth/terminos').cuerpo).toEqual({ version: VERSION_TERMINOS });
  });

  test('DeliMaster Pro abre el panel del prestador', async () => {
    usarVariante('pro');
    sesionGuardada();
    simularApi({ 'GET /auth/yo': { usuario: prestador } });
    const app = await abrirApp({ ruta: '/' });
    expect(await screen.findByText('Pantalla panel')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/panel');
  });
});

describe('Inicio de sesión', () => {
  async function ingresar(email, password) {
    const user = userEvent.setup();
    if (email) await user.type(screen.getByLabelText('Correo'), email);
    if (password) await user.type(screen.getByLabelText('Contraseña'), password);
    await user.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
  }

  test('pide correo y contraseña antes de llamar a la API', async () => {
    const llamadas = simularApi({});
    await abrirApp({ ruta: '/login', pantallas: { login: Login } });
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await ingresar('valentina@demo.cl', '');
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa tu correo y tu contraseña.');
    expect(llamadas).toHaveLength(0);
  });

  test('una cuenta de prestador no entra a Lite y su token no se guarda', async () => {
    simularApi({ 'POST /auth/login': { token: 't-prestador', usuario: prestador } });
    await abrirApp({ ruta: '/login', pantallas: { login: Login } });
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await ingresar('maria@demo.cl', 'demo1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta es de prestador. Para gestionar tus trabajos usa DeliMaster Pro.');
    expect(tokenGuardado()).toBeNull();
  });

  test('una cuenta de cliente no entra a Pro', async () => {
    usarVariante('pro');
    simularApi({ 'POST /auth/login': { token: 't-cliente', usuario: cliente } });
    await abrirApp({ ruta: '/login', pantallas: { login: Login } });
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await ingresar('valentina@demo.cl', 'demo1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta es de cliente. Para contratar servicios usa DeliMaster Lite.');
  });

  test('con credenciales correctas guarda el token cifrado y abre el catálogo', async () => {
    const llamadas = simularApi({ 'POST /auth/login': { token: 't-cliente', usuario: cliente } });
    await abrirApp({ ruta: '/login', pantallas: { login: Login } });
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await ingresar('  valentina@demo.cl ', 'demo1234');
    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(tokenGuardado()).toBe('t-cliente');
    expect(llamadas[0].cuerpo).toEqual({ email: 'valentina@demo.cl', password: 'demo1234' });
  });

  test('credenciales incorrectas muestran el mensaje de la API', async () => {
    simularApi({ 'POST /auth/login': errorApi(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos') });
    await abrirApp({ ruta: '/login', pantallas: { login: Login } });
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await ingresar('valentina@demo.cl', 'otra');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });
});
