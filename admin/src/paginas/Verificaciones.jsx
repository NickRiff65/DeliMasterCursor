import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useDatos, Cargando, Aviso, Vacio, Insignia, Pestanas } from '../componentes/comunes.jsx';
import { avisarCambio } from '../componentes/Marco.jsx';
import { fecha, fechaDia, diasHasta, enDias } from '../formato.js';

// Máximo de verificaciones que el servidor acepta en un solo lote
const LOTE_MAXIMO = 50;

// HU-11 / HU-17: revisión de certificados contra los registros oficiales (SEC, SAG)
export default function Verificaciones() {
  const [estado, setEstado] = useState('pendiente');
  const [modo, setModo] = useState('uno');
  const [resultadoLote, setResultadoLote] = useState(null);
  // Ids resueltos en esta sesión: salen de la lista al instante, sin esperar la respuesta del servidor
  const [resueltos, setResueltos] = useState(() => new Set());
  const { datos, error, recargar } = useDatos(`/admin/verificaciones?estado=${estado}`);
  const enRevision = estado === 'pendiente';
  const lista = !datos ? [] : enRevision ? datos.verificaciones.filter((v) => !resueltos.has(v.id)) : datos.verificaciones;

  function cambiarEstado(nuevo) {
    setEstado(nuevo);
    setResueltos(new Set());
    setResultadoLote(null);
  }

  function resolvieron(ids) {
    setResueltos((previo) => new Set([...previo, ...ids]));
    recargar();
    avisarCambio();
  }

  return (
    <>
      <header className="cabecera">
        <h1>Verificaciones</h1>
        <p className="suave">
          Revisa cada certificado en el sitio oficial antes de aprobarlo. El de la SEC trae un código bajo el QR y vence a los tres meses.
        </p>
      </header>
      <Pestanas valor={estado} onCambio={cambiarEstado}
        opciones={[['pendiente', 'Por revisar'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']]} />
      {resultadoLote ? <ResultadoLote resultado={resultadoLote} /> : null}
      {!datos ? <Cargando error={error} /> : lista.length === 0 ? (
        <Vacio titulo={enRevision ? 'No hay verificaciones por revisar' : 'Sin registros'} />
      ) : !enRevision ? (
        <div className="lista">
          {lista.map((v) => <Resuelta key={v.id} v={v} />)}
        </div>
      ) : (
        <>
          <div className="barra-modos">
            <Segmentado valor={modo} onCambio={setModo}
              opciones={[['uno', 'Revisar de a uno'], ['lista', 'Lista y aprobación en lote']]} />
            {resueltos.size > 0 ? <span className="suave pequeno">En esta sesión: {resueltos.size} resueltas</span> : null}
          </div>
          {modo === 'uno'
            ? <RevisionUno lista={lista} alResolver={resolvieron} />
            : <Lote lista={lista} alResolver={resolvieron} alResultado={setResultadoLote} />}
        </>
      )}
    </>
  );
}

function Segmentado({ valor, onCambio, opciones }) {
  return (
    <div className="segmentado" role="group" aria-label="Forma de revisar">
      {opciones.map(([v, etiqueta]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onCambio(v)}>{etiqueta}</button>
      ))}
    </div>
  );
}

function ResultadoLote({ resultado }) {
  const { aplicadas, total, fallos } = resultado;
  return (
    <div className={`aviso aviso-${fallos.length ? 'alerta' : 'ok'}`} role="status">
      <p>Aprobadas {aplicadas} de {total}.</p>
      {fallos.length ? <ul>{fallos.map((texto, i) => <li key={i}>{texto}</li>)}</ul> : null}
    </div>
  );
}

// Una verificación a la vez: al resolverla, la siguiente ocupa su lugar
function RevisionUno({ lista, alResolver }) {
  const [indice, setIndice] = useState(0);
  const i = Math.min(indice, lista.length - 1);
  const v = lista[i];
  const saltar = () => setIndice(i + 1 < lista.length ? i + 1 : 0);

  return (
    <>
      <p className="progreso" aria-live="polite">Revisando {i + 1} de {lista.length}</p>
      <Revision key={v.id} v={v} alResolver={alResolver} alSaltar={saltar} />
    </>
  );
}

function Datos({ v }) {
  return (
    <dl className="datos">
      <div><dt>Prestador</dt><dd>{v.prestador_nombre}</dd></div>
      <div><dt>Servicio</dt><dd>{v.categoria_nombre} · {v.organismo}</dd></div>
      {v.rut ? <div><dt>RUT</dt><dd className="mono">{v.rut}</dd></div> : null}
      {v.apellido_paterno ? <div><dt>Apellidos</dt><dd>{v.apellido_paterno} {v.apellido_materno ?? ''}</dd></div> : null}
      <div><dt>N.º de registro o licencia</dt><dd className="mono">{v.numero_registro}</dd></div>
      {v.codigo_certificado ? <div><dt>Código del certificado</dt><dd className="mono">{v.codigo_certificado}</dd></div> : null}
      <div><dt>Solicitada</dt><dd>{fecha(v.creado_en)}</dd></div>
    </dl>
  );
}

function Revision({ v, alResolver, alSaltar }) {
  const [vence, setVence] = useState('');
  const [fuente, setFuente] = useState('');
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState(null);
  const [campos, setCampos] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(null);
  const enCurso = useRef(false);   // evita dos envíos si la tecla se pulsa dos veces seguidas
  const campoVence = useRef(null);
  const campoObservacion = useRef(null);
  const esSec = v.organismo === 'SEC';
  const puedeCopiar = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);

  async function resolver(decision) {
    if (enCurso.current) return;
    if (decision === 'aprobada' && esSec && !vence) {
      setCampos({ vence_en: 'Escribe el vencimiento del certificado antes de aprobar' });
      campoVence.current?.focus();
      return;
    }
    if (decision === 'rechazada' && !observacion.trim()) {
      setCampos({ observacion: 'Escribe por qué se rechaza' });
      campoObservacion.current?.focus();
      return;
    }
    enCurso.current = true;
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
      alResolver([v.id]);
    } catch (e) {
      setError(e.message);
      setCampos(e.campos ?? {});
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  // Atajos de teclado: sin modificadores y fuera de los campos de texto. Se registra en cada render
  // para que siempre use los valores actuales del formulario.
  useEffect(() => {
    function alPresionar(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const destino = e.target;
      if (destino instanceof HTMLElement && (destino.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(destino.tagName))) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'a') { e.preventDefault(); resolver('aprobada'); }
      else if (tecla === 'r') { e.preventDefault(); resolver('rechazada'); }
      else if (tecla === 's') { e.preventDefault(); alSaltar(); }
      else if (tecla === 'o' && v.fuente_sugerida) window.open(v.fuente_sugerida, '_blank', 'noopener');
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  });

  function copiar(texto, clave) {
    navigator.clipboard.writeText(texto)
      .then(() => { setCopiado(clave); setTimeout(() => setCopiado(null), 1500); })
      .catch(() => {});
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
      {puedeCopiar && (v.rut || v.codigo_certificado) ? (
        <div className="chips">
          {v.rut ? (
            <button type="button" className="chip" onClick={() => copiar(v.rut, 'rut')}>
              {copiado === 'rut' ? '✓ RUT copiado' : 'Copiar RUT'}
            </button>
          ) : null}
          {v.codigo_certificado ? (
            <button type="button" className="chip" onClick={() => copiar(v.codigo_certificado, 'codigo')}>
              {copiado === 'codigo' ? '✓ Código copiado' : 'Copiar código'}
            </button>
          ) : null}
        </div>
      ) : null}
      {v.consulta_motivo ? <Aviso tipo="alerta" mensaje={`Necesita revisión: ${v.consulta_motivo}`} /> : null}
      <div className="formulario">
        <label>
          Vencimiento del certificado {esSec ? '(obligatorio para la SEC)' : '(si tiene)'}
          <input ref={campoVence} type="date" value={vence} min={enDias(0)} max={esSec ? enDias(93) : undefined}
            onChange={(e) => setVence(e.target.value)} aria-invalid={Boolean(campos.vence_en)} />
          {campos.vence_en ? <span className="error-campo">{campos.vence_en}</span> : null}
        </label>
        <label>
          Enlace de la consulta (opcional)
          <input type="url" value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder={v.fuente_sugerida} />
        </label>
        <label className="ancho">
          Observación {campos.observacion ? '' : '(obligatoria si rechazas)'}
          <textarea ref={campoObservacion} rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej.: el código no aparece en el sitio de la SEC" aria-invalid={Boolean(campos.observacion)} />
          {campos.observacion ? <span className="error-campo">{campos.observacion}</span> : null}
        </label>
      </div>
      <Aviso mensaje={error} />
      <div className="acciones">
        <button className="boton" aria-keyshortcuts="A" disabled={enviando} onClick={() => resolver('aprobada')}>Aprobar</button>
        <button className="boton peligro" aria-keyshortcuts="R" disabled={enviando} onClick={() => resolver('rechazada')}>Rechazar</button>
        <button className="boton secundario" aria-keyshortcuts="S" disabled={enviando} onClick={alSaltar}>Saltar</button>
      </div>
      <p className="suave pequeno atajos">
        Atajos: <kbd>A</kbd> aprobar · <kbd>R</kbd> rechazar · <kbd>S</kbd> saltar · <kbd>O</kbd> abrir la consulta oficial
      </p>
    </article>
  );
}

// Varias verificaciones a la vez. Solo se aprueban con su vencimiento (SEC) y con tu confirmación de haberlas revisado.
// El rechazo sigue siendo individual: cada uno necesita su propia observación.
function Lote({ lista, alResolver, alResultado }) {
  const [elegidas, setElegidas] = useState({});
  const [vences, setVences] = useState({});
  const [atestiguo, setAtestiguo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const seleccionadas = lista.filter((v) => elegidas[v.id]);
  const n = seleccionadas.length;
  const sinFecha = seleccionadas.filter((v) => v.organismo === 'SEC' && !vences[v.id]);
  const demasiadas = n > LOTE_MAXIMO;
  const puede = n > 0 && !demasiadas && sinFecha.length === 0 && atestiguo && !enviando;
  const todas = lista.length > 0 && n === lista.length;

  function alternar(id) {
    setElegidas((previo) => ({ ...previo, [id]: !previo[id] }));
  }

  function alternarTodas() {
    setElegidas(todas ? {} : Object.fromEntries(lista.map((v) => [v.id, true])));
  }

  async function aprobar() {
    setEnviando(true);
    setError(null);
    const decisiones = seleccionadas.map((v) => ({
      id: v.id, decision: 'aprobada', ...(vences[v.id] ? { vence_en: vences[v.id] } : {}),
    }));
    try {
      const { resultados } = await api.post('/admin/verificaciones/lote', { decisiones });
      const aplicadas = resultados.filter((r) => r.ok).map((r) => r.id);
      const nombres = Object.fromEntries(lista.map((v) => [v.id, v.prestador_nombre]));
      alResultado({
        aplicadas: aplicadas.length,
        total: decisiones.length,
        fallos: resultados.filter((r) => !r.ok).map((r) => `${nombres[r.id] ?? 'Verificación'}: ${r.error}`),
      });
      // Las que no se aprobaron siguen seleccionadas; la confirmación se pide de nuevo
      setElegidas((previo) => {
        const siguiente = { ...previo };
        aplicadas.forEach((id) => delete siguiente[id]);
        return siguiente;
      });
      setAtestiguo(false);
      if (aplicadas.length) alResolver(aplicadas);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="lote-barra">
        <div className="lote-resumen">
          <strong>{n} seleccionada{n === 1 ? '' : 's'}</strong>
          {sinFecha.length > 0 ? (
            <span className="suave"> · falta el vencimiento de {sinFecha.length} certificado{sinFecha.length === 1 ? '' : 's'} SEC</span>
          ) : null}
          {demasiadas ? <span className="suave"> · el lote admite hasta {LOTE_MAXIMO} a la vez</span> : null}
        </div>
        <label className="lote-atestacion">
          <input type="checkbox" checked={atestiguo} onChange={(e) => setAtestiguo(e.target.checked)} />
          <span>Revisé en el sitio oficial cada certificado seleccionado y su fecha de vencimiento coincide.</span>
        </label>
        <button className="boton" disabled={!puede} onClick={aprobar}>
          {enviando ? 'Aprobando…' : n > 0 ? `Aprobar ${n}` : 'Aprobar seleccionadas'}
        </button>
      </div>
      <div className="lote-acciones">
        <button type="button" className="enlace" onClick={alternarTodas}>
          {todas ? 'Quitar selección' : 'Elegir todas'}
        </button>
      </div>
      <Aviso mensaje={error} />
      <table className="tabla" aria-label="Verificaciones por revisar">
        <thead>
          <tr>
            <th scope="col">Elegir</th>
            <th scope="col">Prestador</th>
            <th scope="col">Servicio</th>
            <th scope="col">Certificado</th>
            <th scope="col">Vencimiento</th>
            <th scope="col">Consulta</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((v) => {
            const esSec = v.organismo === 'SEC';
            return (
              <tr key={v.id}>
                <td>
                  <input type="checkbox" checked={Boolean(elegidas[v.id])} onChange={() => alternar(v.id)}
                    aria-label={`Elegir a ${v.prestador_nombre}`} />
                </td>
                <td>
                  <strong>{v.prestador_nombre}</strong>
                  {v.rut ? <div className="mono pequeno">{v.rut}</div> : null}
                  {v.consulta_motivo ? <div><Insignia tono="alerta">Revisar</Insignia></div> : null}
                </td>
                <td>{v.categoria_nombre} · {v.organismo}</td>
                <td className="mono">
                  {v.numero_registro}
                  {v.codigo_certificado ? <div className="pequeno">{v.codigo_certificado}</div> : null}
                </td>
                <td>
                  <input type="date" className="vencimiento-lote" value={vences[v.id] ?? ''}
                    min={enDias(0)} max={esSec ? enDias(93) : undefined}
                    aria-label={`Vencimiento de ${v.prestador_nombre}${esSec ? ' (obligatorio)' : ''}`}
                    aria-invalid={Boolean(elegidas[v.id] && esSec && !vences[v.id])}
                    onChange={(e) => setVences((previo) => ({ ...previo, [v.id]: e.target.value }))} />
                </td>
                <td>
                  <a href={v.fuente_sugerida} target="_blank" rel="noreferrer"
                    aria-label={`Consultar a ${v.prestador_nombre} en ${v.organismo}`}>Consultar ↗</a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
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
        {v.metodo_revision === 'automatica'
          ? `Verificada automáticamente con la ${v.organismo} el ${fecha(v.revisado_en)}`
          : <>Revisada el {fecha(v.revisado_en)}{v.revisado_por ? ` por ${v.revisado_por}` : ''}</>}
        {v.fuente_url ? <> · <a href={v.fuente_url} target="_blank" rel="noreferrer">fuente</a></> : null}
        {v.observacion ? ` · ${v.observacion}` : ''}
      </p>
    </article>
  );
}
