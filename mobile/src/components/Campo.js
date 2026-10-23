import { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Campo de formulario con etiqueta y mensaje de error (los errores vienen por campo desde la API).
export function Campo({ etiqueta, error, ayuda, onFocus, onBlur, ...props }) {
  const { esOscuro } = useTema();
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput
        placeholderTextColor={colores.textoSuave}
        style={[estilos.input, enfocado && estilos.inputEnfocado, error && estilos.inputError]}
        accessibilityLabel={etiqueta}
        keyboardAppearance={esOscuro ? 'dark' : 'light'}
        onFocus={(e) => { setEnfocado(true); onFocus?.(e); }}
        onBlur={(e) => { setEnfocado(false); onBlur?.(e); }}
        {...props}
      />
      {error ? <Text style={estilos.error}>{error}</Text> : ayuda ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { marginBottom: espacio.m },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto, marginBottom: espacio.xs },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colores.borde,
    borderRadius: radio.s + 4,
    paddingHorizontal: espacio.m,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.campoFondo,
    // El realce al escribir lo da el borde y el resplandor, no el contorno del navegador
    outlineWidth: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  inputEnfocado: { borderColor: colores.primario, boxShadow: `0px 0px 0px 4px ${colores.primarioSuave}` },
  inputError: { borderColor: colores.error },
  error: { color: colores.error, fontSize: 13, marginTop: espacio.xs },
  ayuda: { color: colores.textoSuave, fontSize: 13, marginTop: espacio.xs },
}));
