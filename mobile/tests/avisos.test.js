import { act, screen, userEvent } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import Inicio from '../src/app/index';
import Avisos from '../src/app/avisos';
import Panel from '../src/app/panel';
import DetalleTrabajo from '../src/app/trabajo/[id]';
import { abrirApp, simularApi, sesionGuardada, usarVariante, cliente, prestador } from './ayudas';

// El socket simulado permite "recibir" un aviso en tiempo real
const manejadores = {};
jest.mock('../src/lib/socket', () => {
  const socket = {
    on: (evento, fn) => { manejadores[evento] = fn; },
    off: (evento) => { delete manejadores[evento]; },
    emit: () => {},
    connected: false,
  };
  return { obtenerSocket: () => socket, desconectarSocket: () => {} };
});

const aviso = (id, titulo, extra = {}) => ({
  id, titulo, texto: `Detalle ${id}`, solicitud_id: null, tipo: 'solicitud', leida_en: null, creado_en: '2026-10-22T12:00:00Z', ...extra,
});

beforeEach(() => sesionGuardada());

describe('Avisos dentro de la app', () => {
  test('la campana muestra los no leídos; al abrir la lista quedan leídos', async () => {
    const lista = [aviso(2, 'Luis aceptó tu solicitud'), aviso(1, 'Recibiste la cotización de Luis')];
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /solicitudes': { solicitudes: [] },
      'GET /notificaciones': { notificaciones: lista, no_leidas: 2 },
      'POST /notificaciones/leidas': { notificaciones: lista.map((n) => ({ ...n, leida_en: new Date().toISOString() })), no_leidas: 0 },
    });
    await abrirApp({ ruta: '/', pantallas: { index: Inicio, avisos: Avisos } });
    const campana = await screen.findByRole('button', { name: 'Avisos, 2 sin leer' });
    await userEvent.setup().press(campana);
    expect(await screen.findByText('Luis aceptó tu solicitud')).toBeOnTheScreen();
    expect(screen.getByText('Detalle 1')).toBeOnTheScreen();
    expect(llamadas.some((l) => l.ruta === '/notificaciones/leidas')).toBe(true);
  });

  test('un aviso que llega con la app abierta aparece arriba y suma a la campana', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /solicitudes': { solicitudes: [] },
      'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
    });
    await abrirApp({ ruta: '/', pantallas: { index: Inicio } });
    await screen.findByRole('button', { name: 'Avisos' });
    await act(async () => manejadores.notificacion(aviso(9, '🏦 Te transferimos tu pago', { tipo: 'pago' })));
    expect(await screen.findByRole('alert', { name: /Te transferimos tu pago/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Avisos, 1 sin leer' })).toBeOnTheScreen();
  });
});

describe('DeliMaster Pro', () => {
  test('el panel muestra cuánto dinero tiene retenido, por transferir y ya recibido', async () => {
    usarVariante('pro');
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
      'GET /prestadores/yo': { ficha: {
        disponible: true, categorias: [{ slug: 'poda-altura', nombre: 'Poda', requiere_verificacion: false }],
        comunas_atendidas: ['Chillán'], total_resenas: 0, trabajos_cerrados: 3, calificacion_promedio: 0,
      } },
      'GET /solicitudes?estado=asignada': { solicitudes: [] },
      'GET /prestadores/yo/datos-pago': { datos_pago: { completos: true } },
      'GET /prestadores/yo/dinero': { retenido: 44000, por_transferir: 35200, transferido: 120500, transferencias: [] },
    });
    await abrirApp({ ruta: '/panel', pantallas: { panel: Panel } });
    expect(await screen.findByText('💰 Mi dinero')).toBeOnTheScreen();
    expect(screen.getByText('$44.000')).toBeOnTheScreen();
    expect(screen.getByText('$35.200')).toBeOnTheScreen();
    expect(screen.getByText('$120.500')).toBeOnTheScreen();
  });

  const ID = '11111111-2222-4333-8444-555555555555';
  const trabajo = (extra) => ({
    id: ID, categoria: 'poda-altura', categoria_nombre: 'Poda en altura', descripcion: 'Podar un árbol alto', comuna: 'Chillán',
    creado_en: '2026-10-20T12:00:00Z', modalidad: 'precio_cerrado', cliente: { id: 'c1', nombre: 'Valentina' },
    prestador: { id: 'p1', nombre: 'María González' }, eventos: [], ...extra,
  });
  async function abrirTrabajo(solicitud) {
    usarVariante('pro');
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
      [`GET /solicitudes/${ID}`]: { solicitud },
    });
    await abrirApp({ ruta: `/trabajo/${ID}`, pantallas: { 'trabajo/[id]': DetalleTrabajo } });
  }

  test('antes del pago el maestro solo ve la comuna; después, la dirección exacta y el mapa', async () => {
    await abrirTrabajo(trabajo({ estado: 'confirmada', precio_acordado: 50000, direccion: null, direccion_visible: false }));
    expect(await screen.findByText(/Chillán\. Verás la dirección exacta cuando el cliente pague el trabajo/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '🗺️ Abrir en el mapa' })).not.toBeOnTheScreen();
  });

  test('con el pago asegurado ve la dirección, la referencia y la abre en el mapa', async () => {
    const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await abrirTrabajo(trabajo({
      estado: 'pagada', precio_acordado: 50000, direccion_visible: true,
      direccion: 'Av. Libertad 1234', referencia: 'Portón verde', latitud: -36.6066, longitud: -72.1034,
    }));
    expect(await screen.findByText('Av. Libertad 1234, Chillán')).toBeOnTheScreen();
    expect(screen.getByText('Referencia: Portón verde')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: '🗺️ Abrir en el mapa' }));
    expect(abrir).toHaveBeenCalledWith('https://www.google.com/maps/search/?api=1&query=-36.6066%2C-72.1034');
  });
});
