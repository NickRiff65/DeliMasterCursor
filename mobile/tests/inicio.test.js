import { screen, userEvent } from 'expo-router/testing-library';
import Inicio from '../src/app/index';
import Maestros from '../src/app/maestros';
import PerfilMaestro from '../src/app/prestador/[id]';
import DetalleSolicitud from '../src/app/solicitud/[id]';
import { abrirApp, simularApi, sesionGuardada, cliente } from './ayudas';

// Lite: el inicio muestra las solicitudes del cliente; los maestros disponibles están en su propia pantalla
const solicitud = (id, estado, extra = {}) => ({
  id, estado, categoria_nombre: 'Poda en altura', descripcion: `Solicitud ${id}`, comuna: 'Chillán',
  creado_en: '2026-10-10T12:00:00Z', prestador: null, precio_acordado: null, ...extra,
});
const maestro = {
  id: 'p1', nombre: 'Juan Soto', descripcion: 'Poda segura en altura', comunas_atendidas: ['Chillán'],
  categorias: [{ slug: 'poda-altura', nombre: 'Poda en altura', verificada: false }], calificacion_promedio: 4.8,
  total_resenas: 12, horario: { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '17:00' },
};

beforeEach(() => sesionGuardada());

describe('Inicio del cliente', () => {
  test('muestra sus solicitudes, cuántas están en curso y el acceso a los maestros disponibles', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /solicitudes': { solicitudes: [
        solicitud('s1', 'pagada', { prestador: { id: 'p1', nombre: 'Juan Soto' }, precio_acordado: 45000 }),
        solicitud('s2', 'cerrada'),
      ] },
      'GET /prestadores?comuna=Chill%C3%A1n&limite=1': { prestadores: [maestro], paginacion: { total: 7, pagina: 1, paginas: 7 } },
    });
    const app = await abrirApp({ ruta: '/', pantallas: { index: Inicio } });

    expect(await screen.findByText('Solicitud s1')).toBeOnTheScreen();
    expect(screen.getByText('Solicitud s2')).toBeOnTheScreen();
    expect(screen.getByText('Tus solicitudes')).toBeOnTheScreen();
    expect(screen.getByText('1 en curso')).toBeOnTheScreen();
    expect(screen.getByText(/👷 Juan Soto · \$45\.000/)).toBeOnTheScreen();
    expect(await screen.findByText(/7 maestros en Chillán/)).toBeOnTheScreen();
    expect(screen.queryByText(/prestador/i)).not.toBeOnTheScreen();

    await userEvent.setup().press(screen.getByText('Ver maestros disponibles'));
    expect(await screen.findByText('Pantalla maestros')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/maestros');
  });

  test('sin solicitudes explica qué verá ahí', async () => {
    simularApi({ 'GET /auth/yo': { usuario: cliente }, 'GET /solicitudes': { solicitudes: [] } });
    await abrirApp({ ruta: '/', pantallas: { index: Inicio } });
    expect(await screen.findByText('Aún no tienes solicitudes')).toBeOnTheScreen();
    expect(screen.getByText(/aquí verás cómo avanza/)).toBeOnTheScreen();
  });
});

describe('Volver al inicio', () => {
  test('desde una solicitud abierta directo (por ejemplo, al volver de Webpay) el botón Inicio lleva al inicio', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /solicitudes/s1': { solicitud: { ...solicitud('s1', 'pagada', { prestador: { id: 'p1', nombre: 'Juan Soto' }, precio_acordado: 45000 }), eventos: [] } },
    });
    const app = await abrirApp({ ruta: '/solicitud/s1?pago=aprobado', pantallas: { 'solicitud/[id]': DetalleSolicitud } });
    expect(await screen.findByText('✔ Pago aprobado. Tu dinero quedó protegido.')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Ir al inicio' }));
    expect(await screen.findByText('Pantalla index')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/');
  });
});

describe('Maestros disponibles', () => {
  test('lista los maestros con su horario y abre el perfil', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /categorias': { categorias: [{ slug: 'poda-altura', nombre: 'Poda en altura' }] },
      'GET /comunas': { comunas: ['Chillán'] },
      'GET /prestadores?comuna=Chill%C3%A1n&pagina=1&limite=20': { prestadores: [maestro], paginacion: { total: 1, pagina: 1, paginas: 1 } },
      'GET /prestadores/p1': { prestador: {
        ...maestro, verificaciones: [], resenas: [], trabajos_cerrados: 12, miembro_desde: '2026-01-01', disponible: true,
      } },
    });
    await abrirApp({ ruta: '/maestros', pantallas: { maestros: Maestros, 'prestador/[id]': PerfilMaestro } });

    expect(await screen.findByText('1 maestro disponible')).toBeOnTheScreen();
    expect(screen.getByText('🕒 Lunes a sábado · 08:00 a 17:00')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Ver perfil de Juan Soto' }));
    expect(await screen.findByText('Horario de atención')).toBeOnTheScreen();
    expect(screen.getByText('Las visitas se agendan dentro de este horario.')).toBeOnTheScreen();
  });
});
