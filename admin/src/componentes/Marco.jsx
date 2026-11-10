import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSesion } from '../sesion.jsx';
import { useDatos } from './comunes.jsx';

// Las páginas avisan cuando resuelven algo para que los contadores del menú se actualicen
export const avisarCambio = () => window.dispatchEvent(new Event('delimaster:pendientes'));

// Estructura del panel: menú lateral con los pendientes del equipo y área de contenido
export function Marco({ children }) {
  const { usuario, cerrarSesion } = useSesion();
  const { datos, recargar } = useDatos('/admin/resumen');
  const { pathname } = useLocation();
  const p = datos?.pendientes;

  useEffect(() => { recargar(); }, [pathname, recargar]);
  useEffect(() => {
    window.addEventListener('delimaster:pendientes', recargar);
    return () => window.removeEventListener('delimaster:pendientes', recargar);
  }, [recargar]);

  const enlaces = [
    ['/', 'Resumen', null],
    ['/verificaciones', 'Verificaciones', p?.verificaciones],
    ['/disputas', 'Disputas', p?.disputas],
    ['/liquidaciones', 'Transferencias', p?.prestadores_por_pagar],
    ['/moderacion', 'Moderación', p?.usuarios_por_revisar],
    ['/contabilidad', 'Contabilidad', null],
  ];

  return (
    <div className="marco">
      <aside className="lateral">
        <div className="marca">
          <span className="marca-logo" aria-hidden="true">D</span>
          <div>
            <strong>DeliMaster</strong>
            <span>Administración</span>
          </div>
        </div>
        <nav aria-label="Secciones">
          {enlaces.map(([ruta, nombre, n]) => (
            <NavLink key={ruta} to={ruta} end={ruta === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <span>{nombre}</span>
              {n ? <span className="contador" aria-label={`${n} pendientes`}>{n}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="usuario">
          <span>{usuario.nombre}</span>
          <button className="enlace" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="contenido">{children}</main>
    </div>
  );
}
