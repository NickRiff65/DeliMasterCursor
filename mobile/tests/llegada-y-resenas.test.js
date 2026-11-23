import { screen, userEvent } from 'expo-router/testing-library';
import DetalleSolicitud from '../src/app/solicitud/[id]';
import DetalleTrabajo from '../src/app/trabajo/[id]';
import Cuenta from '../src/app/cuenta';
import Perfil from '../src/app/perfil';
import MisResenas from '../src/app/resenas';
import { abrirApp, simularApi, sesionGuardada, usarVariante, cliente, prestador } from './ayudas';

// Precio cerrado con código de llegada, y reputación y reseñas del maestro en DeliMaster Pro
const ID = '11111111-2222-4333-8444-555555555555';
const pagada = {
  id: ID, categoria: 'gasfiteria', categoria_nombre: 'Gasfitería', descripcion: 'Cambiar la llave del lavaplatos',
  comuna: 'Chillán', creado_en: '2026-10-10T12:00:00Z', modalidad: 'precio_cerrado', precio_acordado: 45_000,
  visita_programada_en: '2026-10-11T13:00:00Z', estado: 'pagada', llegada_pendiente: true,
  cliente: { id: 'c1', nombre: 'Valentina' }, prestador: { id: 'p1', nombre: 'María González' }, eventos: [],
};

const resenas = {
  calificacion_promedio: 4.5, total_resenas: 2, trabajos_cerrados: 3,
  resenas: [
    { id: 'r2', estrellas: 4, comentario: 'Llegó a la hora y dejó todo limpio', cliente: 'Pedro', categoria: 'Gasfitería', creado_en: '2026-11-20T12:00:00Z' },
    { id: 'r1', estrellas: 5, comentario: null, cliente: 'Ana', categoria: 'Electricidad', creado_en: '2026-11-02T12:00:00Z' },
  ],
};

describe('Precio cerrado: código de llegada', () => {
  afterEach(() => usarVariante('lite'));

  test('el cliente ve su código para dictarlo cuando llegue el maestro', async () => {
    sesionGuardada();
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}`]: { solicitud: { ...pagada, codigo_llegada: '4821' } },
      'GET /pagos/tarjeta': { tarjeta: null },
    });
    await abrirApp({ ruta: `/solicitud/${ID}`, pantallas: { 'solicitud/[id]': DetalleSolicitud } });

    expect(await screen.findByLabelText('Código de llegada 4 8 2 1')).toBeOnTheScreen();
    expect(screen.getByText(/sin este código no puede marcar el trabajo como terminado/)).toBeOnTheScreen();
  });

  test('si el maestro no llega, pasada la hora el cliente pide que le devuelvan el pago (con confirmación)', async () => {
    sesionGuardada();
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}`]: { solicitud: { ...pagada, codigo_llegada: '4821', reclamo_no_llego_desde: '2020-01-01T00:00:00Z' } },
      [`POST /solicitudes/${ID}/no-llego`]: { solicitud: { ...pagada, estado: 'cancelada', llegada_pendiente: false } },
    });
    await abrirApp({ ruta: `/solicitud/${ID}`, pantallas: { 'solicitud/[id]': DetalleSolicitud } });

    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'No llegó: devolverme el pago' }));
    expect(screen.getByText(/te devolvemos \$45\.000 a la tarjeta con que pagaste/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Sí, devolverme el pago' }));

    await screen.findByText(/Cancelada/i);
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => l.ruta)).toEqual([`/solicitudes/${ID}/no-llego`]);
  });

  test('antes de la hora acordada solo explica desde cuándo podrá pedir la devolución', async () => {
    sesionGuardada();
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      [`GET /solicitudes/${ID}`]: { solicitud: { ...pagada, codigo_llegada: '4821', reclamo_no_llego_desde: '2099-01-01T12:00:00Z' } },
    });
    await abrirApp({ ruta: `/solicitud/${ID}`, pantallas: { 'solicitud/[id]': DetalleSolicitud } });

    expect(await screen.findByText(/podrás pedir que te devolvamos el pago/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'No llegó: devolverme el pago' })).toBeNull();
  });

  test('el maestro confirma su llegada con el código y recién entonces puede marcar el trabajo terminado', async () => {
    usarVariante('pro');
    sesionGuardada();
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: prestador },
      [`GET /solicitudes/${ID}`]: { solicitud: pagada },
      [`GET /solicitudes/${ID}/gastos`]: { gastos: [], resumen: { precio: 45000, comision: 5400, ingreso_neto: 39600, gastos: 0, ganancia_neta: 39600, ingreso_confirmado: false } },
      [`POST /solicitudes/${ID}/llegada`]: {
        solicitud: { ...pagada, llegada_pendiente: false, llegada_en: '2026-10-11T13:05:00Z' },
      },
    });
    await abrirApp({ ruta: `/trabajo/${ID}`, pantallas: { 'trabajo/[id]': DetalleTrabajo } });

    expect(await screen.findByText('Confirma tu llegada')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Marcar trabajo como terminado' })).toBeNull();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Código del cliente'), '4821');
    await user.press(screen.getByRole('button', { name: 'Confirmar llegada' }));

    expect(await screen.findByRole('button', { name: 'Marcar trabajo como terminado' })).toBeOnTheScreen();
    expect(screen.getByText(/Llegada confirmada:/)).toBeOnTheScreen();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ codigo: '4821' });
  });
});

