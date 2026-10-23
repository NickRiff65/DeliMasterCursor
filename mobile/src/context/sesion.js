import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, usarToken, ApiError } from '../lib/api';
import { guardarToken, leerToken, borrarToken } from '../lib/almacen';
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

  // Al abrir la app: si hay un token guardado, se recupera la sesión.
  useEffect(() => {
    (async () => {
      try {
        const token = await leerToken();
        if (token) {
          usarToken(token);
          const { usuario: u } = await api.get('/auth/yo');
          verificarRol(u);
          setUsuario(u);
        }
      } catch {
        // Token vencido o inválido: se descarta y se pide iniciar sesión de nuevo.
        usarToken(null);
        await borrarToken();
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const abrirSesion = useCallback(async ({ usuario: u, token }) => {
    verificarRol(u); // antes de guardar nada
    usarToken(token);
    await guardarToken(token);
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
    setUsuario(u);
  }, []);

  // Después de editar el perfil
  const actualizarUsuario = useCallback((u) => setUsuario(u), []);

  const cerrarSesion = useCallback(async () => {
    desconectarSocket();
    usarToken(null);
    await borrarToken();
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
