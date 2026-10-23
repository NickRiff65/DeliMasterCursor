import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, usarToken, alPerderSesion, ApiError } from './api.js';

// La sesión del administrador vive en sessionStorage: se cierra al cerrar la pestaña.
const CLAVE = 'delimaster-admin-sesion';
const leer = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE)); } catch { return null; } };
const guardar = (v) => { try { v ? sessionStorage.setItem(CLAVE, JSON.stringify(v)) : sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };

const Contexto = createContext(null);

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(() => {
    const s = leer();
    if (s?.token) usarToken(s.token);
    return s;
  });

  const cerrarSesion = useCallback(() => {
    usarToken(null);
    guardar(null);
    setSesion(null);
  }, []);

  useEffect(() => { alPerderSesion(cerrarSesion); }, [cerrarSesion]);

  async function iniciarSesion(email, password) {
    const { token, usuario } = await api.post('/auth/login', { email, password });
    if (usuario.rol !== 'admin') {
      throw new ApiError(403, { mensaje: 'Esta cuenta no tiene acceso al panel de administración.' });
    }
    usarToken(token);
    const nueva = { token, usuario };
    guardar(nueva);
    setSesion(nueva);
  }

  return (
    <Contexto.Provider value={{ usuario: sesion?.usuario ?? null, iniciarSesion, cerrarSesion }}>
      {children}
    </Contexto.Provider>
  );
}

export const useSesion = () => useContext(Contexto);
