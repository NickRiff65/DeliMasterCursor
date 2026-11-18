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
  const cerradas = ['cerrada', 'cancelada'];
  const enCurso = (lista ?? []).filter((s) => s.estado !== 'asignada' && !cerradas.includes(s.estado));
  const historial = (lista ?? []).filter((s) => cerradas.includes(s.estado));
  // Lo que sigue en marcha va primero; el historial queda debajo con su propio encabezado
  const filas = [
    ...(enCurso.length ? [{ clave: 'titulo-curso', titulo: `En curso (${enCurso.length})` }] : []),
    ...enCurso.map((s) => ({ clave: s.id, solicitud: s })),
    ...(historial.length ? [{ clave: 'titulo-historial', titulo: `Historial (${historial.length})` }] : []),
    ...historial.map((s) => ({ clave: s.id, solicitud: s })),
  ];

  const tarjeta = (s) => (
    <Pressable key={s.id} style={[estilos.tarjeta, s.estado === 'asignada' && estilos.urgente]}
      onPress={() => router.push(`/trabajo/${s.id}`)} accessibilityRole="button">
      <View style={estilos.fila}>
        <Text style={estilos.categoria}>{s.categoria_nombre}</Text>
        <EstadoSolicitud estado={s.estado} vista="prestador" />
      </View>
      <Text style={estilos.descripcion} numberOfLines={2}>“{s.descripcion}”</Text>
      <View style={[estilos.fila, { marginTop: espacio.xs }]}>
        <Text style={[estilos.suave, { flex: 1 }]} numberOfLines={1}>
          {s.cliente.nombre} · 📍 {s.comuna} · {fechaCorta(s.creado_en)}
        </Text>
        {s.precio_acordado ? <Text style={estilos.precio}>{pesos(s.precio_acordado)}</Text> : null}
      </View>
      {s.estado === 'asignada' ? (
        <Text style={estilos.plazo}>Responde en <CuentaRegresiva hasta={s.responder_antes_de} alVencer={cargar} /></Text>
      ) : null}
    </Pressable>
  );

  return (
    <FlatList
      data={filas}
      keyExtractor={(f) => f.clave}
      contentContainerStyle={estilos.contenido}
      refreshing={recargando}
      onRefresh={async () => { setRecargando(true); await cargar(); setRecargando(false); }}
      ListHeaderComponent={
        <View>
          <Aviso mensaje={error} />
          {/* La agenda de visitas se movió aquí desde el inicio */}
          <Pressable onPress={() => router.push('/agenda')} accessibilityRole="button"
            style={[estilos.tarjeta, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s }]}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.subtitulo}>📅 Mi agenda</Text>
              <Text style={estilos.suave}>Tus próximas visitas programadas, en orden de fecha.</Text>
            </View>
            <Text style={{ color: colores.primario, fontWeight: '700', fontSize: 15 }}>Ver →</Text>
          </Pressable>
          <Text style={estilos.subtitulo}>Por responder ({porResponder.length})</Text>
          {porResponder.length ? porResponder.map(tarjeta) : (
            <Text style={[estilos.suave, { marginBottom: espacio.m }]}>No tienes solicitudes pendientes.</Text>
          )}
        </View>
      }
      renderItem={({ item }) => (item.titulo ? <Text style={estilos.subtitulo}>{item.titulo}</Text> : tarjeta(item.solicitud))}
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
  precio: { fontSize: 16, fontWeight: '800', color: colores.primarioOscuro },
  plazo: { fontSize: 14, color: colores.texto, marginTop: espacio.s },
}));
