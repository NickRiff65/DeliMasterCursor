import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, consulta } from '../lib/api';
import { useSesion } from '../context/sesion';
import { useCola } from '../context/cola';
import { Aviso } from '../components/Aviso';
import { PendientesDeEnvio } from '../components/PendientesDeEnvio';
import { TarjetaSolicitud } from '../components/TarjetaSolicitud';
import { BotonCuenta } from '../components/BotonCuenta';
import { BotonAvisos } from '../components/BotonAvisos';
import { colores, crearEstilos, degradado, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Lite: inicio del cliente. Pedir un servicio, ver los maestros disponibles y seguir sus solicitudes.
export default function Inicio() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { usuario } = useSesion();
  const { guardada } = useLocalSearchParams();
  const { items: enCola } = useCola();
  const [solicitudes, setSolicitudes] = useState(null);
  const [maestros, setMaestros] = useState(null);     // cuántos hay disponibles en su comuna
  const [error, setError] = useState(null);
  const [recargando, setRecargando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setSolicitudes((await api.get('/solicitudes')).solicitudes);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  // Cuando una solicitud de la cola se envía, aparece en la lista del servidor
  useEffect(() => { cargar(); }, [enCola.length, cargar]);

  useEffect(() => {
    api.get(`/prestadores${consulta({ comuna: usuario?.comuna, limite: 1 })}`)
      .then((r) => setMaestros(r.paginacion.total))
      .catch(() => {});   // es solo un dato de apoyo
  }, [usuario?.comuna]);

  const primerNombre = usuario?.nombre?.split(' ')[0];
  const activas = (solicitudes ?? []).filter((s) => !['cerrada', 'cancelada'].includes(s.estado)).length;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerRight: () => <View style={{ flexDirection: 'row', alignItems: 'center' }}><BotonAvisos /><BotonCuenta /></View> }} />
      <FlatList
        data={solicitudes ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={estilos.lista}
        refreshing={recargando}
        onRefresh={async () => { setRecargando(true); await cargar(); setRecargando(false); }}
        ListHeaderComponent={
          <View>
            <Text style={estilos.saludo}>Hola{primerNombre ? `, ${primerNombre}` : ''} 👋</Text>
            <Text style={estilos.pregunta}>¿Qué necesitas hoy?</Text>

            {/* HU-08: pedir el servicio con tus propias palabras */}
            <Pressable onPress={() => router.push('/nueva-solicitud')} accessibilityRole="button"
              style={({ pressed }) => [estilos.pedir, degradado(colores.degradadoHeroe), pressed && { transform: [{ scale: 0.98 }] }]}>
              <View style={[estilos.burbuja, { width: 150, height: 150, top: -50, right: -40 }]} />
              <View style={[estilos.burbuja, { width: 80, height: 80, bottom: -30, right: 70 }]} />
              <Text style={estilos.pedirEtiqueta}>PIDE CON TUS PALABRAS</Text>
              <Text style={estilos.pedirTitulo}>✍️  Escríbelo y lo resolvemos</Text>
              <Text style={estilos.pedirTexto}>“Se rompió una cañería…” · “Me quedé sin llaves…” · y agrega fotos</Text>
              <View style={estilos.pedirBoton}><Text style={estilos.pedirBotonTexto}>Pedir un servicio →</Text></View>
            </Pressable>

            {/* HU-01: catálogo de maestros */}
            <Pressable onPress={() => router.push('/maestros')} accessibilityRole="button"
              style={({ pressed }) => [estilos.maestros, pressed && { transform: [{ scale: 0.98 }] }]}>
              <View style={estilos.maestrosIcono}><Text style={{ fontSize: 24 }}>👷</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.maestrosTitulo}>Ver maestros disponibles</Text>
                <Text style={estilos.maestrosTexto}>
                  {maestros ? `${maestros === 1 ? '1 maestro' : `${maestros} maestros`}${usuario?.comuna ? ` en ${usuario.comuna}` : ''} · ` : ''}
                  Perfiles, reseñas y horarios
                </Text>
              </View>
              <Text style={estilos.flecha}>›</Text>
            </Pressable>

            <PendientesDeEnvio recienGuardada={guardada === '1'} />

            <View style={estilos.seccion}>
              <Text style={estilos.seccionTitulo}>Tus solicitudes</Text>
              {activas ? <Text style={estilos.contador}>{activas === 1 ? '1 en curso' : `${activas} en curso`}</Text> : null}
            </View>
            {/* Sin señal, la lista del servidor no se puede actualizar: no se muestra el error si hay pendientes */}
            {enCola.length ? null : <Aviso mensaje={error} />}
          </View>
        }
        renderItem={({ item }) => <TarjetaSolicitud solicitud={item} />}
        ListEmptyComponent={
          !solicitudes ? (error ? null : <ActivityIndicator color={colores.primario} style={{ margin: espacio.l }} />)
            : !enCola.length ? (
              <View style={estilos.vacio}>
                <Text style={{ fontSize: 34 }}>🧰</Text>
                <Text style={estilos.vacioTitulo}>Aún no tienes solicitudes</Text>
                <Text style={estilos.vacioTexto}>Cuando pidas un servicio, aquí verás cómo avanza: el maestro, el precio y el pago.</Text>
              </View>
            ) : null
        }
      />
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  lista: { padding: espacio.m, maxWidth: 720, width: '100%', alignSelf: 'center' },
  saludo: { fontSize: 15, color: colores.textoSuave, fontWeight: '600' },
  pregunta: { fontSize: 28, fontWeight: '900', color: colores.texto, marginBottom: espacio.m, letterSpacing: -0.5 },
  pedir: {
    backgroundColor: colores.primario, borderRadius: radio.l, padding: espacio.l, overflow: 'hidden',
    boxShadow: colores.sombraFuerte,
  },
  burbuja: { position: 'absolute', borderRadius: 999, backgroundColor: colores.burbujaHeroe },
  pedirEtiqueta: { color: colores.sobreHeroeSuave, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: espacio.xs },
  pedirTitulo: { color: colores.sobreHeroe, fontSize: 20, fontWeight: '800' },
  pedirTexto: { color: colores.sobreHeroeSuave, fontSize: 13, marginTop: espacio.xs, lineHeight: 19 },
  pedirBoton: {
    alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: radio.pildora,
    paddingHorizontal: espacio.m, paddingVertical: 9, marginTop: espacio.m,
  },
  pedirBotonTexto: { color: '#0B7568', fontWeight: '800', fontSize: 14 },
  maestros: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginTop: espacio.m, padding: espacio.m,
    backgroundColor: colores.superficie, borderRadius: radio.l, borderWidth: 1, borderColor: colores.bordeTarjeta,
    boxShadow: colores.sombra,
  },
  maestrosIcono: {
    width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.primarioSuave,
  },
  maestrosTitulo: { fontSize: 16, fontWeight: '800', color: colores.texto },
  maestrosTexto: { fontSize: 13, color: colores.textoSuave, marginTop: 2 },
  flecha: { fontSize: 28, color: colores.primario, fontWeight: '300' },
  seccion: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: espacio.l, marginBottom: espacio.s },
  seccionTitulo: { fontSize: 19, fontWeight: '800', color: colores.texto },
  contador: { fontSize: 13, fontWeight: '700', color: colores.primario },
  vacio: {
    alignItems: 'center', padding: espacio.l, gap: espacio.xs, borderRadius: radio.l, borderWidth: 1,
    borderStyle: 'dashed', borderColor: colores.borde,
  },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  vacioTexto: { fontSize: 14, color: colores.textoSuave, textAlign: 'center', lineHeight: 20 },
}));
