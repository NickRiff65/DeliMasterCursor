import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SesionProvider } from '../src/sesion.jsx';
import App from '../src/App.jsx';
import { simularApi, errorApi, resumenVacio } from './ayudas.jsx';

const CLAVE = 'delimaster-admin-sesion';
const admin = { id: 'a1', rol: 'admin', nombre: 'Equipo DeliMaster' };

function abrirPanel(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SesionProvider><App /></SesionProvider>
    </MemoryRouter>,
  );
}

async function ingresar(email, password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Correo'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

describe('Sesión del panel', () => {
  test('una cuenta de cliente no puede entrar al panel', async () => {
    simularApi({ 'POST /auth/login': { token: 't-cliente', usuario: { id: 'c1', rol: 'cliente', nombre: 'Ana' } } });
    abrirPanel();
    await ingresar('ana@demo.cl', 'demo1234');
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta no tiene acceso al panel de administración.');
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  test('credenciales incorrectas muestran el mensaje de la API', async () => {
    simularApi({ 'POST /auth/login': errorApi(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos') });
    abrirPanel();
    await ingresar('admin@demo.cl', 'mala');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });

  test('el administrador entra, ve los pendientes en el menú y la sesión queda solo en la pestaña', async () => {
    const llamadas = simularApi({
      'POST /auth/login': { token: 't-admin', usuario: admin },
      'GET /admin/resumen': { ...resumenVacio, pendientes: { ...resumenVacio.pendientes, disputas: 2, verificaciones: 3 } },
    });
    abrirPanel();
    await ingresar('admin@demo.cl', 'demo1234');

    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByLabelText('2 pendientes')).toBeInTheDocument();
    expect(screen.getByLabelText('3 pendientes')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(CLAVE)).token).toBe('t-admin');
    expect(llamadas.find((l) => l.ruta === '/admin/resumen').headers.Authorization).toBe('Bearer t-admin');
    expect(llamadas[0].cuerpo).toEqual({ email: 'admin@demo.cl', password: 'demo1234' });
  });

  test('al recargar la página la sesión de la pestaña se recupera', async () => {
    sessionStorage.setItem(CLAVE, JSON.stringify({ token: 't-guardado', usuario: admin }));
    const llamadas = simularApi({ 'GET /admin/resumen': resumenVacio });
    abrirPanel();
    expect(await screen.findByRole('heading', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByText('Equipo DeliMaster')).toBeInTheDocument();
    expect(llamadas[0].headers.Authorization).toBe('Bearer t-guardado');
  });

  test('si la sesión vence (401) vuelve al ingreso y borra la sesión guardada', async () => {
    sessionStorage.setItem(CLAVE, JSON.stringify({ token: 't-vencido', usuario: admin }));
    simularApi({ 'GET /admin/resumen': errorApi(401, 'TOKEN_INVALIDO', 'Tu sesión expiró') });
    abrirPanel();
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });

  test('cerrar sesión vuelve a la pantalla de ingreso', async () => {
    sessionStorage.setItem(CLAVE, JSON.stringify({ token: 't', usuario: admin }));
    simularApi({ 'GET /admin/resumen': resumenVacio });
    abrirPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(sessionStorage.getItem(CLAVE)).toBeNull();
  });
});
