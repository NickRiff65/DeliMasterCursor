import { useEffect, useState } from 'react';
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
      {s.estado === 'en_disputa' || s.motivo_disputa ? (
        <ChatsDisputa solicitudId={s.id} cliente={s.cliente?.nombre} prestador={s.prestador?.nombre} />
      ) : null}

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
                    <VerificacionFoto f={f} />
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

// HU-16 · Conversaciones de la disputa: el equipo pide antecedentes al cliente y al maestro por
// separado (cada uno ve solo la suya). Se actualizan solas cada 15 segundos.
function ChatsDisputa({ solicitudId, cliente, prestador }) {
  const { datos, error, recargar } = useDatos(`/admin/solicitudes/${solicitudId}/disputa`);
  useEffect(() => {
    const t = setInterval(recargar, 15_000);
    return () => clearInterval(t);
  }, [recargar]);
  if (!datos) return error ? <Aviso mensaje={error} /> : null;
  return (
    <section className="tarjeta">
      <h2>Conversación con las partes</h2>
      <p className="suave">
        Cada conversación es privada: el cliente no ve la del maestro ni el maestro la del cliente.
        Pide aquí los antecedentes que falten; las fotos las suben en la sección «Fotos» de su app.
      </p>
      <div className="dos-columnas">
        <Conversacion solicitudId={solicitudId} parte="cliente" titulo={`Con el cliente${cliente ? ` · ${cliente}` : ''}`}
          mensajes={datos.cliente} puedeEscribir={datos.puede_escribir} alEnviar={recargar} />
        {prestador ? (
          <Conversacion solicitudId={solicitudId} parte="prestador" titulo={`Con el maestro · ${prestador}`}
            mensajes={datos.prestador} puedeEscribir={datos.puede_escribir} alEnviar={recargar} />
        ) : null}
      </div>
    </section>
  );
}

function Conversacion({ solicitudId, parte, titulo, mensajes, puedeEscribir, alEnviar }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const quien = parte === 'cliente' ? 'cliente' : 'maestro';

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/admin/solicitudes/${solicitudId}/disputa`, { parte, contenido: texto.trim() });
      setTexto('');
      alEnviar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="conversacion" aria-label={titulo}>
      <h3>{titulo}</h3>
      <div className="chat">
        {mensajes.length ? mensajes.map((m) => (
          <div key={m.id} className={`burbuja ${m.de_equipo ? 'equipo' : ''}`}>
            <p>{m.contenido}</p>
            <span className="pequeno suave">{m.de_equipo ? 'Equipo DeliMaster' : quien[0].toUpperCase() + quien.slice(1)} · {fechaHora(m.creado_en)}</span>
          </div>
        )) : <p className="suave pequeno">Sin mensajes todavía.</p>}
      </div>
      {puedeEscribir ? (
        <form className="formulario-chat" onSubmit={enviar}>
          <label>
            Escribir al {quien}
            <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000}
              placeholder={parte === 'cliente' ? 'Ej.: ¿Puedes subir una foto de cómo quedó el patio?' : 'Ej.: ¿Por qué quedaron las ramas en el patio?'} />
          </label>
          <button className="boton" type="submit" disabled={enviando || !texto.trim()}>{enviando ? 'Enviando…' : 'Enviar'}</button>
        </form>
      ) : <p className="suave pequeno">La disputa ya se resolvió: la conversación quedó cerrada.</p>}
      <Aviso mensaje={error} />
    </div>
  );
}

// ¿La foto es real y se tomó en el momento? Lo que dicen los datos de la cámara (EXIF)
const MOTIVOS_FOTO = {
  sin_datos: 'Sin datos de cámara: podría ser una captura o una imagen descargada',
  sin_fecha: 'No trae la fecha en que se tomó',
  antigua: 'Foto antigua: se tomó más de un día antes de subirla',
  fecha_futura: 'La fecha de la foto es posterior a la subida (reloj alterado)',
  editada: 'Editada con un programa',
  lejos: 'Se tomó lejos del punto del trabajo',
};
const TOMADA_CON = { camara: 'con la cámara de la app', galeria: 'desde la galería', web: 'desde la versión web' };

function VerificacionFoto({ f }) {
  const estado = f.verificacion ?? (f.sospechosa ? 'sin_datos' : null);
  if (!estado) return null;
  const motivos = f.verificacion_motivos ?? (estado === 'sin_datos' ? ['sin_datos'] : []);
  const minutos = f.minutos_antes;
  const antes = minutos == null ? '' : minutos < 60 ? `${minutos} min antes de subirla`
    : minutos < 1440 ? `${Math.round(minutos / 60)} h antes de subirla` : `${Math.round(minutos / 1440)} días antes de subirla`;
  return (
    <span className="bloque verificacion-foto">
      {estado === 'verificada' ? <Insignia tono="ok">✓ Verificada</Insignia>
        : estado === 'revisar' ? <Insignia tono="alerta">Revisar</Insignia>
          : <Insignia tono="alerta">⚠ Sin datos de cámara</Insignia>}
      {motivos.map((m) => (
        <span key={m} className="bloque">{MOTIVOS_FOTO[m] ?? m}</span>
      ))}
      {f.exif_fecha ? <span className="bloque">Tomada el {fechaHora(`${f.exif_fecha}`)}{antes ? ` (${antes})` : ''}</span> : null}
      {f.exif_dispositivo ? <span className="bloque">Equipo: {f.exif_dispositivo}</span> : null}
      {f.exif_software ? <span className="bloque">Programa: {f.exif_software}</span> : null}
      {f.distancia_m != null ? <span className="bloque">A {f.distancia_m >= 1000 ? `${(f.distancia_m / 1000).toFixed(1).replace('.', ',')} km` : `${f.distancia_m} m`} del punto del trabajo</span> : null}
      {f.tomada_con || f.metadatos_origen ? (
        <span className="bloque">
          Subida {TOMADA_CON[f.tomada_con] ?? ''}{f.metadatos_origen === 'app' ? ' · datos leídos por la app' : f.metadatos_origen === 'archivo' ? ' · datos del archivo' : ''}
        </span>
      ) : null}
    </span>
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
