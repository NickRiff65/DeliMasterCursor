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
const otra = { ...pendiente, id: 'v5', prestador_nombre: 'Rosa Paz', numero_registro: '98.765.432-1', codigo_certificado: 'XYZ789' };
const sag = {
  ...pendiente, id: 'v6', prestador_nombre: 'Juan Soto', categoria_nombre: 'Fumigación', organismo: 'SAG',
  numero_registro: 'SAG-554', codigo_certificado: null, fuente_sugerida: 'https://www.sag.gob.cl/',
};

describe('Verificaciones (HU-11, HU-17)', () => {
  test('rechazar sin observación no envía nada y señala el campo', async () => {
    const llamadas = simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [pendiente] },
    });
    mostrar(<Verificaciones />);
    expect(await screen.findByText('12.345.678-9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Consultar en SEC/ })).toHaveAttribute('href', pendiente.fuente_sugerida);

    fireEvent.change(screen.getByLabelText(/Vencimiento del certificado/), { target: { value: enDias(30) } });
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(await screen.findByText('Escribe por qué se rechaza')).toBeInTheDocument();
    expect(screen.getByLabelText(/Observación/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Observación/)).toHaveFocus();
    expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);
  });

  test('un error del servidor se muestra junto al campo que lo causa', async () => {
    simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [pendiente] },
      'PATCH /admin/verificaciones/v1': errorApi(422, 'DATOS_INVALIDOS', 'Revisa los datos',
        { vence_en: 'El certificado ya venció' }),
    });
    mostrar(<Verificaciones />);
    await screen.findByText('12.345.678-9');

    fireEvent.change(screen.getByLabelText(/Vencimiento del certificado/), { target: { value: enDias(30) } });
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('Revisa los datos')).toBeInTheDocument();
    expect(screen.getByText('El certificado ya venció')).toBeInTheDocument();
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

  test('revisar de a uno: la tecla A aprueba y la siguiente verificación ocupa su lugar', async () => {
    const resueltas = [];
    const llamadas = simularApi({
      'GET /admin/verificaciones?estado=pendiente': () => ({
        verificaciones: [pendiente, otra].filter((v) => !resueltas.includes(v.id)),
      }),
      'PATCH /admin/verificaciones/v1': () => { resueltas.push('v1'); return { verificacion: { id: 'v1' } }; },
    });
    mostrar(<Verificaciones />);
    expect(await screen.findByText('Revisando 1 de 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/obligatorio para la SEC/), { target: { value: enDias(60) } });
    fireEvent.keyDown(document.body, { key: 'a' });

    expect(await screen.findByText('Revisando 1 de 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rosa Paz · Electricidad' })).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'PATCH').cuerpo).toEqual({ decision: 'aprobada', vence_en: enDias(60) });
  });

  test('revisar de a uno: sin fecha SEC, la tecla A no envía nada y lleva al campo de fecha', async () => {
    const llamadas = simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [pendiente] },
    });
    mostrar(<Verificaciones />);
    await screen.findByText('12.345.678-9');

    fireEvent.keyDown(document.body, { key: 'a' });

    expect(await screen.findByText('Escribe el vencimiento del certificado antes de aprobar')).toBeInTheDocument();
    expect(screen.getByLabelText(/obligatorio para la SEC/)).toHaveFocus();
    expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);
  });

  test('revisar de a uno: la tecla S pasa a la siguiente sin decidir nada', async () => {
    const llamadas = simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [pendiente, otra] },
    });
    mostrar(<Verificaciones />);
    expect(await screen.findByText('Revisando 1 de 2')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 's' });

    expect(await screen.findByText('Revisando 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rosa Paz · Electricidad' })).toBeInTheDocument();
    expect(llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);
  });

  test('en lote, el botón solo se activa con la fecha SEC de cada certificado y la confirmación', async () => {
    const llamadas = simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [pendiente, sag] },
      'POST /admin/verificaciones/lote': () => ({
        aplicadas: 2,
        resultados: [{ id: 'v1', ok: true, decision: 'aprobada' }, { id: 'v6', ok: true, decision: 'aprobada' }],
      }),
    });
    mostrar(<Verificaciones />);
    await userEvent.click(await screen.findByRole('button', { name: 'Lista y aprobación en lote' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Elegir a Luis Fuentes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Elegir a Juan Soto' }));

    const boton = screen.getByRole('button', { name: 'Aprobar 2' });
    expect(boton).toBeDisabled();
    expect(screen.getByText(/falta el vencimiento de 1 certificado SEC/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Vencimiento de Luis Fuentes/), { target: { value: enDias(80) } });
    expect(boton).toBeDisabled();                                    // falta la confirmación
    await userEvent.click(screen.getByRole('checkbox', { name: /Revisé en el sitio oficial/ }));
    expect(boton).toBeEnabled();
    await userEvent.click(boton);

    expect(await screen.findByText('Aprobadas 2 de 2.')).toBeInTheDocument();
    expect(llamadas.find((l) => l.metodo === 'POST').cuerpo).toEqual({
      decisiones: [
        { id: 'v1', decision: 'aprobada', vence_en: enDias(80) },
        { id: 'v6', decision: 'aprobada' },                          // el SAG no exige fecha
      ],
    });
  });

  test('en lote, un fallo no impide aprobar las demás y queda informado y seleccionado', async () => {
    simularApi({
      'GET /admin/verificaciones?estado=pendiente': { verificaciones: [pendiente, sag] },
      'POST /admin/verificaciones/lote': () => ({
        aplicadas: 1,
        resultados: [
          { id: 'v1', ok: true, decision: 'aprobada' },
          { id: 'v6', ok: false, codigo: 'YA_RESUELTA', error: 'Esta solicitud ya fue resuelta' },
        ],
      }),
    });
    mostrar(<Verificaciones />);
    await userEvent.click(await screen.findByRole('button', { name: 'Lista y aprobación en lote' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Elegir a Luis Fuentes' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Elegir a Juan Soto' }));
    fireEvent.change(screen.getByLabelText(/Vencimiento de Luis Fuentes/), { target: { value: enDias(80) } });
    await userEvent.click(screen.getByRole('checkbox', { name: /Revisé en el sitio oficial/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar 2' }));

    expect(await screen.findByText('Aprobadas 1 de 2.')).toBeInTheDocument();
    expect(screen.getByText('Juan Soto: Esta solicitud ya fue resuelta')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Elegir a Juan Soto' })).toBeChecked();
  });

  test('en lote, no se puede elegir más de 50 verificaciones a la vez', async () => {
    const muchas = Array.from({ length: 51 }, (_, i) => ({ ...sag, id: `w${i}`, prestador_nombre: `Prestador ${i}` }));
    simularApi({ 'GET /admin/verificaciones?estado=pendiente': { verificaciones: muchas } });
    mostrar(<Verificaciones />);
    await userEvent.click(await screen.findByRole('button', { name: 'Lista y aprobación en lote' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elegir todas' }));

    expect(screen.getByText(/el lote admite hasta 50 a la vez/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar 51' })).toBeDisabled();
  });
});
