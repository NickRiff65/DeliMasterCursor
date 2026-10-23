import { render, screen } from '@testing-library/react-native';
import { textoHorario, diaDeLaSemana, horasDeLaJornada } from '../src/lib/horario';
import { SelectorHorario } from '../src/components/SelectorHorario';

// Horario de atención del maestro: cómo se muestra y cómo limita la hora de la visita
describe('Horario de atención', () => {
  test('se describe en palabras', () => {
    expect(textoHorario({ dias: [1, 2, 3, 4, 5], desde: '09:00', hasta: '18:00' })).toBe('Lunes a viernes · 09:00 a 18:00');
    expect(textoHorario({ dias: [6, 1, 3], desde: '08:30', hasta: '17:00' })).toBe('Lun, mié y sáb · 08:30 a 17:00');
    expect(textoHorario({ dias: [1, 2, 3, 4, 5, 6, 7], desde: '10:00', hasta: '20:00' })).toBe('Todos los días · 10:00 a 20:00');
    expect(textoHorario({ dias: [6], desde: '09:00', hasta: '13:00' })).toBe('Solo sábado · 09:00 a 13:00');
    expect(textoHorario({ dias: [6, 7], desde: '09:00', hasta: '13:00' })).toBe('Sáb y dom · 09:00 a 13:00');
    expect(textoHorario({ dias: [1, 2, 3, 4, 5, 6, 7], desde: '08:00', hasta: '24:00' })).toBe('Todos los días · 08:00 a medianoche');
    expect(textoHorario(null)).toBeNull();
  });

  test('días de la semana y horas de inicio dentro de la jornada', () => {
    expect(diaDeLaSemana(new Date(2026, 9, 12))).toBe(1);   // lunes 12 de octubre de 2026
    expect(diaDeLaSemana(new Date(2026, 9, 18))).toBe(7);   // domingo
    expect(horasDeLaJornada({ desde: '09:00', hasta: '11:00' })).toEqual([{ h: 9, m: 0 }, { h: 9, m: 30 }, { h: 10, m: 0 }, { h: 10, m: 30 }]);
    // Hasta medianoche: la última visita posible es a las 23:30
    expect(horasDeLaJornada({ desde: '22:00', hasta: '24:00' })).toEqual([{ h: 22, m: 0 }, { h: 22, m: 30 }, { h: 23, m: 0 }, { h: 23, m: 30 }]);
  });

  test('la visita solo se puede agendar en los días y horas en que atiende el maestro', async () => {
    // Domingo 11 de octubre a las 7:00: atiende solo lunes y miércoles, de 9 a 11
    const ahora = new Date(2026, 9, 11, 7, 0);
    await render(<SelectorHorario valor={new Date(2026, 9, 12, 9, 0).toISOString()} onCambio={() => {}} ahora={ahora}
      horario={{ dias: [1, 3], desde: '09:00', hasta: '11:00' }} />);
    expect(screen.queryByRole('button', { name: 'Hoy' })).not.toBeOnTheScreen();   // domingo
    expect(screen.getByRole('button', { name: 'Mañana' })).toBeOnTheScreen();      // lunes
    expect(screen.queryByRole('button', { name: /mar 13/ })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /mié 14/ })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^\d\d:\d\d$/ }).map((b) => b.props.accessibilityLabel ?? '')).toHaveLength(4);
    expect(screen.getByRole('button', { name: '10:30' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '11:00' })).not.toBeOnTheScreen();
  });
});
