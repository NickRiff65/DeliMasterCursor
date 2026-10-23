import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { useSesion } from '../context/sesion';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { Estrellas } from '../components/Estrellas';
import { EstadoVerificacion } from '../components/EstadoVerificacion';
import { colores, crearEstilos, degradado, espacio, radio } from '../theme';
import { useTema } from '../context/tema';
import { BotonCuenta } from '../components/BotonCuenta';
import { BotonAvisos } from '../components/BotonAvisos';
import { pesos } from '../lib/formato';

// Una categoría aparece en el catálogo si no es regulada, o si su verificación está aprobada.
const esVisible = (c) => !c.requiere_verificacion || c.verificacion === 'aprobada';

// DeliMaster Pro: panel del prestador
export default function Panel() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { usuario } = useSesion();
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [porResponder, setPorResponder] = useState(0);
  const [datosPagoCompletos, setDatosPagoCompletos] = useState(true);
  const [dinero, setDinero] = useState(null);

  // Se recarga cada vez que se vuelve a esta pantalla (por ejemplo, después de editar la ficha)
  useFocusEffect(useCallback(() => {
    api.get('/prestadores/yo').then((r) => setFicha(r.ficha)).catch((e) => setError(e.message));
    api.get('/solicitudes?estado=asignada').then((r) => setPorResponder(r.solicitudes.length)).catch(() => {});
    api.get('/prestadores/yo/datos-pago').then((r) => setDatosPagoCompletos(r.datos_pago.completos)).catch(() => {});
    api.get('/prestadores/yo/dinero').then(setDinero).catch(() => {});
  }, []));

  async function cambiarDisponible(valor) {
    setGuardando(true);
    setFicha((f) => ({ ...f, disponible: valor })); // respuesta inmediata en pantalla
    try {
      const r = await api.put('/prestadores/yo', { disponible: valor });
      setFicha(r.ficha);
    } catch (e) {
      setFicha((f) => ({ ...f, disponible: !valor }));
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  const cabecera = (
    <Stack.Screen
      options={{
        headerRight: () => <View style={{ flexDirection: 'row', alignItems: 'center' }}><BotonAvisos /><BotonCuenta /></View>,
      }}
    />
  );

  if (!ficha) {
    return (
      <View style={estilos.contenido}>
        {cabecera}
        {error ? <Aviso mensaje={error} /> : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />}
      </View>
    );
  }

  const incompleta = !ficha.categorias.length || !ficha.comunas_atendidas.length;
  const visibles = ficha.categorias.filter(esVisible);
  const porVerificar = ficha.categorias.filter((c) => !esVisible(c));
  const enCatalogo = ficha.disponible && visibles.length > 0 && ficha.comunas_atendidas.length > 0;

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      {cabecera}
      {/* Portada: saludo, estado en el catálogo y reputación de un vistazo */}
      <View style={[estilos.portada, degradado(colores.degradadoHeroePro)]}>
        <View style={[estilos.burbuja, { width: 170, height: 170, top: -60, right: -50 }]} />
        <View style={[estilos.burbuja, { width: 70, height: 70, bottom: -20, right: 90 }]} />
        <Text style={estilos.portadaEtiqueta}>TU NEGOCIO HOY</Text>
        <Text style={estilos.saludo}>Hola, {usuario.nombre.split(' ')[0]} 👋</Text>
        <View style={estilos.estadoFila}>
          <View style={[estilos.estadoPunto, { backgroundColor: enCatalogo ? '#34D399' : '#FBBF24' }]} />
          <Text style={estilos.estadoTexto}>{enCatalogo ? 'Visible en el catálogo' : 'Hoy no apareces en el catálogo'}</Text>
        </View>
        <View style={estilos.metricas}>
          <View style={estilos.metrica}>
            <Text style={estilos.metricaValor}>
              {ficha.total_resenas ? `★ ${Number(ficha.calificacion_promedio).toFixed(1).replace('.', ',')}` : 'Nuevo'}
            </Text>
            <Text style={estilos.metricaNombre}>{ficha.total_resenas ? `${ficha.total_resenas} reseñas` : 'sin reseñas'}</Text>
          </View>
          <View style={estilos.metrica}>
            <Text style={estilos.metricaValor}>{ficha.trabajos_cerrados}</Text>
            <Text style={estilos.metricaNombre}>trabajos cerrados</Text>
          </View>
          <View style={estilos.metrica}>
            <Text style={estilos.metricaValor}>{porResponder}</Text>
            <Text style={estilos.metricaNombre}>por responder</Text>
          </View>
        </View>
      </View>
      <Aviso mensaje={error} />

      {/* HU-05: solicitudes que esperan respuesta */}
      <Pressable style={[estilos.tarjeta, estilos.fila, porResponder > 0 && [estilos.pendientes, degradado(colores.degradadoBoton)]]}
        onPress={() => router.push('/recibidas')} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={[estilos.tarjetaTitulo, porResponder > 0 && { color: colores.sobrePrimario }]}>
            {porResponder > 0
              ? `${porResponder} ${porResponder === 1 ? 'solicitud espera' : 'solicitudes esperan'} tu respuesta`
              : 'Solicitudes y trabajos'}
          </Text>
          <Text style={[estilos.suave, porResponder > 0 && { color: colores.primarioSuave }]}>
            {porResponder > 0 ? 'Tienes 30 minutos para responder cada una.' : 'Revisa tus trabajos aceptados.'}
          </Text>
        </View>
        <Text style={[estilos.enlace, porResponder > 0 && { color: colores.sobrePrimario }]}>Ver →</Text>
      </Pressable>

      {/* Mi dinero: lo retenido (trabajos en curso), lo liberado por transferir y lo ya recibido */}
      {dinero ? (
        <Pressable style={estilos.tarjeta} onPress={() => router.push('/finanzas')} accessibilityRole="button">
          <View style={estilos.fila}>
            <Text style={estilos.tarjetaTitulo}>💰 Mi dinero</Text>
            <Text style={estilos.enlace}>Detalle →</Text>
          </View>
          <View style={estilos.dinero}>
            <View style={estilos.dineroCifra}>
              <Text style={estilos.dineroValor}>{pesos(dinero.retenido)}</Text>
              <Text style={estilos.dineroNombre}>Retenido</Text>
            </View>
            <View style={estilos.dineroCifra}>
              <Text style={estilos.dineroValor}>{pesos(dinero.por_transferir)}</Text>
              <Text style={estilos.dineroNombre}>Por transferir</Text>
            </View>
            <View style={estilos.dineroCifra}>
              <Text style={[estilos.dineroValor, { color: colores.exitoTexto }]}>{pesos(dinero.transferido)}</Text>
              <Text style={estilos.dineroNombre}>Recibido</Text>
            </View>
          </View>
          <Text style={estilos.suave}>
            Retenido: trabajos pagados que aún no se cierran. Por transferir: ya liberado, te llega dentro de 48 horas hábiles.
          </Text>
        </Pressable>
      ) : null}

      {/* Disponibilidad: controla si aparece o no en el catálogo */}
      <View style={[estilos.tarjeta, estilos.fila]}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.tarjetaTitulo}>{ficha.disponible ? 'Disponible para trabajos' : 'No disponible'}</Text>
          <Text style={estilos.suave}>
            {enCatalogo ? 'Los clientes te ven en el catálogo.' : 'Hoy no apareces en el catálogo.'}
          </Text>
        </View>
        <Switch
          value={ficha.disponible}
          onValueChange={cambiarDisponible}
          disabled={guardando}
          trackColor={{ true: colores.primario }}
          accessibilityLabel="Disponible para trabajos"
        />
      </View>

      {incompleta ? (
        <View style={[estilos.tarjeta, estilos.alerta]}>
          <Text style={estilos.alertaTitulo}>Completa tu ficha para aparecer en el catálogo</Text>
          <Text style={estilos.alertaTexto}>Indica qué servicios ofreces y en qué comunas trabajas.</Text>
          <View style={{ marginTop: espacio.m }}>
            <Boton titulo="Completar mi ficha" onPress={() => router.push('/ficha')} />
          </View>
        </View>
      ) : null}

      {porVerificar.length ? (
        <View style={[estilos.tarjeta, estilos.alerta]}>
          <Text style={estilos.alertaTitulo}>Servicios que aún no se muestran</Text>
          {porVerificar.map((c) => (
            <Text key={c.slug} style={estilos.alertaTexto}>
              • {c.nombre}: requiere verificación {c.organismo}
              {c.verificacion === 'pendiente' ? ' (en revisión)' : ''}
            </Text>
          ))}
          <View style={{ marginTop: espacio.m }}>
            <Boton titulo="Ir a verificaciones" variante="secundario" onPress={() => router.push('/verificaciones')} />
          </View>
        </View>
      ) : null}

      {/* HU-13: sin datos bancarios, DeliMaster no puede transferirle sus pagos */}
      <Pressable style={[estilos.tarjeta, estilos.fila, !datosPagoCompletos && estilos.alerta]}
        onPress={() => router.push('/datos-pago')} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={[estilos.tarjetaTitulo, !datosPagoCompletos && { color: colores.avisoTexto }]}>💳 Datos para recibir pagos</Text>
          <Text style={[estilos.suave, !datosPagoCompletos && { color: colores.avisoTexto }]}>
            {datosPagoCompletos
              ? 'Tu cuenta para las transferencias de DeliMaster.'
              : 'Complétalos para que podamos transferirte lo que cobres.'}
          </Text>
        </View>
        <Text style={estilos.enlace}>{datosPagoCompletos ? 'Ver →' : 'Completar →'}</Text>
      </Pressable>

      {/* HU-09: acceso al panel contable */}
      <Pressable style={[estilos.tarjeta, estilos.fila]} onPress={() => router.push('/finanzas')} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={estilos.tarjetaTitulo}>💰 Mis finanzas</Text>
          <Text style={estilos.suave}>Ingresos, gastos en materiales y tu ganancia neta del mes.</Text>
        </View>
        <Text style={estilos.enlace}>Ver →</Text>
      </Pressable>

      <View style={estilos.tarjeta}>
        <Text style={estilos.tarjetaTitulo}>Mi reputación</Text>
        <View style={[estilos.fila, { marginTop: espacio.s }]}>
          <Estrellas promedio={ficha.calificacion_promedio} total={ficha.total_resenas} tamano={16} />
          <Text style={estilos.suave}>{ficha.trabajos_cerrados} trabajos cerrados</Text>
        </View>
        <Text style={[estilos.suave, { marginTop: espacio.s }]}>
          Solo los trabajos cerrados en DeliMaster suman reseñas y te suben en el catálogo.
        </Text>
      </View>

      <View style={estilos.tarjeta}>
        <View style={estilos.fila}>
          <Text style={estilos.tarjetaTitulo}>Mi ficha</Text>
          <Pressable onPress={() => router.push('/ficha')} accessibilityRole="button" hitSlop={8}>
            <Text style={estilos.enlace}>Editar</Text>
          </Pressable>
        </View>
        <Text style={estilos.etiqueta}>Servicios</Text>
        {ficha.categorias.length ? ficha.categorias.map((c) => (
          <View key={c.slug} style={[estilos.fila, { marginBottom: espacio.xs }]}>
            <Text style={estilos.texto}>{c.nombre}</Text>
            {c.requiere_verificacion ? <EstadoVerificacion estado={c.verificacion} /> : null}
          </View>
        )) : <Text style={estilos.suave}>Sin servicios</Text>}
        <Text style={estilos.etiqueta}>Comunas</Text>
        <Text style={estilos.texto}>{ficha.comunas_atendidas.join(', ') || 'Sin comunas'}</Text>
        <Text style={estilos.etiqueta}>Descripción</Text>
        <Text style={estilos.texto}>{ficha.descripcion || 'Sin descripción'}</Text>
      </View>

      <Boton titulo="Mis verificaciones" variante="secundario" onPress={() => router.push('/verificaciones')} />
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  portada: {
    backgroundColor: colores.logoPro, borderRadius: radio.l, padding: espacio.l, marginBottom: espacio.m,
    overflow: 'hidden', boxShadow: colores.sombraFuerte,
  },
  burbuja: { position: 'absolute', borderRadius: 999, backgroundColor: colores.burbujaHeroe },
  portadaEtiqueta: { color: colores.sobreHeroeSuave, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  saludo: { fontSize: 28, fontWeight: '900', color: colores.sobreHeroe, marginTop: 2, letterSpacing: -0.5 },
  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: espacio.xs },
  estadoPunto: { width: 9, height: 9, borderRadius: 5 },
  estadoTexto: { color: colores.sobreHeroeSuave, fontSize: 14, fontWeight: '600' },
  metricas: { flexDirection: 'row', gap: espacio.s, marginTop: espacio.m },
  metrica: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: radio.s, paddingVertical: 10, paddingHorizontal: espacio.s },
  metricaValor: { color: colores.sobreHeroe, fontSize: 18, fontWeight: '900' },
  metricaNombre: { color: colores.sobreHeroeSuave, fontSize: 12, marginTop: 2 },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s },
  tarjetaTitulo: { fontSize: 16, fontWeight: '800', color: colores.texto },
  suave: { fontSize: 14, color: colores.textoSuave },
  texto: { fontSize: 15, color: colores.texto },
  etiqueta: { fontSize: 13, fontWeight: '700', color: colores.textoSuave, marginTop: espacio.m, marginBottom: espacio.xs },
  enlace: { color: colores.primario, fontWeight: '700', fontSize: 15 },
  alerta: { backgroundColor: colores.avisoFondo, borderColor: colores.avisoBorde },
  pendientes: { backgroundColor: colores.primario, borderColor: 'transparent', boxShadow: colores.sombraFuerte },
  alertaTitulo: { fontSize: 15, fontWeight: '700', color: colores.avisoTexto, marginBottom: espacio.xs },
  alertaTexto: { fontSize: 14, color: colores.avisoTexto, marginTop: 2 },
  dinero: { flexDirection: 'row', gap: espacio.s, marginVertical: espacio.s },
  dineroCifra: { flex: 1, backgroundColor: colores.fondo, borderRadius: radio.s, padding: espacio.s, alignItems: 'center' },
  dineroValor: { fontSize: 16, fontWeight: '800', color: colores.texto },
  dineroNombre: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
}));
