import { screen, userEvent } from 'expo-router/testing-library';
import Panel from '../src/app/panel';
import Perfil from '../src/app/perfil';
import { seccionDe, SECCIONES } from '../src/components/BarraPro';
import { abrirApp, prestador, sesionGuardada, simularApi, usarVariante } from './ayudas';

// Barra inferior de DeliMaster Pro: cuatro secciones que reemplazan la portada cargada de antes
function simularMaestro() {
  sesionGuardada();
  return simularApi({
    'GET /auth/yo': { usuario: prestador },
    'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
    'GET /prestadores/yo': { ficha: {
      disponible: true, categorias: [{ slug: 'poda-altura', nombre: 'Poda', requiere_verificacion: false }],
      comunas_atendidas: ['Chillán'], total_resenas: 0, trabajos_cerrados: 3, calificacion_promedio: 0,
    } },
    'GET /solicitudes?estado=asignada': { solicitudes: [] },
    'GET /prestadores/yo/datos-pago': { datos_pago: { completos: true } },
    'GET /prestadores/yo/dinero': { retenido: 0, por_transferir: 0, transferido: 0, transferencias: [] },
  });
}

describe('Secciones de la barra', () => {
  test('cada sección tiene su pantalla raíz y las que se abren desde ella', () => {
    expect(seccionDe('/panel').clave).toBe('inicio');
    expect(seccionDe('/recibidas').clave).toBe('trabajos');
    expect(seccionDe('/agenda').clave).toBe('trabajos');
    expect(seccionDe('/finanzas').clave).toBe('dinero');
    expect(seccionDe('/datos-pago').clave).toBe('dinero');
    expect(seccionDe('/perfil').clave).toBe('perfil');
    expect(seccionDe('/ficha').clave).toBe('perfil');
    expect(seccionDe('/cuenta').clave).toBe('perfil');
    expect(seccionDe('/trabajo/123')).toBeNull();   // los detalles no llevan barra
    expect(SECCIONES).toHaveLength(4);
  });
});

describe('Barra inferior en la app de maestros', () => {
  beforeEach(() => usarVariante('pro'));

  test('la portada muestra las cuatro secciones y marca Inicio', async () => {
    simularMaestro();
    await abrirApp({ ruta: '/panel', pantallas: { panel: Panel } });

    expect(await screen.findByRole('tab', { name: 'Inicio' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Trabajos' })).not.toBeSelected();
    expect(screen.getByRole('tab', { name: 'Finanzas' })).not.toBeSelected();
    expect(screen.getByRole('tab', { name: 'Perfil' })).not.toBeSelected();
  });

  test('tocar Dinero abre esa sección y la barra la marca', async () => {
    simularMaestro();
    const app = await abrirApp({ ruta: '/panel', pantallas: { panel: Panel } });

    await userEvent.setup().press(await screen.findByRole('tab', { name: 'Finanzas' }));
    expect(app.ruta()).toBe('/finanzas');
    expect(await screen.findByRole('tab', { name: 'Finanzas' })).toBeSelected();
  });

  test('Perfil reúne la ficha, el portafolio, las verificaciones y la cuenta', async () => {
    simularMaestro();
    await abrirApp({ ruta: '/perfil', pantallas: { perfil: Perfil } });

    expect(await screen.findByRole('button', { name: 'Mi ficha' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mi portafolio' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mis verificaciones' })).toBeOnTheScreen();
    // «Mi cuenta» aparece también en el botón del encabezado, así que basta con que exista
    expect(screen.getAllByRole('button', { name: 'Mi cuenta' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Perfil' })).toBeSelected();
  });

  test('en un detalle, como un trabajo, no hay barra', async () => {
    simularMaestro();
    await abrirApp({ ruta: '/trabajo/123' });

    expect(screen.queryByRole('tab', { name: 'Inicio' })).toBeNull();
  });
});
