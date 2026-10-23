import { Pressable, Text, View } from 'react-native';
import { useCola } from '../context/cola';
import { fechaCorta } from '../lib/formato';
import { colores, crearEstilos, espacio, radio } from '../theme';

// HU-12: solicitudes guardadas en el celular que aún no llegan al servidor
export function PendientesDeEnvio({ recienGuardada = false }) {
  const { items, conectado, enviando, procesar, descartar } = useCola();
  if (!items.length) return null;

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Pendientes de envío ({items.length})</Text>
      {recienGuardada && items.some((i) => i.estado === 'pendiente') ? (
        <Text style={estilos.aviso}>✔ Tu solicitud quedó guardada en el celular. Se enviará sola apenas haya señal.</Text>
      ) : null}

      {items.map((item) => (
        <View key={item.id} style={[estilos.tarjeta, item.estado === 'revisar' && estilos.revisar]}>
          <Text style={estilos.descripcion} numberOfLines={2}>“{item.datos.descripcion}”</Text>
          <Text style={estilos.suave}>
            Guardada {fechaCorta(item.creado_en)}{item.datos.comuna ? ` · 📍 ${item.datos.comuna}` : ''}
          </Text>
          {item.estado === 'revisar' ? (
            <Text style={estilos.error}>No se pudo enviar: {item.error}</Text>
          ) : (
            <Text style={estilos.estado}>
              {enviando ? '⏳ Enviando…' : conectado ? '⏳ Esperando para enviar' : '📶 Esperando señal'}
            </Text>
          )}
          <View style={estilos.acciones}>
            {item.estado === 'pendiente' ? (
              <Pressable onPress={procesar} disabled={enviando} accessibilityRole="button" hitSlop={8}>
                <Text style={estilos.enlace}>Reintentar ahora</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => descartar(item.id)} accessibilityRole="button" hitSlop={8}>
              <Text style={[estilos.enlace, { color: colores.error }]}>Descartar</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenedor: { marginBottom: espacio.m },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto, marginBottom: espacio.s },
  aviso: { color: colores.verificado, fontWeight: '600', fontSize: 14, marginBottom: espacio.s },
  tarjeta: {
    backgroundColor: colores.avisoFondo, borderRadius: radio.m, padding: espacio.m, marginBottom: espacio.s,
    borderWidth: 1, borderColor: colores.avisoBorde, borderStyle: 'dashed',
  },
  revisar: { backgroundColor: colores.errorSuave, borderColor: colores.errorBorde },
  descripcion: { fontSize: 15, color: colores.texto, fontStyle: 'italic' },
  suave: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.xs },
  estado: { fontSize: 14, color: colores.avisoTexto, fontWeight: '600', marginTop: espacio.s },
  error: { fontSize: 14, color: colores.error, marginTop: espacio.s },
  acciones: { flexDirection: 'row', gap: espacio.l, marginTop: espacio.s },
  enlace: { color: colores.primario, fontWeight: '600', fontSize: 14 },
}));
