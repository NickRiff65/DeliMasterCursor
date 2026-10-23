import { Text, View } from 'react-native';
import { Boton } from './Boton';
import { CAMARA_DIRECTA } from '../lib/fotos';
import { colores, crearEstilos, espacio } from '../theme';

// Botones para agregar una foto: cámara o galería en el celular; en la web, un solo botón que abre
// el selector de archivos (en el iPhone ofrece la cámara y las fotos)
export function BotonesFoto({ onElegir, camara = '📷 Cámara', galeria = '🖼️ Galería', web = '📷 Subir una foto', variante = 'secundario', nota }) {
  return (
    <View style={estilos.contenedor}>
      {CAMARA_DIRECTA ? (
        <View style={estilos.fila}>
          <View style={{ flex: 1 }}><Boton titulo={camara} variante={variante} onPress={() => onElegir(true)} /></View>
          <View style={{ flex: 1 }}><Boton titulo={galeria} variante="secundario" onPress={() => onElegir(false)} /></View>
        </View>
      ) : <Boton titulo={web} variante={variante} onPress={() => onElegir(false)} />}
      {nota ? <Text style={estilos.nota}>{nota}</Text> : null}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { gap: espacio.s, marginTop: espacio.s },
  fila: { flexDirection: 'row', gap: espacio.s, flexWrap: 'wrap' },
  nota: { fontSize: 13, color: colores.textoSuave },
}));
