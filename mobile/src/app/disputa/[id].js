import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { hora, fechaCorta } from '../../lib/formato';
import { ES_PRO } from '../../lib/variante';
import { Aviso } from '../../components/Aviso';
import { ConIcono } from '../../components/ConIcono';
import { colores, crearEstilos, degradado, espacio, radio } from '../../theme';
import { useTema } from '../../context/tema';

// HU-16 · Reclamo: conversación privada con el equipo de DeliMaster mientras se revisa una disputa.
// El cliente y el maestro tienen cada uno la suya (la otra parte no la ve): sirve para que el equipo
// pida más antecedentes antes de decidir. Las fotos se suben en la sección «Fotos» de la solicitud.
export default function Reclamo() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { id } = useLocalSearchParams();
  const [datos, setDatos] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const lista = useRef(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.get(`/solicitudes/${id}/disputa/mensajes`));
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  // Mientras la pantalla está abierta se revisa cada 10 segundos si el equipo respondió
  useFocusEffect(useCallback(() => {
    cargar();
    const t = setInterval(cargar, 10_000);
    return () => clearInterval(t);
  }, [cargar]));

  useEffect(() => {
    if (datos?.mensajes.length) setTimeout(() => lista.current?.scrollToEnd?.({ animated: true }), 50);
  }, [datos?.mensajes.length]);

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido) return;
    setEnviando(true);
    setError(null);
    try {
      setDatos(await api.post(`/solicitudes/${id}/disputa/mensajes`, { contenido }));
      setTexto('');
    } catch (e) {
      setError(e.message);
      if (e.codigo === 'DISPUTA_CERRADA') cargar();
    } finally {
      setEnviando(false);
    }
  }

  if (!datos) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={estilos.banner}>
        <ConIcono icono={require('../../../assets/iconos/app/protegido.png')} estilo={estilos.bannerTexto}>
          Conversación privada con el equipo de DeliMaster: {ES_PRO ? 'el cliente' : 'el maestro'} no la ve.
          Cuéntanos lo que pasó; las fotos súbelas en la sección «Fotos» de la solicitud.
        </ConIcono>
      </View>
      <FlatList
        ref={lista}
        data={datos.mensajes}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            {datos.puede_escribir
              ? 'Aún no hay mensajes. El equipo te escribirá aquí si necesita más antecedentes, y tú también puedes escribirle.'
              : 'No hubo mensajes en este reclamo.'}
          </Text>
        }
        renderItem={({ item: m }) => (
          <View style={[estilos.burbuja, m.de_equipo ? estilos.delEquipo : [estilos.mia, degradado(colores.degradadoBoton)]]}>
            {m.de_equipo ? <Text style={estilos.autor}>Equipo DeliMaster</Text> : null}
            <Text style={[estilos.texto, !m.de_equipo && { color: colores.sobrePrimario }]}>{m.contenido}</Text>
            <Text style={[estilos.hora, !m.de_equipo && { color: colores.sobrePrimario }]}>{fechaCorta(m.creado_en)} · {hora(m.creado_en)}</Text>
          </View>
        )}
      />
      <View style={estilos.pie}>
        <Aviso mensaje={error} />
        {datos.puede_escribir ? (
          <View style={estilos.fila}>
            <TextInput value={texto} onChangeText={setTexto} placeholder="Escribe al equipo de DeliMaster"
              placeholderTextColor={colores.textoSuave} multiline maxLength={1000} style={estilos.campo}
              accessibilityLabel="Mensaje para el equipo de DeliMaster" />
            <Pressable onPress={enviar} disabled={enviando || !texto.trim()} accessibilityRole="button" accessibilityLabel="Enviar"
              style={[estilos.enviar, (!texto.trim() || enviando) && { opacity: 0.5 }]}>
              {enviando ? <ActivityIndicator color={colores.sobrePrimario} /> : <Text style={estilos.enviarTexto}>➤</Text>}
            </Pressable>
          </View>
        ) : <Text style={estilos.cerrado}>El reclamo ya se resolvió: la conversación quedó cerrada.</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m },
  banner: { backgroundColor: colores.infoFondo, padding: espacio.m },
  bannerTexto: { fontSize: 13, color: colores.infoTexto, lineHeight: 19 },
  lista: { padding: espacio.m, gap: espacio.s, maxWidth: 720, width: '100%', alignSelf: 'center', flexGrow: 1 },
  vacio: { textAlign: 'center', color: colores.textoSuave, marginTop: espacio.xl, lineHeight: 20 },
  burbuja: { maxWidth: '85%', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  delEquipo: { alignSelf: 'flex-start', backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.bordeTarjeta },
  mia: { alignSelf: 'flex-end', backgroundColor: colores.primario },
  autor: { fontSize: 12, fontWeight: '800', color: colores.primarioOscuro, marginBottom: 2 },
  texto: { fontSize: 15, color: colores.texto, lineHeight: 21 },
  hora: { fontSize: 11, color: colores.textoSuave, marginTop: 4, textAlign: 'right' },
  pie: { padding: espacio.s, borderTopWidth: 1, borderColor: colores.borde, backgroundColor: colores.superficie },
  fila: { flexDirection: 'row', alignItems: 'flex-end', gap: espacio.s, maxWidth: 720, width: '100%', alignSelf: 'center' },
  campo: {
    flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1.5, borderColor: colores.borde, borderRadius: radio.l,
    paddingHorizontal: espacio.m, paddingVertical: 10, fontSize: 15, color: colores.texto, backgroundColor: colores.campoFondo,
  },
  enviar: {
    width: 46, height: 46, borderRadius: 999, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center',
  },
  enviarTexto: { color: colores.sobrePrimario, fontSize: 18 },
  cerrado: { textAlign: 'center', color: colores.textoSuave, padding: espacio.s },
}));
