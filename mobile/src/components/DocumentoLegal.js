import { ScrollView, Text, View } from 'react-native';
import { FECHA_TERMINOS, VERSION_TERMINOS } from '../legal/textos';
import { crearEstilos, espacio } from '../theme';

// Muestra un documento legal (términos o privacidad) por secciones
export function DocumentoLegal({ titulo, secciones }) {
  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.version}>Versión {VERSION_TERMINOS} · {FECHA_TERMINOS}</Text>
      {secciones.map(([subtitulo, parrafos], i) => (
        <View key={subtitulo} style={estilos.seccion}>
          <Text style={estilos.subtitulo}>{i + 1}. {subtitulo}</Text>
          {parrafos.map((texto) => <Text key={texto} style={estilos.texto}>{texto}</Text>)}
        </View>
      ))}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.l, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 22, fontWeight: '800', color: colores.texto },
  version: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.xs, marginBottom: espacio.m },
  seccion: { marginBottom: espacio.m },
  subtitulo: { fontSize: 16, fontWeight: '700', color: colores.texto, marginBottom: espacio.xs },
  texto: { fontSize: 15, lineHeight: 22, color: colores.texto, marginBottom: espacio.s },
}));
