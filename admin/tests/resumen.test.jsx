import { describe, test, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Resumen from '../src/paginas/Resumen.jsx';
import { GraficoMensual } from '../src/componentes/GraficoMensual.jsx';
import { pesos, diasHasta, enDias, fechaDia } from '../src/formato.js';
import { simularApi, mostrar, resumenVacio } from './ayudas.jsx';

describe('Resumen e indicadores (HU-14)', () => {
  test('muestra pendientes con su nota, el dinero por estado y si cada indicador cumple la meta', async () => {
    simularApi({
      'GET /admin/resumen': {
        ...resumenVacio,
        pendientes: { ...resumenVacio.pendientes, prestadores_por_pagar: 2, transferencias_atrasadas: 1 },
        dinero: { retenido: 150000, por_transferir: 88000, transferido: 440000, reembolsado: 50000, comisiones: 84000 },
        usuarios: { clientes: 12, prestadores: 5 },
        indicadores: [
          { id: 'cierre', nombre: 'Servicios cerrados sin disputa', formula: 'cerrados / pagados', valor: 92.5, meta: '≥ 90%', cumple: true },
          { id: 'fuga', nombre: 'Intentos de pago por fuera', formula: 'bloqueados / mensajes', valor: 12, meta: '≤ 5%', cumple: false },
          { id: 'sus', nombre: 'Satisfacción (SUS)', formula: 'encuesta', valor: null, meta: '≥ 68', cumple: null },
        ],
      },
    });
    mostrar(<Resumen />);
    expect(await screen.findByText('12 clientes y 5 prestadores registrados.')).toBeInTheDocument();
    expect(screen.getByText('1 pago(s) fuera del plazo de 48 h')).toBeInTheDocument();
    expect(screen.getByText('$84.000')).toBeInTheDocument();

    const filas = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(filas[1]).getByText('92,5%')).toBeInTheDocument();
    expect(within(filas[1]).getByText('Cumple')).toBeInTheDocument();
    expect(within(filas[2]).getByText('Bajo la meta')).toBeInTheDocument();
    expect(within(filas[3]).getByText('Sin datos aún')).toBeInTheDocument();
  });
});

describe('Gráfico de servicios cerrados por mes', () => {
  const datos = [{ mes: '2026-08', cerrados: 3 }, { mes: '2026-09', cerrados: 7 }, { mes: '2026-10', cerrados: 5 }];

  test('usa un eje con números redondos y escala cada columna', () => {
    const { container } = render(<GraficoMensual datos={datos} />);
    // máximo 7 → eje hasta 10, con marcas 0, 5 y 10
    expect([...container.querySelectorAll('.grafico-linea span')].map((s) => s.textContent)).toEqual(['0', '5', '10']);
    const alturas = [...container.querySelectorAll('.grafico-columna')].map((c) => c.style.height);
    expect(alturas).toEqual(['30%', '70%', '50%']);
    expect(screen.getByLabelText('2026-09: 7 servicios cerrados')).toBeInTheDocument();
  });

  test('muestra el detalle al pasar el mouse y ofrece la misma información como tabla', async () => {
    render(<GraficoMensual datos={datos} />);
    fireEvent.mouseEnter(screen.getByLabelText('2026-09: 7 servicios cerrados'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('7');

    await userEvent.click(screen.getByRole('button', { name: 'Ver tabla' }));
    const filas = screen.getAllByRole('row');
    expect(filas).toHaveLength(4);
    expect(within(filas[2]).getByText('7')).toBeInTheDocument();
  });

  test('sin servicios cerrados el eje llega a 4 y no se divide por cero', () => {
    const { container } = render(<GraficoMensual datos={[{ mes: '2026-10', cerrados: 0 }]} />);
    expect(container.querySelector('.grafico-columna').style.height).toBe('0%');
    expect([...container.querySelectorAll('.grafico-linea span')].map((s) => s.textContent)).toEqual(['0', '2', '4']);
  });
});

describe('Formato de montos y fechas', () => {
  test('montos en pesos chilenos', () => {
    expect(pesos(1234567)).toBe('$1.234.567');
    expect(pesos(null)).toBe('$0');
  });

  test('días hasta una fecha y fechas sin hora', () => {
    expect(diasHasta(enDias(5))).toBe(5);
    expect(diasHasta(enDias(-2))).toBe(-2);
    expect(diasHasta(null)).toBeNull();
    expect(fechaDia('2027-01-08')).toMatch(/8.*ene.*2027/);
    expect(fechaDia(null)).toBe('—');
  });
});
