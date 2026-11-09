import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { Chip } from '../components/Chip';
import { EstadoVerificacion } from '../components/EstadoVerificacion';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
// Fecha sin hora (AAAA-MM-DD) y días que faltan para ella
const fechaDia = (dia) => fecha(`${dia}T00:00:00`);
const diasHasta = (dia) => {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dia}T00:00:00`) - hoy) / 86_400_000);
};

// Con cuántos días de anticipación se puede renovar un certificado (igual que en el servidor)
const DIAS_RENOVACION = 15;

// Situación de un oficio regulado según la verificación más reciente (las reemplazadas por una renovación no cuentan):
//  · verificado  → aprobada y vigente: no se ofrece verificarse de nuevo
//  · por_vencer  → aprobada, vence pronto: se ofrece renovar
//  · en_revision → pendiente: se espera la revisión del equipo
//  · null        → nunca se pidió, venció o fue rechazada: se ofrece solicitar
function situacion(lista, slug) {
  const v = lista.find((x) => x.categoria === slug && !x.renovada);
  if (!v) return { estado: null };
  if (v.estado === 'pendiente') return { estado: 'en_revision', v };
  if (v.estado === 'aprobada') {
    return { estado: v.vence_en && diasHasta(v.vence_en) <= DIAS_RENOVACION ? 'por_vencer' : 'verificado', v };
  }
  return { estado: null, v };
}

// DeliMaster Pro: solicitud, seguimiento y renovación de verificaciones oficiales (HU-11, HU-17)
export default function Verificaciones() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [reguladas, setReguladas] = useState(null);
  const [lista, setLista] = useState([]);
  const [categoria, setCategoria] = useState(null);
  const [numero, setNumero] = useState('');
  const [codigo, setCodigo] = useState('');
  const [rut, setRut] = useState('');
  const [paterno, setPaterno] = useState('');
  const [materno, setMaterno] = useState('');
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cargarLista = useCallback(
    () => api.get('/prestadores/yo/verificaciones').then((r) => setLista(r.verificaciones)),
    [],
  );

  useEffect(() => {
    Promise.all([api.get('/categorias'), api.get('/prestadores/yo/verificaciones')])
      .then(([cat, v]) => {
        const r = cat.categorias.filter((c) => c.requiere_verificacion);
        setLista(v.verificaciones);
        setReguladas(r);
        // Parte en el primer oficio en que aún no está verificado
        const pendiente = r.find((c) => situacion(v.verificaciones, c.slug).estado !== 'verificado') ?? r[0];
        if (pendiente) setCategoria(pendiente.slug);
      })
      .catch((e) => setError(e.message));
  }, [cargarLista]);

  async function solicitar() {
    setError(null);
    setErrores({});
    setExito(null);
    setEnviando(true);
    try {
      const { verificacion } = await api.post('/prestadores/yo/verificaciones', {
        categoria,
        numero_registro: numero.trim(),
        ...(codigo.trim() ? { codigo_certificado: codigo.trim() } : {}),
        ...(esSec ? {
          rut: rut.trim(),
          apellido_paterno: paterno.trim(),
          ...(materno.trim() ? { apellido_materno: materno.trim() } : {}),
        } : {}),
      });
      setNumero('');
      setCodigo('');
      setExito(verificacion.estado === 'aprobada'
        ? '✅ La SEC confirmó tu registro: ya quedaste verificado.'
        : 'Solicitud enviada. Te avisaremos cuando el equipo la revise.');
      await cargarLista();
    } catch (e) {
      setErrores(e.campos);
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!reguladas) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  const seleccionada = reguladas.find((c) => c.slug === categoria);
  const esSec = seleccionada?.organismo === 'SEC';
  const { estado: estadoActual, v: actual } = situacion(lista, categoria);
  const ofrecerFormulario = !['verificado', 'en_revision'].includes(estadoActual);

  return (
    <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>Solicitar verificación</Text>
        <Text style={estilos.ayuda}>
          Los oficios regulados solo se muestran a los clientes cuando verificamos tu registro en el organismo oficial.
        </Text>

        <View style={estilos.chips}>
          {reguladas.map((c) => (
            <Chip key={c.slug} activo={categoria === c.slug} onPress={() => { setCategoria(c.slug); setExito(null); setError(null); }}
              texto={`${situacion(lista, c.slug).estado === 'verificado' ? '✓ ' : ''}${c.nombre} · ${c.organismo}`} />
          ))}
        </View>

        <Aviso mensaje={error} />
        {exito ? <Text style={estilos.exito}>{exito}</Text> : null}

        {/* Ya verificado (o en revisión) en este oficio: se dice claramente en vez de ofrecer verificarse otra vez */}
        {estadoActual === 'verificado' ? (
          <View style={estilos.yaVerificado}>
            <Text style={estilos.yaVerificadoTitulo}>✅ Ya estás verificado por la {actual.organismo} en {seleccionada?.nombre}</Text>
            <Text style={estilos.yaVerificadoTexto}>
              {actual.vence_en ? `Vigente hasta el ${fechaDia(actual.vence_en)}. ` : ''}
              Apareces en el catálogo para este servicio.{actual.vence_en ? ' Te avisaremos cuando debas renovarlo.' : ''}
            </Text>
          </View>
        ) : estadoActual === 'en_revision' ? (
          <View style={estilos.enRevision}>
            <Text style={estilos.enRevisionTitulo}>⏳ Tu solicitud para {seleccionada?.nombre} está en revisión</Text>
            <Text style={estilos.enRevisionTexto}>La enviaste el {fecha(actual.creado_en)}. Te avisaremos cuando el equipo la revise.</Text>
          </View>
        ) : estadoActual === 'por_vencer' ? (
          <Text style={estilos.motivo}>
            Tu verificación de {seleccionada?.nombre} vence el {fechaDia(actual.vence_en)}. Envía tu certificado nuevo para renovarla.
          </Text>
        ) : null}

        {ofrecerFormulario ? (
          <>
        <Campo
          etiqueta={`N.º de registro ${seleccionada?.organismo ?? ''}`}
          value={numero}
          onChangeText={setNumero}
          error={errores.numero_registro}
          placeholder={seleccionada?.organismo === 'SEC' ? 'Ej.: número de licencia SEC' : 'Número de registro'}
          autoCapitalize="characters"
          ayuda={seleccionada?.organismo === 'CONAF'
            ? 'Lo revisamos en CONAF: plan de manejo o permiso de corta.'
            : seleccionada?.organismo === 'SAG'
              ? 'Lo revisamos en el registro de aplicadores del SAG.'
              : 'Lo revisamos en el buscador público del organismo.'}
        />
        {esSec ? (
          <Campo
            etiqueta="Código del certificado SEC"
            value={codigo}
            onChangeText={setCodigo}
            error={errores.codigo_certificado}
            placeholder="Ej.: 7731-2209-5512"
            autoCapitalize="characters"
            ayuda="Descarga tu certificado de instalador autorizado en sec.cl con tu ClaveÚnica: el código está bajo el QR. Vence a los 3 meses y te pediremos renovarlo."
          />
        ) : null}
        {esSec ? (
          <>
            <Campo etiqueta="RUT" value={rut} onChangeText={setRut} error={errores.rut} placeholder="Ej.: 12.345.678-5" autoCapitalize="characters" />
            <Campo etiqueta="Apellido paterno" value={paterno} onChangeText={setPaterno} error={errores.apellido_paterno} autoCapitalize="words" />
            <Campo etiqueta="Apellido materno" value={materno} onChangeText={setMaterno} error={errores.apellido_materno} autoCapitalize="words" />
            <Text style={estilos.ayuda}>
              Al enviar, autorizas a DeliMaster a consultar tu RUT y tus apellidos en el registro público de la SEC. Si coinciden, quedas verificado de inmediato.
            </Text>
          </>
        ) : null}
        <Boton titulo={estadoActual === 'por_vencer' ? 'Renovar verificación' : 'Enviar solicitud'} onPress={solicitar} cargando={enviando}
          deshabilitado={!numero.trim() || (esSec && (!codigo.trim() || !rut.trim() || !paterno.trim()))} />
          </>
        ) : null}
      </View>

      <Text style={estilos.subtitulo}>Mis solicitudes</Text>
      {lista.length ? lista.map((v) => (
        <View key={v.id} style={estilos.tarjeta}>
          <View style={estilos.fila}>
            <Text style={estilos.nombre}>{v.categoria_nombre} · {v.organismo}</Text>
            <EstadoVerificacion estado={v.estado} />
          </View>
          <Text style={estilos.suave}>N.º {v.numero_registro} · enviada el {fecha(v.creado_en)}</Text>
          {v.renovada ? <Text style={estilos.suave}>Reemplazada por una renovación más reciente</Text> : null}
          {v.estado === 'aprobada' && v.vence_en && !v.renovada ? (
            <Text style={[estilos.suave, diasHasta(v.vence_en) <= 15 && estilos.motivo]}>
              {diasHasta(v.vence_en) <= 15
                ? (v.organismo === 'SEC'
                  ? `Tu certificado vence el ${fechaDia(v.vence_en)}: descarga uno nuevo en sec.cl y envíalo arriba para seguir apareciendo en el catálogo.`
                  : `Tu verificación vence el ${fechaDia(v.vence_en)}. Envía el documento nuevo arriba para seguir en el catálogo.`)
                : `Vigente hasta el ${fechaDia(v.vence_en)}`}
            </Text>
          ) : null}
          {v.estado === 'vencida' && !v.renovada ? (
            <Text style={estilos.motivo}>
              Venció el {fechaDia(v.vence_en)}. Mientras no la renueves, no apareces en el catálogo para este servicio.
            </Text>
          ) : null}
          {v.estado === 'rechazada' && v.observacion ? (
            <Text style={estilos.motivo}>Motivo: {v.observacion}</Text>
          ) : null}
        </View>
      )) : <Text style={estilos.suave}>Aún no has enviado solicitudes.</Text>}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colores.texto, marginVertical: espacio.s },
  ayuda: { fontSize: 14, color: colores.textoSuave, marginTop: espacio.xs, marginBottom: espacio.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.s },
  nombre: { fontSize: 15, fontWeight: '700', color: colores.texto, flex: 1 },
  suave: { fontSize: 14, color: colores.textoSuave, marginTop: espacio.xs },
  motivo: { fontSize: 14, color: colores.error, marginTop: espacio.s },
  exito: { color: colores.verificado, fontSize: 14, marginBottom: espacio.m, fontWeight: '600' },
  yaVerificado: {
    backgroundColor: colores.exitoSuave, borderRadius: radio.s, padding: espacio.m, borderWidth: 1, borderColor: colores.exitoBorde,
  },
  yaVerificadoTitulo: { fontSize: 15, fontWeight: '800', color: colores.verificado },
  yaVerificadoTexto: { fontSize: 14, color: colores.texto, marginTop: espacio.xs, lineHeight: 20 },
  enRevision: { backgroundColor: colores.infoFondo, borderRadius: radio.s, padding: espacio.m },
  enRevisionTitulo: { fontSize: 15, fontWeight: '800', color: colores.infoTexto },
  enRevisionTexto: { fontSize: 14, color: colores.infoTexto, marginTop: espacio.xs },
}));
