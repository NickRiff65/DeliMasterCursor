import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatos, Cargando, Vacio, Insignia, Pestanas } from '../componentes/comunes.jsx';
import { pesos, fecha, fechaHora } from '../formato.js';

// HU-16: reclamos de clientes antes del cierre; el dinero sigue retenido hasta resolver
export default function Disputas() {
  const [estado, setEstado] = useState('abiertas');
  const { datos, error } = useDatos(`/admin/disputas?estado=${estado}`);

  return (
    <>
      <header className="cabecera">
        <h1>Disputas</h1>
        <p className="suave">Revisa la evidencia y decide: liberar el pago al prestador o reembolsar al cliente.</p>
      </header>
      <Pestanas valor={estado} onCambio={setEstado} opciones={[['abiertas', 'Abiertas'], ['resueltas', 'Resueltas']]} />
      {!datos ? <Cargando error={error} /> : datos.disputas.length === 0 ? (
        <Vacio titulo={estado === 'abiertas' ? 'No hay disputas abiertas' : 'Aún no se ha resuelto ninguna disputa'} />
      ) : (
        <div className="lista">
          {datos.disputas.map((d) => (
            <Link key={d.id + (d.resuelta_en ?? '')} to={`/solicitudes/${d.id}`} className="tarjeta enlace-tarjeta">
              <div className="fila-titulo">
                <h2>{d.categoria} · {pesos(d.precio_acordado)}</h2>
                {estado === 'abiertas'
                  ? <Insignia tono="alerta">Abierta desde el {fecha(d.abierta_en)}</Insignia>
                  : d.resultado === 'cerrada'
                    ? <Insignia tono="ok">Pago liberado al prestador</Insignia>
                    : <Insignia tono="info">Reembolsado al cliente</Insignia>}
              </div>
              <p className="cita">«{d.motivo_disputa}»</p>
              <p className="suave pequeno">
                Cliente: {d.cliente} · Prestador: {d.prestador}
                {estado === 'abiertas'
                  ? ` · ${d.mensajes} mensajes en el chat`
                  : ` · Resuelta el ${fechaHora(d.resuelta_en)} por ${d.resuelta_por ?? '—'}`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
