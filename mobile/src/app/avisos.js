import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAvisos } from '../context/avisos';
import { ES_PRO } from '../lib/variante';
import { fechaCorta } from '../lib/formato';
import { Aviso } from '../components/Aviso';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Avisos de la persona (ambas apps): solicitudes, pagos, liberaciones y transferencias.
// Al abrir la lista quedan como leídos (los nuevos se destacan esta vez).
export default function Avisos() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { marcarLeidas } = useAvisos();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);

  useFocusEffect(useCallback(() => {
    marcarLeidas().then((r) => setLista(r.notificaciones)).catch((e) => setError(e.message));
  }, [marcarLeidas]));

  if (!lista) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  // Se destacan los que estaban sin leer hasta recién (leídos hace menos de un minuto)
  const recien = (n) => n.leida_en && Date.now() - new Date(n.leida_en).getTime() < 60_000;
  return (
    <FlatList
      data={lista}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={estilos.contenido}
      ListEmptyComponent={<Text style={estilos.vacio}>Aún no tienes avisos. Aquí te contaremos cómo avanzan tus trabajos y tus pagos.</Text>}
      renderItem={({ item: n }) => (
        <Pressable accessibilityRole="button" disabled={!n.solicitud_id}
          onPress={() => router.push(ES_PRO ? `/trabajo/${n.solicitud_id}` : `/solicitud/${n.solicitud_id}`)}
          style={[estilos.tarjeta, recien(n) && estilos.nuevo, n.tipo === 'pago' && estilos.pago]}>
          <Text style={estilos.titulo}>{n.titulo}</Text>
          <Text style={estilos.texto}>{n.texto}</Text>
          <Text style={estilos.fecha}>{fechaCorta(n.creado_en)}</Text>
        </Pressable>
      )}
    />
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, gap: espacio.s, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, borderRadius: radio.m, padding: espacio.m, borderWidth: 1,
    borderColor: colores.bordeTarjeta, boxShadow: colores.sombra,
  },
  nuevo: { borderColor: colores.primario },
  pago: { borderLeftWidth: 4, borderLeftColor: colores.exitoTexto },
  titulo: { fontSize: 15, fontWeight: '800', color: colores.texto },
  texto: { fontSize: 14, color: colores.texto, marginTop: 4, lineHeight: 20 },
  fecha: { fontSize: 12, color: colores.textoSuave, marginTop: espacio.xs },
  vacio: { textAlign: 'center', color: colores.textoSuave, marginTop: espacio.xl, lineHeight: 20 },
}));
