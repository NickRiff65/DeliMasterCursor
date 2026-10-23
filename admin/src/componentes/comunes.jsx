import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// Carga una ruta de la API y permite recargarla después de una acción
export function useDatos(ruta) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const cargar = useCallback(async () => {
    try {
      setDatos(await api.get(ruta));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [ruta]);
  useEffect(() => { setDatos(null); cargar(); }, [cargar]);
  return { datos, error, recargar: cargar };
}

export function Aviso({ mensaje, tipo = 'error' }) {
  if (!mensaje) return null;
  return <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>{mensaje}</div>;
}

export function Cargando({ error }) {
  if (error) return <Aviso mensaje={error} />;
  return <p className="suave">Cargando…</p>;
}

export function Vacio({ titulo, children }) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {children ? <p className="suave">{children}</p> : null}
    </div>
  );
}

// Estado con ícono + texto (nunca solo color)
export function Insignia({ tono = 'neutro', children }) {
  const icono = { ok: '✓', alerta: '!', peligro: '✕', info: '•', neutro: '' }[tono];
  return <span className={`insignia insignia-${tono}`}>{icono ? <span aria-hidden="true">{icono} </span> : null}{children}</span>;
}

export function Pestanas({ opciones, valor, onCambio }) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map(([v, etiqueta]) => (
        <button key={v} role="tab" aria-selected={valor === v} className={valor === v ? 'activa' : ''} onClick={() => onCambio(v)}>
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
