import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { Estrellas } from '../../components/Estrellas';
import { Aviso } from '../../components/Aviso';
import { Boton } from '../../components/Boton';
import { Avatar } from '../../components/Avatar';
import { ConIcono } from '../../components/ConIcono';
import { colores, crearEstilos, espacio, radio } from '../../theme';
import { textoHorario } from '../../lib/horario';
import { useTema } from '../../context/tema';

const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

// HU-02: perfil del maestro (sin teléfono ni correo: el contacto ocurre dentro de la app).
// Si se abre desde una solicitud ya publicada (?solicitud=id), «Contratar» le asigna esa misma
// solicitud: no se vuelve a pedir el servicio ni choca con el límite de una solicitud activa.
export default function PerfilPrestador() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { id, solicitud } = useLocalSearchParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [asignando, setAsignando] = useState(false);
  const [fotoAbierta, setFotoAbierta] = useState(null);

  useEffect(() => {
    api.get(`/prestadores/${id}`).then((r) => setP(r.prestador)).catch((e) => setError(e.message));
  }, [id]);

  async function contratar() {
    if (!solicitud) {
      router.push(`/nueva-solicitud?prestador=${p.id}`);
      return;
    }
    setError(null);
    setAsignando(true);
    try {
      await api.post(`/solicitudes/${solicitud}/asignar`, { prestador_id: p.id });
      // De vuelta a la solicitud, que se recarga sola y muestra al maestro elegido
      if (router.canGoBack()) router.back();
      else router.replace(`/solicitud/${solicitud}`);
    } catch (e) {
      setError(e.message);
      setAsignando(false);
    }
  }

  if (!p) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={[estilos.contenido, { paddingBottom: 130 }]}>
      <View style={estilos.cabecera}>
        <View style={estilos.avatar}><Avatar nombre={p.nombre} tamano={92} /></View>
        <Text style={estilos.nombre}>{p.nombre}</Text>
        <Estrellas promedio={p.calificacion_promedio} total={p.total_resenas} tamano={16} />
        <Text style={estilos.meta}>
          {p.trabajos_cerrados} trabajos cerrados en DeliMaster · Miembro desde {fecha(p.miembro_desde)}
        </Text>
      </View>

      {p.verificaciones.length ? (
        <View style={estilos.verificado}>
          {p.verificaciones.map((v) => (
            <Text key={`${v.organismo}-${v.categoria}`} style={estilos.verificadoTexto}>
              ✓ {v.categoria}: verificado con {v.organismo}
            </Text>
          ))}
        </View>
      ) : null}

      <Seccion titulo="Servicios">
        <Text style={estilos.texto}>{p.categorias.map((c) => c.nombre).join(' · ')}</Text>
      </Seccion>

      {p.descripcion ? (
        <Seccion titulo="Sobre mí"><Text style={estilos.texto}>{p.descripcion}</Text></Seccion>
      ) : null}

      <Seccion titulo="Atiende en">
        <Text style={estilos.texto}>{p.comunas_atendidas.join(', ') || 'Sin comunas indicadas'}</Text>
      </Seccion>

      {p.horario ? (
        <Seccion titulo="Horario de atención">
          <ConIcono icono={require('../../../assets/iconos/app/reloj.png')} estilo={estilos.texto}>
            {textoHorario(p.horario)}
          </ConIcono>
          <Text style={estilos.textoSuave}>Las visitas se agendan dentro de este horario.</Text>
        </Seccion>
      ) : null}

      {/* Portafolio: fotos de trabajos anteriores que el maestro subió desde DeliMaster Pro (enlaces firmados) */}
      {p.fotos?.length ? (
        <Seccion titulo={`Trabajos anteriores (${p.fotos.length})`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s }}>
            {p.fotos.map((f, i) => (
              <Pressable key={f.id} onPress={() => setFotoAbierta(f.url)} accessibilityRole="imagebutton"
                accessibilityLabel={`Ver la foto ${i + 1} de los trabajos de ${p.nombre}`}>
                <Image source={{ uri: f.url }} style={estilos.miniatura} />
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[estilos.textoSuave, { marginTop: espacio.s, fontSize: 13 }]}>Toca una foto para verla en grande.</Text>
        </Seccion>
      ) : null}

      <Seccion titulo="Reseñas">
        {p.resenas.length ? p.resenas.map((r, i) => (
          <View key={i} style={estilos.resena}>
            <Text style={estilos.resenaCabecera}>
              <Text style={{ color: colores.acento }}>{'★'.repeat(r.estrellas)}</Text>  {r.cliente}
            </Text>
            {r.comentario ? <Text style={estilos.texto}>{r.comentario}</Text> : null}
          </View>
        )) : <Text style={estilos.textoSuave}>Aún no tiene reseñas en DeliMaster.</Text>}
      </Seccion>

    </ScrollView>
    <Modal visible={Boolean(fotoAbierta)} transparent animationType="fade" onRequestClose={() => setFotoAbierta(null)}>
      <View style={estilos.visor}>
        {fotoAbierta ? (
          <Image source={{ uri: fotoAbierta }} style={estilos.fotoGrande} resizeMode="contain"
            accessibilityLabel={`Foto de un trabajo de ${p.nombre}`} />
        ) : null}
        <Pressable onPress={() => setFotoAbierta(null)} accessibilityRole="button" accessibilityLabel="Cerrar la foto" style={estilos.cerrarVisor}>
          <Text style={estilos.cerrarVisorTexto}>Cerrar</Text>
        </Pressable>
      </View>
    </Modal>
    {/* La acción principal queda siempre a la vista, sin importar cuánto se desplace el perfil */}
    <View style={estilos.barra}>
      {error ? <Aviso mensaje={error} /> : null}
      <View style={estilos.barraFila}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.barraNombre} numberOfLines={1}>{p.nombre.split(' ')[0]}</Text>
          <Text style={estilos.nota} numberOfLines={2}>
            {!p.disponible ? 'No está disponible ahora.'
              : solicitud ? 'Se lo pediremos en tu solicitud.' : 'Pago protegido hasta el cierre.'}
          </Text>
        </View>
        <View style={{ minWidth: 170 }}>
          <Boton titulo="Contratar" deshabilitado={!p.disponible} cargando={asignando} onPress={contratar} />
        </View>
      </View>
    </View>
    </View>
  );
}

