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
  test('pide confirmar a quién y cuánto, y el comprobante se genera solo', async () => {
    let registrada = false;
    const llamadas = simularApi({
      'GET /admin/liquidaciones': () => ({
        sla_horas: 48,
        pendientes: registrada ? [] : [luis],
        historial: registrada ? [{ transferido_en: '2026-10-08T12:00:00Z', prestador: 'Luis Fuentes', comprobante: 'DM-20261008-001', cantidad: 1, total: 44000 }] : [],
      }),
      'POST /admin/liquidaciones/p1': () => {
        registrada = true;
        return { transferencia: { comprobante: 'DM-20261008-001', cantidad: 1, total: 44000 } };
      },
    });
    mostrar(<Liquidaciones />);
    await screen.findByRole('button', { name: 'Registrar transferencia de $88.000' });
    expect(screen.queryByLabelText(/comprobante/)).not.toBeInTheDocument();   // ya no se escribe a mano

    await userEvent.click(screen.getByLabelText('Incluir Gasfitería'));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar transferencia de $44.000' }));

    // Confirmación: todavía no se envía nada
    const confirmacion = screen.getByRole('alertdialog', { name: 'Confirmar transferencia a Luis Fuentes' });
    expect(within(confirmacion).getByText('¿Estás seguro de transferir $44.000 a Luis Fuentes?')).toBeInTheDocument();
    expect(confirmacion).toHaveTextContent('1 pago, a su Cuenta RUT de BancoEstado 12345678');
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Sí, registrar la transferencia' }));

    expect(await screen.findByText('Transferencia DM-20261008-001 registrada: 1 pago(s) por $44.000.')).toBeInTheDocument();
    expect(screen.getByText('No hay pagos por transferir')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('DM-20261008-001')).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({ movimientos: ['m1'] });
  });

  test('cancelar la confirmación no registra nada', async () => {
    const llamadas = simularApi({ 'GET /admin/liquidaciones': { sla_horas: 48, historial: [], pendientes: [luis] } });
    mostrar(<Liquidaciones />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar transferencia de $88.000' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar transferencia de $88.000' })).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
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
    expect(screen.getByRole('button', { name: /Registrar transferencia/ })).toBeDisabled();
  });
});
