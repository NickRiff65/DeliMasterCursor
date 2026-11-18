import { Text, View } from 'react-native';
import { colores, crearEstilos, espacio } from '../theme';

// Las cinco etapas que recorre una solicitud, en lenguaje del cliente.
// Cada estado de la máquina de estados (solicitudes) cae en una de ellas; las cancelaciones no muestran progreso.
const PASOS = ['Pedida', 'Maestro', 'Pago', 'Trabajo', 'Cerrada'];
const ETAPA = {
  creada: 0,
  asignada: 1,
  visita_por_pagar: 1,
  visita_pagada: 2,
  en_diagnostico: 2,
  cotizada: 2,
  confirmada: 2,
  pagada: 2,
  finalizada: 3,
  en_disputa: 3,
  cerrada: 4,
};

// Barra de progreso de una solicitud: muestra en qué etapa va y cuánto falta.
export function ProgresoSolicitud({ estado }) {
  const actual = ETAPA[estado];
  if (actual === undefined) return null;
  return (
    <View style={estilos.contenedor} accessibilityRole="progressbar"
      accessibilityLabel={`Paso ${actual + 1} de ${PASOS.length}: ${PASOS[actual]}`}
      accessibilityValue={{ min: 1, max: PASOS.length, now: actual + 1 }}>
      <View style={estilos.barras}>
        {PASOS.map((_, i) => (
          <View key={i} style={[estilos.barra, i <= actual ? estilos.llena : estilos.vacia]} />
        ))}
      </View>
      <View style={estilos.etiquetas}>
        {PASOS.map((nombre, i) => (
          <Text key={nombre} style={[estilos.etiqueta, i === actual && estilos.etiquetaActual]} numberOfLines={1}>
            {nombre}
          </Text>
        ))}
      </View>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { marginTop: espacio.s, gap: 6 },
  barras: { flexDirection: 'row', gap: 4 },
  barra: { flex: 1, height: 6, borderRadius: 3 },
  llena: { backgroundColor: colores.primario },
  vacia: { backgroundColor: colores.borde },
  etiquetas: { flexDirection: 'row', justifyContent: 'space-between' },
  etiqueta: { flex: 1, fontSize: 12, color: colores.textoSuave, fontWeight: '600', textAlign: 'center' },
  etiquetaActual: { color: colores.primarioOscuro, fontWeight: '800' },
}));
