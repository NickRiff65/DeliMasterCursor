import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { NOMBRE_APP } from '../lib/variante';
import { useTema } from '../context/tema';
import { colores, crearEstilos, espacio } from '../theme';

const CLAVE = 'delimaster.aviso-instalar';

// iPhone o iPad usando la versión web en el navegador, sin haberla instalado en la pantalla de inicio
export function debeSugerirInstalar({ os = Platform.OS, nav = globalThis.navigator, ventana = globalThis.window } = {}) {
  if (os !== 'web' || !nav || !ventana) return false;
  const esIos = /iPhone|iPad|iPod/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const instalada = nav.standalone === true || Boolean(ventana.matchMedia?.('(display-mode: standalone)').matches);
  return esIos && !instalada;
}

// En el iPhone no hay botón de "Instalar": se explica cómo agregarla a la pantalla de inicio
export function InstalarEnIphone() {
  useTema();   // está fuera de las pantallas: se suscribe al modo claro/oscuro por su cuenta
  const [visible, setVisible] = useState(() => {
    if (!debeSugerirInstalar()) return false;
    try { return localStorage.getItem(CLAVE) !== 'cerrado'; } catch { return true; }
  });
  if (!visible) return null;

  function cerrar() {
    try { localStorage.setItem(CLAVE, 'cerrado'); } catch { /* sin almacenamiento */ }
    setVisible(false);
  }

  return (
    <View style={estilos.caja}>
      <Text style={estilos.texto}>
        <Text style={estilos.negrita}>Instala {NOMBRE_APP} en tu iPhone: </Text>
        toca Compartir (el cuadrado con la flecha ↑) y elige «Agregar a pantalla de inicio».
      </Text>
      <Pressable onPress={cerrar} accessibilityRole="button" accessibilityLabel="Cerrar aviso" hitSlop={12}>
        <Text style={estilos.cerrar}>✕</Text>
      </Pressable>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  caja: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.s,
    backgroundColor: colores.primarioSuave, paddingHorizontal: espacio.m, paddingVertical: espacio.s,
  },
  texto: { flex: 1, fontSize: 14, lineHeight: 20, color: colores.primarioOscuro },
  negrita: { fontWeight: '700' },
  cerrar: { fontSize: 18, color: colores.primarioOscuro, paddingHorizontal: espacio.xs },
}));
