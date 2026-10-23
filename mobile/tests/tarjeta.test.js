import { screen, userEvent } from 'expo-router/testing-library';
import * as WebBrowser from 'expo-web-browser';
import DetalleSolicitud from '../src/app/solicitud/[id]';
import Cuenta from '../src/app/cuenta';
import { abrirApp, simularApi, sesionGuardada, cliente } from './ayudas';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(), maybeCompleteAuthSession: jest.fn() }));

// Tarjeta guardada (Webpay Oneclick): pagar el segundo pago sin volver a ingresar la tarjeta
const ID = '11111111-2222-4333-8444-555555555555';
const base = {
  id: ID, categoria: 'poda-altura', categoria_nombre: 'Poda en altura', descripcion: 'Podar un árbol alto',
  comuna: 'Chillán', creado_en: '2026-10-10T12:00:00Z', modalidad: 'visita', tarifa_visita: 25_000,
  visita_programada_en: '2026-10-16T13:00:00Z', cliente: { id: 'c1', nombre: 'Valentina' },
  prestador: { id: 'p1', nombre: 'Juan Soto' }, eventos: [],
};
const VISA = { tipo: 'Visa', ultimos4: '6623', creada_en: '2026-10-14T12:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
  sesionGuardada();
});

async function abrir(solicitud, extra = {}) {
  const llamadas = simularApi({ 'GET /auth/yo': { usuario: cliente }, [`GET /solicitudes/${ID}`]: { solicitud }, ...extra });
  await abrirApp({ ruta: `/solicitud/${ID}`, pantallas: { 'solicitud/[id]': DetalleSolicitud } });
  return llamadas;
}
const pagos = (llamadas) => llamadas.filter((l) => l.ruta === `/solicitudes/${ID}/pago`).map((l) => l.cuerpo.medio);

describe('Pagar con la tarjeta guardada', () => {
  test('con una tarjeta guardada, el saldo se paga con un toque y sin salir de la app', async () => {
    let pagada = false;
    const llamadas = await abrir(undefined, {
      'GET /pagos/tarjeta': { tarjeta: VISA },
      [`GET /solicitudes/${ID}`]: () => ({ solicitud: pagada
        ? { ...base, estado: 'pagada', precio_acordado: 100_000 }
        : { ...base, estado: 'confirmada', precio_acordado: 100_000, monto_por_pagar: 75_000 } }),
      [`POST /solicitudes/${ID}/pago`]: () => { pagada = true; return { resultado: 'aprobado', concepto: 'saldo', monto: 75_000 }; },
    });
    expect(await screen.findByText('Visa •••• 6623')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Pagar $75.000 con •••• 6623' }));

    expect(await screen.findByText('✔ Pago aprobado. Tu dinero quedó protegido.')).toBeOnTheScreen();
    expect(pagos(llamadas)).toEqual(['tarjeta_guardada']);
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  test('puede cambiar la tarjeta (la registra en Transbank y paga) o pagar con otra sin guardarla', async () => {
    const llamadas = await abrir({ ...base, estado: 'confirmada', precio_acordado: 100_000, monto_por_pagar: 75_000 }, {
      'GET /pagos/tarjeta': { tarjeta: VISA },
      [`POST /solicitudes/${ID}/pago`]: { url_pago: 'http://localhost:3000/api/pagos/oneclick/ir/ins-1', concepto: 'saldo', monto: 75_000 },
    });
    WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: `delimaster://solicitud/${ID}?pago=aprobado` });
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Cambiar tarjeta de pago' }));
    expect(screen.getByText('Al cambiarla, la nueva reemplaza a la que tienes guardada.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cambiar tarjeta y pagar' }));
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith('http://localhost:3000/api/pagos/oneclick/ir/ins-1', expect.any(String));

    await user.press(screen.getByRole('button', { name: 'Pagar con otra tarjeta sin guardarla' }));
    expect(pagos(llamadas)).toEqual(['guardar_tarjeta', 'webpay']);
  });

  test('sin tarjeta guardada, al pagar la visita ofrece guardarla (marcado) y se puede desmarcar', async () => {
    const llamadas = await abrir({ ...base, estado: 'visita_por_pagar' }, {
      'GET /pagos/tarjeta': { tarjeta: null },
      [`POST /solicitudes/${ID}/pago`]: { url_pago: 'http://localhost:3000/api/pagos/x', concepto: 'visita', monto: 25_000 },
    });
    WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    const user = userEvent.setup();
    const casilla = await screen.findByRole('checkbox');
    expect(casilla).toBeChecked();
    expect(screen.getByText(/DeliMaster solo ve los últimos 4 dígitos/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Pagar visita $25.000 con Webpay' }));
    await user.press(casilla);
    await user.press(screen.getByRole('button', { name: 'Pagar visita $25.000 con Webpay' }));
    expect(pagos(llamadas)).toEqual(['guardar_tarjeta', 'webpay']);
  });
});

describe('Mi cuenta: tarjeta guardada', () => {
  test('muestra la tarjeta y permite quitarla', async () => {
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /pagos/tarjeta': { tarjeta: VISA },
      'DELETE /pagos/tarjeta': { tarjeta: null },
    });
    await abrirApp({ ruta: '/cuenta', pantallas: { cuenta: Cuenta } });
    expect(await screen.findByText('Visa •••• 6623')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Quitar tarjeta' }));
    await user.press(screen.getByRole('button', { name: 'Sí, quitar la tarjeta' }));
    expect(await screen.findByText('Quitamos tu tarjeta guardada.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Guardar una tarjeta' })).toBeOnTheScreen();
    expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(true);
  });

  test('guardar una tarjeta lleva a Transbank y vuelve con la tarjeta guardada', async () => {
    let guardada = false;
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /pagos/tarjeta': () => ({ tarjeta: guardada ? VISA : null }),
      'POST /pagos/tarjeta': () => { guardada = true; return { url_pago: 'http://localhost:3000/api/pagos/oneclick/ir/ins-2' }; },
    });
    WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'delimaster://cuenta?pago=tarjeta_guardada' });
    await abrirApp({ ruta: '/cuenta', pantallas: { cuenta: Cuenta } });
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Guardar una tarjeta' }));
    expect(await screen.findByText('✔ Tu tarjeta quedó guardada.')).toBeOnTheScreen();
    expect(await screen.findByText('Visa •••• 6623')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.ruta === '/pagos/tarjeta' && l.metodo === 'POST').cuerpo.volver_a).toMatch(/cuenta$/);
  });
});
