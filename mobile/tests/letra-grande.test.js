import { StyleSheet } from 'react-native';
import { screen } from 'expo-router/testing-library';
import Panel from '../src/app/panel';
import { MARGEN_INFERIOR_BARRA } from '../src/components/BarraPro';
import { crearEstilos, ESCALA_LETRA_LITE, ESCALA_LETRA_PRO, letra } from '../src/theme';
import { abrirApp, prestador, sesionGuardada, simularApi, usarVariante } from './ayudas';

// Recomendación del profesor: letra más grande en la app de maestros (muchos son mayores y usan
// el celular con las manos grandes o sucias). La de clientes la agranda un poco menos.
const estiloDe = (elemento) => StyleSheet.flatten(elemento.props.style);

describe('Tamaño de letra según la app', () => {
  afterEach(() => usarVariante('lite'));

  test('en la app de maestros crecen la letra, el interlineado y la altura de botones y campos', () => {
    usarVariante('pro');
    const estilos = crearEstilos(() => ({ texto: { fontSize: 16, lineHeight: 22, minHeight: 52, padding: 10 } }));
    expect(StyleSheet.flatten(estilos.texto)).toEqual({ fontSize: 18, lineHeight: 25, minHeight: 60, padding: 10 });
    expect(letra(14)).toBe(Math.round(14 * ESCALA_LETRA_PRO));
  });

  test('en la app de clientes crecen un poco menos', () => {
    usarVariante('lite');
    const estilos = crearEstilos(() => ({ texto: { fontSize: 16, lineHeight: 22, minHeight: 52 } }));
    expect(StyleSheet.flatten(estilos.texto)).toEqual({ fontSize: 18, lineHeight: 24, minHeight: 57 });
    expect(letra(14)).toBe(Math.round(14 * ESCALA_LETRA_LITE));
    expect(ESCALA_LETRA_LITE).toBeLessThan(ESCALA_LETRA_PRO);
  });
});

describe('Barra inferior de la app de maestros', () => {
  beforeEach(() => usarVariante('pro'));
  afterEach(() => usarVariante('lite'));

  test('queda despegada del borde de abajo y con letra grande', async () => {
    sesionGuardada();
    simularApi({
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
    await abrirApp({ ruta: '/panel', pantallas: { panel: Panel } });

    const barra = (await screen.findByRole('tab', { name: 'Inicio' })).parent;
    expect(barra.props.accessibilityRole).toBe('tablist');
    expect(estiloDe(barra).paddingBottom).toBeGreaterThanOrEqual(MARGEN_INFERIOR_BARRA);
    expect(estiloDe(screen.getByText('Trabajos')).fontSize).toBe(letra(13));
    expect(letra(13)).toBeGreaterThan(13);
  });
});
