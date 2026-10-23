import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { api } from '../lib/api';
import { useSesion } from '../context/sesion';
import { useCola } from '../context/cola';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { BotonesFoto } from '../components/BotonesFoto';
import { elegirFoto } from '../lib/fotos';
import { ubicacionActual } from '../lib/ubicacion';
import { Campo } from '../components/Campo';
import { SeleccionMultiple } from '../components/SeleccionMultiple';
import { SelectorComuna } from '../components/SelectorComuna';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

const EJEMPLOS = [
  'Se rompió una cañería y está saliendo agua',
  'Se me quedaron las llaves adentro de la casa',
  'Se me quemó un enchufe y saltó el automático',
];
const MAX_FOTOS = 4;

// HU-08: el cliente describe su necesidad con sus palabras; la app muestra lo que entendió
// para confirmarlo o corregirlo antes de publicar la solicitud. Puede agregar fotos (cámara o galería)
// para que el maestro cotice con más exactitud.
// Si viene desde el perfil de un maestro (?prestador=id), al publicar se le asigna directamente.
export default function NuevaSolicitud() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { usuario } = useSesion();
  const { prestador: prestadorId } = useLocalSearchParams();
  const [paso, setPaso] = useState('escribir');
  const [texto, setTexto] = useState('');
  const [opciones, setOpciones] = useState([]);       // categorías que se pueden elegir
  const [prestador, setPrestador] = useState(null);
  const [comunas, setComunas] = useState([]);
  const [elegidas, setElegidas] = useState([]);
  const [comuna, setComuna] = useState(usuario?.comuna ?? null);
  const [noDisponibles, setNoDisponibles] = useState([]);
  const [fueraDeCobertura, setFueraDeCobertura] = useState(null);   // comuna mencionada donde aún no operamos
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [fotos, setFotos] = useState([]);              // { base64, uri }: se suben al publicar
  // Dónde es el trabajo: dirección exacta (obligatoria), referencia y, si quiere, su ubicación GPS
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [gps, setGps] = useState(null);                 // { latitud, longitud, precision }
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [errorDireccion, setErrorDireccion] = useState(null);
  const { encolar } = useCola();
  // El UUID se genera una sola vez: si el envío falla y se reintenta, el servidor no duplica (HU-12)
  const [idSolicitud] = useState(() => Crypto.randomUUID());

  useEffect(() => {
    const pedidos = [api.get('/categorias'), api.get('/comunas')];
    if (prestadorId) pedidos.push(api.get(`/prestadores/${prestadorId}`));
    Promise.all(pedidos)
      .then(([cat, com, pre]) => {
        setComunas(com.comunas);
        if (pre) {
          // Desde un perfil: solo los servicios que ofrece ese prestador
          setPrestador(pre.prestador);
          setOpciones(pre.prestador.categorias);
        } else {
          setOpciones(cat.categorias);
        }
      })
      .catch((e) => setError(e.message));
  }, [prestadorId]);

  async function revisar() {
    setError(null);
    setCargando(true);
    try {
      const r = await api.post('/solicitudes/interpretar', { descripcion: texto.trim() });
      const validas = new Set(opciones.map((o) => o.slug));
      let detectadas = r.categorias.map((c) => c.slug).filter((s) => validas.has(s));
      // Con un prestador elegido se contrata un solo servicio
      if (prestador) detectadas = detectadas.slice(0, 1);
      if (prestador && !detectadas.length && opciones.length === 1) detectadas = [opciones[0].slug];
      setElegidas(detectadas);
      setNoDisponibles(r.no_disponibles);
      setFueraDeCobertura(r.fuera_de_cobertura ?? null);
      if (r.comuna) setComuna(r.comuna);
      else if (r.fuera_de_cobertura) setComuna(null);   // que elija Chillán o Coihueco a conciencia
      setPaso('revisar');
    } catch (e) {
      if (e.codigo === 'SIN_CONEXION') setSinConexion(true);
      else setError(e.campos?.descripcion ?? e.message);
    } finally {
      setCargando(false);
    }
  }

  async function usarMiUbicacion() {
    setErrorDireccion(null);
    setBuscandoGps(true);
    try {
      setGps(await ubicacionActual());
    } catch (e) {
      setErrorDireccion(e.message);
    } finally {
      setBuscandoGps(false);
    }
  }

  // Los datos del lugar que viajan con la solicitud
  const lugar = () => ({
    direccion: direccion.trim(),
    ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
    ...(gps ? { latitud: gps.latitud, longitud: gps.longitud } : {}),
  });

  async function agregarFoto(desdeCamara) {
    setError(null);
    try {
      const foto = await elegirFoto(desdeCamara);
      if (foto) setFotos((f) => [...f, foto].slice(0, MAX_FOTOS));
    } catch (e) {
      setError(e.message);
    }
  }

  // Las fotos se suben a cada solicitud creada. Si alguna falla, la solicitud igual queda publicada
  // y el cliente puede volver a agregarla desde el detalle.
  async function subirFotos(solicitudes) {
    let fallidas = 0;
    for (const s of solicitudes) {
      for (const f of fotos) {
        try {
          await api.post(`/solicitudes/${s.id}/fotos`, { imagen_base64: f.base64, descripcion: 'Foto de la solicitud' });
        } catch {
          fallidas++;
        }
      }
    }
    return fallidas;
  }

  async function publicar() {
    setError(null);
    if (!elegidas.length) return setError('Elige qué servicio necesitas.');
    if (!comuna) return setError('Elige la comuna donde necesitas el servicio.');
    if (direccion.trim().length < 5) {
      setErrorDireccion('Indica la dirección exacta (calle y número, o sector y parcela).');
      return setError('Falta la dirección exacta del trabajo.');
    }
    setCargando(true);
    try {
      const r = await api.post('/solicitudes', {
        id: idSolicitud,
        descripcion: texto.trim(),
        categorias: elegidas,
        comuna,
        ...lugar(),
        creado_en_dispositivo: new Date().toISOString(),
      });
      const fallidas = fotos.length ? await subirFotos(r.solicitudes) : 0;
      if (prestador) {
        await api.post(`/solicitudes/${r.solicitudes[0].id}/asignar`, { prestador_id: prestador.id });
      }
      if (r.solicitudes.length === 1) router.replace(`/solicitud/${r.solicitudes[0].id}${fallidas ? '?fotos=fallidas' : ''}`);
      else router.dismissTo('/');
    } catch (e) {
      if (e.codigo === 'SIN_CONEXION') {
        await guardarSinConexion({ categorias: elegidas, comuna });
        return;
      }
      if (e.campos?.direccion || e.campos?.latitud) setErrorDireccion(e.campos.direccion ?? e.campos.latitud);
      setError(e.message);
      setCargando(false);
    }
  }

  // HU-12: sin señal, la solicitud se guarda en el celular y se envía sola al volver la conexión.
  // Si no pasó por la vista previa, el servidor identificará el servicio al recibirla.
  async function guardarSinConexion(extra = {}) {
    const datos = {
      id: idSolicitud,
      descripcion: texto.trim(),
      creado_en_dispositivo: new Date().toISOString(),
      ...(comuna ? { comuna } : {}),
      ...(prestador ? { prestador_id: prestador.id } : {}),
      ...lugar(),
      ...extra,
    };
    if (!datos.categorias?.length) delete datos.categorias;
    await encolar(datos);
    router.dismissTo('/?guardada=1');
  }

  const alternar = (seleccion) => {
    // Con prestador: selección única (se queda con la última marcada)
    setElegidas(prestador ? seleccion.slice(-1) : seleccion);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {prestador ? (
          <View style={estilos.contratando}>
            <Text style={estilos.contratandoTexto}>Vas a contratar a <Text style={{ fontWeight: '700' }}>{prestador.nombre}</Text></Text>
          </View>
        ) : null}

        <Text style={estilos.titulo}>¿Qué necesitas?</Text>
        <Text style={estilos.ayuda}>Escríbelo con tus palabras. Nosotros identificamos el servicio.</Text>

        <TextInput
          value={texto}
          onChangeText={(t) => { setTexto(t); if (paso === 'revisar') setPaso('escribir'); }}
          placeholder="Ej.: Se me quemó un enchufe y saltó el automático"
          placeholderTextColor={colores.textoSuave}
          multiline
          maxLength={1000}
          style={estilos.areaTexto}
          accessibilityLabel="Describe lo que necesitas"
        />
        {paso === 'escribir' && !texto ? (
          <View style={estilos.ejemplos}>
            {EJEMPLOS.map((e) => (
              <Text key={e} style={estilos.ejemplo} onPress={() => setTexto(e)}>“{e}”</Text>
            ))}
          </View>
        ) : null}

        {/* Fotos opcionales: el árbol, la falla o el lugar */}
        <View style={estilos.fotos}>
          <Text style={estilos.fotosTitulo}>📷 Fotos <Text style={estilos.opcional}>(opcional)</Text></Text>
          <Text style={estilos.fotosAyuda}>Una foto del árbol, la falla o el lugar ayuda al maestro a cotizar con más exactitud.</Text>
          {fotos.length ? (
            <View style={estilos.grilla}>
              {fotos.map((f, i) => (
                <View key={f.uri ?? i}>
                  <Image source={{ uri: f.uri }} style={estilos.miniatura} accessibilityLabel={`Foto ${i + 1}`} />
                  <Pressable onPress={() => setFotos((todas) => todas.filter((_, j) => j !== i))} style={estilos.quitar}
                    accessibilityRole="button" accessibilityLabel={`Quitar foto ${i + 1}`} hitSlop={6}>
                    <Text style={estilos.quitarTexto}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {fotos.length < MAX_FOTOS ? <BotonesFoto onElegir={agregarFoto} /> : (
            <Text style={estilos.fotosAyuda}>Puedes agregar hasta {MAX_FOTOS} fotos aquí; después podrás sumar más en la solicitud o por el chat.</Text>
          )}
        </View>

        <Aviso mensaje={error} />

        {sinConexion && paso === 'escribir' ? (
          <View style={estilos.sinSenal}>
            <Text style={estilos.sinSenalTitulo}>📶 Estás sin conexión</Text>
            <Text style={estilos.sinSenalTexto}>
              Guarda tu solicitud y la enviaremos sola apenas vuelva la señal. Luego podrás elegir al maestro.
            </Text>
            {fotos.length ? (
              <Text style={[estilos.sinSenalTexto, { fontWeight: '700' }]}>
                Las fotos no se guardan sin conexión: podrás agregarlas en la solicitud cuando se envíe.
              </Text>
            ) : null}
            <View style={{ marginTop: espacio.m }}>
              <Campo etiqueta="Dirección exacta del trabajo" value={direccion} onChangeText={setDireccion}
                placeholder="Ej.: Av. Libertad 1234, depto 302" maxLength={200} />
            </View>
            <View style={{ marginTop: espacio.s }}>
              <Boton titulo="Guardar y enviar cuando haya señal" onPress={() => guardarSinConexion()}
                deshabilitado={direccion.trim().length < 5} />
            </View>
          </View>
        ) : null}

        {paso === 'escribir' ? (
          <Boton titulo="Continuar" onPress={revisar} cargando={cargando} deshabilitado={texto.trim().length < 8} />
        ) : (
          <View>
            <Text style={estilos.subtitulo}>
              {elegidas.length ? 'Entendimos que necesitas:' : 'No identificamos el servicio. Elígelo:'}
            </Text>
            <SeleccionMultiple
              opciones={opciones.map((c) => ({ valor: c.slug, etiqueta: c.nombre }))}
              seleccion={elegidas}
              onCambio={alternar}
            />
            {noDisponibles.length ? (
              <Text style={estilos.noDisponible}>
                Aún no ofrecemos {noDisponibles.map((c) => c.nombre.toLowerCase()).join(' ni ')}. ¡Pronto!
              </Text>
            ) : null}
            {!prestador && elegidas.length > 1 ? (
              <Text style={estilos.ayuda}>Crearemos una solicitud por cada servicio.</Text>
            ) : null}

            <Text style={estilos.subtitulo}>¿Dónde es el trabajo?</Text>
            {fueraDeCobertura ? (
              <Text style={estilos.noDisponible}>
                Por ahora atendemos solo en Chillán y Coihueco (mencionaste {fueraDeCobertura}). Si el trabajo es en una de ellas, elígela.
              </Text>
            ) : null}
            <SelectorComuna comunas={comunas} valor={comuna} onCambio={setComuna} />
            <Campo etiqueta="Dirección exacta" value={direccion} onChangeText={(t) => { setDireccion(t); setErrorDireccion(null); }}
              error={errorDireccion} placeholder="Ej.: Av. Libertad 1234, depto 302 · o Parcela 12, camino a Tres Esquinas"
              maxLength={200} autoComplete="street-address" textContentType="fullStreetAddress" />
            <Campo etiqueta="Referencia (opcional)" value={referencia} onChangeText={setReferencia}
              placeholder="Ej.: portón verde, frente a la plaza" maxLength={200} />
            <View style={estilos.gps}>
              {gps ? (
                <Text style={estilos.gpsTexto}>
                  📍 Ubicación guardada{gps.precision ? ` (±${Math.round(gps.precision)} m)` : ''}.{' '}
                  <Text style={estilos.gpsQuitar} onPress={() => setGps(null)}>Quitar</Text>
                </Text>
              ) : (
                <Boton titulo="📍 Usar mi ubicación actual" variante="secundario" onPress={usarMiUbicacion} cargando={buscandoGps} />
              )}
              <Text style={estilos.gpsAyuda}>
                El maestro verá la dirección recién cuando pagues: así tus datos quedan protegidos.
              </Text>
            </View>

            <View style={{ marginTop: espacio.l }}>
              <Boton titulo={prestador ? `Enviar a ${prestador.nombre.split(' ')[0]}` : 'Publicar solicitud'}
                onPress={publicar} cargando={cargando} />
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 24, fontWeight: '800', color: colores.texto },
  subtitulo: { fontSize: 16, fontWeight: '700', color: colores.texto, marginTop: espacio.l, marginBottom: espacio.s },
  ayuda: { fontSize: 14, color: colores.textoSuave, marginTop: espacio.xs, marginBottom: espacio.m },
  areaTexto: {
    minHeight: 120, textAlignVertical: 'top', padding: espacio.m, fontSize: 16, color: colores.texto,
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderWidth: 1, borderColor: colores.bordeTarjeta, borderRadius: radio.m,
    marginBottom: espacio.m,
  },
  ejemplos: { marginBottom: espacio.m, gap: espacio.xs },
  ejemplo: { color: colores.primario, fontSize: 14 },
  noDisponible: { color: colores.avisoTexto, fontSize: 14, marginTop: espacio.s },
  sinSenal: { backgroundColor: colores.avisoFondo, borderWidth: 1, borderColor: colores.avisoBorde, borderRadius: radio.m, padding: espacio.m, marginBottom: espacio.m },
  sinSenalTitulo: { fontSize: 16, fontWeight: '700', color: colores.avisoTexto },
  sinSenalTexto: { fontSize: 14, color: colores.avisoTexto, marginTop: espacio.xs },
  contratando: { backgroundColor: colores.primarioSuave, borderRadius: radio.s, padding: espacio.m, marginBottom: espacio.m },
  fotos: {
    backgroundColor: colores.superficie, borderRadius: radio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
    padding: espacio.m, marginBottom: espacio.m, boxShadow: colores.sombra,
  },
  fotosTitulo: { fontSize: 16, fontWeight: '700', color: colores.texto },
  opcional: { fontSize: 13, fontWeight: '500', color: colores.textoSuave },
  fotosAyuda: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.xs, lineHeight: 18 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginTop: espacio.s },
  miniatura: { width: 76, height: 76, borderRadius: radio.s, backgroundColor: colores.fondo },
  quitar: {
    position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 999, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colores.texto,
  },
  quitarTexto: { color: colores.superficie, fontSize: 12, fontWeight: '800' },
  gps: { gap: espacio.xs, marginTop: espacio.xs },
  gpsTexto: { fontSize: 14, color: colores.exitoTexto, fontWeight: '600' },
  gpsQuitar: { color: colores.primario, fontWeight: '700', textDecorationLine: 'underline' },
  gpsAyuda: { fontSize: 13, color: colores.textoSuave, lineHeight: 18 },
  contratandoTexto: { color: colores.primarioOscuro, fontSize: 15 },
}));
