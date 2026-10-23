import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useDatos, Cargando, Aviso, Insignia } from '../componentes/comunes.jsx';
import { avisarCambio } from '../componentes/Marco.jsx';
import { pesos, fechaHora, ESTADOS, ESTADOS_PAGO, MOTIVOS } from '../formato.js';

// Evidencia completa de una solicitud y resolución de la disputa (HU-16)
export default function Solicitud() {
  const { id } = useParams();
  const { datos, error, recargar } = useDatos(`/admin/solicitudes/${id}`);
  if (!datos) return <Cargando error={error} />;
  const s = datos.solicitud;
  const tono = s.estado === 'en_disputa' ? 'alerta' : s.estado === 'cerrada' ? 'ok' : 'neutro';

  return (
    <>
      <header className="cabecera">
        <Link to="/disputas" className="enlace pequeno">← Disputas</Link>
        <div className="fila-titulo">
          <h1>{s.categoria_nombre} · {s.precio_acordado ? pesos(s.precio_acordado) : 'sin precio'}</h1>
          <Insignia tono={tono}>{ESTADOS[s.estado]}</Insignia>
        </div>
        <p className="cita">«{s.descripcion}»</p>
      </header>

      {s.estado === 'en_disputa' ? <Resolver solicitud={s} alResolver={() => { recargar(); avisarCambio(); }} /> : null}

      <section className="dos-columnas">
        <div className="tarjeta">
          <h2>Partes</h2>
          <Parte titulo="Cliente" p={s.cliente} />
          {s.prestador ? (
            <Parte titulo="Prestador" p={s.prestador}
              extra={s.prestador.total_resenas
                ? `${s.prestador.calificacion_promedio.toLocaleString('es-CL')} ★ (${s.prestador.total_resenas} reseñas)`
                : 'Sin reseñas'} />
          ) : null}
          <h3>Dónde es el trabajo</h3>
          <p className="pequeno">
            {s.direccion ? `${s.direccion}, ${s.comuna}` : `${s.comuna} (sin dirección exacta)`}
            {s.referencia ? <span className="bloque suave">Referencia: {s.referencia}</span> : null}
            {s.latitud != null ? (
              <a className="bloque" href={`https://www.google.com/maps/search/?api=1&query=${s.latitud},${s.longitud}`}
                target="_blank" rel="noreferrer">Ver ubicación en el mapa</a>
            ) : null}
            {s.llegada_en ? (
              <span className="bloque suave">
                Llegada confirmada{s.llegada_distancia_m != null ? ` a ${s.llegada_distancia_m.toLocaleString('es-CL')} m del lugar` : ''}
                {s.llegada_latitud != null ? (
                  <>
                    {' · '}
                    <a href={`https://www.google.com/maps/search/?api=1&query=${s.llegada_latitud},${s.llegada_longitud}`}
                      target="_blank" rel="noreferrer">punto del prestador</a>
                  </>
                ) : null}
              </span>
            ) : null}
          </p>
          {s.motivo_disputa ? (
            <>
              <h3>Motivo del reclamo</h3>
              <p className="cita">«{s.motivo_disputa}»</p>
            </>
          ) : null}
        </div>
        <div className="tarjeta">
          <h2>Pago y garantía</h2>
          {s.pago ? (
            <dl className="montos">
              <div><dt>{s.pago.medio === 'oneclick' ? 'Tarjeta guardada' : 'Webpay'} · orden {s.pago.orden_compra}</dt><dd>{pesos(s.pago.monto)}</dd></div>
              {s.pago.codigo_autorizacion
                ? <div><dt>Código de autorización</dt><dd className="mono">{s.pago.codigo_autorizacion}</dd></div>
                : null}
              {s.ledger ? (
                <>
                  {s.ledger.monto_reembolsado ? (
                    <div><dt>Devuelto al cliente (disputa)</dt><dd>{pesos(s.ledger.monto_reembolsado)}</dd></div>
                  ) : null}
                  <div><dt>Comisión DeliMaster</dt><dd>{pesos(s.ledger.comision)}</dd></div>
                  <div><dt>Monto para el prestador</dt><dd>{pesos(s.ledger.monto_neto)}</dd></div>
                  <div className="destacado"><dt>Estado del dinero</dt><dd>{ESTADOS_PAGO[s.ledger.estado]}</dd></div>
                </>
              ) : null}
            </dl>
          ) : <p className="suave">{s.visita ? 'El saldo del trabajo aún no se paga.' : 'Sin pago registrado.'}</p>}
          {/* Modalidad con visita: el pago de la visita va aparte (se libera al llegar el prestador) */}
          {s.visita ? (
            <dl className="montos">
              <div><dt>Visita · orden {s.visita.pago.orden_compra}</dt><dd>{pesos(s.visita.pago.monto)}</dd></div>
              {s.visita.ledger ? <div><dt>Estado de la visita</dt><dd>{ESTADOS_PAGO[s.visita.ledger.estado]}</dd></div> : null}
            </dl>
          ) : null}
          {s.ledger?.eventos?.length ? (
            <ol className="linea-tiempo pequeno">
              {s.ledger.eventos.map((e, i) => (
                <li key={i}>
                  {fechaHora(e.creado_en)} · {e.estado_anterior ? `${ESTADOS_PAGO[e.estado_anterior]} → ` : ''}
                  {e.detalle ?? ESTADOS_PAGO[e.estado_nuevo]} ({pesos(e.monto)}){e.actor ? ` · ${e.actor}` : ''}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>

      <section className="dos-columnas">
        <div className="tarjeta">
          <h2>Chat ({s.mensajes.length})</h2>
          {s.mensajes.length === 0 ? <p className="suave">Las partes no intercambiaron mensajes.</p> : (
            <div className="chat">
              {s.mensajes.map((m) => (
                <div key={m.id} className={`burbuja ${m.emisor} ${m.bloqueado ? 'bloqueado' : ''}`}>
                  <span className="pequeno suave">{m.emisor === 'cliente' ? 'Cliente' : 'Prestador'} · {fechaHora(m.creado_en)}</span>
                  <p>{m.contenido}</p>
                  {m.bloqueado ? (
                    <Insignia tono="peligro">
                      Bloqueado: {(m.motivo_bloqueo ?? '').split(',').map((x) => MOTIVOS[x] ?? x).join(', ')}
                    </Insignia>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="tarjeta">
          <h2>Historial</h2>
          <ol className="linea-tiempo">
            {s.eventos.map((e, i) => (
              <li key={i}>
                <strong>{ESTADOS[e.estado_nuevo]}</strong> <span className="suave pequeno">{fechaHora(e.creado_en)}</span>
                {e.detalle ? <span className="bloque pequeno">{e.detalle}</span> : null}
              </li>
            ))}
          </ol>
          <h3>Gastos en materiales del prestador</h3>
          {s.gastos?.length ? (
            <ul className="gastos pequeno">
              {s.gastos.map((g) => (
                <li key={g.id}>
                  <span>{g.descripcion ?? 'Sin descripción'} · <strong>{pesos(g.monto)}</strong></span>
                  {g.rechazado
                    ? <Insignia tono="peligro">Rechazado · devuelto al cliente</Insignia>
                    : g.con_boleta
                      ? <a href={g.imagen_url} target="_blank" rel="noreferrer"><Insignia tono="ok">Con boleta · ver</Insignia></a>
                      : <Insignia tono="alerta">Sin boleta</Insignia>}
                </li>
              ))}
            </ul>
          ) : <p className="suave pequeno">El prestador no registró gastos en materiales.</p>}
          <h3>Fotos de evidencia</h3>
          {s.fotos?.length ? (
            <div className="fotos">
              {s.fotos.map((f) => (
                <figure key={f.id} className="foto">
                  <a href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} alt={`Foto subida por el ${f.rol}`} />
                  </a>
                  <figcaption className="pequeno suave">
                    {f.rol === 'cliente' ? 'Cliente' : 'Prestador'} · {fechaHora(f.creado_en)}
                    {f.descripcion ? <span className="bloque">{f.descripcion}</span> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : <p className="suave pequeno">Ninguna de las partes subió fotos.</p>}
        </div>
      </section>
    </>
  );
}

function Parte({ titulo, p, extra }) {
  return (
    <div className="parte">
      <h3>{titulo}</h3>
      <p><strong>{p.nombre}</strong> {p.activo ? null : <Insignia tono="peligro">Cuenta desactivada</Insignia>}</p>
      <p className="pequeno">{p.email}{p.telefono ? ` · ${p.telefono}` : ''}</p>
      {extra ? <p className="pequeno suave">{extra}</p> : null}
    </div>
  );
}

const aPesos = (texto) => Number(String(texto).replace(/\D/g, ''));

function Resolver({ solicitud, alResolver }) {
  const [decision, setDecision] = useState(null);
  const [parte, setParte] = useState('');   // monto a devolver en la devolución parcial
  const [rechazados, setRechazados] = useState([]);   // gastos del prestador que se rechazan (no justificados)
  const [observacion, setObservacion] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const monto = solicitud.ledger?.monto_bruto ?? solicitud.precio_acordado;
  const gastos = (solicitud.gastos ?? []).filter((g) => !g.rechazado);
  const devolver = aPesos(parte);

  // Rechazar un gasto suma su monto a lo que se devuelve al cliente (el monto se puede ajustar)
  function alternarGasto(g) {
    const nuevos = rechazados.includes(g.id) ? rechazados.filter((x) => x !== g.id) : [...rechazados, g.id];
    setRechazados(nuevos);
    const suma = gastos.filter((x) => nuevos.includes(x.id)).reduce((t, x) => t + x.monto, 0);
    setParte(suma ? String(Math.min(suma, monto - 1)) : '');
    setConfirmar(false);
  }
  const parcialValido = devolver > 0 && devolver < monto;

  function elegir(d) {
    setDecision(d);
    setConfirmar(false);
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/admin/disputas/${solicitud.id}/resolver`, {
        decision, observacion: observacion.trim(),
        ...(decision === 'parcial' ? { monto_reembolso: devolver, gastos_rechazados: rechazados } : {}),
      });
      alResolver();
    } catch (e) {
      setError(e.campos?.observacion ?? e.campos?.monto_reembolso ?? e.campos?.gastos_rechazados ?? e.message);
      setConfirmar(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="tarjeta resolver">
      <h2>Resolver la disputa</h2>
      <div className="opciones">
        <label className={`opcion ${decision === 'liberar' ? 'elegida' : ''}`}>
          <input type="radio" name="decision" checked={decision === 'liberar'} onChange={() => elegir('liberar')} />
          <span>
            <strong>Liberar el pago al prestador</strong>
            <span className="bloque pequeno suave">
              El trabajo se da por bien hecho: se cierra, el monto queda por transferir y el cliente puede calificar.
            </span>
          </span>
        </label>
        <label className={`opcion ${decision === 'reembolsar' ? 'elegida' : ''}`}>
          <input type="radio" name="decision" checked={decision === 'reembolsar'} onChange={() => elegir('reembolsar')} />
          <span>
            <strong>Reembolsar {pesos(monto)} al cliente</strong>
            <span className="bloque pequeno suave">Webpay devuelve el pago completo a la tarjeta del cliente y la solicitud se cancela.</span>
          </span>
        </label>
        <label className={`opcion ${decision === 'parcial' ? 'elegida' : ''}`}>
          <input type="radio" name="decision" checked={decision === 'parcial'} onChange={() => elegir('parcial')} />
          <span>
            <strong>Devolver una parte al cliente</strong>
            <span className="bloque pequeno suave">
              Por ejemplo, los materiales sin boleta. El resto se libera al prestador (con la comisión sobre lo que recibe) y el trabajo se cierra.
            </span>
          </span>
        </label>
      </div>
      {decision === 'parcial' ? (
        <div className="parcial">
          <label>
            Monto a devolver al cliente (de {pesos(monto)})
            <input inputMode="numeric" value={parte} onChange={(e) => { setParte(e.target.value); setConfirmar(false); }}
              placeholder="Ej.: 15000" />
          </label>
          {gastos.length ? (
            <fieldset className="rechazar-gastos">
              <legend className="pequeno">Gastos del prestador que se rechazan (se devuelven al cliente y no se le descuentan como gasto)</legend>
              {gastos.map((g) => (
                <label key={g.id} className="pequeno">
                  <input type="checkbox" checked={rechazados.includes(g.id)} onChange={() => alternarGasto(g)} />
                  {' '}{g.descripcion ?? 'Sin descripción'} · {pesos(g.monto)} {g.con_boleta ? '(con boleta)' : '(sin boleta)'}
                </label>
              ))}
            </fieldset>
          ) : null}
          {parte && !parcialValido ? (
            <p className="error-campo">Debe ser mayor que $0 y menor que {pesos(monto)} (para devolver todo, elige «Reembolsar»).</p>
          ) : null}
        </div>
      ) : null}
      <label>
        Fundamento de la decisión (queda en el historial)
        <textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)}
          placeholder="Ej.: las fotos y el chat muestran que el trabajo quedó incompleto" />
      </label>
      <Aviso mensaje={error} />
      {!confirmar ? (
        <button className="boton" disabled={!decision || observacion.trim().length < 10 || (decision === 'parcial' && !parcialValido)}
          onClick={() => setConfirmar(true)}>
          Continuar
        </button>
      ) : (
        <div className="confirmar">
          <p>
            <strong>¿Confirmas?</strong>{' '}
            {decision === 'liberar' ? 'Se liberará el pago al prestador.'
              : decision === 'parcial'
                ? `Se devolverán ${pesos(devolver)} al cliente y ${pesos(monto - devolver)} se liberarán al prestador.${rechazados.length ? ` Se rechazan ${rechazados.length === 1 ? '1 gasto' : `${rechazados.length} gastos`}.` : ''}`
                : `Se reembolsarán ${pesos(monto)} al cliente.`}{' '}
            Esta acción no se puede deshacer.
          </p>
          <div className="acciones">
            <button className={`boton ${decision === 'liberar' ? '' : 'peligro'}`} disabled={enviando} onClick={enviar}>
              {enviando ? 'Procesando…' : { liberar: 'Sí, liberar el pago', reembolsar: 'Sí, reembolsar', parcial: 'Sí, devolver esa parte' }[decision]}
            </button>
            <button className="boton secundario" onClick={() => setConfirmar(false)}>Volver</button>
          </div>
        </div>
      )}
    </section>
  );
}
