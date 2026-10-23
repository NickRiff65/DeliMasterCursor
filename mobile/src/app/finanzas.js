import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { pesos, fechaCorta } from '../lib/formato';
import { Aviso } from '../components/Aviso';
import { EstadoSolicitud } from '../components/EstadoSolicitud';
import { colores, crearEstilos, degradado, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const claveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// HU-09: panel contable del prestador — ingresos netos, gastos y ganancia del mes
export default function Finanzas() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [fecha, setFecha] = useState(() => new Date());
  const [datos, setDatos] = useState(null);
  const [dinero, setDinero] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setDatos(null);
    try {
      setDatos(await api.get(`/prestadores/yo/finanzas?mes=${claveMes(fecha)}`));
      api.get('/prestadores/yo/dinero').then(setDinero).catch(() => {});
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [fecha]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const mover = (delta) => setFecha((f) => new Date(f.getFullYear(), f.getMonth() + delta, 1));
  const esMesActual = claveMes(fecha) === claveMes(new Date());
  const t = datos?.totales;

  return (
    <FlatList
      data={datos?.trabajos ?? []}
      keyExtractor={(x) => x.id}
      contentContainerStyle={estilos.contenido}
      ListHeaderComponent={
        <View>
          <View style={estilos.selector}>
            <Pressable onPress={() => mover(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mes anterior">
              <Text style={estilos.flecha}>‹</Text>
            </Pressable>
            <Text style={estilos.mes}>{MESES[fecha.getMonth()]} {fecha.getFullYear()}</Text>
            <Pressable onPress={() => !esMesActual && mover(1)} hitSlop={12} disabled={esMesActual}
              accessibilityRole="button" accessibilityLabel="Mes siguiente">
              <Text style={[estilos.flecha, esMesActual && { opacity: 0.25 }]}>›</Text>
            </Pressable>
          </View>

          <Aviso mensaje={error} />
          {!datos && !error ? <ActivityIndicator color={colores.primario} style={{ margin: espacio.l }} /> : null}

          {t ? (
            <>
              <View style={[estilos.principal, degradado(colores.degradadoHeroe)]}>
                <Text style={estilos.principalEtiqueta}>Ganancia neta del mes</Text>
                <Text style={estilos.principalValor}>{pesos(t.ganancia_neta)}</Text>
                <Text style={estilos.principalNota}>{t.trabajos} {t.trabajos === 1 ? 'trabajo' : 'trabajos'}</Text>
              </View>
              <View style={estilos.cifras}>
                <Cifra etiqueta="Ingresos netos" valor={pesos(t.ingreso_neto)} />
                <Cifra etiqueta="Gastos" valor={pesos(t.gastos)} />
                <Cifra etiqueta="Por cobrar" valor={pesos(t.por_cobrar)} />
              </View>
              <Text style={estilos.ayuda}>
                Ingresos netos = lo que cobraste menos la comisión de DeliMaster. «Por cobrar» son trabajos pagados que aún
                no se cierran.
              </Text>
              {/* Mi dinero: retenido, por transferir y transferencias recibidas */}
              {dinero ? (
                <View style={estilos.tarjeta}>
                  <Text style={estilos.categoria}>💰 Mi dinero</Text>
                  <View style={[estilos.fila, { marginTop: espacio.s }]}>
                    <Text style={estilos.suave}>Retenido (trabajos en curso)</Text><Text style={estilos.categoria}>{pesos(dinero.retenido)}</Text>
                  </View>
                  <View style={estilos.fila}>
                    <Text style={estilos.suave}>Por transferir (ya liberado)</Text><Text style={estilos.categoria}>{pesos(dinero.por_transferir)}</Text>
                  </View>
                  <View style={estilos.fila}>
                    <Text style={estilos.suave}>Recibido en tu cuenta</Text><Text style={estilos.ganancia}>{pesos(dinero.transferido)}</Text>
                  </View>
                  {dinero.transferencias.length ? (
                    <>
                      <Text style={[estilos.suave, { marginTop: espacio.s, fontWeight: '700' }]}>Transferencias recibidas</Text>
                      {dinero.transferencias.map((tr) => (
                        <View key={tr.comprobante} style={estilos.fila}>
                          <Text style={estilos.suave}>{fechaCorta(tr.fecha)} · N.º {tr.comprobante} · {tr.trabajos} {tr.trabajos === 1 ? 'trabajo' : 'trabajos'}</Text>
                          <Text style={estilos.categoria}>{pesos(tr.monto)}</Text>
                        </View>
                      ))}
                    </>
                  ) : <Text style={[estilos.suave, { marginTop: espacio.s }]}>Aún no recibes transferencias.</Text>}
                </View>
              ) : null}
              {datos.trabajos.length ? <Text style={estilos.subtitulo}>Trabajos</Text> : null}
            </>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={estilos.tarjeta} onPress={() => router.push(`/trabajo/${item.id}`)} accessibilityRole="button">
          <View style={estilos.fila}>
            <Text style={estilos.categoria}>{item.categoria} · {item.cliente}</Text>
            <EstadoSolicitud estado={item.estado} vista="prestador" />
          </View>
          <Text style={estilos.suave}>{fechaCorta(item.fecha)} · {item.cantidad_gastos} {item.cantidad_gastos === 1 ? 'gasto' : 'gastos'}</Text>
          <View style={[estilos.fila, { marginTop: espacio.s }]}>
            <Text style={estilos.suave}>Neto {pesos(item.ingreso_neto)} − gastos {pesos(item.gastos)}</Text>
            <Text style={estilos.ganancia}>{pesos(item.ganancia_neta)}</Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={datos ? (
        <Text style={[estilos.suave, { textAlign: 'center', marginTop: espacio.l }]}>No tienes trabajos pagados en este mes.</Text>
      ) : null}
    />
  );
}

function Cifra({ etiqueta, valor }) {
  return (
    <View style={estilos.cifra}>
      <Text style={estilos.cifraValor}>{valor}</Text>
      <Text style={estilos.cifraEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.m },
  flecha: { fontSize: 32, color: colores.primario, paddingHorizontal: espacio.m },
  mes: { fontSize: 18, fontWeight: '700', color: colores.texto, textTransform: 'capitalize' },
  principal: { backgroundColor: colores.primario, borderRadius: radio.l, padding: espacio.l, alignItems: 'center', boxShadow: colores.sombraFuerte },
  principalEtiqueta: { color: colores.sobreHeroeSuave, fontSize: 14, fontWeight: '600' },
  principalValor: { color: colores.sobreHeroe, fontSize: 38, fontWeight: '900', marginVertical: 4, letterSpacing: -1 },
  principalNota: { color: colores.sobreHeroeSuave, fontSize: 13 },
  cifras: { flexDirection: 'row', gap: espacio.s, marginTop: espacio.m },
  cifra: { flex: 1, backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.s, padding: espacio.s, borderWidth: 1, borderColor: colores.bordeTarjeta },
  cifraValor: { fontSize: 15, fontWeight: '700', color: colores.texto },
  cifraEtiqueta: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  ayuda: { fontSize: 12, color: colores.textoSuave, marginTop: espacio.s },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colores.texto, marginTop: espacio.l, marginBottom: espacio.s },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.s },
  categoria: { fontSize: 15, fontWeight: '700', color: colores.texto, flex: 1 },
  suave: { fontSize: 13, color: colores.textoSuave },
  ganancia: { fontSize: 16, fontWeight: '800', color: colores.primarioOscuro },
}));
