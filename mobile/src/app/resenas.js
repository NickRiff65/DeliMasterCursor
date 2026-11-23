import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { fechaCorta } from '../lib/formato';
import { Aviso } from '../components/Aviso';
import { ConIcono } from '../components/ConIcono';
import { Estrellas } from '../components/Estrellas';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// DeliMaster Pro · Mis reseñas: la reputación del maestro (la que ven los clientes en el catálogo) y
// todas las reseñas que le dejaron al cerrar sus trabajos, las más recientes primero.
export default function MisResenas() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [datos, setDatos] = useState(null);   // { calificacion_promedio, total_resenas, trabajos_cerrados, resenas }
  const [error, setError] = useState(null);

  useFocusEffect(useCallback(() => {
    api.get('/prestadores/yo/resenas').then(setDatos).catch((e) => setError(e.message));
  }, []));

  if (!datos) {
    return (
      <View style={estilos.contenido}>
        {error ? <Aviso mensaje={error} /> : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.tarjeta}>
        <ConIcono icono={require('../../assets/iconos/app/reputacion.png')} estilo={estilos.titulo}>
          Tu reputación como maestro
        </ConIcono>
        <View style={estilos.fila}>
          <Estrellas promedio={datos.calificacion_promedio} total={datos.total_resenas} tamano={20} />
          <Text style={estilos.suave}>
            {datos.trabajos_cerrados} {datos.trabajos_cerrados === 1 ? 'trabajo cerrado' : 'trabajos cerrados'}
          </Text>
        </View>
        <Text style={estilos.suave}>
          Es el promedio de lo que te calificaron los clientes. Los clientes la ven en el catálogo y en tu perfil.
        </Text>
      </View>

      {datos.resenas.length ? datos.resenas.map((r) => (
        <View key={r.id} style={estilos.tarjeta} accessible
          accessibilityLabel={`${r.estrellas} de 5 estrellas, de ${r.cliente}${r.comentario ? `: ${r.comentario}` : ''}`}>
          <View style={estilos.fila}>
            <Text style={estilos.estrellas}>
              {'★'.repeat(r.estrellas)}<Text style={estilos.estrellasVacias}>{'★'.repeat(5 - r.estrellas)}</Text>
            </Text>
            <Text style={estilos.suave}>{fechaCorta(r.creado_en)}</Text>
          </View>
          <Text style={estilos.quien}>{r.cliente} · {r.categoria}</Text>
          {r.comentario
            ? <Text style={estilos.comentario}>«{r.comentario}»</Text>
            : <Text style={estilos.suave}>Calificó sin dejar comentario.</Text>}
        </View>
      )) : (
        <View style={estilos.tarjeta}>
          <Text style={estilos.texto}>Aún no tienes reseñas.</Text>
          <Text style={estilos.suave}>
            Cuando cierres un trabajo en DeliMaster, el cliente podrá calificarte y su reseña aparecerá aquí.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta, gap: espacio.xs,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s },
  titulo: { fontSize: 17, fontWeight: '800', color: colores.texto },
  texto: { fontSize: 15, color: colores.texto },
  suave: { fontSize: 14, color: colores.textoSuave },
  estrellas: { fontSize: 18, color: colores.acento, letterSpacing: 1 },
  estrellasVacias: { color: colores.borde },
  quien: { fontSize: 15, fontWeight: '700', color: colores.texto },
  comentario: { fontSize: 15, color: colores.texto, lineHeight: 22 },
}));
