import { useState } from 'react';
import { pesos, pesosCorto } from '../formato.js';

// Gráficos de una sola serie para el panel (sin librerías): el título nombra la serie, así que no
// llevan leyenda. Marcas delgadas de un solo color (--grafico), tooltip al pasar el mouse o con el
// teclado, el valor destacado escrito sobre la marca y una vista de tabla para leer todos los números.

// Tope "redondo" del eje para que las marcas sean números limpios (0 · 50 mil · 100 mil)
function topeRedondo(max) {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  const paso = [1, 2, 2.5, 5, 10].find((p) => p * potencia >= max);
  return paso * potencia;
}

function Encabezado({ titulo, subtitulo, verTabla, alternar }) {
  return (
    <figcaption>
      <span>
        <strong>{titulo}</strong>
        {subtitulo ? <span className="suave pequeno bloque">{subtitulo}</span> : null}
      </span>
      <button type="button" className="enlace pequeno" onClick={alternar}>{verTabla ? 'Ver gráfico' : 'Ver tabla'}</button>
    </figcaption>
  );
}

function Tabla({ datos, columna, formato }) {
  return (
    <table className="tabla">
      <thead><tr><th>{columna}</th><th className="num">Monto</th></tr></thead>
      <tbody>
        {datos.map((d) => (
          <tr key={d.clave}><td>{d.etiquetaLarga ?? d.etiqueta}</td><td className="num">{formato(d.valor)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

// Columnas en el tiempo: datos = [{ clave, etiqueta (eje), etiquetaLarga (tooltip), valor }]
export function GraficoColumnas({ titulo, subtitulo, datos, columna = 'Período', formato = pesos }) {
  const [activo, setActivo] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const ALTO = 170;
  const EJE = 28;
  const max = Math.max(0, ...datos.map((d) => d.valor));
  const tope = topeRedondo(max);
  const marcas = [0, tope / 2, tope];
  // Con muchas columnas, el eje muestra una etiqueta cada tanto para que no se monten
  const cada = Math.max(1, Math.ceil(datos.length / 8));
  const claveMax = max > 0 ? datos.find((d) => d.valor === max)?.clave : null;

  return (
    <figure className="grafico">
      <Encabezado titulo={titulo} subtitulo={subtitulo} verTabla={verTabla} alternar={() => setVerTabla((v) => !v)} />
      {verTabla ? <Tabla datos={datos} columna={columna} formato={formato} /> : (
        <div className="grafico-area grafico-area-pesos" style={{ height: ALTO + EJE }} role="img"
          aria-label={`${titulo}. Máximo ${formato(max)}.`}>
          {marcas.map((m) => (
            <div key={m} className="grafico-linea" style={{ bottom: EJE + (m / tope) * ALTO }}>
              <span>{pesosCorto(m)}</span>
            </div>
          ))}
          <div className="grafico-columnas" style={{ height: ALTO }}>
            {datos.map((d) => (
              <div key={d.clave} className="grafico-celda" tabIndex={0}
                onMouseEnter={() => setActivo(d.clave)} onMouseLeave={() => setActivo(null)}
                onFocus={() => setActivo(d.clave)} onBlur={() => setActivo(null)}
                aria-label={`${d.etiquetaLarga ?? d.etiqueta}: ${formato(d.valor)}`}>
                {activo === d.clave ? (
                  <div className="grafico-tooltip" role="tooltip">{d.etiquetaLarga ?? d.etiqueta}: <strong>{formato(d.valor)}</strong></div>
                ) : d.clave === claveMax ? <span className="grafico-valor">{pesosCorto(d.valor)}</span> : null}
                <div className="grafico-columna" style={{ height: `${(d.valor / tope) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="grafico-ejex">
            {datos.map((d, i) => <span key={d.clave}>{i % cada === 0 ? d.etiqueta : ''}</span>)}
          </div>
        </div>
      )}
    </figure>
  );
}

// Barras horizontales por categoría: datos = [{ clave, etiqueta, valor, detalle }]. El ancho de cada
// barra es proporcional al mayor y deja lugar para el monto escrito en la punta.
// conTabla: false cuando la tarjeta ya muestra su propia tabla detallada.
export function GraficoBarras({ titulo, subtitulo, datos, columna = 'Categoría', formato = pesos, vacio = 'Sin datos en el período.', conTabla = true }) {
  const [activo, setActivo] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const max = Math.max(0, ...datos.map((d) => d.valor));

  return (
    <figure className="grafico">
      {conTabla
        ? <Encabezado titulo={titulo} subtitulo={subtitulo} verTabla={verTabla} alternar={() => setVerTabla((v) => !v)} />
        : <figcaption><span><strong>{titulo}</strong>{subtitulo ? <span className="suave pequeno bloque">{subtitulo}</span> : null}</span></figcaption>}
      {datos.length === 0 ? <p className="suave">{vacio}</p> : verTabla ? <Tabla datos={datos} columna={columna} formato={formato} /> : (
        <ul className="barras" aria-label={titulo}>
          {datos.map((d) => (
            <li key={d.clave} className="barras-fila" tabIndex={0}
              onMouseEnter={() => setActivo(d.clave)} onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(d.clave)} onBlur={() => setActivo(null)}
              aria-label={`${d.etiqueta}: ${formato(d.valor)}${d.detalle ? `, ${d.detalle}` : ''}`}>
              <span className="barras-nombre">{d.etiqueta}</span>
              <span className="barras-pista">
                <span className="barras-barra" style={{ width: max ? `calc((100% - 6.5rem) * ${d.valor / max})` : 0 }} />
                <span className="barras-valor">{formato(d.valor)}</span>
                {activo === d.clave && d.detalle ? <span className="grafico-tooltip barras-tooltip" role="tooltip">{d.detalle}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
