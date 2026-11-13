import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fechaCorta, pesos } from '../lib/formato';
import { EstadoSolicitud } from './EstadoSolicitud';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Lite: una solicitud del cliente en la lista de inicio
export function TarjetaSolicitud({ solicitud: s }) {
  return (
    <Pressable onPress={() => router.push(`/solicitud/${s.id}`)} accessibilityRole="button"
      style={({ pressed }) => [estilos.tarjeta, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={estilos.fila}>
        <Text style={estilos.categoria}>{s.categoria_nombre}</Text>
        <EstadoSolicitud estado={s.estado} />
      </View>
      <Text style={estilos.descripcion} numberOfLines={2}>{s.descripcion}</Text>
      <Text style={estilos.suave}>
        📍 {s.comuna} · {fechaCorta(s.creado_en)}
        {s.prestador ? ` · 👷 ${s.prestador.nombre}` : ''}
        {s.precio_acordado ? ` · ${pesos(s.precio_acordado)}` : ''}
      </Text>
      {/* Sin respuesta en 1 día hábil: el cliente puede elegir a otro maestro en el detalle */}
      {s.estado === 'creada' && s.sin_respuesta ? (
        <View style={estilos.sinRespuesta}>
          <Text style={estilos.sinRespuestaTexto}>⏰ El maestro no respondió en 1 día hábil</Text>
          <Pressable onPress={() => router.push(`/solicitud/${s.id}`)} accessibilityRole="button"
            accessibilityLabel="Elegir otro maestro" hitSlop={6}>
            <Text style={estilos.elegirOtro}>Elegir otro maestro →</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s },
  categoria: { fontSize: 16, fontWeight: '700', color: colores.texto, flex: 1 },
  descripcion: { fontSize: 15, color: colores.texto, marginVertical: espacio.xs },
  suave: { fontSize: 13, color: colores.textoSuave, textAlign: 'left' },
  sinRespuesta: {
    backgroundColor: colores.avisoFondo, borderWidth: 1, borderColor: colores.avisoBorde, borderRadius: radio.s,
    padding: espacio.s, marginTop: espacio.s, gap: espacio.xs,
  },
  sinRespuestaTexto: { fontSize: 14, fontWeight: '700', color: colores.avisoTexto },
  elegirOtro: { fontSize: 14, fontWeight: '700', color: colores.primario },
}));
