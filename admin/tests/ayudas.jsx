import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

export const respuesta = (status, datos) =>
  new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });

export const errorApi = (status, codigo, mensaje, campos) => respuesta(status, { error: { codigo, mensaje, campos } });

// Reemplaza fetch por una API simulada. Cada clave es "MÉTODO /ruta?consulta" y su valor es la
// respuesta (objeto, Response) o una función (cuerpo, llamadas) => respuesta. Devuelve las llamadas
// recibidas para revisar qué envió el panel.
export function simularApi(rutas) {
  const llamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opciones = {}) => {
    const { pathname, search } = new URL(url);
    const ruta = pathname.replace(/^\/api/, '') + search;
    const metodo = opciones.method ?? 'GET';
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : undefined;
    llamadas.push({ metodo, ruta, cuerpo, headers: opciones.headers ?? {} });
    const r = rutas[`${metodo} ${ruta}`];
    if (r === undefined) return errorApi(404, 'NO_SIMULADA', `Ruta no simulada: ${metodo} ${ruta}`);
    const valor = typeof r === 'function' ? await r(cuerpo, llamadas) : r;
    return valor instanceof Response ? valor : respuesta(200, valor);
  }));
  return llamadas;
}

// Muestra una página dentro de un enrutador en memoria (con su patrón si usa parámetros)
export function mostrar(ui, { ruta = '/', patron } = {}) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      {patron ? <Routes><Route path={patron} element={ui} /></Routes> : ui}
    </MemoryRouter>,
  );
}

export const resumenVacio = {
  pendientes: {
    verificaciones: 0, verificaciones_por_vencer: 0, disputas: 0,
    prestadores_por_pagar: 0, transferencias_atrasadas: 0, usuarios_por_revisar: 0,
  },
  dinero: { retenido: 0, por_transferir: 0, transferido: 0, reembolsado: 0, comisiones: 0 },
  indicadores: [],
  usuarios: { clientes: 0, prestadores: 0 },
  cerrados_por_mes: [{ mes: '2026-09', cerrados: 0 }, { mes: '2026-10', cerrados: 0 }],
};
