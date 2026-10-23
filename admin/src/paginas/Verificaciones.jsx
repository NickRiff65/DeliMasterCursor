import { useState } from 'react';
import { api } from '../api.js';
import { useDatos, Cargando, Aviso, Vacio, Insignia, Pestanas } from '../componentes/comunes.jsx';
import { avisarCambio } from '../componentes/Marco.jsx';
import { fecha, fechaDia, diasHasta, enDias } from '../formato.js';

// HU-11 / HU-17: revisión de certificados contra los registros oficiales (SEC, SAG)
export default function Verificaciones() {
  const [estado, setEstado] = useState('pendiente');
  const { datos, error, recargar } = useDatos(`/admin/verificaciones?estado=${estado}`);

  return (
    <>
      <header className="cabecera">
        <h1>Verificaciones</h1>
        <p className="suave">
          Revisa cada certificado en el sitio oficial antes de aprobarlo. El de la SEC trae un código bajo el QR y vence a los tres meses.
        </p>
      </header>
      <Pestanas valor={estado} onCambio={setEstado}
        opciones={[['pendiente', 'Por revisar'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']]} />
      {!datos ? <Cargando error={error} /> : datos.verificaciones.length === 0 ? (
        <Vacio titulo={estado === 'pendiente' ? 'No hay verificaciones por revisar' : 'Sin registros'} />
      ) : (
        <div className="lista">
          {datos.verificaciones.map((v) => (
            estado === 'pendiente'
              ? <Pendiente key={v.id} v={v} alResolver={() => { recargar(); avisarCambio(); }} />
              : <Resuelta key={v.id} v={v} />
          ))}
        </div>
      )}
    </>
  );
}

function Datos({ v }) {
  return (
    <dl className="datos">
      <div><dt>Prestador</dt><dd>{v.prestador_nombre}</dd></div>
      <div><dt>Servicio</dt><dd>{v.categoria_nombre} · {v.organismo}</dd></div>
      <div><dt>N.º de registro o licencia</dt><dd className="mono">{v.numero_registro}</dd></div>
      {v.codigo_certificado ? <div><dt>Código del certificado</dt><dd className="mono">{v.codigo_certificado}</dd></div> : null}
      <div><dt>Solicitada</dt><dd>{fecha(v.creado_en)}</dd></div>
    </dl>
  );
}

function Pendiente({ v, alResolver }) {
  const [vence, setVence] = useState('');
  const [fuente, setFuente] = useState('');
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState(null);
  const [campos, setCampos] = useState({});
  const [enviando, setEnviando] = useState(false);
  const esSec = v.organismo === 'SEC';

  async function resolver(decision) {
    setEnviando(true);
    setError(null);
    setCampos({});
    try {
      await api.patch(`/admin/verificaciones/${v.id}`, {
        decision,
        ...(decision === 'aprobada' && vence ? { vence_en: vence } : {}),
        ...(fuente.trim() ? { fuente_url: fuente.trim() } : {}),
        ...(observacion.trim() ? { observacion: observacion.trim() } : {}),
      });
      alResolver();
    } catch (e) {
      setError(e.message);
      setCampos(e.campos ?? {});
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article className="tarjeta">
      <div className="fila-titulo">
        <h2>{v.prestador_nombre} · {v.categoria_nombre}</h2>
        <a className="boton secundario" href={v.fuente_sugerida} target="_blank" rel="noreferrer">
          Consultar en {v.organismo} ↗
        </a>
      </div>
      <Datos v={v} />
      <div className="formulario">
        <label>
          Vencimiento del certificado {esSec ? '(obligatorio para la SEC)' : '(si tiene)'}
          <input type="date" value={vence} min={enDias(0)} max={esSec ? enDias(93) : undefined}
            onChange={(e) => setVence(e.target.value)} aria-invalid={Boolean(campos.vence_en)} />
          {campos.vence_en ? <span className="error-campo">{campos.vence_en}</span> : null}
        </label>
        <label>
          Enlace de la consulta (opcional)
          <input type="url" value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder={v.fuente_sugerida} />
        </label>
        <label className="ancho">
          Observación {campos.observacion ? '' : '(obligatoria si rechazas)'}
          <textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej.: el código no aparece en el sitio de la SEC" aria-invalid={Boolean(campos.observacion)} />
          {campos.observacion ? <span className="error-campo">{campos.observacion}</span> : null}
        </label>
      </div>
      <Aviso mensaje={error} />
      <div className="acciones">
        <button className="boton" disabled={enviando} onClick={() => resolver('aprobada')}>Aprobar</button>
        <button className="boton peligro" disabled={enviando} onClick={() => resolver('rechazada')}>Rechazar</button>
      </div>
    </article>
  );
}

function Resuelta({ v }) {
  const dias = diasHasta(v.vence_en);
  let vigencia = null;
  if (v.renovada) vigencia = <Insignia tono="neutro">Renovada</Insignia>;
  else if (v.estado === 'vencida') vigencia = <Insignia tono="peligro">Vencida el {fechaDia(v.vence_en)}</Insignia>;
  else if (v.estado === 'aprobada' && v.vence_en) {
    vigencia = dias <= 15
      ? <Insignia tono="alerta">Vence en {dias} día{dias === 1 ? '' : 's'}</Insignia>
      : <Insignia tono="ok">Vigente hasta el {fechaDia(v.vence_en)}</Insignia>;
  } else if (v.estado === 'aprobada') vigencia = <Insignia tono="ok">Aprobada</Insignia>;
  else vigencia = <Insignia tono="peligro">Rechazada</Insignia>;

  return (
    <article className="tarjeta">
      <div className="fila-titulo">
        <h2>{v.prestador_nombre} · {v.categoria_nombre}</h2>
        {vigencia}
      </div>
      <Datos v={v} />
      <p className="suave pequeno">
        Revisada el {fecha(v.revisado_en)}{v.revisado_por ? ` por ${v.revisado_por}` : ''}
        {v.fuente_url ? <> · <a href={v.fuente_url} target="_blank" rel="noreferrer">fuente</a></> : null}
        {v.observacion ? ` · ${v.observacion}` : ''}
      </p>
    </article>
  );
}
