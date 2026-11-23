import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { Aviso } from '../components/Aviso';
import { BotonAvisos } from '../components/BotonAvisos';
import { BotonCuenta } from '../components/BotonCuenta';
import { Estrellas } from '../components/Estrellas';
import { colores, crearEstilos, espacio, letra, radio } from '../theme';
import { useTema } from '../context/tema';

// DeliMaster Pro · Perfil: lo que el maestro configura una vez y consulta de vez en cuando.
// Ya no ocupa la portada: se entra desde la barra inferior.
// Íconos de línea (PNG con fondo transparente) que se pintan del color del tema
const OPCIONES = [
  {
    ruta: '/ficha', icono: require('../../assets/iconos/perfil/ficha.png'), titulo: 'Mi ficha',
    detalle: (f) => `${f.categorias.length} ${f.categorias.length === 1 ? 'servicio' : 'servicios'} · ${f.comunas_atendidas.join(', ') || 'sin comunas'}`,
  },
  {
    ruta: '/portafolio', icono: require('../../assets/iconos/perfil/portafolio.png'), titulo: 'Mi portafolio',
    detalle: () => 'Fotos de tus trabajos anteriores',
  },
  {
    ruta: '/verificaciones', icono: require('../../assets/iconos/perfil/verificaciones.png'), titulo: 'Mis verificaciones',
    detalle: () => 'Certificados de la SEC y del SAG',
  },
  {
    ruta: '/cuenta', icono: require('../../assets/iconos/perfil/cuenta.png'), titulo: 'Mi cuenta',
    detalle: () => 'Datos, contraseña y apariencia',
  },
];

export default function Perfil() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState(null);

  // Se recarga al volver a la sección, por ejemplo después de editar la ficha
  useFocusEffect(useCallback(() => {
    api.get('/prestadores/yo').then((r) => setFicha(r.ficha)).catch((e) => setError(e.message));
  }, []));

  const cabecera = (
    <Stack.Screen
      options={{
        headerRight: () => <View style={{ flexDirection: 'row', alignItems: 'center' }}><BotonAvisos /><BotonCuenta /></View>,
      }}
    />
  );

  if (!ficha) {
    return (
      <View style={estilos.contenido}>
        {cabecera}
        {error ? <Aviso mensaje={error} /> : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      {cabecera}
      <Aviso mensaje={error} />

      {/* Reputación: solo los trabajos cerrados en DeliMaster suman reseñas. Al tocarla, se ven todas */}
      <Pressable style={estilos.tarjeta} onPress={() => router.push('/resenas')}
        accessibilityRole="button" accessibilityLabel="Mi reputación: ver mis reseñas">
        <Text style={estilos.etiqueta}>MI REPUTACIÓN</Text>
        <View style={estilos.fila}>
          <Estrellas promedio={ficha.calificacion_promedio} total={ficha.total_resenas} tamano={18} />
          <Text style={estilos.suave}>{ficha.trabajos_cerrados} trabajos cerrados</Text>
        </View>
        <Text style={[estilos.suave, { marginTop: espacio.s }]}>
          Solo los trabajos cerrados en DeliMaster suman reseñas y te suben en el catálogo.
        </Text>
        <Text style={estilos.verResenas}>Ver mis reseñas ›</Text>
      </Pressable>

      {OPCIONES.map((o) => (
        <Pressable key={o.ruta} style={[estilos.tarjeta, estilos.fila]} onPress={() => router.push(o.ruta)}
          accessibilityRole="button" accessibilityLabel={o.titulo}>
          <Image source={o.icono} tintColor={colores.texto} accessibilityIgnoresInvertColors style={estilos.icono} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.tarjetaTitulo}>{o.titulo}</Text>
            <Text style={estilos.suave}>{o.detalle(ficha)}</Text>
          </View>
          <Text style={estilos.flecha}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s },
  icono: { width: letra(28), height: letra(28) },
  tarjetaTitulo: { fontSize: 16, fontWeight: '800', color: colores.texto },
  suave: { fontSize: 14, color: colores.textoSuave },
  etiqueta: { fontSize: 12, fontWeight: '800', color: colores.textoSuave, letterSpacing: 1, marginBottom: espacio.xs },
  flecha: { fontSize: 24, color: colores.textoSuave },
  verResenas: { fontSize: 15, fontWeight: '700', color: colores.primario, marginTop: espacio.s },
}));
