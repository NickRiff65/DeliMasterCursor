import { screen, userEvent } from 'expo-router/testing-library';
import Cuenta from '../src/app/cuenta';
import Maestros from '../src/app/maestros';
import Agenda from '../src/app/agenda';
import { abrirApp, simularApi, sesionGuardada, usarVariante, cliente, prestador } from './ayudas';

// Cierre de brechas del EF2: reputación del cliente en su cuenta (CU-15), filtro por horario y
// orden en el catálogo (CU-05) y agenda de visitas del maestro (CU-16)
beforeEach(() => sesionGuardada());

describe('Mi cuenta: reputación como cliente', () => {
  test('muestra las estrellas y el total cuando los maestros ya lo calificaron', async () => {
    simularApi({
      'GET /auth/yo': { usuario: { ...cliente, calificacion_promedio: 4.5, total_resenas: 3 } },
      'GET /pagos/tarjeta': { tarjeta: null },
    });
    await abrirApp({ ruta: '/cuenta', pantallas: { cuenta: Cuenta } });

    expect(await screen.findByText(/Tu reputación como cliente/)).toBeOnTheScreen();
    expect(screen.getByLabelText('4.5 estrellas, 3 reseñas')).toBeOnTheScreen();
  });

  test('sin calificaciones explica que aparecerán al cerrar su primer trabajo', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /pagos/tarjeta': { tarjeta: null },
    });
    await abrirApp({ ruta: '/cuenta', pantallas: { cuenta: Cuenta } });

    expect(await screen.findByText(/Aún no tienes calificaciones como cliente/)).toBeOnTheScreen();
  });
});

describe('Catálogo: horario y orden', () => {
  const maestro = {
    id: 'p1', nombre: 'Juan Soto', descripcion: 'Poda segura en altura', comunas_atendidas: ['Chillán'],
    categorias: [{ slug: 'poda-altura', nombre: 'Poda en altura', verificada: false }], calificacion_promedio: 4.8,
    total_resenas: 12, horario: { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '17:00' },
  };
  const lista = { prestadores: [maestro], paginacion: { total: 1, pagina: 1, paginas: 1 } };

  test('al activar «solo en horario» y cambiar el orden, la consulta lleva los parámetros nuevos', async () => {
    const llamadas = simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /categorias': { categorias: [{ slug: 'poda-altura', nombre: 'Poda en altura' }] },
      'GET /comunas': { comunas: ['Chillán'] },
      'GET /prestadores?comuna=Chill%C3%A1n&orden=reputacion&pagina=1&limite=20': lista,
      'GET /prestadores?comuna=Chill%C3%A1n&orden=reputacion&disponible_ahora=true&pagina=1&limite=20': lista,
      'GET /prestadores?comuna=Chill%C3%A1n&orden=trabajos&disponible_ahora=true&pagina=1&limite=20': lista,
    });
    await abrirApp({ ruta: '/maestros', pantallas: { maestros: Maestros } });
    expect(await screen.findByText('1 maestro disponible')).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: '🕒 Solo en horario ahora' }));
    expect(await screen.findByText('1 maestro disponible')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Más trabajos' }));

    const rutas = llamadas.filter((l) => l.ruta.startsWith('/prestadores?')).map((l) => l.ruta);
    expect(rutas).toContain('/prestadores?comuna=Chill%C3%A1n&orden=reputacion&disponible_ahora=true&pagina=1&limite=20');
    expect(rutas.at(-1)).toBe('/prestadores?comuna=Chill%C3%A1n&orden=trabajos&disponible_ahora=true&pagina=1&limite=20');
  });
});

describe('Agenda del maestro (Pro)', () => {
  test('lista la visita con fecha, cliente y tarifa, y al tocarla abre el trabajo', async () => {
    usarVariante('pro');
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /prestadores/yo/agenda': { agenda: [{
        id: 's9', estado: 'visita_pagada', visita_programada_en: '2026-10-11T13:00:00Z', tarifa_visita: 25000,
        comuna: 'Chillán', descripcion: 'Saltó el automático y no vuelve', categoria: 'Electricidad', cliente: 'Valentina Rojas',
      }] },
    });
    const app = await abrirApp({ ruta: '/agenda', pantallas: { agenda: Agenda } });

    expect(await screen.findByText('Valentina Rojas')).toBeOnTheScreen();
    expect(screen.getByText(/11 oct/)).toBeOnTheScreen();
    expect(screen.getByText(/Electricidad · 📍 Chillán/)).toBeOnTheScreen();
    expect(screen.getByText(/\$25\.000/)).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByText('Valentina Rojas'));
    expect(await screen.findByText('Pantalla trabajo/[id]')).toBeOnTheScreen();
    expect(app.ruta()).toBe('/trabajo/s9');
  });

  test('sin visitas lo dice en pantalla', async () => {
    usarVariante('pro');
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /prestadores/yo/agenda': { agenda: [] },
    });
    await abrirApp({ ruta: '/agenda', pantallas: { agenda: Agenda } });

    expect(await screen.findByText('No tienes visitas programadas por ahora')).toBeOnTheScreen();
  });
});
