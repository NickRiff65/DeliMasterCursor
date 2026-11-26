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
  test('por defecto la app se ve oscura, aunque el teléfono esté en claro', async () => {
    const titulo = await abrirCuenta();
    expect(colorDe(titulo)).toBe(paletas.oscuro.texto);
    expect(screen.getByRole('radio', { name: 'Modo oscuro' })).toBeChecked();
  });

  test('en automático, con el teléfono en claro la app se ve clara', async () => {
    await abrirCuenta();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Modo automático' }));
    expect(colorDe(screen.getByText('Apariencia'))).toBe(paletas.claro.texto);
    expect(screen.getByText('Cambia sola según el modo claro u oscuro de tu teléfono.')).toBeOnTheScreen();
  });

  test('elegir "Claro" cambia los colores de inmediato y queda guardado en el dispositivo', async () => {
    await abrirCuenta();
    await userEvent.setup().press(screen.getByRole('radio', { name: 'Modo claro' }));

    expect(screen.getByRole('radio', { name: 'Modo claro' })).toBeChecked();
    expect(colorDe(screen.getByText('Apariencia'))).toBe(paletas.claro.texto);
    expect(colorDe(screen.getByText('Mis datos'))).toBe(paletas.claro.texto);
    expect(SecureStore.__datos.get(CLAVE)).toBe('claro');
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

// En Android el degradado experimental de React Native cerraba la app al terminar o calificar un trabajo
// (IllegalArgumentException en BackgroundImageDrawable): ahí se usa un color sólido del mismo degradado.
test('en Android los degradados son un color sólido; en la web siguen siendo degradados', () => {
  const { Platform } = require('react-native');
  const { degradado } = require('../src/theme');
  const antes = Platform.OS;
  try {
    Platform.OS = 'android';
    expect(degradado('linear-gradient(135deg, #074A42 0%, #0B7568 52%, #12A594 100%)')).toEqual({ backgroundColor: '#0B7568' });
    expect(degradado('linear-gradient(135deg, #0B7568 0%, #12A594 100%)')).toEqual({ backgroundColor: '#0B7568' });
    Platform.OS = 'web';
    expect(degradado('linear-gradient(135deg, #0B7568 0%, #12A594 100%)')).toEqual({ backgroundImage: 'linear-gradient(135deg, #0B7568 0%, #12A594 100%)' });
  } finally {
    Platform.OS = antes;
  }
});