describe('Pro: reputación como maestro y reseñas', () => {
  beforeEach(() => {
    usarVariante('pro');
    sesionGuardada();
  });
  afterEach(() => usarVariante('lite'));

  test('Mi cuenta muestra la reputación como maestro (no como cliente) y lleva a sus reseñas', async () => {
    simularApi({ 'GET /auth/yo': { usuario: prestador }, 'GET /prestadores/yo/resenas': resenas });
    const app = await abrirApp({ ruta: '/cuenta', pantallas: { cuenta: Cuenta } });

    expect(await screen.findByText(/Tu reputación como maestro/)).toBeOnTheScreen();
    expect(screen.queryByText(/Tu reputación como cliente/)).toBeNull();
    expect(screen.getByLabelText('4.5 estrellas, 2 reseñas')).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Ver mis reseñas (2)' }));
    expect(app.ruta()).toBe('/resenas');
  });

  test('desde el perfil, la tarjeta de reputación abre sus reseñas', async () => {
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /prestadores/yo': { ficha: { categorias: [], comunas_atendidas: ['Chillán'], calificacion_promedio: 4.5, total_resenas: 2, trabajos_cerrados: 3 } },
    });
    const app = await abrirApp({ ruta: '/perfil', pantallas: { perfil: Perfil } });

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Mi reputación: ver mis reseñas' }));
    expect(app.ruta()).toBe('/resenas');
  });

  test('Mis reseñas lista cada reseña con quién la dejó, el servicio y el comentario', async () => {
    simularApi({ 'GET /auth/yo': { usuario: prestador }, 'GET /prestadores/yo/resenas': resenas });
    await abrirApp({ ruta: '/resenas', pantallas: { resenas: MisResenas } });

    expect(await screen.findByText('Pedro · Gasfitería')).toBeOnTheScreen();
    expect(screen.getByText('«Llegó a la hora y dejó todo limpio»')).toBeOnTheScreen();
    expect(screen.getByText('Ana · Electricidad')).toBeOnTheScreen();
    expect(screen.getByText('Calificó sin dejar comentario.')).toBeOnTheScreen();
    expect(screen.getByText('3 trabajos cerrados')).toBeOnTheScreen();
  });

  test('sin reseñas explica cómo llegarán', async () => {
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /prestadores/yo/resenas': { calificacion_promedio: null, total_resenas: 0, trabajos_cerrados: 0, resenas: [] },
    });
    await abrirApp({ ruta: '/resenas', pantallas: { resenas: MisResenas } });

    expect(await screen.findByText('Aún no tienes reseñas.')).toBeOnTheScreen();
  });
});
