import { Text, View } from 'react-native';
import { Chip } from './Chip';
import { colores, crearEstilos, espacio } from '../theme';

// DeliMaster atiende en Chillán y Coihueco: la comuna se elige con un toque.
//  · permitirTodas: agrega "Todas" (valor null), para filtrar el catálogo
//  · opcional: tocar la comuna elegida la desmarca (registro y perfil)
export const COMUNAS_ATENDIDAS = ['Chillán', 'Coihueco'];

export function SelectorComuna({ comunas, valor, onCambio, permitirTodas = false, opcional = false, etiqueta, error }) {
  const lista = comunas?.length ? comunas : COMUNAS_ATENDIDAS;
  return (
    <View style={estilos.contenedor}>
      {etiqueta ? <Text style={estilos.etiqueta}>{etiqueta}</Text> : null}
      <View style={estilos.fila} accessibilityRole="radiogroup" accessibilityLabel="Comuna">
        {permitirTodas ? <Chip texto="Todas" activo={!valor} onPress={() => onCambio(null)} /> : null}
        {lista.map((c) => (
          <Chip key={c} texto={`📍 ${c}`} activo={valor === c} onPress={() => onCambio(opcional && valor === c ? null : c)} />
        ))}
      </View>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { marginBottom: espacio.s },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto, marginBottom: espacio.xs },
  // Margen para que la sombra de los botones no se corte
  fila: { flexDirection: 'row', flexWrap: 'wrap', rowGap: espacio.s, paddingVertical: 4 },
  error: { color: colores.error, fontSize: 13, marginTop: espacio.xs },
}));
