import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useDatos, Cargando, Aviso, Vacio, Insignia } from '../componentes/comunes.jsx';
import { avisarCambio } from '../componentes/Marco.jsx';
import { pesos, fecha, fechaHora } from '../formato.js';

// HU-13: transferir a cada prestador los pagos liberados y registrar el comprobante
export default function Liquidaciones() {
  const { datos, error, recargar } = useDatos('/admin/liquidaciones');
  const [hecho, setHecho] = useState(null);
  if (!datos) return <Cargando error={error} />;

  return (
    <>
      <header className="cabecera">
        <h1>Transferencias a prestadores</h1>
        <p className="suave">
          Transfiere desde la cuenta de DeliMaster y registra aquí el comprobante. El plazo comprometido es de {datos.sla_horas} horas desde el cierre.
        </p>
      </header>
      <Aviso tipo="ok" mensaje={hecho} />
      {datos.pendientes.length === 0 ? <Vacio titulo="No hay pagos por transferir">Todo lo liberado ya fue pagado.</Vacio> : (
        <div className="lista">
          {datos.pendientes.map((p) => (
            <Prestador key={p.prestador_id} p={p} alRegistrar={(t) => {
              setHecho(`Transferencia ${t.comprobante} registrada: ${t.cantidad} pago(s) por ${pesos(t.total)}.`);
              recargar();
              avisarCambio();
            }} />
          ))}
        </div>
      )}

      <section className="tarjeta">
        <h2>Transferencias realizadas</h2>
        {datos.historial.length === 0 ? <p className="suave">Aún no hay transferencias registradas.</p> : (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Prestador</th><th>Comprobante</th><th className="num">Pagos</th><th className="num">Total</th></tr></thead>
            <tbody>
              {datos.historial.map((h) => (
                <tr key={h.comprobante + h.prestador}>
                  <td>{fechaHora(h.transferido_en)}</td><td>{h.prestador}</td><td className="mono">{h.comprobante}</td>
                  <td className="num">{h.cantidad}</td><td className="num">{pesos(h.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Copiar({ texto }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch { /* sin portapapeles */ }
  }
  return <button className="enlace pequeno" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button>;
}

function Prestador({ p, alRegistrar }) {
  const [elegidos, setElegidos] = useState(() => new Set(p.movimientos.map((m) => m.id)));
  const [comprobante, setComprobante] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const total = p.movimientos.filter((m) => elegidos.has(m.id)).reduce((t, m) => t + m.monto_neto, 0);

  function alternar(id) {
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function registrar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const { transferencia } = await api.post(`/admin/liquidaciones/${p.prestador_id}`, {
        movimientos: [...elegidos], comprobante: comprobante.trim(),
      });
      alRegistrar(transferencia);
    } catch (err) {
      setError(err.campos?.comprobante ?? err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article className="tarjeta">
      <div className="fila-titulo">
        <h2>{p.nombre} · {pesos(p.total)}</h2>
        {p.atrasado
          ? <Insignia tono="alerta">Fuera de plazo: liberado desde el {fecha(p.liberado_desde)}</Insignia>
          : <Insignia tono="info">Liberado desde el {fecha(p.liberado_desde)}</Insignia>}
      </div>

      {p.datos_completos ? (
        <dl className="datos">
          <div><dt>RUT</dt><dd className="mono">{p.rut} <Copiar texto={p.rut} /></dd></div>
          <div><dt>Banco</dt><dd>{p.banco}</dd></div>
          <div><dt>Cuenta</dt><dd>{p.tipo_cuenta} · <span className="mono">{p.numero_cuenta}</span> <Copiar texto={p.numero_cuenta} /></dd></div>
          <div><dt>Correo</dt><dd>{p.email}</dd></div>
        </dl>
      ) : (
        <Aviso tipo="alerta" mensaje={`${p.nombre} aún no registra sus datos bancarios en DeliMaster Pro. Escríbele a ${p.email} para que los complete.`} />
      )}

      <table className="tabla">
        <thead><tr><th aria-label="Incluir" /><th>Trabajo</th><th>Cerrado</th><th className="num">Cobrado</th><th className="num">Comisión</th><th className="num">A transferir</th></tr></thead>
        <tbody>
          {p.movimientos.map((m) => (
            <tr key={m.id}>
              <td><input type="checkbox" checked={elegidos.has(m.id)} onChange={() => alternar(m.id)} aria-label={`Incluir ${m.categoria}`} /></td>
              <td><Link to={`/solicitudes/${m.solicitud_id}`}>{m.categoria}</Link>{m.concepto === 'visita' ? <span className="suave pequeno"> · visita</span> : null}</td>
              <td>{fecha(m.liberado_en)}</td>
              <td className="num">{pesos(m.monto_bruto)}</td>
              <td className="num">−{pesos(m.comision)}</td>
              <td className="num"><strong>{pesos(m.monto_neto)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="fila-formulario" onSubmit={registrar}>
        <label>
          N.º de comprobante de la transferencia
          <input value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="Ej.: 0012345678" disabled={!p.datos_completos} />
        </label>
        <button className="boton" disabled={!p.datos_completos || enviando || elegidos.size === 0 || comprobante.trim().length < 4}>
          Registrar transferencia de {pesos(total)}
        </button>
      </form>
      <Aviso mensaje={error} />
    </article>
  );
}
