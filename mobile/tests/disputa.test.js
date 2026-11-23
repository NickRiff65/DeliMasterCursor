import { screen, userEvent } from 'expo-router/testing-library';
import Reclamo from '../src/app/disputa/[id]';
import DetalleSolicitud from '../src/app/solicitud/[id]';
import Panel from '../src/app/panel';
import { abrirApp, simularApi, sesionGuardada, usarVariante, cliente, prestador } from './ayudas';

const ID = '11111111-2222-4333-8444-555555555555';
const mensaje = (id, deEquipo, contenido) => ({ id, de_equipo: deEquipo, contenido, creado_en: '2026-11-20T15:00:00Z' });

// HU-16: en una disputa, conversación privada de cada parte con el equipo de DeliMaster
describe('Chat del reclamo', () => {
  test('desde la solicitud en disputa se abre la conversación con el equipo', async () => {
    sesionGuardada();
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}`]: { solicitud: {
        id: ID, estado: 'en_disputa', categoria_nombre: 'Poda', descripcion: 'Poda', comuna: 'Chillán', creado_en: '2026-11-10T12:00:00Z',
        motivo_disputa: 'Dejó las ramas tiradas', prestador: { id: 'p1', nombre: 'Luis Poda' }, cliente: { id: 'c1', nombre: 'Valentina' }, eventos: [],
      } },
    });
    const app = await abrirApp({ ruta: `/solicitud/${ID}`, pantallas: { 'solicitud/[id]': DetalleSolicitud } });
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Hablar con DeliMaster sobre el reclamo' }));
    expect(await screen.findByText('Pantalla disputa/[id]')).toBeOnTheScreen();
    expect(app.ruta()).toBe(`/disputa/${ID}`);
  });

  test('muestra los mensajes del equipo y envía la respuesta', async () => {
    sesionGuardada();
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}/disputa/mensajes`]: { mensajes: [mensaje(1, true, '¿Puedes subir una foto del patio?')], puede_escribir: true },
      [`POST /solicitudes/${ID}/disputa/mensajes`]: {
        mensajes: [mensaje(1, true, '¿Puedes subir una foto del patio?'), mensaje(2, false, 'Ya la subí en Fotos')], puede_escribir: true,
      },
    });
    await abrirApp({ ruta: `/disputa/${ID}`, pantallas: { 'disputa/[id]': Reclamo } });
    expect(await screen.findByText('¿Puedes subir una foto del patio?')).toBeOnTheScreen();
    expect(screen.getByText('Equipo DeliMaster')).toBeOnTheScreen();
    expect(screen.getByText(/el maestro no la ve/)).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mensaje para el equipo de DeliMaster'), 'Ya la subí en Fotos');
    await user.press(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Ya la subí en Fotos')).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ contenido: 'Ya la subí en Fotos' });
  });

  test('resuelta la disputa, la conversación queda cerrada', async () => {
    sesionGuardada();
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}/disputa/mensajes`]: { mensajes: [mensaje(1, true, 'Gracias por los antecedentes')], puede_escribir: false },
    });
    await abrirApp({ ruta: `/disputa/${ID}`, pantallas: { 'disputa/[id]': Reclamo } });
    expect(await screen.findByText('El reclamo ya se resolvió: la conversación quedó cerrada.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Mensaje para el equipo de DeliMaster')).not.toBeOnTheScreen();
  });
});

describe('Inicio del maestro: trabajo en curso', () => {
  beforeEach(() => usarVariante('pro'));
  afterEach(() => usarVariante('lite'));

  test('muestra el trabajo que espera una acción suya, con lo que sigue', async () => {
    sesionGuardada();
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
      'GET /prestadores/yo': { ficha: {
        disponible: true, categorias: [{ slug: 'poda-altura', nombre: 'Poda', requiere_verificacion: false }],
        comunas_atendidas: ['Chillán'], total_resenas: 0, trabajos_cerrados: 3, calificacion_promedio: 0,
      } },
      'GET /solicitudes?estado=asignada': { solicitudes: [] },
      'GET /solicitudes': { solicitudes: [
        { id: 'a', estado: 'cotizada', categoria_nombre: 'Gasfitería', cliente: { nombre: 'Rosa' }, creado_en: '2026-11-18T12:00:00Z' },
        { id: 'b', estado: 'en_diagnostico', categoria_nombre: 'Electricidad', cliente: { nombre: 'Valentina' }, creado_en: '2026-11-19T12:00:00Z' },
        { id: 'c', estado: 'cerrada', categoria_nombre: 'Poda', cliente: { nombre: 'Ana' }, creado_en: '2026-11-01T12:00:00Z' },
      ] },
      'GET /prestadores/yo/datos-pago': { datos_pago: { completos: true } },
      'GET /prestadores/yo/dinero': { retenido: 0, por_transferir: 0, transferido: 0, transferencias: [] },
    });
    const app = await abrirApp({ ruta: '/panel', pantallas: { panel: Panel } });
    expect(await screen.findByText('TRABAJO EN CURSO')).toBeOnTheScreen();
    expect(screen.getByText('Electricidad')).toBeOnTheScreen();               // espera su cotización: va primero
    expect(screen.getByText('Envía la cotización del trabajo')).toBeOnTheScreen();
    expect(screen.getByText(/y 1 más en Trabajos/)).toBeOnTheScreen();        // la cerrada no cuenta
    await userEvent.setup().press(screen.getByText(/Ver el trabajo/));
    expect(app.ruta()).toBe('/trabajo/b');
  });
});
