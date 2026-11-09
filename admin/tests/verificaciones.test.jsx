import { describe, test, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Verificaciones from '../src/paginas/Verificaciones.jsx';
import { enDias } from '../src/formato.js';
import { simularApi, errorApi, mostrar } from './ayudas.jsx';

const pendiente = {
  id: 'v1', prestador_nombre: 'Luis Fuentes', categoria_nombre: 'Electricidad', organismo: 'SEC',
  numero_registro: '12.345.678-9', codigo_certificado: 'ABC123', creado_en: '2026-10-01T12:00:00Z',
  fuente_sugerida: 'https://wlhttp.sec.cl/validadorInstaladores/',
};

describe('Verificaciones (HU-11, HU-17)', () => {
  test('rechazar sin observación muestra el error junto al campo y no envía vencimiento', async () => {
    const llamadas = simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [pendiente] },
      'PATCH /admin/verificaciones/v1': errorApi(422, 'DATOS_INVALIDOS', 'Revisa los datos',
        { observacion: 'Indica por qué se rechaza' }),
    });
    mostrar(<Verificaciones />);
    expect(await screen.findByText('12.345.678-9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Consultar en SEC/ })).toHaveAttribute('href', pendiente.fuente_sugerida);

    fireEvent.change(screen.getByLabelText(/Vencimiento del certificado/), { target: { value: enDias(30) } });
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(await screen.findByText('Indica por qué se rechaza')).toBeInTheDocument();
    expect(screen.getByLabelText(/Observación/)).toHaveAttribute('aria-invalid', 'true');
    const patch = llamadas.find((l) => l.metodo === 'PATCH');
    expect(patch.cuerpo).toEqual({ decision: 'rechazada' });   // el vencimiento solo va al aprobar
  });

  test('aprobar con vencimiento envía la fecha, recarga la lista y actualiza los contadores', async () => {
    let resuelta = false;
    const llamadas = simularApi({
      'GET /admin/verificaciones?estado=pendiente': () => ({ verificaciones: resuelta ? [] : [pendiente] }),
      'PATCH /admin/verificaciones/v1': () => { resuelta = true; return { verificacion: { id: 'v1' } }; },
    });
    const aviso = vi.fn();
    window.addEventListener('delimaster:pendientes', aviso);
    mostrar(<Verificaciones />);

    const campoFecha = await screen.findByLabelText(/obligatorio para la SEC/);
    expect(campoFecha).toHaveAttribute('max', enDias(93));       // la SEC vence a los tres meses
    fireEvent.change(campoFecha, { target: { value: enDias(90) } });
    await userEvent.type(screen.getByLabelText(/Enlace de la consulta/), 'https://wlhttp.sec.cl/consulta/ABC123');
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('No hay verificaciones por revisar')).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'PATCH').cuerpo).toEqual({
      decision: 'aprobada', vence_en: enDias(90), fuente_url: 'https://wlhttp.sec.cl/consulta/ABC123',
    });
    expect(aviso).toHaveBeenCalledOnce();
    window.removeEventListener('delimaster:pendientes', aviso);
  });

  test('una excepción muestra el RUT, los apellidos y por qué llegó al panel', async () => {
    simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [{
        ...pendiente, rut: '12345678-5', apellido_paterno: 'Fuentes', apellido_materno: 'Soto', consulta_motivo: 'La SEC no tiene registrado ese RUT con estos datos.',
      }] },
    });
    mostrar(<Verificaciones />);
    expect(await screen.findByText('12345678-5')).toBeInTheDocument();
    expect(screen.getByText('Fuentes Soto')).toBeInTheDocument();
    expect(screen.getByText('Necesita revisión: La SEC no tiene registrado ese RUT con estos datos.')).toBeInTheDocument();
  });

  test('una aprobación automática se identifica como tal', async () => {
    simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [] },
      'GET /admin/verificaciones?estado=aprobada': { verificaciones: [{
        ...pendiente, estado: 'aprobada', metodo_revision: 'automatica', revisado_en: '2026-11-08T12:00:00Z', vence_en: enDias(80), revisado_por: null,
      }] },
    });
    mostrar(<Verificaciones />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Aprobadas' }));
    expect(await screen.findByText(/Verificada automáticamente con la SEC/)).toBeInTheDocument();
  });

  test('en las aprobadas se ve cuánto falta para que venza cada certificado', async () => {
    simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [] },
      'GET /admin/verificaciones?estado=aprobada': {
        verificaciones: [
          { ...pendiente, id: 'v2', estado: 'aprobada', vence_en: enDias(10), revisado_en: '2026-10-02T12:00:00Z', revisado_por: 'Equipo' },
          { ...pendiente, id: 'v3', prestador_nombre: 'Rosa Paz', estado: 'aprobada', vence_en: enDias(60), revisado_en: '2026-10-02T12:00:00Z' },
          { ...pendiente, id: 'v4', prestador_nombre: 'Juan Soto', estado: 'vencida', vence_en: enDias(-3), revisado_en: '2026-07-02T12:00:00Z' },
        ],
      },
    });
    mostrar(<Verificaciones />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Aprobadas' }));

    const [luis, rosa, juan] = await screen.findAllByRole('article');
    expect(within(luis).getByText('Vence en 10 días')).toBeInTheDocument();
    expect(within(luis).getByText(/por Equipo/)).toBeInTheDocument();
    expect(within(rosa).getByText(/Vigente hasta el/)).toBeInTheDocument();
    expect(within(juan).getByText(/Vencida el/)).toBeInTheDocument();
  });
});
