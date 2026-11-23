import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { useSesion } from '../context/sesion';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { BotonCuenta } from '../components/BotonCuenta';
import { BotonAvisos } from '../components/BotonAvisos';
import { EstadoSolicitud } from '../components/EstadoSolicitud';
import { ProgresoSolicitud } from '../components/ProgresoSolicitud';
import { colores, crearEstilos, degradado, espacio, letra, radio } from '../theme';
import { useTema } from '../context/tema';
import { diaYHora, pesos } from '../lib/formato';

// Una categoría aparece en el catálogo si no es regulada, o si su verificación está aprobada.
const esVisible = (c) => !c.requiere_verificacion || c.verificacion === 'aprobada';

// Trabajo en curso: primero lo que espera una acción del maestro, después lo que espera al cliente.
// Las solicitudes por responder tienen su propia tarjeta.
const PRIORIDAD_EN_CURSO = ['visita_pagada', 'en_diagnostico', 'pagada', 'en_disputa', 'finalizada', 'cotizada', 'confirmada', 'visita_por_pagar'];
const QUE_SIGUE = {
  visita_por_pagar: () => 'Esperando que el cliente pague la visita',
  visita_pagada: (s) => `Visita: ${diaYHora(s.visita_programada_en)}. Al llegar, pide el código al cliente`,
  en_diagnostico: () => 'Envía la cotización del trabajo',
  cotizada: () => 'Esperando que el cliente responda la cotización',
  confirmada: () => 'Esperando el pago del cliente',
  pagada: (s) => (s.modalidad !== 'visita' && s.visita_programada_en
    ? `Trabajo agendado: ${diaYHora(s.visita_programada_en)}` : 'Haz el trabajo y márcalo como terminado'),
  finalizada: () => 'Esperando que el cliente confirme el cierre',
  en_disputa: () => 'El cliente reportó un problema: el equipo está revisando',
};

function trabajosEnCurso(solicitudes) {
  return solicitudes
    .filter((s) => PRIORIDAD_EN_CURSO.includes(s.estado))
    .sort((a, b) => PRIORIDAD_EN_CURSO.indexOf(a.estado) - PRIORIDAD_EN_CURSO.indexOf(b.estado)
      || new Date(a.visita_programada_en ?? a.creado_en) - new Date(b.visita_programada_en ?? b.creado_en));
}

