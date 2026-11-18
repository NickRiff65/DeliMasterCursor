import { screen, userEvent } from 'expo-router/testing-library';
import DetalleSolicitud from '../src/app/solicitud/[id]';
import { abrirApp, cliente, sesionGuardada, simularApi } from './ayudas';

// Al pedir un servicio: cada maestro se elige por lo importante de su perfil.
// Y mientras el maestro elegido no responde, el cliente puede cambiarlo sin crear otra solicitud.
const solicitudBase = {
  id: 's1', categoria: 'poda-altura', categoria_nombre: 'Poda en altura',
  descripcion: 'Necesito podar un árbol alto', comuna: 'Chillán', direccion: 'Av. Libertad 1234',
  creado_en: '2026-11-10T12:00:00Z', precio_acordado: null, sin_respuesta: false, eventos: [],
};
const creada = { ...solicitudBase, estado: 'creada', prestador: null };
const asignada = {
  ...solicitudBase, estado: 'asignada', prestador: { id: 'p1', nombre: 'Luis Poda' },
  responder_antes_de: '2030-01-01T12:00:00Z',
};
const maestro = {
  id: 'p2', nombre: 'Carlos Rivas', calificacion_promedio: 4.8, total_resenas: 8, comunas_atendidas: ['Chillán'],
  puntos_clave: ['15 años de experiencia', 'Puntual'],
  descripcion_breve: 'Gasfiter con 15 años de experiencia.',
  descripcion: 'Gasfiter con 15 años de experiencia. Filtraciones, destapes y cambio de llaves. Puntual.',
};

// La lista de maestros que se muestra al cliente para la categoría y la comuna de la solicitud
const CANDIDATOS = 'GET /prestadores?categoria=poda-altura&comuna=Chill%C3%A1n&limite=20';

function simular(estadoInicial, extra = {}) {
  sesionGuardada();
  let solicitud = estadoInicial;
  return simularApi({
    'GET /auth/yo': { usuario: cliente },
    'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
    'GET /pagos/tarjeta': { tarjeta: null },
    'GET /solicitudes/s1': () => ({ solicitud }),
    [CANDIDATOS]: { prestadores: [maestro], paginacion: { total: 1, pagina: 1, paginas: 1 } },
    'POST /solicitudes/s1/cambiar-maestro': () => { solicitud = creada; return { solicitud: creada }; },
    ...extra,
  });
}

describe('Elegir maestro al pedir un servicio', () => {
  test('cada maestro se muestra con lo importante de su perfil, no con su descripción completa', async () => {
    simular(creada);
    await abrirApp({ ruta: '/solicitud/s1', pantallas: { 'solicitud/[id]': DetalleSolicitud } });

    expect(await screen.findByText('15 años de experiencia')).toBeOnTheScreen();
    expect(screen.getByText('Puntual')).toBeOnTheScreen();
    expect(screen.getByText('Gasfiter con 15 años de experiencia.')).toBeOnTheScreen();
    expect(screen.queryByText(/Filtraciones, destapes/)).toBeNull();   // el texto completo no se repite aquí
  });
});

describe('Cambiar de maestro mientras no responde', () => {
  test('pide confirmación con el nombre del maestro y no crea otra solicitud', async () => {
    const llamadas = simular(asignada);
    await abrirApp({ ruta: '/solicitud/s1', pantallas: { 'solicitud/[id]': DetalleSolicitud } });
    const user = userEvent.setup();

    await user.press(await screen.findByText('Cambiar de maestro'));
    expect(screen.getByText('¿Cambiar de maestro?')).toBeOnTheScreen();
    expect(screen.getByText(/Luis Poda dejará de ver tu solicitud/)).toBeOnTheScreen();
    expect(screen.getByText(/No se crea una solicitud nueva/)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Seguir esperando' }));
    expect(screen.queryByText('¿Cambiar de maestro?')).toBeNull();
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
  });

  test('al confirmar, vuelve a mostrar la lista para elegir otro maestro', async () => {
    const llamadas = simular(asignada);
    await abrirApp({ ruta: '/solicitud/s1', pantallas: { 'solicitud/[id]': DetalleSolicitud } });
    const user = userEvent.setup();

    await user.press(await screen.findByText('Cambiar de maestro'));
    await user.press(screen.getByRole('button', { name: 'Sí, cambiar de maestro' }));

    expect(await screen.findByText('Elige quién lo hará')).toBeOnTheScreen();
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta === '/solicitudes/s1/cambiar-maestro')).toBe(true);
    expect(screen.getByRole('button', { name: 'Elegir' })).toBeOnTheScreen();
  });
});
