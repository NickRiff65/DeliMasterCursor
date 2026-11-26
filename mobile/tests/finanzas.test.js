import { screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';
import Finanzas from '../src/app/finanzas';
import { abrirApp, prestador, sesionGuardada, simularApi, usarVariante } from './ayudas';

// «Mis finanzas» del maestro: en la APK los montos de «Transferencias recibidas» se veían un carácter por línea,
// porque el texto de la izquierda se llevaba todo el ancho. Ahora el monto nunca se achica.
const ahora = new Date();
const mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;

describe('Mis finanzas (app de maestros)', () => {
  beforeEach(() => usarVariante('pro'));

  test('las transferencias recibidas muestran el monto completo en una línea', async () => {
    sesionGuardada();
    simularApi({
      'GET /auth/yo': { usuario: prestador },
      'GET /notificaciones': { notificaciones: [], no_leidas: 0 },
      [`GET /prestadores/yo/finanzas?mes=${mes}`]: {
        totales: { ganancia_neta: 0, ingreso_neto: 0, gastos: 0, por_cobrar: 0, trabajos: 0 }, trabajos: [],
      },
      'GET /prestadores/yo/dinero': {
        retenido: 0, por_transferir: 0, transferido: 109120,
        transferencias: [
          { comprobante: 'DM-20261124-002', fecha: '2026-11-24T03:36:00Z', trabajos: 4, monto: 88000 },
          { comprobante: 'DM-20261120-001', fecha: '2026-11-20T22:07:00Z', trabajos: 2, monto: 21120 },
        ],
      },
    });
    await abrirApp({ ruta: '/finanzas', pantallas: { finanzas: Finanzas } });

    const monto = await screen.findByText('$88.000');
    expect(StyleSheet.flatten(monto.props.style)).toMatchObject({ flexShrink: 0 });
    expect(StyleSheet.flatten(monto.props.style).flex).toBeUndefined();
    // la descripción (fecha, trabajos y comprobante) ocupa el espacio libre y puede pasar a otra línea
    const comprobante = screen.getByText('N.º DM-20261124-002');
    expect(StyleSheet.flatten(comprobante.parent.props.style)).toMatchObject({ flex: 1 });
    expect(screen.getByText('$21.120')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText('$109.120').props.style)).toMatchObject({ flexShrink: 0 });
  });
});
