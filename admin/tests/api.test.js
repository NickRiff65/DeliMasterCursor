import { describe, test, expect, vi } from 'vitest';
import { api, usarToken, alPerderSesion, ApiError } from '../src/api.js';
import { simularApi, errorApi } from './ayudas.jsx';

describe('Cliente de la API', () => {
  test('envía el token de la sesión y devuelve los datos', async () => {
    const llamadas = simularApi({ 'GET /admin/resumen': { ok: true } });
    usarToken('token-del-equipo');
    expect(await api.get('/admin/resumen')).toEqual({ ok: true });
    expect(llamadas[0].headers.Authorization).toBe('Bearer token-del-equipo');
  });

  test('sin sesión no envía encabezado de autorización', async () => {
    const llamadas = simularApi({ 'POST /auth/login': { token: 't' } });
    await api.post('/auth/login', { email: 'a@b.cl', password: 'x' });
    expect(llamadas[0].headers.Authorization).toBeUndefined();
    expect(llamadas[0].cuerpo).toEqual({ email: 'a@b.cl', password: 'x' });
  });

  test('un error de la API llega como ApiError con su código y los campos inválidos', async () => {
    simularApi({
      'PATCH /admin/verificaciones/1': errorApi(422, 'DATOS_INVALIDOS', 'Revisa los datos', { observacion: 'Falta la observación' }),
    });
    const error = await api.patch('/admin/verificaciones/1', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.codigo).toBe('DATOS_INVALIDOS');
    expect(error.message).toBe('Revisa los datos');
    expect(error.campos).toEqual({ observacion: 'Falta la observación' });
  });

  test('si el backend está apagado avisa que no hay conexión', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const error = await api.get('/admin/resumen').catch((e) => e);
    expect(error.status).toBe(0);
    expect(error.codigo).toBe('SIN_CONEXION');
    expect(error.message).toMatch(/backend/);
  });

  test('un 401 con sesión abierta la cierra; un login fallido no', async () => {
    const perder = vi.fn();
    alPerderSesion(perder);
    simularApi({
      'POST /auth/login': errorApi(401, 'CREDENCIALES', 'Correo o contraseña incorrectos'),
      'GET /admin/resumen': errorApi(401, 'TOKEN_INVALIDO', 'Sesión vencida'),
    });
    await expect(api.post('/auth/login', {})).rejects.toThrow('Correo o contraseña incorrectos');
    expect(perder).not.toHaveBeenCalled();

    usarToken('vencido');
    await expect(api.get('/admin/resumen')).rejects.toThrow('Sesión vencida');
    expect(perder).toHaveBeenCalledOnce();
    alPerderSesion(() => {});
  });
});