function Seccion({ titulo, children }) {
  return (
    <View style={estilos.seccion}>
      <Text style={estilos.seccionTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, maxWidth: 720, width: '100%', alignSelf: 'center' },
  cabecera: { alignItems: 'center', paddingVertical: espacio.l, gap: espacio.xs },
  avatar: { marginBottom: espacio.s, borderRadius: 999, padding: 4, backgroundColor: colores.superficie, boxShadow: colores.sombra },
  nombre: { fontSize: 24, fontWeight: '900', color: colores.texto, letterSpacing: -0.3 },
  meta: { fontSize: 13, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.xs },
  verificado: { backgroundColor: colores.exitoSuave, borderRadius: radio.s, padding: espacio.m, gap: espacio.xs },
  verificadoTexto: { color: colores.verificado, fontWeight: '600', fontSize: 14 },
  seccion: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginTop: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  seccionTitulo: { fontSize: 15, fontWeight: '700', color: colores.texto, marginBottom: espacio.s },
  texto: { fontSize: 15, color: colores.texto, lineHeight: 21 },
  textoSuave: { fontSize: 15, color: colores.textoSuave },
  resena: { paddingVertical: espacio.s, borderTopWidth: 1, borderTopColor: colores.fondo },
  resenaCabecera: { fontSize: 14, fontWeight: '600', color: colores.texto, marginBottom: 2 },
  nota: { color: colores.textoSuave, fontSize: 13, marginTop: 2 },
  barra: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: espacio.m, paddingBottom: espacio.l, backgroundColor: colores.superficie,
    borderTopWidth: 1, borderTopColor: colores.borde, boxShadow: colores.sombraFuerte,
  },
  barraFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.m },
  barraNombre: { fontSize: 17, fontWeight: '800', color: colores.texto },
  miniatura: { width: 120, height: 120, borderRadius: radio.s, backgroundColor: colores.fondo },
  visor: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', alignItems: 'center', justifyContent: 'center', padding: espacio.m },
  fotoGrande: { width: '100%', height: '80%' },
  cerrarVisor: {
    marginTop: espacio.l, backgroundColor: '#FFFFFF', borderRadius: radio.pildora, paddingHorizontal: espacio.xl, paddingVertical: espacio.s,
  },
  cerrarVisorTexto: { color: '#000000', fontWeight: '800', fontSize: 16 },
}));
