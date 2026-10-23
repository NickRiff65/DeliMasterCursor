import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { obtenerSocket } from '../lib/socket';
import { registrarAvisosPush } from '../lib/push';
import { useSesion } from './sesion';

// Avisos dentro de la app (ambas apps): cuántos hay sin leer y el último que llegó en tiempo real
// (por ejemplo, "Te transferimos tu pago"), para mostrarlo en un aviso flotante.
const AvisosContext = createContext({ noLeidas: 0, nuevo: null, descartarNuevo: () => {}, recargar: () => {}, marcarLeidas: async () => null });

const CADA = 60_000;   // se revisa cada minuto por si el aviso llegó con la app sin conexión

export function AvisosProvider({ children }) {
  const { usuario } = useSesion();
  const [noLeidas, setNoLeidas] = useState(0);
  const [nuevo, setNuevo] = useState(null);

  const recargar = useCallback(async () => {
    try {
      setNoLeidas((await api.get('/notificaciones')).no_leidas ?? 0);
    } catch {
      // es solo un apoyo: si falla, se vuelve a intentar en la próxima revisión
    }
  }, []);

  const marcarLeidas = useCallback(async () => {
    const r = await api.post('/notificaciones/leidas', {});
    setNoLeidas(0);
    return r;
  }, []);

  useEffect(() => {
    if (!usuario || usuario.terminos_pendientes) return undefined;
    recargar();
    registrarAvisosPush();
    const t = setInterval(recargar, CADA);
    const socket = obtenerSocket();
    const alLlegar = (n) => {
      setNoLeidas((x) => x + 1);
      setNuevo(n);
    };
    socket.on('notificacion', alLlegar);
    return () => {
      clearInterval(t);
      socket.off('notificacion', alLlegar);
    };
  }, [usuario, recargar]);

  const valor = useMemo(
    () => ({ noLeidas, nuevo, descartarNuevo: () => setNuevo(null), recargar, marcarLeidas }),
    [noLeidas, nuevo, recargar, marcarLeidas],
  );
  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>;
}

export const useAvisos = () => useContext(AvisosContext);
