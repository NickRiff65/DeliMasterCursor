import { describe, test, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Moderacion from '../src/paginas/Moderacion.jsx';
import { simularApi, mostrar } from './ayudas.jsx';

const pedro = {
  id: 'u1', nombre: 'Pedro Muñoz', rol: 'prestador', email: 'pedro@demo.cl', activo: true, revisar: true,
  bloqueados: 4, enviados: 10, ultimo_bloqueo: '2026-10-05T12:00:00Z', motivos: ['telefono', 'pago_externo'],
  ultimos: [{ contenido: 'llámame al +56 9 8765 4321', solicitud_id: 's1' }],
};

describe('Moderación del chat (HU-04)', () => {
  test('desactivar una cuenta exige un motivo y lo envía', async () => {
    let usuario = pedro;
    const llamadas = simularApi({
      'GET /admin/moderacion': () => ({ umbral: 3, usuarios: [usuario] }),
      'PATCH /admin/usuarios/u1': (cuerpo) => {
        usuario = { ...pedro, activo: false, desactivado_motivo: cuerpo.motivo, desactivado_en: '2026-10-08T12:00:00Z' };
        return { usuario };
      },
    });
    mostrar(<Moderacion />);
    expect(await screen.findByText('Revisar')).toBeInTheDocument();
    expect(screen.getByText('Teléfono')).toBeInTheDocument();
    expect(screen.getByText('Pago por fuera')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ver solicitud' })).toHaveAttribute('href', '/solicitudes/s1');

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar cuenta…' }));
    const desactivar = screen.getByRole('button', { name: 'Desactivar' });
    await userEvent.type(screen.getByLabelText('Motivo de la desactivación'), 'pago');
    expect(desactivar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motivo de la desactivación'), 's por fuera');
    await userEvent.click(desactivar);

    expect(await screen.findByText('Desactivada')).toBeInTheDocument();
    expect(screen.getByText(/Motivo: pagos por fuera/)).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'PATCH').cuerpo).toEqual({ activo: false, motivo: 'pagos por fuera' });
  });

  test('una cuenta desactivada se puede reactivar', async () => {
    const llamadas = simularApi({
      'GET /admin/moderacion': { umbral: 3, usuarios: [{ ...pedro, activo: false, desactivado_motivo: 'insiste', desactivado_en: '2026-10-08T12:00:00Z' }] },
      'PATCH /admin/usuarios/u1': { usuario: pedro },
    });
    mostrar(<Moderacion />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar cuenta' }));
    expect(llamadas.find((l) => l.metodo === 'PATCH').cuerpo).toEqual({ activo: true });
  });

  test('una cuenta que su titular eliminó no ofrece reactivarla', async () => {
    simularApi({
      'GET /admin/moderacion': { umbral: 3, usuarios: [{
        ...pedro, nombre: 'Cuenta eliminada', activo: false, eliminada: true,
        desactivado_motivo: 'Eliminada por su titular', desactivado_en: '2026-10-15T12:00:00Z',
      }] },
    });
    mostrar(<Moderacion />);
    expect(await screen.findByText(/Motivo: Eliminada por su titular/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar cuenta' })).not.toBeInTheDocument();
  });

  test('sin bloqueos se muestra el estado vacío', async () => {
    simularApi({ 'GET /admin/moderacion': { umbral: 3, usuarios: [] } });
    mostrar(<Moderacion />);
    expect(await screen.findByText('Nadie ha intentado compartir contactos')).toBeInTheDocument();
  });
});
