import { useState } from 'react';
import { nombreMes } from '../formato.js';

// Columnas de una sola serie (servicios cerrados por mes). Sin leyenda: el título nombra la serie.
// Columnas delgadas con extremo redondeado, etiqueta solo en el mes actual y tooltip por columna.
export function GraficoMensual({ datos }) {
  const [activo, setActivo] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const max = Math.max(1, ...datos.map((d) => d.cerrados));
  const tope = max <= 4 ? 4 : Math.ceil(max / 5) * 5;          // eje con números redondos
  const marcas = [0, tope / 2, tope];
  const ALTO = 160;

  return (
    <figure className="grafico">
      <figcaption>
        <strong>Servicios cerrados por mes</strong>
        <button className="enlace pequeno" onClick={() => setVerTabla((v) => !v)}>{verTabla ? 'Ver gráfico' : 'Ver tabla'}</button>
      </figcaption>
      {verTabla ? (
        <table className="tabla">
          <thead><tr><th>Mes</th><th className="num">Servicios cerrados</th></tr></thead>
          <tbody>{datos.map((d) => <tr key={d.mes}><td>{d.mes}</td><td className="num">{d.cerrados}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="grafico-area" style={{ height: ALTO + 28 }}>
          {marcas.map((m) => (
            <div key={m} className="grafico-linea" style={{ bottom: 28 + (m / tope) * ALTO }}>
              <span>{m}</span>
            </div>
          ))}
          <div className="grafico-columnas" style={{ height: ALTO }}>
            {datos.map((d, i) => {
              const ultimo = i === datos.length - 1;
              return (
                <div key={d.mes} className="grafico-celda"
                  onMouseEnter={() => setActivo(d.mes)} onMouseLeave={() => setActivo(null)}
                  onFocus={() => setActivo(d.mes)} onBlur={() => setActivo(null)} tabIndex={0}
                  aria-label={`${d.mes}: ${d.cerrados} servicios cerrados`}>
                  {activo === d.mes ? <div className="grafico-tooltip" role="tooltip">{nombreMes(d.mes)}: <strong>{d.cerrados}</strong></div> : null}
                  {ultimo && activo !== d.mes ? <span className="grafico-valor">{d.cerrados}</span> : null}
                  <div className="grafico-columna" style={{ height: `${(d.cerrados / tope) * 100}%` }} />
                </div>
              );
            })}
          </div>
          <div className="grafico-ejex">
            {datos.map((d) => <span key={d.mes}>{nombreMes(d.mes)}</span>)}
          </div>
        </div>
      )}
    </figure>
  );
}
