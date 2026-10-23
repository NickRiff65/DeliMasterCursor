import { screen, userEvent } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import useColorScheme from 'react-native/Libraries/Utilities/useColorScheme';
import Cuenta from '../src/app/cuenta';
import { paletas } from '../src/theme';
import { abrirApp, simularApi, sesionGuardada, cliente } from './ayudas';

// Modo oscuro (Mi cuenta → Apariencia), en Lite y en Pro
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn(() => 'light') }));

const CLAVE = 'delimaster.tema';
const colorDe = (elemento) => [elemento.props.style].flat(Infinity).filter(Boolean).reduce((a, e) => ({ ...a, ...e }), {}).color;

async function abrirCuenta() {
  sesionGuardada();
  simularApi({ 'GET /auth/yo': { usuario: cliente } });
  await abrirApp({ ruta: '/cuenta', pantallas: { cuenta: Cuenta } });
  return screen.findByText('Apariencia');
}

beforeEach(() => useColorScheme.mockReturnValue('light'));

describe('Modo claro y oscuro', () => {
  test('por defecto sigue al teléfono: claro si el teléfono está en claro', async () => {
    const titulo = await abrirCuenta();
    expect(colorDe(titulo)).toBe(paletas.claro.texto);
    expect(screen.getByRole('radio', { name: 'Modo automático' })).toBeChecked();
    expect(screen.getByText('Cambia sola según el modo claro u oscuro de tu teléfono.')).toBeOnTheScreen();
  });

  test('en automático, con el teléfono en oscuro la app se ve oscura', async () => {
    useColorScheme.mockReturnValue('dark');
    const titulo = await abrirCuenta();
    expect(colorDe(titulo)).toBe(paletas.oscuro.texto);
  });

  test('elegir "Oscuro" cambia los colores de inmediato y queda guardado en el dispositivo', async () => {
    await abrirCuenta();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Modo oscuro' }));

    expect(screen.getByRole('radio', { name: 'Modo oscuro' })).toBeChecked();
    expect(colorDe(screen.getByText('Apariencia'))).toBe(paletas.oscuro.texto);
    expect(colorDe(screen.getByText('Mis datos'))).toBe(paletas.oscuro.texto);
    expect(SecureStore.__datos.get(CLAVE)).toBe('oscuro');
  });

  test('la preferencia guardada se respeta al volver a abrir la app, aunque el teléfono esté en oscuro', async () => {
    SecureStore.__datos.set(CLAVE, 'claro');
    useColorScheme.mockReturnValue('dark');
    const titulo = await abrirCuenta();
    expect(colorDe(titulo)).toBe(paletas.claro.texto);
    expect(screen.getByRole('radio', { name: 'Modo claro' })).toBeChecked();
    expect(screen.getByText('Queda guardado en este dispositivo.')).toBeOnTheScreen();
  });
});

test('las dos paletas tienen los mismos colores definidos', () => {
  expect(Object.keys(paletas.oscuro).sort()).toEqual(Object.keys(paletas.claro).sort());
});
