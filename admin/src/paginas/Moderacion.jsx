import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useDatos, Cargando, Aviso, Vacio, Insignia } from '../componentes/comunes.jsx';
import { avisarCambio } from '../componentes/Marco.jsx';
import { fechaHora, MOTIVOS } from '../formato.js';

// Moderación: quienes insisten en compartir contactos o pagar por fuera (filtro anti-fuga, HU-04)
export default function Moderacion() {
  const { datos, error, recargar } = useDatos('/admin/moderacion');
  if (!datos) return <Cargando error={error} />;

  return (
    <>
      <header className="cabecera">
        <h1>Moderación del chat</h1>
        <p className="suave">
          Usuarios con mensajes bloqueados por el filtro. Desde {datos.umbral} bloqueos se marcan para revisión.
          Desactivar una cuenta cierra sus sesiones de inmediato.
        </p>
      </header>
      {datos.usuarios.length === 0 ? <Vacio titulo="Nadie ha intentado compartir contactos" /> : (
        <div className="lista">
          {datos.usuarios.map((u) => <Usuario key={u.id} u={u} alCambiar={() => { recargar(); avisarCambio(); }} />)}
        </div>
      )}
    </>
  );
}

function Usuario({ u, alCambiar }) {
  const [desactivando, setDesactivando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function cambiar(activo) {
    setEnviando(true);
    setError(null);
    try {
      await api.patch(`/admin/usuarios/${u.id}`, activo ? { activo } : { activo, motivo: motivo.trim() });
      setDesactivando(false);
      alCambiar();
    } catch (e) {
      setError(e.campos?.motivo ?? e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article className="tarjeta">
      <div className="fila-titulo">
        <h2>{u.nombre} <span className="suave pequeno">· {u.rol} · {u.email}</span></h2>
        {!u.activo
          ? <Insignia tono="peligro">Desactivada</Insignia>
          : u.revisar ? <Insignia tono="alerta">Revisar</Insignia> : <Insignia tono="neutro">En observación</Insignia>}
      </div>
      <p>
        <strong>{u.bloqueados}</strong> de {u.enviados} mensajes bloqueados · último {fechaHora(u.ultimo_bloqueo)}
      </p>
      <div className="chips">
        {(u.motivos ?? []).map((m) => <span key={m} className="chip">{MOTIVOS[m] ?? m}</span>)}
      </div>
      <ul className="mensajes-bloqueados">
        {(u.ultimos ?? []).map((m, i) => (
          <li key={i}>
            <span className="mono">«{m.contenido}»</span>{' '}
            <Link className="pequeno" to={`/solicitudes/${m.solicitud_id}`}>ver solicitud</Link>
          </li>
        ))}
      </ul>
      {!u.activo ? (
        <>
          <p className="suave pequeno">Motivo: {u.desactivado_motivo} · {fechaHora(u.desactivado_en)}</p>
          {/* Una cuenta que su titular eliminó no se puede reactivar */}
          {u.eliminada ? null : (
            <button className="boton secundario" disabled={enviando} onClick={() => cambiar(true)}>Reactivar cuenta</button>
          )}
        </>
      ) : desactivando ? (
        <div className="fila-formulario">
          <label>
            Motivo de la desactivación
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: insiste en pagos por fuera de la plataforma" />
          </label>
          <button className="boton peligro" disabled={enviando || motivo.trim().length < 5} onClick={() => cambiar(false)}>Desactivar</button>
          <button className="boton secundario" onClick={() => setDesactivando(false)}>Cancelar</button>
        </div>
      ) : (
        <button className="boton secundario" onClick={() => setDesactivando(true)}>Desactivar cuenta…</button>
      )}
      <Aviso mensaje={error} />
    </article>
  );
}
