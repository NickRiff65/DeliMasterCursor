import { Text, View } from 'react-native';
import { Boton } from './Boton';
import { CAMARA_DIRECTA } from '../lib/fotos';
import { colores, crearEstilos, espacio } from '../theme';

const SUBIR_FOTO = require('../../assets/iconos/app/subir-foto.png');
const CAMARA = require('../../assets/iconos/app/camara.png');

// Botones para agregar una foto: cámara o galería en el celular; en la web, un solo botón que abre
// el selector de archivos (en el iPhone ofrece la cámara y las fotos).
// La cámara lleva el ícono de la cámara; la galería y "Subir una foto", el de subir foto.
export function BotonesFoto({ onElegir, camara = 'Cámara', galeria = 'Galería', web = 'Subir una foto', variante = 'secundario', nota }) {
  return (
    <View style={estilos.contenedor}>
      {CAMARA_DIRECTA ? (
        <View style={estilos.fila}>
          <View style={{ flex: 1 }}><Boton titulo={camara} icono={CAMARA} variante={variante} onPress={() => onElegir(true)} /></View>
          <View style={{ flex: 1 }}>
            <Boton titulo={galeria} icono={SUBIR_FOTO} variante="secundario" onPress={() => onElegir(false)} />
          </View>
        </View>
      ) : <Boton titulo={web} icono={SUBIR_FOTO} variante={variante} onPress={() => onElegir(false)} />}
      {nota ? <Text style={estilos.nota}>{nota}</Text> : null}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { gap: espacio.s, marginTop: espacio.s },
  fila: { flexDirection: 'row', gap: espacio.s, flexWrap: 'wrap' },
  nota: { fontSize: 13, color: colores.textoSuave },
}));
