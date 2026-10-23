import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Network from 'expo-network';
import { api } from '../lib/api';
import * as almacen from '../lib/almacenCola';
import { useSesion } from './sesion';

// HU-12: cola de solicitudes creadas sin conexión.
// Se guardan en el celular y se envían solas cuando vuelve la señal. Como cada solicitud lleva
// el UUID generado en el celular, reenviarla nunca crea duplicados en el servidor.
const ColaContext = createContext(null);
const REINTENTO_MS = 30000;

export function ColaProvider({ children }) {
  const { usuario } = useSesion();
  const [items, setItems] = useState([]);
  const [conectado, setConectado] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const procesando = useRef(false);

  const recargar = useCallback(async () => {
    setItems(usuario ? await almacen.listar(usuario.id) : []);
  }, [usuario]);

  // Envía las solicitudes pendientes, en el orden en que se crearon
  const procesar = useCallback(async () => {
    if (!usuario || usuario.rol !== 'cliente' || procesando.current) return;
    procesando.current = true;
    setEnviando(true);
    try {
      for (const item of await almacen.listar(usuario.id)) {
        if (item.estado !== 'pendiente') continue;
        try {
          const { prestador_id: prestadorId, ...solicitud } = item.datos;
          const r = await api.post('/solicitudes', solicitud);
          // Si se pidió desde el perfil de un prestador, se le asigna (si ya no está disponible,
          // la solicitud queda publicada y el cliente puede elegir a otro)
          if (prestadorId && r.solicitudes?.[0]?.estado === 'creada') {
            await api.post(`/solicitudes/${r.solicitudes[0].id}/asignar`, { prestador_id: prestadorId }).catch(() => {});
          }
          await almacen.quitar(item.id);
        } catch (e) {
          if (e.status === 0 || e.status === 401 || e.status >= 500) {
            // Sin señal, sesión vencida o servidor caído: se reintenta más tarde
            if (e.status === 0) setConectado(false);
            break;
          }
          // El servidor la rechazó (por ejemplo, no identificó el servicio): el cliente debe revisarla
          await almacen.guardar({ ...item, estado: 'revisar', error: e.message, intentos: item.intentos + 1 });
        }
      }
    } finally {
      procesando.current = false;
      setEnviando(false);
      await recargar();
    }
  }, [usuario, recargar]);

  // Al iniciar sesión: cargar la cola e intentar enviar
  useEffect(() => {
    recargar().then(procesar);
  }, [recargar, procesar]);

  // Cuando vuelve la señal, se envía lo pendiente
  useEffect(() => {
    Network.getNetworkStateAsync().then((s) => setConectado(s.isConnected !== false)).catch(() => {});
    const sub = Network.addNetworkStateListener((s) => {
      const hay = s.isConnected !== false && s.isInternetReachable !== false;
      setConectado(hay);
      if (hay) procesar();
    });
    return () => sub.remove();
  }, [procesar]);

  // Respaldo: mientras haya pendientes, reintentar cada 30 s (la señal rural puede volver sin aviso)
  const hayPendientes = items.some((i) => i.estado === 'pendiente');
  useEffect(() => {
    if (!hayPendientes) return undefined;
    const t = setInterval(procesar, REINTENTO_MS);
    return () => clearInterval(t);
  }, [hayPendientes, procesar]);

  const encolar = useCallback(async (datos) => {
    await almacen.guardar({
      id: datos.id, usuario_id: usuario.id, datos, estado: 'pendiente', error: null, intentos: 0,
      creado_en: new Date().toISOString(),
    });
    setConectado(false);
    await recargar();
  }, [usuario, recargar]);

  const descartar = useCallback(async (id) => {
    await almacen.quitar(id);
    await recargar();
  }, [recargar]);

  // Reintentar una que necesitaba revisión (por ejemplo, después de elegir la categoría)
  const reintentar = useCallback(async (item, cambios = {}) => {
    await almacen.guardar({ ...item, datos: { ...item.datos, ...cambios }, estado: 'pendiente', error: null });
    await procesar();
  }, [procesar]);

  const valor = useMemo(
    () => ({ items, conectado, enviando, encolar, procesar, descartar, reintentar }),
    [items, conectado, enviando, encolar, procesar, descartar, reintentar],
  );
  return <ColaContext.Provider value={valor}>{children}</ColaContext.Provider>;
}

export function useCola() {
  const ctx = useContext(ColaContext);
  if (!ctx) throw new Error('useCola debe usarse dentro de <ColaProvider>');
  return ctx;
}
