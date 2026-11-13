import { describe, test, expect } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Contabilidad from '../src/paginas/Contabilidad.jsx';
import { simularApi, mostrar } from './ayudas.jsx';

const datos = {
  rango: { desde: '2026-10-11', hasta: '2026-11-10' },
  totales: [
    { estado: 'retenido', cantidad: 1, bruto: 45000, comision: 5400, neto: 39600 },
    { estado: 'transferido', cantidad: 2, bruto: 100000, comision: 12000, neto: 88000 },
  ],
  movimientos: [
    {
      id: 'm1', creado_en: '2026-11-05T15:30:00.000Z', liberado_en: '2026-11-06T10:00:00.000Z',
      transferido_en: '2026-11-07T09:00:00.000Z', estado: 'transferido',
      monto_bruto: 50000, comision: 6000, monto_neto: 44000, comprobante: '0012345678',
      solicitud_id: 's1', cliente: 'Ana Pérez', prestador: 'Juan Soto', categoria: 'Electricidad',
    },
    {
      id: 'm2', creado_en: '2026-11-08T11:00:00.000Z', liberado_en: null, transferido_en: null,
      estado: 'retenido', monto_bruto: 45000, comision: 5400, monto_neto: 39600, comprobante: null,
      solicitud_id: 's2', cliente: 'María Fuentes', prestador: 'Pedro Rojas', categoria: 'Gasfitería',
    },
  ],
  gastos: [
    {
      id: 'g1', creado_en: '2026-11-05T16:00:00.000Z', monto: 15000, origen: 'boleta',
      descripcion: 'Cable y automáticos', solicitud_id: 's1', prestador: 'Juan Soto',
      con_boleta: true, ocr_monto: 14780, ocr_lector: 'google_vision',
    },
    {
      id: 'g2', creado_en: '2026-11-06T09:00:00.000Z', monto: 5000, origen: 'manual',
      descripcion: 'Traslado a terreno', solicitud_id: 's2', prestador: 'Pedro Rojas',
      con_boleta: false, ocr_monto: null, ocr_lector: null,
    },
  ],
};

describe('Panel contable (HU-09 / HU-14)', () => {
  test('muestra los totales por estado y un movimiento con cliente, prestador y montos', async () => {
    simularApi({ 'GET /admin/contabilidad': datos });
    mostrar(<Contabilidad />);

    expect(await screen.findByRole('heading', { name: 'Contabilidad' })).toBeInTheDocument();

    // Los campos de fecha parten con el rango que devolvió la API
    await waitFor(() => {
      expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-11');
      expect(screen.getByLabelText('Hasta')).toHaveValue('2026-11-10');
    });

    const tablas = screen.getAllByRole('table');
    const filasTotales = within(tablas[0]).getAllByRole('row');
    expect(within(filasTotales[1]).getByText('Retenido')).toBeInTheDocument();
    expect(within(filasTotales[1]).getByText('$45.000')).toBeInTheDocument();
    expect(within(filasTotales[2]).getByText('Transferido')).toBeInTheDocument();
    expect(within(filasTotales[2]).getByText('2')).toBeInTheDocument();
    expect(within(filasTotales[2]).getByText('$100.000')).toBeInTheDocument();
    expect(within(filasTotales[2]).getByText('$88.000')).toBeInTheDocument();

    const filasMov = within(tablas[1]).getAllByRole('row');
    expect(within(filasMov[1]).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(filasMov[1]).getByText('Juan Soto')).toBeInTheDocument();
    expect(within(filasMov[1]).getByText('Electricidad')).toBeInTheDocument();
    expect(within(filasMov[1]).getByText('$50.000')).toBeInTheDocument();
    expect(within(filasMov[1]).getByText('$44.000')).toBeInTheDocument();
    expect(within(filasMov[1]).getByText('0012345678')).toBeInTheDocument();
    // La fecha del movimiento enlaza al detalle de la solicitud
    const enlaces = within(filasMov[1]).getAllByRole('link');
    expect(enlaces[0]).toHaveAttribute('href', '/solicitudes/s1');
    // Sin comprobante se muestra un guión
    expect(within(filasMov[2]).getByText('—')).toBeInTheDocument();
  });

  test('muestra los gastos con su boleta y la lectura del OCR', async () => {
    simularApi({ 'GET /admin/contabilidad': datos });
    mostrar(<Contabilidad />);

    const tablas = await screen.findAllByRole('table');
    const filasGastos = within(tablas[2]).getAllByRole('row');
    expect(within(filasGastos[1]).getByText('Cable y automáticos')).toBeInTheDocument();
    expect(within(filasGastos[1]).getByText('Con boleta')).toBeInTheDocument();
    expect(within(filasGastos[1]).getByText('$15.000')).toBeInTheDocument();
    expect(within(filasGastos[1]).getByText('$14.780')).toBeInTheDocument();
    expect(within(filasGastos[1]).getByText('google_vision')).toBeInTheDocument();
    expect(within(filasGastos[2]).getByText('Sin boleta')).toBeInTheDocument();
  });

  test('al filtrar vuelve a pedir la contabilidad con las fechas elegidas', async () => {
    const llamadas = simularApi({
      'GET /admin/contabilidad': datos,
      'GET /admin/contabilidad?desde=2026-11-01&hasta=2026-11-07': { ...datos, rango: { desde: '2026-11-01', hasta: '2026-11-07' } },
    });
    mostrar(<Contabilidad />);
    await screen.findByRole('heading', { name: 'Contabilidad' });

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-07' } });
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));

    expect(await screen.findByText(/1 nov 2026/)).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'GET' && l.ruta === '/admin/contabilidad?desde=2026-11-01&hasta=2026-11-07')).toBe(true);
  });

  test('sin datos en el período muestra los estados vacíos', async () => {
    simularApi({
      'GET /admin/contabilidad': { rango: { desde: '2026-10-11', hasta: '2026-11-10' }, totales: [], movimientos: [], gastos: [] },
    });
    mostrar(<Contabilidad />);
    expect(await screen.findByText('Sin totales en el período.')).toBeInTheDocument();
    expect(screen.getByText('Sin movimientos en el período.')).toBeInTheDocument();
    expect(screen.getByText('Sin gastos registrados en el período.')).toBeInTheDocument();
  });
});
