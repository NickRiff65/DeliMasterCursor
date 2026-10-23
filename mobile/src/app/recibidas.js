import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { fechaCorta, pesos } from '../lib/formato';
import { Aviso } from '../components/Aviso';
import { EstadoSolicitud } from '../components/EstadoSolicitud';
import { CuentaRegresiva } from '../components/CuentaRegresiva';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Pro: solicitudes que los clientes asignaron a este prestador (HU-05)
export default function Recibidas() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [recargando, setRecargando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista((await api.get('/solicitudes')).solicitudes);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  // Respaldo del aviso push: si el teléfono no tiene el permiso, igual aparece al tener esta pantalla abierta
  useEffect(() => {
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, [cargar]);

  const porResponder = (lista ?? []).filter((s) => s.estado === 'asignada');
  const resto = (lista ?? []).filter((s) => s.estado !== 'asignada');

  const tarjeta = (s) => (
    <Pressable key={s.id} style={[estilos.tarjeta, s.estado === 'asignada' && estilos.urgente]}
      onPress={() => router.push(`/trabajo/${s.id}`)} accessibilityRole="button">
      <View style={estilos.fila}>
        <Text style={estilos.categoria}>{s.categoria_nombre}</Text>
        <EstadoSolicitud estado={s.estado} vista="prestador" />
      </View>
      <Text style={estilos.descripcion} numberOfLines={2}>“{s.descripcion}”</Text>
      <Text style={estilos.suave}>
        {s.cliente.nombre} · 📍 {s.comuna} · {fechaCorta(s.creado_en)}
        {s.precio_acordado ? ` · ${pesos(s.precio_acordado)}` : ''}
      </Text>
      {s.estado === 'asignada' ? (
        <Text style={estilos.plazo}>Responde en <CuentaRegresiva hasta={s.responder_antes_de} alVencer={cargar} /></Text>
      ) : null}
    </Pressable>
  );

  return (
    <FlatList
      data={resto}
      keyExtractor={(s) => s.id}
      contentContainerStyle={estilos.contenido}
      refreshing={recargando}
      onRefresh={async () => { setRecargando(true); await cargar(); setRecargando(false); }}
      ListHeaderComponent={
        <View>
          <Aviso mensaje={error} />
          <Text style={estilos.subtitulo}>Por responder ({porResponder.length})</Text>
          {porResponder.length ? porResponder.map(tarjeta) : (
            <Text style={[estilos.suave, { marginBottom: espacio.m }]}>No tienes solicitudes pendientes.</Text>
          )}
          {resto.length ? <Text style={estilos.subtitulo}>Mis trabajos</Text> : null}
        </View>
      }
      renderItem={({ item }) => tarjeta(item)}
    />
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, maxWidth: 720, width: '100%', alignSelf: 'center' },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colores.texto, marginVertical: espacio.s },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  urgente: { borderColor: colores.acento, borderWidth: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s },
  categoria: { fontSize: 16, fontWeight: '700', color: colores.texto, flex: 1 },
  descripcion: { fontSize: 15, color: colores.texto, marginVertical: espacio.xs, fontStyle: 'italic' },
  suave: { fontSize: 13, color: colores.textoSuave },
  plazo: { fontSize: 14, color: colores.texto, marginTop: espacio.s },
}));
