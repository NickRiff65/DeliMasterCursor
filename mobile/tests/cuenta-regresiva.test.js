import { render, screen } from '@testing-library/react-native';
import { CuentaRegresiva, formatearRestante } from '../src/components/CuentaRegresiva';

// El plazo se mostraba como «1438:20» (minutos sin tope): debe leerse en horas y minutos
const minutos = (m, s = 0) => (m * 60 + s) * 1000;

describe('Formato del tiempo que queda', () => {
  test('más de una hora se lee en horas y minutos, no en minutos totales', () => {
    expect(formatearRestante(minutos(1438, 20))).toBe('23 h 58 min');
    expect(formatearRestante(minutos(90))).toBe('1 h 30 min');
  });

  test('menos de una hora se cuenta en minutos y segundos', () => {
    expect(formatearRestante(minutos(29, 45))).toBe('29:45');
    expect(formatearRestante(minutos(0, 5))).toBe('0:05');
  });

  test('un día o más se lee en días y horas', () => {
    expect(formatearRestante((24 * 3600 + 2 * 3600) * 1000)).toBe('1 día 2 h');
    expect(formatearRestante((48 * 3600) * 1000)).toBe('2 días 0 h');
  });

  test('sin tiempo queda en cero', () => {
    expect(formatearRestante(0)).toBe('0:00');
    expect(formatearRestante(-5000)).toBe('0:00');
  });
});

describe('Cuenta regresiva en pantalla', () => {
  test('muestra el plazo restante con el formato nuevo', async () => {
    const hasta = new Date(Date.now() + minutos(1438, 20) + 500).toISOString();
    await render(<CuentaRegresiva hasta={hasta} />);
    expect(screen.getByText('23 h 58 min')).toBeOnTheScreen();
  });
});
