import { Text, View } from 'react-native';
import { pesos } from '../lib/formato';
import { crearEstilos, espacio } from '../theme';

// Desglose de una cotización. Desde noviembre de 2026 la cotización es solo el trabajo (mano de obra
// + materiales): el cliente la paga completa y la visita va aparte, sin descontarse. Al maestro se le
// transfieren ambas. Las cotizaciones antiguas (incluye_visita) traían la visita y se pagaba el saldo.
// vista: 'cliente' (lo que paga) o 'maestro' (lo que recibirá)
export function ResumenCotizacion({ cotizacion, tarifaVisita, vista = 'cliente' }) {
  if (cotizacion.incluye_visita) {
    return (
      <View style={estilos.caja}>
        <Fila nombre="Mano de obra" valor={pesos(cotizacion.mano_obra)} />
        {cotizacion.materiales ? <Fila nombre="Materiales" valor={pesos(cotizacion.materiales)} /> : null}
        <Fila nombre="Total del trabajo" valor={pesos(cotizacion.total)} fuerte />
        <Fila nombre="Visita ya pagada" valor={`−${pesos(tarifaVisita)}`} />
        <View style={estilos.separador} />
        <Fila nombre="Saldo por pagar" valor={pesos(cotizacion.total - tarifaVisita)} destacado />
        {cotizacion.detalle ? <Text style={estilos.detalle}>“{cotizacion.detalle}”</Text> : null}
      </View>
    );
  }
  return (
    <View style={estilos.caja}>
      <Fila nombre="Mano de obra" valor={pesos(cotizacion.mano_obra)} />
      {cotizacion.materiales ? <Fila nombre="Materiales" valor={pesos(cotizacion.materiales)} /> : null}
      <View style={estilos.separador} />
      <Fila nombre={vista === 'maestro' ? 'Cotización del trabajo' : 'Por pagar'} valor={pesos(cotizacion.total)} destacado />
      <Text style={estilos.nota}>
        {vista === 'maestro'
          ? `Aparte, la visita (${pesos(tarifaVisita)}) ya es tuya: al cierre te transferimos ambas (${pesos(cotizacion.total + tarifaVisita)}), menos la comisión.`
          : `La visita (${pesos(tarifaVisita)}) ya está pagada aparte y no se descuenta de este monto.`}
      </Text>
      {cotizacion.detalle ? <Text style={estilos.detalle}>“{cotizacion.detalle}”</Text> : null}
    </View>
  );
}

function Fila({ nombre, valor, fuerte, destacado }) {
  return (
    <View style={estilos.fila}>
      <Text style={[estilos.nombre, (fuerte || destacado) && estilos.fuerte]}>{nombre}</Text>
      <Text style={[estilos.valor, fuerte && estilos.fuerte, destacado && estilos.destacado]}>{valor}</Text>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  caja: { gap: 6, marginVertical: espacio.s },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: espacio.s },
  nombre: { fontSize: 15, color: colores.textoSuave },
  valor: { fontSize: 15, color: colores.texto, fontVariant: ['tabular-nums'] },
  fuerte: { color: colores.texto, fontWeight: '700' },
  destacado: { color: colores.primarioOscuro, fontWeight: '900', fontSize: 20 },
  separador: { height: 1, backgroundColor: colores.borde, marginVertical: 2 },
  nota: { fontSize: 13, color: colores.textoSuave, lineHeight: 19 },
  detalle: { fontSize: 14, color: colores.texto, fontStyle: 'italic', marginTop: espacio.xs, lineHeight: 20 },
}));
