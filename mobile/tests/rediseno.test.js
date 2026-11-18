import { render, screen } from '@testing-library/react-native';
import { screen as pantalla, userEvent } from 'expo-router/testing-library';
import Inicio from '../src/app/index';
import { ProgresoSolicitud } from '../src/components/ProgresoSolicitud';
import { abrirApp, simularApi, sesionGuardada, cliente } from './ayudas';

// Rediseño de Lite (clientes): la barra de progreso y la portada que cambia según la solicitud en curso
const solicitud = (id, estado) => ({
  id, estado, categoria_nombre: 'Electricidad', descripcion: `Solicitud ${id}`, comuna: 'Chillán',
  creado_en: '2026-11-17T12:00:00Z', prestador: null, precio_acordado: null,
});

describe('Progreso de una solicitud', () => {
  test('la barra dice en qué etapa va la solicitud, en lenguaje del cliente', async () => {
    await render(<ProgresoSolicitud estado="asignada" />);
    expect(screen.getByLabelText('Paso 2 de 5: Maestro')).toBeOnTheScreen();
  });

  test('una solicitud cerrada llega a la última etapa', async () => {
    await render(<ProgresoSolicitud estado="cerrada" />);
    expect(screen.getByLabelText('Paso 5 de 5: Cerrada')).toBeOnTheScreen();
  });

  test('una solicitud cancelada no muestra progreso', async () => {
    await render(<ProgresoSolicitud estado="cancelada" />);
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });
});

describe('Portada del cliente según su solicitud en curso', () => {
  beforeEach(() => sesionGuardada());

  test('con una solicitud en curso, la portada muestra cuál es el siguiente paso', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /solicitudes': { solicitudes: [solicitud('s1', 'asignada')] },
      'GET /prestadores?comuna=Chill%C3%A1n&limite=1': { prestadores: [], paginacion: { total: 3, pagina: 1, paginas: 3 } },
    });
    await abrirApp({ ruta: '/', pantallas: { index: Inicio } });
    expect(await pantalla.findByText('SIGUE TU SOLICITUD')).toBeOnTheScreen();
    // La misma solicitud se ve en la portada y en la lista: dos barras con el mismo paso
    expect(screen.getAllByLabelText('Paso 2 de 5: Maestro')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Pedir otro servicio/ })).toBeOnTheScreen();
  });

  test('sin solicitudes en curso, la portada invita a pedir el primer servicio', async () => {
    simularApi({
      'GET /auth/yo': { usuario: cliente },
      'GET /solicitudes': { solicitudes: [solicitud('s2', 'cerrada')] },
      'GET /prestadores?comuna=Chill%C3%A1n&limite=1': { prestadores: [], paginacion: { total: 3, pagina: 1, paginas: 3 } },
    });
    await abrirApp({ ruta: '/', pantallas: { index: Inicio } });
    expect(await pantalla.findByText(/Escríbelo y lo resolvemos/)).toBeOnTheScreen();
    expect(pantalla.queryByText('SIGUE TU SOLICITUD')).not.toBeOnTheScreen();
    await userEvent.setup().press(pantalla.getByText('Pedir un servicio →'));
    expect(await pantalla.findByText('Pantalla nueva-solicitud')).toBeOnTheScreen();
  });
});
