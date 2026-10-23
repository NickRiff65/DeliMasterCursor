import { act, render, screen } from '@testing-library/react-native';
import { CuentaRegresiva } from '../src/components/CuentaRegresiva';
import { api, consulta } from '../src/lib/api';
import { pesos } from '../src/lib/formato';
import { colores } from '../src/theme';

describe('Cuenta regresiva del plazo de respuesta (HU-05)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('muestra minutos y segundos, se pone roja en los últimos 5 minutos y avisa una sola vez al vencer', async () => {
    const alVencer = jest.fn();
    await render(<CuentaRegresiva hasta={new Date(Date.now() + 6 * 60_000).toISOString()} alVencer={alVencer} />);
    expect(screen.getByText('6:00')).toBeOnTheScreen();
    expect(screen.getByText('6:00')).toHaveStyle({ color: colores.texto });

    await act(() => jest.advanceTimersByTimeAsync(61_000));
    expect(screen.getByText('4:59')).toHaveStyle({ color: colores.error });

    await act(() => jest.advanceTimersByTimeAsync(5 * 60_000));
    expect(screen.getByText('Plazo vencido')).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(10_000));
    expect(alVencer).toHaveBeenCalledTimes(1);
  });
});

describe('Cliente de la API de las apps', () => {
  test('arma la consulta omitiendo filtros vacíos y codificando tildes', () => {
    expect(consulta({ categoria: 'poda-altura', comuna: 'Chillán', q: '', pagina: null })).toBe('?categoria=poda-altura&comuna=Chill%C3%A1n');
    expect(consulta({})).toBe('');
  });

  test('sin internet entrega un error claro con el código SIN_CONEXION', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); });
    const error = await api.get('/categorias').catch((e) => e);
    expect(error).toMatchObject({ status: 0, codigo: 'SIN_CONEXION' });
    expect(error.message).toMatch(/Revisa tu conexión/);
  });

  test('montos en pesos chilenos', () => {
    expect(pesos(45000)).toBe('$45.000');
  });
});

describe('Almacenamiento en el celular', () => {
  test('Lite y Pro guardan su sesión con claves distintas (se pueden usar en el mismo equipo)', async () => {
    let claves;
    await jest.isolateModulesAsync(async () => {
      Object.assign(require('../src/lib/variante'), { VARIANTE: 'pro', ES_PRO: true });
      const SecureStore = require('expo-secure-store');
      await require('../src/lib/almacen').guardarToken('t-pro');
      claves = [...SecureStore.__datos.keys()];
    });
    expect(claves).toEqual(['delimaster.token.pro']);
  });

  test('en el navegador la cola se guarda por persona y en orden de creación', async () => {
    const datos = new Map();
    global.localStorage = {
      getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k),
    };
    const web = jest.requireActual('../src/lib/almacenCola.web');
    await web.guardar({ id: 'b', usuario_id: 'c1', creado_en: '2026-10-08T10:02:00Z' });
    await web.guardar({ id: 'a', usuario_id: 'c1', creado_en: '2026-10-08T10:01:00Z' });
    await web.guardar({ id: 'x', usuario_id: 'otra', creado_en: '2026-10-08T10:00:00Z' });
    await web.guardar({ id: 'b', usuario_id: 'c1', creado_en: '2026-10-08T10:02:00Z', estado: 'revisar' });   // reemplaza, no duplica
    expect((await web.listar('c1')).map((i) => i.id)).toEqual(['a', 'b']);
    expect((await web.listar('c1'))[1].estado).toBe('revisar');
    await web.quitar('a');
    expect((await web.listar('c1')).map((i) => i.id)).toEqual(['b']);
    datos.set('delimaster.cola_solicitudes', '{dañado');
    expect(await web.listar('c1')).toEqual([]);                           // datos corruptos no rompen la app
    delete global.localStorage;
  });
});
