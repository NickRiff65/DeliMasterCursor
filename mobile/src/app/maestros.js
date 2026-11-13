import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, consulta } from '../lib/api';
import { useSesion } from '../context/sesion';
import { Chip } from '../components/Chip';
import { SelectorComuna } from '../components/SelectorComuna';
import { TarjetaPrestador } from '../components/TarjetaPrestador';
import { Aviso } from '../components/Aviso';
import { colores, crearEstilos, espacio } from '../theme';
import { useTema } from '../context/tema';

const POR_PAGINA = 20;

// Orden del catálogo: lo resuelve la API (parámetro «orden»)
const ORDENES = [
  ['reputacion', 'Reputación'],
  ['trabajos', 'Más trabajos'],
  ['resenas', 'Más reseñas'],
];

// HU-01: maestros disponibles, filtrables por servicio y comuna
export default function Maestros() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { usuario } = useSesion();
  const [categorias, setCategorias] = useState([]);
  const [comunas, setComunas] = useState([]);
  const [categoria, setCategoria] = useState(null);
  const [comuna, setComuna] = useState(usuario?.comuna ?? null);
  const [soloEnHorario, setSoloEnHorario] = useState(false);
  const [soloNuevos, setSoloNuevos] = useState(false);
  const [orden, setOrden] = useState('reputacion');
  const [prestadores, setPrestadores] = useState([]);
  const [paginacion, setPaginacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Listas para los filtros (una sola vez)
  useEffect(() => {
    Promise.all([api.get('/categorias'), api.get('/comunas')])
      .then(([c, m]) => { setCategorias(c.categorias); setComunas(m.comunas); })
      .catch((e) => setError(e.message));
  }, []);

  const cargar = useCallback(async (pagina = 1) => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.get(`/prestadores${consulta({
        categoria, comuna, orden, disponible_ahora: soloEnHorario ? true : undefined,
        nuevos: soloNuevos ? true : undefined, pagina, limite: POR_PAGINA,
      })}`);
      setPrestadores((prev) => (pagina === 1 ? res.prestadores : [...prev, ...res.prestadores]));
      setPaginacion(res.paginacion);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [categoria, comuna, orden, soloEnHorario, soloNuevos]);

  // Cada cambio de filtro recarga desde la primera página
  useEffect(() => { cargar(1); }, [cargar]);

  const hayMas = paginacion && paginacion.pagina < paginacion.paginas;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={prestadores}
        keyExtractor={(p) => p.id}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <View>
            <Text style={estilos.intro}>Revisa sus perfiles, reseñas y horarios. Elige uno y contrátalo con pago protegido.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.chips} contentContainerStyle={estilos.chipsContenido}>
              <Chip texto="Todas" activo={!categoria} onPress={() => setCategoria(null)} />
              {categorias.map((c) => (
                <Chip key={c.slug} texto={c.nombre} activo={categoria === c.slug} onPress={() => setCategoria(c.slug)} />
              ))}
            </ScrollView>

            <SelectorComuna comunas={comunas} valor={comuna} onCambio={setComuna} permitirTodas />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.chips} contentContainerStyle={estilos.chipsContenido}>
              <Chip texto="🕒 Solo en horario ahora" activo={soloEnHorario} onPress={() => setSoloEnHorario((v) => !v)} />
              <Chip texto="✨ Nuevos" activo={soloNuevos} onPress={() => setSoloNuevos((v) => !v)} />
            </ScrollView>

            <Text style={estilos.ordenEtiqueta}>Ordenar por</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.chips} contentContainerStyle={estilos.chipsContenido}>
              {ORDENES.map(([valor, texto]) => (
                <Chip key={valor} texto={texto} activo={orden === valor} onPress={() => setOrden(valor)} />
              ))}
            </ScrollView>

            {paginacion ? (
              <Text style={estilos.resultado}>
                {paginacion.total === 1 ? '1 maestro disponible' : `${paginacion.total} maestros disponibles`}
              </Text>
            ) : null}
            <Aviso mensaje={error} />
          </View>
        }
        renderItem={({ item }) => (
          <TarjetaPrestador prestador={item} onPress={() => router.push(`/prestador/${item.id}`)} />
        )}
        ListEmptyComponent={
          !cargando && !error ? (
            <View style={estilos.vacio}>
              <Text style={estilos.vacioTitulo}>No hay maestros disponibles</Text>
              <Text style={estilos.vacioTexto}>Prueba con otra comuna o categoría.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={cargando ? <ActivityIndicator color={colores.primario} style={{ margin: espacio.l }} /> : null}
        onEndReached={() => { if (hayMas && !cargando) cargar(paginacion.pagina + 1); }}
        onEndReachedThreshold={0.4}
        refreshing={false}
        onRefresh={() => cargar(1)}
      />
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  lista: { padding: espacio.m, maxWidth: 720, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 14, color: colores.textoSuave, marginBottom: espacio.xs, lineHeight: 20 },
  chips: { marginBottom: espacio.s, flexGrow: 0, marginHorizontal: -espacio.m },
  // Margen para que la sombra de los filtros no se corte en el borde de la fila
  chipsContenido: { paddingVertical: 10, paddingHorizontal: espacio.m },
  resultado: { color: colores.textoSuave, fontSize: 14, marginVertical: espacio.m },
  ordenEtiqueta: { color: colores.textoSuave, fontSize: 13, fontWeight: '700', marginTop: espacio.xs },
  vacio: { alignItems: 'center', padding: espacio.xl },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  vacioTexto: { fontSize: 15, color: colores.textoSuave, marginTop: espacio.xs },
}));