// DeliMaster Pro · Inicio: lo que el maestro necesita al abrir la app. Lo que se configura una vez
// (ficha, portafolio, verificaciones, cuenta) está en Perfil, y aquí solo aparece si falta algo.
export default function Panel() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { usuario } = useSesion();
  const [ficha, setFicha] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [porResponder, setPorResponder] = useState(0);
  const [enCurso, setEnCurso] = useState([]);
  const [datosPagoCompletos, setDatosPagoCompletos] = useState(true);
  const [dinero, setDinero] = useState(null);

  // Se recarga cada vez que se vuelve a esta pantalla (por ejemplo, después de editar la ficha)
  useFocusEffect(useCallback(() => {
    api.get('/prestadores/yo').then((r) => setFicha(r.ficha)).catch((e) => setError(e.message));
    api.get('/solicitudes?estado=asignada').then((r) => setPorResponder(r.solicitudes.length)).catch(() => {});
    api.get('/solicitudes').then((r) => setEnCurso(trabajosEnCurso(r.solicitudes))).catch(() => {});
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
      {/* Portada: saludo y si el maestro está visible en el catálogo */}
      <View style={[estilos.portada, degradado(colores.degradadoHeroePro)]}>
        <Text style={estilos.portadaEtiqueta}>TU NEGOCIO HOY</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={estilos.saludo}>Hola, {usuario.nombre.split(' ')[0]}</Text>
          <Image source={require('../../assets/iconos/app/mano.png')} tintColor={colores.sobreHeroe}
            accessibilityIgnoresInvertColors style={{ width: letra(40), height: letra(40) }} />
        </View>
        <View style={estilos.estadoFila}>
          <View style={[estilos.estadoPunto, { backgroundColor: enCatalogo ? '#34D399' : '#FBBF24' }]} />
          <Text style={estilos.estadoTexto}>{enCatalogo ? 'Visible en el catálogo' : 'Hoy no apareces en el catálogo'}</Text>
        </View>
      </View>
      <Aviso mensaje={error} />

      {/* El trabajo en curso, con lo que sigue (como «Sigue tu solicitud» de los clientes) */}
      {enCurso.length ? (
        <Pressable onPress={() => router.push(`/trabajo/${enCurso[0].id}`)} accessibilityRole="button"
          style={({ pressed }) => [estilos.enCurso, pressed && { transform: [{ scale: 0.98 }] }]}>
          <Text style={estilos.enCursoEtiqueta}>TRABAJO EN CURSO</Text>
          <Text style={estilos.enCursoTitulo}>{enCurso[0].categoria_nombre}</Text>
          <Text style={estilos.suave}>Cliente: {enCurso[0].cliente?.nombre}</Text>
          <View style={{ alignSelf: 'flex-start', marginTop: espacio.xs }}>
            <EstadoSolicitud estado={enCurso[0].estado} vista="prestador" />
          </View>
          <ProgresoSolicitud estado={enCurso[0].estado} />
          <Text style={estilos.enCursoQueSigue}>{QUE_SIGUE[enCurso[0].estado](enCurso[0])}</Text>
          <Text style={estilos.enCursoAccion}>
            Ver el trabajo →{enCurso.length > 1 ? `  ·  y ${enCurso.length - 1} más en Trabajos` : ''}
          </Text>
        </Pressable>
      ) : null}

      {/* Lo principal: solicitudes que esperan respuesta (HU-05) */}
      <Pressable style={[estilos.tarjeta, estilos.fila, porResponder > 0 && [estilos.pendientes, degradado(colores.degradadoBoton)]]}
        onPress={() => router.push('/recibidas')} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={[estilos.tarjetaTitulo, porResponder > 0 && { color: colores.sobrePrimario }]}>
            {porResponder > 0
              ? `${porResponder} ${porResponder === 1 ? 'solicitud espera' : 'solicitudes esperan'} tu respuesta`
              : 'Sin solicitudes por responder'}
          </Text>
          <Text style={[estilos.suave, porResponder > 0 && { color: colores.primarioSuave }]}>
            {porResponder > 0 ? 'Tienes 1 día para responder cada una.' : 'Revisa tus trabajos en Trabajos.'}
          </Text>
        </View>
        <Text style={[estilos.enlace, porResponder > 0 && { color: colores.sobrePrimario }]}>Ver →</Text>
      </Pressable>

      {/* Dinero de un vistazo: el detalle está en la sección Dinero */}
      {dinero ? (
        <Pressable style={[estilos.tarjeta, estilos.fila]} onPress={() => router.push('/finanzas')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image source={require('../../assets/iconos/app/dinero.png')} tintColor={colores.texto}
                accessibilityIgnoresInvertColors style={{ width: 20, height: 20 }} />
              <Text style={estilos.tarjetaTitulo}>Mi dinero</Text>
            </View>
            <Text style={estilos.suave}>Por transferir {pesos(dinero.por_transferir)} · Retenido {pesos(dinero.retenido)}</Text>
          </View>
          <Text style={estilos.enlace}>Ver →</Text>
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

      {/* Avisos: solo aparecen si falta algo */}
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
      {!datosPagoCompletos ? (
        <Pressable style={[estilos.tarjeta, estilos.fila, estilos.alerta]} onPress={() => router.push('/datos-pago')} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={[estilos.tarjetaTitulo, { color: colores.avisoTexto }]}>Falta tu cuenta para recibir pagos</Text>
            <Text style={[estilos.suave, { color: colores.avisoTexto }]}>Complétala para que podamos transferirte lo que cobres.</Text>
          </View>
          <Text style={estilos.enlace}>Completar →</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  portada: {
    backgroundColor: colores.logoPro, borderRadius: radio.l, padding: espacio.l, marginBottom: espacio.m,
    overflow: 'hidden', boxShadow: colores.sombraFuerte,
  },
  portadaEtiqueta: { color: colores.sobreHeroeSuave, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  saludo: { fontSize: 28, fontWeight: '900', color: colores.sobreHeroe, marginTop: 2, letterSpacing: -0.5 },
  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: espacio.xs },
  estadoPunto: { width: 9, height: 9, borderRadius: 5 },
  estadoTexto: { color: colores.sobreHeroeSuave, fontSize: 14, fontWeight: '600' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s },
  tarjetaTitulo: { fontSize: 16, fontWeight: '800', color: colores.texto },
  suave: { fontSize: 14, color: colores.textoSuave },
  enlace: { color: colores.primario, fontWeight: '700', fontSize: 15 },
  alerta: { backgroundColor: colores.avisoFondo, borderColor: colores.avisoBorde },
  pendientes: { backgroundColor: colores.primario, borderColor: 'transparent', boxShadow: colores.sombraFuerte },
  alertaTitulo: { fontSize: 15, fontWeight: '700', color: colores.avisoTexto, marginBottom: espacio.xs },
  alertaTexto: { fontSize: 14, color: colores.avisoTexto, marginTop: 2 },
  enCurso: {
    backgroundColor: colores.superficie, borderRadius: radio.l, padding: espacio.l, marginBottom: espacio.m,
    borderWidth: 1, borderColor: colores.bordeTarjeta, borderLeftWidth: 5, borderLeftColor: colores.primario,
    boxShadow: colores.sombra, gap: 2,
  },
  enCursoEtiqueta: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: colores.primarioOscuro },
  enCursoTitulo: { fontSize: 22, fontWeight: '900', color: colores.texto, letterSpacing: -0.4, marginTop: 2 },
  enCursoQueSigue: { fontSize: 15, fontWeight: '700', color: colores.texto, marginTop: espacio.s },
  enCursoAccion: { fontSize: 15, fontWeight: '800', color: colores.primarioOscuro, marginTop: espacio.m },
}));
