import { describe, test, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Liquidaciones from '../src/paginas/Liquidaciones.jsx';
import { simularApi, mostrar } from './ayudas.jsx';

const movimiento = (id, categoria, bruto) => ({
  id, solicitud_id: `s-${id}`, categoria, liberado_en: '2026-10-01T12:00:00Z',
  monto_bruto: bruto, comision: bruto * 0.12, monto_neto: bruto * 0.88,
});
const luis = {
  prestador_id: 'p1', nombre: 'Luis Fuentes', email: 'luis@demo.cl', total: 88000,
  liberado_desde: '2026-10-01T12:00:00Z', atrasado: false, datos_completos: true,
  rut: '12.345.678-5', banco: 'BancoEstado', tipo_cuenta: 'Cuenta RUT', numero_cuenta: '12345678',
  movimientos: [movimiento('m1', 'Electricidad', 50000), movimiento('m2', 'Gasfitería', 50000)],
};

describe('Transferencias a prestadores (HU-13)', () => {
  test('el total se ajusta a los pagos elegidos y se registra el comprobante', async () => {
    let registrada = false;
    const llamadas = simularApi({
      'GET /admin/liquidaciones': () => ({
        sla_horas: 48,
        pendientes: registrada ? [] : [luis],
        historial: registrada ? [{ transferido_en: '2026-10-08T12:00:00Z', prestador: 'Luis Fuentes', comprobante: '0012345678', cantidad: 1, total: 44000 }] : [],
      }),
      'POST /admin/liquidaciones/p1': () => {
        registrada = true;
        return { transferencia: { comprobante: '0012345678', cantidad: 1, total: 44000 } };
      },
    });
    mostrar(<Liquidaciones />);
    const registrar = await screen.findByRole('button', { name: 'Registrar transferencia de $88.000' });
    expect(registrar).toBeDisabled();                                   // falta el comprobante

    await userEvent.click(screen.getByLabelText('Incluir Gasfitería'));
    expect(screen.getByRole('button', { name: 'Registrar transferencia de $44.000' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/comprobante/), '0012345678');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar transferencia de $44.000' }));

    expect(await screen.findByText('Transferencia 0012345678 registrada: 1 pago(s) por $44.000.')).toBeInTheDocument();
    expect(screen.getByText('No hay pagos por transferir')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('0012345678')).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ movimientos: ['m1'], comprobante: '0012345678' });
  });

  test('sin datos bancarios no se puede registrar y se indica a quién escribir', async () => {
    simularApi({
      'GET /admin/liquidaciones': {
        sla_horas: 48, historial: [],
        pendientes: [{ ...luis, datos_completos: false, atrasado: true, rut: null, banco: null, numero_cuenta: null }],
      },
    });
    mostrar(<Liquidaciones />);
    expect(await screen.findByText(/aún no registra sus datos bancarios/)).toHaveTextContent('luis@demo.cl');
    expect(screen.getByText(/Fuera de plazo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/comprobante/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Registrar transferencia/ })).toBeDisabled();
  });
});
