import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, usarToken, ApiError } from '../lib/api';
import { guardarToken, leerToken, borrarToken, guardarUsuario, leerUsuario, borrarUsuario } from '../lib/almacen';
import { ROL_APP, ES_PRO } from '../lib/variante';
import { desconectarSocket } from '../lib/socket';
import { VERSION_TERMINOS } from '../legal/textos';

// Cada app atiende un solo rol: un cliente usa Lite y un prestador usa Pro.
function verificarRol(usuario) {
  if (usuario.rol !== ROL_APP) {
    throw new ApiError(403, {
      codigo: 'APP_EQUIVOCADA',
      mensaje: ES_PRO
        ? 'Esta cuenta es de cliente. Para contratar servicios usa DeliMaster Lite.'
        : 'Esta cuenta es de prestador. Para gestionar tus trabajos usa DeliMaster Pro.',
    });
  }
}

const SesionContext = createContext(null);

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al abrir la app: si hay un token guardado, se recupera la sesión. Solo se cierra si el servidor dice que el
  // token ya no sirve (401) o que la cuenta es de la otra app; sin señal o con el servidor lento, la sesión sigue
  // abierta con los datos guardados en el teléfono y se vuelve a revisar en segundo plano.
  useEffect(() => {
    let activo = true;
    let reintento = null;
    const descartar = async () => {
      usarToken(null);
      await Promise.all([borrarToken(), borrarUsuario()]).catch(() => {});
      if (activo) setUsuario(null);
    };
    const revisar = async (intento) => {
      try {
        const r = await api.get('/auth/yo');
        verificarRol(r.usuario);
        if (r.token) {               // el servidor renueva la sesión: otros 7 días desde hoy
          usarToken(r.token);
          await guardarToken(r.token);
        }
        await guardarUsuario(r.usuario).catch(() => {});
        if (activo) setUsuario(r.usuario);
        return true;
      } catch (e) {
        if (e.status === 401 || e.codigo === 'APP_EQUIVOCADA') {
          await descartar();
          return true;
        }
        // Falla de red o del servidor: se reintenta más tarde sin cerrar la sesión
        if (activo && intento < 5) reintento = setTimeout(() => revisar(intento + 1), Math.min(30_000, 3_000 * 2 ** intento));
        return false;
      }
    };
    (async () => {
      try {
        const token = await leerToken();
        if (token) {
          usarToken(token);
          const guardado = await leerUsuario();
          if (guardado?.rol === ROL_APP) {
            // Abre de inmediato con la sesión guardada y la confirma con el servidor en segundo plano
            setUsuario(guardado);
            setCargando(false);
            revisar(0);
            return;
          }
          await revisar(0);
        }
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
      clearTimeout(reintento);
    };
  }, []);

  const abrirSesion = useCallback(async ({ usuario: u, token }) => {
    verificarRol(u); // antes de guardar nada
    usarToken(token);
    await guardarToken(token);
    await guardarUsuario(u).catch(() => {});
    setUsuario(u);
  }, []);

  const iniciarSesion = useCallback(
    async (email, password) => abrirSesion(await api.post('/auth/login', { email, password })),
    [abrirSesion],
  );

  const registrar = useCallback(
    async (datos) => abrirSesion(await api.post('/auth/registro', datos)),
    [abrirSesion],
  );

  // Términos de uso y privacidad: quien no aceptó la versión vigente debe hacerlo antes de seguir
  const aceptarTerminos = useCallback(async () => {
    const { usuario: u } = await api.post('/auth/terminos', { version: VERSION_TERMINOS });
    guardarUsuario(u).catch(() => {});
    setUsuario(u);
  }, []);

  // Después de editar el perfil
  const actualizarUsuario = useCallback((u) => {
    guardarUsuario(u).catch(() => {});
    setUsuario(u);
  }, []);

  const cerrarSesion = useCallback(async () => {
    desconectarSocket();
    usarToken(null);
    await Promise.all([borrarToken(), borrarUsuario()]).catch(() => {});
    setUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario, cargando, iniciarSesion, registrar, cerrarSesion, abrirSesion, aceptarTerminos, actualizarUsuario }),
    [usuario, cargando, iniciarSesion, registrar, cerrarSesion, abrirSesion, aceptarTerminos, actualizarUsuario],
  );

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return ctx;
}
