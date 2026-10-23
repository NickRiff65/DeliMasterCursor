import { screen, userEvent } from 'expo-router/testing-library';
import Cuenta from '../src/app/cuenta';
import Login from '../src/app/login';
import { abrirApp, simularApi, errorApi, sesionGuardada, tokenGuardado, cliente, prestador, usarVariante } from './ayudas';

// Ley N.º 21.719: eliminar la cuenta desde Mi cuenta (ambas apps)
beforeEach(() => sesionGuardada());

async function abrir(rutas, usuario = cliente) {
  const llamadas = simularApi({ 'GET /auth/yo': { usuario }, 'GET /pagos/tarjeta': { tarjeta: null }, ...rutas });
  await abrirApp({ ruta: '/cuenta', pantallas: { cuenta: Cuenta, login: Login } });
  return llamadas;
}

describe('Eliminar mi cuenta', () => {
  test('explica qué se borra, pide la contraseña y la confirmación, y cierra la sesión', async () => {
    const llamadas = await abrir({
      'GET /auth/yo/eliminar': { puede_eliminar: true, motivo: null },
      'POST /auth/yo/eliminar': (cuerpo) => (cuerpo.password === 'clave1234'
        ? { eliminada: true }
        : errorApi(422, 'DATOS_INVALIDOS', 'La contraseña no es correcta', { password: 'La contraseña no es correcta' })),
    });
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await screen.findByText(/Se borran tu nombre, correo, celular y comuna y tu tarjeta guardada/)).toBeOnTheScreen();
    expect(screen.getByText(/Se conservan, sin tu nombre, los pagos/)).toBeOnTheScreen();

    const boton = screen.getByRole('button', { name: 'Eliminar mi cuenta definitivamente' });
    expect(boton).toBeDisabled();
    await user.type(screen.getByLabelText('Tu contraseña'), 'otra');
    await user.press(screen.getByRole('checkbox', { checked: false }));
    await user.press(boton);
    expect(await screen.findByText('La contraseña no es correcta')).toBeOnTheScreen();

    await user.clear(screen.getByLabelText('Tu contraseña'));
    await user.type(screen.getByLabelText('Tu contraseña'), 'clave1234');
    await user.press(boton);
    expect(await screen.findByText('Eliminamos tu cuenta')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Entendido' }));
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
    expect(tokenGuardado()).toBeNull();
    expect(llamadas.filter((l) => l.ruta === '/auth/yo/eliminar' && l.metodo === 'POST').map((l) => l.cuerpo))
      .toEqual([{ password: 'otra' }, { password: 'clave1234' }]);
  });

  test('si tiene algo pendiente, lo explica y no ofrece eliminar', async () => {
    await abrir({
      'GET /auth/yo/eliminar': { puede_eliminar: false, motivo: 'Tienes una solicitud en curso. Ciérrala o cancélala antes de eliminar tu cuenta.' },
    });
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await screen.findByText(/Tienes una solicitud en curso/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Eliminar mi cuenta definitivamente' })).not.toBeOnTheScreen();
  });

  test('en DeliMaster Pro menciona la ficha y los datos bancarios', async () => {
    usarVariante('pro');
    await abrir({ 'GET /auth/yo/eliminar': { puede_eliminar: true, motivo: null } }, prestador);
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await screen.findByText(/tu ficha y tus datos bancarios/)).toBeOnTheScreen();
  });
});
