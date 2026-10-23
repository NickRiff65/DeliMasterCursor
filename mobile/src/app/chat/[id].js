import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { obtenerSocket } from '../../lib/socket';
import { hora } from '../../lib/formato';
import { CAMARA_DIRECTA, elegirFoto } from '../../lib/fotos';
import { useSesion } from '../../context/sesion';
import { Aviso } from '../../components/Aviso';
import { colores, crearEstilos, degradado, espacio, radio } from '../../theme';
import { useTema } from '../../context/tema';

const MOTIVOS = {
  telefono: 'teléfono o número de cuenta',
  correo: 'correo',
  datos_bancarios: 'datos bancarios',
  contacto_externo: 'contacto por otra aplicación',
  enlace: 'enlace',
  pago_externo: 'acuerdo de pago por fuera de DeliMaster',
};

// HU-04: chat de una solicitud (Lite y Pro). Los mensajes se envían por la API, que aplica
// el filtro anti-fuga; Socket.io entrega en tiempo real los de la otra persona.
// También se envían fotos (cámara o galería), por ejemplo del árbol o de la falla, para cotizar mejor.
export default function Chat() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { id } = useLocalSearchParams();
  const { usuario } = useSesion();
  const [mensajes, setMensajes] = useState(null);
  const [puedeEscribir, setPuedeEscribir] = useState(false);
  const [filtroActivo, setFiltroActivo] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const [menuFoto, setMenuFoto] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [ampliada, setAmpliada] = useState(null);
  const lista = useRef(null);

  // Agrega mensajes sin duplicar (el propio llega por la respuesta de la API y también por el socket)
  const agregar = useCallback((nuevo) => {
    setMensajes((prev) => (prev?.some((m) => m.id === nuevo.id) ? prev : [...(prev ?? []), nuevo]));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get(`/solicitudes/${id}/mensajes`);
      setMensajes(r.mensajes);
      setPuedeEscribir(r.puede_escribir);
      setFiltroActivo(r.filtro_activo);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    cargar();
    const socket = obtenerSocket();
    const unirse = () => socket.emit('unirse', id);
    const alRecibir = (m) => {
      if (m.solicitud_id !== id) return;
      // Las fotos llegan sin enlace por el socket: se vuelve a pedir la lista, que trae el enlace firmado.
      // Las propias ya llegaron con la respuesta de la API.
      if (m.foto_id) { if (m.emisor_id !== usuario.id) cargar(); return; }
      agregar(m);
    };
    socket.on('connect', unirse);        // también al reconectar tras perder señal
    socket.on('mensaje', alRecibir);
    if (socket.connected) unirse();
    return () => {
      socket.emit('salir', id);
      socket.off('connect', unirse);
      socket.off('mensaje', alRecibir);
    };
  }, [id, cargar, agregar, usuario.id]);

  async function enviarFoto(desdeCamara) {
    setMenuFoto(false);
    setAviso(null);
    setError(null);
    try {
      const foto = await elegirFoto(desdeCamara);
      if (!foto) return;
      setSubiendoFoto(true);
      const r = await api.post(`/solicitudes/${id}/mensajes/foto`, { imagen_base64: foto.base64 });
      agregar(r.mensaje);
    } catch (e) {
      setError(e.message);
      if (e.codigo === 'CHAT_CERRADO') setPuedeEscribir(false);
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function enviar() {
    const contenido = texto.trim();
    if (!contenido) return;
    setEnviando(true);
    setAviso(null);
    setError(null);
    try {
      const r = await api.post(`/solicitudes/${id}/mensajes`, { contenido });
      agregar(r.mensaje);
      setTexto('');
      if (r.aviso) setAviso(r.aviso);
    } catch (e) {
      setError(e.message);
      if (e.codigo === 'CHAT_CERRADO') setPuedeEscribir(false);
    } finally {
      setEnviando(false);
    }
  }

  if (!mensajes) {
    return error ? <View style={{ padding: espacio.m }}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {filtroActivo ? (
        <View style={estilos.banner}>
          <Text style={estilos.bannerTexto}>
            🔒 Por tu seguridad, los teléfonos, correos y datos bancarios se bloquean hasta que el pago esté protegido.
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={lista}
        data={mensajes}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={estilos.lista}
        onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Text style={estilos.vacio}>Aún no hay mensajes. ¡Saluda y coordinen el trabajo!</Text>}
        renderItem={({ item: m }) => {
          const mio = m.emisor_id === usuario.id;
          return (
            <View style={[estilos.burbuja, mio ? [estilos.mia, !m.bloqueado && degradado(colores.degradadoBoton)] : estilos.suya, m.bloqueado && estilos.bloqueada]}>
              {!mio ? <Text style={estilos.autor}>{m.emisor_nombre}</Text> : null}
              {m.foto_url ? (
                <Pressable onPress={() => setAmpliada(m)} accessibilityRole="imagebutton" accessibilityLabel={mio ? 'Tu foto' : `Foto de ${m.emisor_nombre}`}>
                  <Image source={{ uri: m.foto_url }} style={estilos.foto} />
                </Pressable>
              ) : (
                <Text style={[estilos.texto, mio && !m.bloqueado && { color: colores.sobrePrimario }, m.bloqueado && estilos.textoBloqueado]}>
                  {m.contenido}
                </Text>
              )}
              {m.bloqueado ? (
                <Text style={estilos.motivo}>
                  No enviado: contiene {m.motivo_bloqueo?.split(',').map((x) => MOTIVOS[x] ?? x).join(', ')}
                </Text>
              ) : null}
              <Text style={[estilos.hora, mio && !m.bloqueado && { color: colores.primarioSuave }]}>{hora(m.creado_en)}</Text>
            </View>
          );
        }}
      />

      <View style={estilos.pie}>
        {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
        {error ? <Text style={estilos.aviso}>{error}</Text> : null}
        {puedeEscribir && menuFoto ? (
          <View style={estilos.menuFoto}>
            <Pressable onPress={() => enviarFoto(true)} style={estilos.opcionFoto} accessibilityRole="button">
              <Text style={estilos.opcionFotoTexto}>📷 Cámara</Text>
            </Pressable>
            <Pressable onPress={() => enviarFoto(false)} style={estilos.opcionFoto} accessibilityRole="button">
              <Text style={estilos.opcionFotoTexto}>🖼️ Galería</Text>
            </Pressable>
            <Pressable onPress={() => setMenuFoto(false)} style={estilos.opcionFoto} accessibilityRole="button">
              <Text style={[estilos.opcionFotoTexto, { color: colores.textoSuave }]}>Cancelar</Text>
            </Pressable>
          </View>
        ) : null}
        {puedeEscribir ? (
          <View style={estilos.fila}>
            {/* En la web se abre directo el selector de archivos (en el iPhone ofrece la cámara) */}
            <Pressable onPress={() => (CAMARA_DIRECTA ? setMenuFoto((v) => !v) : enviarFoto(false))} disabled={subiendoFoto}
              accessibilityRole="button" accessibilityLabel="Enviar una foto" style={estilos.botonFoto}>
              {subiendoFoto ? <ActivityIndicator color={colores.primario} /> : <Text style={{ fontSize: 20 }}>📷</Text>}
            </Pressable>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escribe un mensaje"
              placeholderTextColor={colores.textoSuave}
              style={estilos.input}
              multiline
              maxLength={1000}
              accessibilityLabel="Mensaje"
            />
            <Pressable onPress={enviar} disabled={enviando || !texto.trim()} accessibilityRole="button" accessibilityLabel="Enviar"
              style={[estilos.enviar, (enviando || !texto.trim()) && { opacity: 0.5 }]}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.enviarTexto}>➤</Text>}
            </Pressable>
          </View>
        ) : (
          <Text style={estilos.cerrado}>Este chat está cerrado.</Text>
        )}
      </View>

      <Modal visible={Boolean(ampliada)} transparent animationType="fade" onRequestClose={() => setAmpliada(null)}>
        <Pressable style={estilos.fondoModal} onPress={() => setAmpliada(null)} accessibilityRole="button" accessibilityLabel="Cerrar foto">
          {ampliada ? (
            <>
              <Image source={{ uri: ampliada.foto_url }} style={estilos.ampliada} resizeMode="contain" />
              <Text style={estilos.pieModal}>{ampliada.emisor_id === usuario.id ? 'Tu foto' : ampliada.emisor_nombre} · {hora(ampliada.creado_en)}</Text>
              <Text style={estilos.pieModal}>Toca para cerrar</Text>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const estilos = crearEstilos((colores) => ({
  banner: { backgroundColor: colores.avisoFondo, borderBottomWidth: 1, borderBottomColor: colores.avisoBorde, padding: espacio.s, paddingHorizontal: espacio.m },
  bannerTexto: { color: colores.avisoTexto, fontSize: 13 },
  lista: { padding: espacio.m, gap: espacio.s, flexGrow: 1, maxWidth: 720, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: colores.textoSuave, marginTop: espacio.xl },
  burbuja: { maxWidth: '80%', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  mia: { alignSelf: 'flex-end', backgroundColor: colores.primario, borderBottomRightRadius: 6, boxShadow: colores.sombraFuerte },
  suya: { alignSelf: 'flex-start', backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.bordeTarjeta, borderBottomLeftRadius: 6, boxShadow: colores.sombra },
  bloqueada: { backgroundColor: colores.errorSuave, borderWidth: 1, borderColor: colores.errorBorde },
  autor: { fontSize: 12, fontWeight: '700', color: colores.primarioOscuro, marginBottom: 2 },
  texto: { fontSize: 15, color: colores.texto },
  textoBloqueado: { color: colores.textoSuave, textDecorationLine: 'line-through' },
  motivo: { fontSize: 12, color: colores.error, marginTop: 4, fontWeight: '600' },
  hora: { fontSize: 11, color: colores.textoSuave, marginTop: 4, alignSelf: 'flex-end' },
  pie: { borderTopWidth: 1, borderTopColor: colores.bordeTarjeta, backgroundColor: colores.superficie, padding: espacio.s, boxShadow: colores.sombra },
  aviso: { color: colores.error, fontSize: 13, marginBottom: espacio.s, paddingHorizontal: espacio.xs },
  fila: { flexDirection: 'row', alignItems: 'flex-end', gap: espacio.s, maxWidth: 720, width: '100%', alignSelf: 'center' },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1.5, borderColor: colores.borde, borderRadius: radio.pildora,
    paddingHorizontal: espacio.m, paddingVertical: 10, fontSize: 15, color: colores.texto, backgroundColor: colores.fondo,
  },
  enviar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center',
    boxShadow: colores.sombraFuerte, ...degradado(colores.degradadoBoton),
  },
  enviarTexto: { color: colores.sobrePrimario, fontSize: 18 },
  cerrado: { textAlign: 'center', color: colores.textoSuave, padding: espacio.s },
  foto: { width: 200, height: 200, borderRadius: 14, backgroundColor: colores.fondo, marginTop: 2 },
  botonFoto: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colores.fondo, borderWidth: 1.5, borderColor: colores.borde,
  },
  menuFoto: { flexDirection: 'row', gap: espacio.s, marginBottom: espacio.s, maxWidth: 720, width: '100%', alignSelf: 'center', flexWrap: 'wrap' },
  opcionFoto: {
    paddingHorizontal: espacio.m, paddingVertical: 9, borderRadius: radio.pildora, backgroundColor: colores.fondo,
    borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  opcionFotoTexto: { fontSize: 14, fontWeight: '700', color: colores.primarioOscuro },
  fondoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: espacio.m },
  ampliada: { width: '100%', height: '75%' },
  pieModal: { color: '#FFFFFF',   // siempre sobre el fondo negro de la foto ampliada
    fontSize: 14, marginTop: espacio.s, textAlign: 'center' },
}));
