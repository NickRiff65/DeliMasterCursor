import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatos, Cargando, Insignia } from '../componentes/comunes.jsx';
import { pesos, fechaHora, fechaDia, ESTADOS_PAGO } from '../formato.js';

const TONO_ESTADO = { retenido: 'neutro', liberado: 'info', transferido: 'ok', reembolsado: 'alerta' };

// Panel contable (HU-09 / HU-14): libro mayor del período, totales por estado del ledger
// y los gastos de los prestadores con su boleta y la lectura del OCR.
export default function Contabilidad() {
  const [filtro, setFiltro] = useState(null);
  const ruta = filtro
    ? `/admin/contabilidad?desde=${filtro.desde}&hasta=${filtro.hasta}`
    : '/admin/contabilidad';
  const { datos, error } = useDatos(ruta);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Los campos parten mostrando el rango que la API aplicó (por defecto, los últimos 30 días)
  useEffect(() => {
    if (datos?.rango) {
      setDesde(datos.rango.desde);
      setHasta(datos.rango.hasta);
    }
  }, [datos]);

  if (!datos) return <Cargando error={error} />;
  const { rango, totales, movimientos, gastos } = datos;

  function filtrar(e) {
    e.preventDefault();
    if (desde && hasta) setFiltro({ desde, hasta });
  }

  return (
    <>
      <header className="cabecera">
        <h1>Contabilidad</h1>
        <p className="suave">
          Movimientos del libro mayor y gastos registrados entre el {fechaDia(rango.desde)} y el {fechaDia(rango.hasta)}.
        </p>
      </header>

      <form className="tarjeta fila-formulario" onSubmit={filtrar}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button className="boton" type="submit" disabled={!desde || !hasta}>Filtrar</button>
      </form>

      <section className="tarjeta">
        <h2>Totales por estado</h2>
        {totales.length === 0 ? <p className="suave">Sin totales en el período.</p> : (
          <table className="tabla">
            <thead>
              <tr><th>Estado</th><th className="num">Movimientos</th><th className="num">Bruto</th><th className="num">Comisión</th><th className="num">Neto</th></tr>
            </thead>
            <tbody>
              {totales.map((t) => (
                <tr key={t.estado}>
                  <td><Insignia tono={TONO_ESTADO[t.estado] ?? 'neutro'}>{ESTADOS_PAGO[t.estado] ?? t.estado}</Insignia></td>
                  <td className="num">{t.cantidad}</td>
                  <td className="num">{pesos(t.bruto)}</td>
                  <td className="num">{pesos(t.comision)}</td>
                  <td className="num"><strong>{pesos(t.neto)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="tarjeta">
        <h2>Movimientos del libro mayor</h2>
        {movimientos.length === 0 ? <p className="suave">Sin movimientos en el período.</p> : (
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Cliente</th><th>Prestador</th><th>Categoría</th><th className="num">Bruto</th><th className="num">Comisión</th><th className="num">Neto</th><th>Estado</th><th>Comprobante</th></tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td><Link to={`/solicitudes/${m.solicitud_id}`}>{fechaHora(m.creado_en)}</Link></td>
                  <td>{m.cliente}</td>
                  <td>{m.prestador}</td>
                  <td>{m.categoria ?? '—'}</td>
                  <td className="num">{pesos(m.monto_bruto)}</td>
                  <td className="num">−{pesos(m.comision)}</td>
                  <td className="num"><strong>{pesos(m.monto_neto)}</strong></td>
                  <td><Insignia tono={TONO_ESTADO[m.estado] ?? 'neutro'}>{ESTADOS_PAGO[m.estado] ?? m.estado}</Insignia></td>
                  <td>{m.comprobante ? <span className="mono">{m.comprobante}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="tarjeta">
        <h2>Gastos de los prestadores</h2>
        {gastos.length === 0 ? <p className="suave">Sin gastos registrados en el período.</p> : (
          <table className="tabla">
            <thead>
              <tr><th>Fecha</th><th>Prestador</th><th>Descripción</th><th className="num">Monto</th><th>Boleta</th><th>Leído por OCR</th></tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id}>
                  <td>{fechaHora(g.creado_en)}</td>
                  <td>{g.prestador}</td>
                  <td>{g.descripcion}</td>
                  <td className="num">{pesos(g.monto)}</td>
                  <td>{g.con_boleta
                    ? <Insignia tono="ok">Con boleta</Insignia>
                    : <Insignia tono="neutro">Sin boleta</Insignia>}</td>
                  <td>{g.ocr_monto != null
                    ? <>{pesos(g.ocr_monto)}<span className="suave pequeno bloque">{g.ocr_lector}</span></>
                    : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
