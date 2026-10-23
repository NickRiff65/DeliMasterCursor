import { Text, View } from 'react-native';
import { colores, crearEstilos } from '../theme';

// Etiqueta de color según el estado de una verificación (HU-11, HU-17)
// fondo y color son nombres de la paleta (theme.js), así sirven en modo claro y oscuro
const ESTADOS = {
  aprobada: { texto: '✓ Verificado', fondo: 'exitoSuave', color: 'verificado' },
  pendiente: { texto: '⏳ En revisión', fondo: 'avisoInsignia', color: 'avisoTexto' },
  rechazada: { texto: '✕ Rechazada', fondo: 'errorSuave', color: 'errorTexto' },
  vencida: { texto: '⚠ Vencida', fondo: 'errorSuave', color: 'errorTexto' },
  sin_solicitar: { texto: 'Sin verificar', fondo: 'neutroFondo', color: 'neutroTexto' },
};

export function EstadoVerificacion({ estado }) {
  const e = ESTADOS[estado ?? 'sin_solicitar'] ?? ESTADOS.sin_solicitar;
  return (
    <View style={[estilos.etiqueta, { backgroundColor: colores[e.fondo] }]}>
      <View style={[estilos.punto, { backgroundColor: colores[e.color] }]} />
      <Text style={[estilos.texto, { color: colores[e.color] }]}>{e.texto}</Text>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  etiqueta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  punto: { width: 7, height: 7, borderRadius: 4 },
  texto: { fontSize: 12, fontWeight: '700' },
}));
