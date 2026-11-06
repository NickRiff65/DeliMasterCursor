import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useDatos, Cargando, Insignia, Aviso } from '../componentes/comunes.jsx';
import { GraficoMensual } from '../componentes/GraficoMensual.jsx';
import { pesos } from '../formato.js';

// Clientes que pagaron una solicitud que ya no corresponde y a los que Transbank aún no les devuelve el dinero
function DevolucionesFallidas({ lista, alCambiar }) {
  const [error, setError] = useState(null);

  async function marcar(id) {
    if (!window.confirm('¿Ya devolviste este pago desde el portal de Transbank?')) return;
    setError(null);
    try {
      await api.post(`/admin/pagos/${id}/devolucion-manual`);
      alCambiar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="tarjeta">
      <h2>Devoluciones con problemas</h2>
      <p className="suave">
        Estos clientes pagaron una solicitud que ya no estaba vigente y Transbank no pudo devolverles el dinero.
        El sistema reintenta cada 15 minutos; si sigue fallando, devuélvelo desde el portal de Transbank.
      </p>
      <Aviso mensaje={error} />
      <div className="lista">
        {lista.map((d) => (
          <div key={d.id} className="fila-titulo">
            <span>
              <Link to={`/solicitudes/${d.solicitud_id}`}>{d.cliente}</Link> · {pesos(d.monto)} · orden <span className="mono">{d.orden_compra}</span>
              {' '}· {d.intentos} intento{d.intentos === 1 ? '' : 's'}
              {d.error ? <span className="suave pequeno"> · {d.error}</span> : null}
            </span>
            <button className="boton secundario" onClick={() => marcar(d.id)}>Ya lo devolví</button>
          </div>
        ))}
      </div>
    </section>
  );
}

// HU-14: métricas de la plataforma y pendientes del equipo
export default function Resumen() {
  const { datos, error, recargar } = useDatos('/admin/resumen');
  if (!datos) return <Cargando error={error} />;
  const { pendientes: p, dinero, indicadores, usuarios, cerrados_por_mes, devoluciones_fallidas: devoluciones = [] } = datos;

  const tareas = [
    ['/verificaciones', p.verificaciones, 'verificaciones por revisar',
      p.verificaciones_por_vencer ? `${p.verificaciones_por_vencer} certificado(s) SEC por vencer` : null],
    ['/disputas', p.disputas, 'disputas abiertas', p.disputas ? 'El dinero sigue retenido hasta resolver' : null],
    ['/liquidaciones', p.prestadores_por_pagar, 'prestadores por pagar',
      p.transferencias_atrasadas ? `${p.transferencias_atrasadas} pago(s) fuera del plazo de 48 h` : null],
    ['/moderacion', p.usuarios_por_revisar, 'usuarios por revisar', null],
  ];

  return (
    <>
      <header className="cabecera">
        <h1>Resumen</h1>
        <p className="suave">{usuarios.clientes} clientes y {usuarios.prestadores} prestadores registrados.</p>
      </header>

      {devoluciones.length ? <DevolucionesFallidas lista={devoluciones} alCambiar={recargar} /> : null}

      <section className="cuadricula-4">
        {tareas.map(([ruta, n, texto, nota]) => (
          <Link key={ruta} to={ruta} className={`tarjeta tarea ${n ? 'con-pendientes' : ''}`}>
            <span className="cifra">{n}</span>
            <span>{texto}</span>
            {nota ? <span className="nota">{nota}</span> : null}
          </Link>
        ))}
      </section>

      <section className="dos-columnas">
        <div className="tarjeta">
          <h2>Dinero en la plataforma</h2>
          <dl className="montos">
            <div><dt>Retenido en garantía</dt><dd>{pesos(dinero.retenido)}</dd></div>
            <div><dt>Liberado, por transferir</dt><dd>{pesos(dinero.por_transferir)}</dd></div>
            <div><dt>Transferido a prestadores</dt><dd>{pesos(dinero.transferido)}</dd></div>
            <div><dt>Reembolsado a clientes</dt><dd>{pesos(dinero.reembolsado)}</dd></div>
            <div className="destacado"><dt>Comisiones de DeliMaster</dt><dd>{pesos(dinero.comisiones)}</dd></div>
          </dl>
        </div>
        <div className="tarjeta">
          <GraficoMensual datos={cerrados_por_mes} />
        </div>
      </section>

      <section className="tarjeta">
        <h2>Indicadores del proyecto</h2>
        <table className="tabla">
          <thead>
            <tr><th>Indicador</th><th className="num">Valor</th><th>Meta</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {indicadores.map((k) => (
              <tr key={k.id}>
                <td>{k.nombre}<span className="suave pequeno bloque">{k.formula}</span></td>
                <td className="num">{k.valor === null ? '—' : `${k.valor.toLocaleString('es-CL')}%`}</td>
                <td>{k.meta}</td>
                <td>
                  {k.cumple === null
                    ? <Insignia tono="neutro">{k.valor === null ? 'Sin datos aún' : 'Seguimiento'}</Insignia>
                    : k.cumple ? <Insignia tono="ok">Cumple</Insignia> : <Insignia tono="alerta">Bajo la meta</Insignia>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
