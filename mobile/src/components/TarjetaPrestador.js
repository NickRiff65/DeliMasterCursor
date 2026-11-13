import { Pressable, Text, View } from 'react-native';
import { crearEstilos, espacio, radio } from '../theme';
import { textoHorario } from '../lib/horario';
import { Avatar } from './Avatar';
import { Estrellas } from './Estrellas';

export { iniciales } from './Avatar';

export function TarjetaPrestador({ prestador, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${prestador.nombre}`}
      style={({ pressed }) => [estilos.tarjeta, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={estilos.avatar}><Avatar nombre={prestador.nombre} /></View>
      <View style={estilos.cuerpo}>
        <View style={estilos.fila}>
          <Text style={estilos.nombre} numberOfLines={1}>{prestador.nombre}</Text>
          {prestador.es_nuevo ? (
            <View style={estilos.nuevo}><Text style={estilos.nuevoTexto}>Nuevo</Text></View>
          ) : null}
          {prestador.total_resenas ? (
            <View style={estilos.nota}>
              <Estrellas promedio={prestador.calificacion_promedio} total={prestador.total_resenas} />
            </View>
          ) : <Estrellas promedio={prestador.calificacion_promedio} total={prestador.total_resenas} />}
        </View>
        <Text style={estilos.categorias} numberOfLines={1}>
          {prestador.categorias.map((c, i) => (
            <Text key={c.slug}>
              {i > 0 ? ' · ' : ''}{c.nombre}
              {/* El verde se reserva para lo verificado con un organismo oficial */}
              {c.verificada ? <Text style={estilos.verificado}> ✓ Verificado</Text> : null}
            </Text>
          ))}
        </Text>
        {prestador.descripcion ? (
          <Text style={estilos.descripcion} numberOfLines={2}>{prestador.descripcion}</Text>
        ) : null}
        <Text style={estilos.comunas} numberOfLines={1}>📍 {prestador.comunas_atendidas.join(', ')}</Text>
        {prestador.horario ? <Text style={estilos.comunas} numberOfLines={1}>🕒 {textoHorario(prestador.horario)}</Text> : null}
      </View>
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  tarjeta: {
    flexDirection: 'row',
    backgroundColor: colores.superficie,
    borderRadius: radio.l,
    padding: espacio.m,
    marginBottom: espacio.m,
    borderWidth: 1,
    borderColor: colores.bordeTarjeta,
    boxShadow: colores.sombra,
  },
  avatar: { marginRight: espacio.m },
  cuerpo: { flex: 1 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.s },
  nombre: { flex: 1, fontSize: 16, fontWeight: '800', color: colores.texto },
  nota: { backgroundColor: colores.avisoFondo, borderRadius: radio.pildora, paddingHorizontal: 8, paddingVertical: 2 },
  nuevo: { backgroundColor: colores.primario, borderRadius: radio.pildora, paddingHorizontal: 8, paddingVertical: 2 },
  nuevoTexto: { color: colores.sobrePrimario, fontSize: 12, fontWeight: '800' },
  categorias: { color: colores.texto, fontSize: 13, marginTop: 4, fontWeight: '600' },
  verificado: { color: colores.verificado },
  descripcion: { color: colores.textoSuave, fontSize: 14, marginTop: espacio.xs, lineHeight: 20 },
  comunas: { color: colores.textoSuave, fontSize: 13, marginTop: espacio.xs },
}));
