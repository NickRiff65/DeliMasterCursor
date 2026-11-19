import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatos, Cargando, Insignia } from '../componentes/comunes.jsx';
import { GraficoBarras, GraficoColumnas } from '../componentes/Graficos.jsx';
import { pesos, fechaHora, fechaDia, nombreMes, ESTADOS_PAGO } from '../formato.js';

const TONO_ESTADO = { retenido: 'neutro', liberado: 'info', transferido: 'ok', reembolsado: 'alerta' };
// Orden del recorrido del dinero: se cobra, se libera, se transfiere (o se devuelve)
const ORDEN_ESTADOS = ['retenido', 'liberado', 'transferido', 'reembolsado'];
const UNIDADES = { dia: 'por día', semana: 'por semana', mes: 'por mes' };
const corta = (f) => f.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');

// Lo cobrado en el período, agrupado por día (hasta un mes), por semana (hasta 4 meses) o por mes.
// Los días sin movimientos cuentan como $0, para que el eje del tiempo no salte.
export function serieEnElTiempo(porDia, rango) {
  const inicio = new Date(`${rango.desde}T00:00:00`);
  const fin = new Date(`${rango.hasta}T00:00:00`);
  const dias = Math.round((fin - inicio) / 86_400_000) + 1;
  const unidad = dias <= 31 ? 'dia' : dias <= 120 ? 'semana' : 'mes';
  const montos = new Map(porDia.map((d) => [d.dia, d.bruto]));
  const cubetas = new Map();
  for (const f = new Date(inicio); f <= fin; f.setDate(f.getDate() + 1)) {
    const dia = f.toLocaleDateString('sv-SE');
    let cubeta;
    if (unidad === 'dia') {
      cubeta = { clave: dia, etiqueta: String(f.getDate()), etiquetaLarga: corta(f) };
    } else if (unidad === 'semana') {
      const lunes = new Date(f);
      lunes.setDate(f.getDate() - ((f.getDay() + 6) % 7));
      cubeta = { clave: lunes.toLocaleDateString('sv-SE'), etiqueta: corta(lunes), etiquetaLarga: `Semana del ${corta(lunes)}` };
    } else {
      cubeta = { clave: dia.slice(0, 7), etiqueta: nombreMes(dia.slice(0, 7)), etiquetaLarga: f.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }) };
    }
    const actual = cubetas.get(cubeta.clave) ?? { ...cubeta, valor: 0 };
    actual.valor += montos.get(dia) ?? 0;
    cubetas.set(cubeta.clave, actual);
  }
  return { unidad, datos: [...cubetas.values()] };
}

function Cifra({ etiqueta, valor, nota }) {
  return (
    <div className="tarjeta cifra-tarjeta">
      <span className="cifra-etiqueta">{etiqueta}</span>
      <span className="cifra-valor">{valor}</span>
      {nota ? <span className="cifra-nota">{nota}</span> : null}
    </div>
  );
}

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
  const { rango, totales, movimientos, gastos, por_dia: porDia = [], por_categoria: porCategoria = [], gastos_total: gastosTotal } = datos;
  const suma = (campo) => totales.reduce((t, x) => t + x[campo], 0);
  const cantidadMovimientos = suma('cantidad');
  const serie = serieEnElTiempo(porDia, rango);
  const porEstado = [...totales]
    .sort((a, b) => ORDEN_ESTADOS.indexOf(a.estado) - ORDEN_ESTADOS.indexOf(b.estado))
    .map((t) => ({
      clave: t.estado, etiqueta: ESTADOS_PAGO[t.estado] ?? t.estado, valor: t.bruto,
      detalle: `${t.cantidad} movimiento${t.cantidad === 1 ? '' : 's'} · comisión ${pesos(t.comision)} · neto ${pesos(t.neto)}`,
    }));
  const comisionPorServicio = porCategoria.filter((c) => c.comision > 0).map((c) => ({
    clave: c.categoria, etiqueta: c.categoria, valor: c.comision,
    detalle: `${c.cantidad} pago${c.cantidad === 1 ? '' : 's'} · cobrado ${pesos(c.bruto)}`,
  }));

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

      {/* Las cifras del período de un vistazo */}
      <section className="cuadricula-4" aria-label="Cifras del período">
        <Cifra etiqueta="Cobrado a clientes" valor={pesos(suma('bruto'))}
          nota={`${cantidadMovimientos} pago${cantidadMovimientos === 1 ? '' : 's'}`} />
        <Cifra etiqueta="Comisión de DeliMaster" valor={pesos(suma('comision'))} />
        <Cifra etiqueta="Para los maestros" valor={pesos(suma('neto'))} nota="Lo cobrado menos la comisión y lo devuelto" />
        <Cifra etiqueta="Gastos de los maestros" valor={pesos(gastosTotal?.total ?? 0)}
          nota={gastosTotal ? `${gastosTotal.cantidad} gasto${gastosTotal.cantidad === 1 ? '' : 's'} registrado${gastosTotal.cantidad === 1 ? '' : 's'}` : null} />
      </section>

      <section className="dos-columnas">
        <div className="tarjeta">
          <GraficoColumnas titulo="Cobrado a clientes" subtitulo={UNIDADES[serie.unidad]} datos={serie.datos}
            columna={{ dia: 'Día', semana: 'Semana', mes: 'Mes' }[serie.unidad]} />
        </div>
        <div className="tarjeta">
          <GraficoBarras titulo="Comisión por servicio" subtitulo="Lo que ganó DeliMaster en cada tipo de trabajo"
            datos={comisionPorServicio} columna="Servicio" vacio="Sin comisiones en el período." />
        </div>
      </section>

      <section className="tarjeta">
        <h2>Totales por estado</h2>
        {totales.length === 0 ? <p className="suave">Sin totales en el período.</p> : (
          <>
          <GraficoBarras titulo="Dinero según su estado" subtitulo="Monto cobrado; pasa el mouse para ver comisión y neto"
            datos={porEstado} columna="Estado" conTabla={false} />
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
          </>
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
