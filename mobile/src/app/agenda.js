import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { Aviso } from '../components/Aviso';
import { EstadoSolicitud } from '../components/EstadoSolicitud';
import { diaYHora, pesos } from '../lib/formato';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// CU-16 (Pro): la agenda del maestro con sus próximas visitas programadas, ordenadas por fecha.
// Al tocar una visita se abre el detalle del trabajo.
export default function Agenda() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [visitas, setVisitas] = useState(null);
  const [error, setError] = useState(null);

  // Se recarga cada vez que se vuelve a esta pantalla
  useFocusEffect(useCallback(() => {
    api.get('/prestadores/yo/agenda')
      .then((r) => setVisitas(r.agenda))
      .catch((e) => setError(e.message));
  }, []));

  if (!visitas) {
    return (
      <View style={estilos.contenido}>
        {error ? <Aviso mensaje={error} /> : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Aviso mensaje={error} />
      {visitas.length ? visitas.map((v) => (
        <Pressable key={v.id} style={estilos.tarjeta} onPress={() => router.push(`/trabajo/${v.id}`)} accessibilityRole="button">
          <View style={estilos.fila}>
            <Text style={estilos.fecha}>🗓️ {diaYHora(v.visita_programada_en)}</Text>
            <EstadoSolicitud estado={v.estado} vista="prestador" />
          </View>
          <Text style={estilos.cliente}>{v.cliente}</Text>
          <Text style={estilos.suave}>{v.categoria} · 📍 {v.comuna}</Text>
          {v.descripcion ? <Text style={estilos.texto}>“{v.descripcion}”</Text> : null}
          <Text style={estilos.tarifa}>Visita: {pesos(v.tarifa_visita)}</Text>
        </Pressable>
      )) : (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>No tienes visitas programadas por ahora</Text>
          <Text style={estilos.vacioTexto}>Cuando aceptes un trabajo con visita, aparecerá aquí.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s, marginBottom: espacio.xs },
  fecha: { fontSize: 15, fontWeight: '800', color: colores.texto },
  cliente: { fontSize: 16, fontWeight: '700', color: colores.texto },
  texto: { fontSize: 15, color: colores.texto, marginTop: espacio.xs, fontStyle: 'italic' },
  suave: { fontSize: 14, color: colores.textoSuave, marginTop: espacio.xs },
  tarifa: { fontSize: 14, fontWeight: '700', color: colores.texto, marginTop: espacio.s },
  vacio: { alignItems: 'center', padding: espacio.xl },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.texto, textAlign: 'center' },
  vacioTexto: { fontSize: 15, color: colores.textoSuave, marginTop: espacio.xs, textAlign: 'center' },
}));
