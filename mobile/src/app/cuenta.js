import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { guardarTarjeta } from '../lib/pago';
import { ES_PRO } from '../lib/variante';
import { api } from '../lib/api';
import { useSesion } from '../context/sesion';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { Casilla } from '../components/Casilla';
import { SelectorComuna } from '../components/SelectorComuna';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Mi cuenta (ambas apps): datos personales, apariencia, cambio de contraseña, documentos legales, cierre de
// sesión y eliminación de la cuenta
export default function Cuenta() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { usuario, actualizarUsuario, abrirSesion, cerrarSesion } = useSesion();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <MisDatos usuario={usuario} alGuardar={actualizarUsuario} />
        <Apariencia />
        {ES_PRO ? null : <TarjetaGuardada />}
        <CambiarPassword alCambiar={abrirSesion} />

        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>Documentos</Text>
          <Enlace texto="Términos de uso" onPress={() => router.push('/terminos')} />
          <Enlace texto="Política de privacidad" onPress={() => router.push('/privacidad')} />
        </View>

        <Boton titulo="Cerrar sesión" variante="secundario" onPress={cerrarSesion} />
        <EliminarCuenta alTerminar={cerrarSesion} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Modo claro u oscuro: el cambio se ve de inmediato y queda guardado en este dispositivo
const OPCIONES_TEMA = [
  ['sistema', 'Automático', '📱'],
  ['claro', 'Claro', '☀️'],
  ['oscuro', 'Oscuro', '🌙'],
];

function Apariencia() {
  const { preferencia, cambiarPreferencia } = useTema();
  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>Apariencia</Text>
      <View style={estilos.opcionesTema} accessibilityRole="radiogroup">
        {OPCIONES_TEMA.map(([valor, nombre, icono]) => {
          const elegida = preferencia === valor;
          return (
            <Pressable key={valor} onPress={() => cambiarPreferencia(valor)} accessibilityRole="radio"
              accessibilityState={{ checked: elegida }} accessibilityLabel={`Modo ${nombre.toLowerCase()}`}
              style={[estilos.opcionTema, elegida && estilos.opcionTemaElegida]}>
              <Text style={estilos.opcionIcono}>{icono}</Text>
              <Text style={[estilos.opcionTexto, elegida && estilos.opcionTextoElegida]}>{nombre}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={estilos.ayudaTema}>
        {preferencia === 'sistema'
          ? 'Cambia sola según el modo claro u oscuro de tu teléfono.'
          : 'Queda guardado en este dispositivo.'}
      </Text>
    </View>
  );
}

// Lite: la tarjeta guardada para pagar sin volver a ingresarla (Webpay Oneclick)
function TarjetaGuardada() {
  const { pago } = useLocalSearchParams();   // al volver de Transbank (versión web)
  const [tarjeta, setTarjeta] = useState(undefined);
  const [accion, setAccion] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [mensaje, setMensaje] = useState(pago === 'tarjeta_guardada' ? '✔ Tu tarjeta quedó guardada.' : null);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    api.get('/pagos/tarjeta').then((r) => setTarjeta(r.tarjeta)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function cambiar() {
    setError(null);
    setMensaje(null);
    setAccion('guardar');
    try {
      const r = await guardarTarjeta();   // en web la página se va a Transbank y vuelve aquí
      if (r === 'tarjeta_guardada') setMensaje('✔ Tu tarjeta quedó guardada.');
      if (r) cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setAccion(null);
    }
  }

  async function quitar() {
    setError(null);
    setAccion('quitar');
    try {
      setTarjeta((await api.delete('/pagos/tarjeta')).tarjeta);
      setMensaje('Quitamos tu tarjeta guardada.');
      setConfirmar(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setAccion(null);
    }
  }

  if (tarjeta === undefined) return error ? <Aviso mensaje={error} /> : null;
  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>💳 Tarjeta guardada</Text>
      {mensaje ? <Text style={estilos.ok}>{mensaje}</Text> : null}
      <Aviso mensaje={error} />
      {tarjeta ? (
        <Text style={estilos.ayudaTema}>
          <Text style={{ fontWeight: '700', color: colores.texto }}>{tarjeta.tipo ?? 'Tarjeta'} •••• {tarjeta.ultimos4}</Text>
          {'  '}· la usas para pagar con un toque. Transbank la guarda; DeliMaster solo ve los últimos 4 dígitos.
        </Text>
      ) : (
        <Text style={estilos.ayudaTema}>
          No tienes una tarjeta guardada. Guárdala para pagar el saldo y tus próximos trabajos sin volver a ingresarla
          (Transbank hace un pequeño cobro de validación que se devuelve).
        </Text>
      )}
      <View style={{ gap: espacio.s, marginTop: espacio.s }}>
        <Boton titulo={tarjeta ? 'Cambiar tarjeta' : 'Guardar una tarjeta'} variante={tarjeta ? 'secundario' : 'primario'}
          onPress={cambiar} cargando={accion === 'guardar'} deshabilitado={Boolean(accion)} />
        {tarjeta ? (
          confirmar ? (
            <>
              <Text style={estilos.ayudaTema}>¿Quitar la tarjeta •••• {tarjeta.ultimos4}? En el próximo pago tendrás que ingresarla en Webpay.</Text>
              <Boton titulo="Sí, quitar la tarjeta" variante="secundario" onPress={quitar} cargando={accion === 'quitar'} />
              <Boton titulo="Volver" variante="secundario" onPress={() => setConfirmar(false)} />
            </>
          ) : <Boton titulo="Quitar tarjeta" variante="secundario" onPress={() => setConfirmar(true)} deshabilitado={Boolean(accion)} />
        ) : null}
      </View>
    </View>
  );
}

// Ley N.º 21.719 (derecho de supresión): eliminar la cuenta. Se borran los datos personales; los pagos,
// el libro contable, los mensajes y las fotos de los trabajos se conservan sin el nombre.
function EliminarCuenta({ alTerminar }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState(null);         // { puede_eliminar, motivo }
  const [password, setPassword] = useState('');
  const [entiende, setEntiende] = useState(false);
  const [error, setError] = useState(null);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [eliminada, setEliminada] = useState(false);

  async function abrir() {
    setAbierto(true);
    setError(null);
    try {
      setEstado(await api.get('/auth/yo/eliminar'));
    } catch (e) {
      setError(e.message);
    }
  }

  async function eliminar() {
    setEnviando(true);
    setError(null);
    setErrores({});
    try {
      await api.post('/auth/yo/eliminar', { password });
      setEliminada(true);
    } catch (e) {
      setErrores(e.campos ?? {});
      if (!e.campos?.password) setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <Text style={estilos.enlacePeligro} onPress={abrir} accessibilityRole="button">Eliminar mi cuenta</Text>
    );
  }
  if (eliminada) {
    return (
      <View style={[estilos.tarjeta, { marginTop: espacio.m }]}>
        <Text style={estilos.titulo}>Eliminamos tu cuenta</Text>
        <Text style={estilos.ayudaTema}>Borramos tus datos personales. Gracias por haber usado DeliMaster.</Text>
        <View style={{ marginTop: espacio.m }}><Boton titulo="Entendido" onPress={alTerminar} /></View>
      </View>
    );
  }
  return (
    <View style={[estilos.tarjeta, estilos.tarjetaPeligro]}>
      <Text style={estilos.titulo}>Eliminar mi cuenta</Text>
      {!estado ? (error ? <Aviso mensaje={error} /> : <ActivityIndicator color={colores.primario} />) : !estado.puede_eliminar ? (
        <View style={{ gap: espacio.s }}>
          <Aviso mensaje={estado.motivo} />
          <Boton titulo="Volver" variante="secundario" onPress={() => setAbierto(false)} />
        </View>
      ) : (
        <View style={{ gap: espacio.xs }}>
          <Text style={estilos.punto}>
            • Se borran tu nombre, correo, celular y comuna{ES_PRO ? ', tu ficha y tus datos bancarios' : ' y tu tarjeta guardada'}.
          </Text>
          <Text style={estilos.punto}>• No podrás volver a entrar con esta cuenta (más adelante puedes crear otra con el mismo correo).</Text>
          <Text style={estilos.punto}>
            • Se conservan, sin tu nombre, los pagos, el libro contable, los mensajes y las fotos de tus trabajos: lo exige la ley
            y sirven de respaldo si hay un reclamo.
          </Text>
          <View style={{ marginTop: espacio.s }}>
            <Campo etiqueta="Tu contraseña" value={password} onChangeText={setPassword} error={errores.password}
              secureTextEntry autoComplete="current-password" textContentType="password" />
          </View>
          <Casilla marcada={entiende} onCambio={setEntiende}>Entiendo que esto no se puede deshacer.</Casilla>
          <Aviso mensaje={error} />
          <Boton titulo="Eliminar mi cuenta definitivamente" variante="peligro" onPress={eliminar} cargando={enviando}
            deshabilitado={!password || !entiende} />
          <View style={{ marginTop: espacio.xs }}>
            <Boton titulo="Volver" variante="secundario" onPress={() => setAbierto(false)} />
          </View>
        </View>
      )}
    </View>
  );
}

function Enlace({ texto, onPress }) {
  return (
    <Pressable onPress={onPress} style={estilos.enlaceFila} accessibilityRole="link">
      <Text style={estilos.enlace}>{texto}</Text>
      <Text style={estilos.enlace}>→</Text>
    </Pressable>
  );
}

function MisDatos({ usuario, alGuardar }) {
  // Las cuentas antiguas solo tienen el nombre completo: el servidor ya lo separa en nombres y apellidos
  const inicial = (u) => ({
    nombre: u.nombres ?? u.nombre, apellido: u.apellidos ?? '', telefono: u.telefono ?? '', comuna: u.comuna ?? '',
  });
  const [datos, setDatos] = useState(inicial(usuario));
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (valor) => { setDatos((d) => ({ ...d, [campo]: valor })); setExito(null); };

  async function guardar() {
    setGuardando(true);
    setError(null);
    setErrores({});
    try {
      const cuerpo = { nombre: datos.nombre.trim(), apellido: datos.apellido.trim(), telefono: datos.telefono.trim() };
      if (datos.comuna.trim()) cuerpo.comuna = datos.comuna.trim();
      const { usuario: u } = await api.put('/auth/yo', cuerpo);
      alGuardar(u);
      setDatos(inicial(u));
      setExito('Datos guardados.');
    } catch (e) {
      setErrores(e.campos ?? {});
      setError(Object.keys(e.campos ?? {}).length ? 'Revisa los campos marcados.' : e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>Mis datos</Text>
      <Aviso mensaje={error} />
      {exito ? <Text style={estilos.exito}>{exito}</Text> : null}
      <View style={estilos.filaNombre}>
        <View style={{ flex: 1 }}>
          <Campo etiqueta="Nombre" value={datos.nombre} onChangeText={cambiar('nombre')} error={errores.nombre} autoComplete="given-name" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo etiqueta="Apellido" value={datos.apellido} onChangeText={cambiar('apellido')} error={errores.apellido} autoComplete="family-name" />
        </View>
      </View>
      <Text style={estilos.etiqueta}>Correo</Text>
      <Text style={estilos.fijo}>{usuario.email}</Text>
      <Campo etiqueta="Celular (opcional)" value={datos.telefono} onChangeText={cambiar('telefono')} error={errores.telefono}
        placeholder="9 1234 5678" keyboardType="phone-pad" ayuda="Nunca se muestra a la otra parte. Déjalo vacío para quitarlo." />
      <SelectorComuna etiqueta="Comuna" valor={datos.comuna || null} onCambio={(c) => cambiar('comuna')(c ?? '')}
        error={errores.comuna} />
      <Boton titulo="Guardar datos" onPress={guardar} cargando={guardando}
        deshabilitado={datos.nombre.trim().length < 2 || datos.apellido.trim().length < 2} />
    </View>
  );
}

function CambiarPassword({ alCambiar }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cambiar() {
    setError(null);
    setErrores({});
    setExito(null);
    if (nueva !== repetir) {
      setErrores({ repetir: 'Las contraseñas no coinciden' });
      return;
    }
    setGuardando(true);
    try {
      // La API cierra las demás sesiones y entrega un token nuevo para seguir en esta
      await alCambiar(await api.put('/auth/password', { actual, nueva }));
      setActual(''); setNueva(''); setRepetir('');
      setExito('Contraseña cambiada. Se cerraron tus sesiones en otros dispositivos.');
    } catch (e) {
      setErrores(e.campos ?? {});
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>Cambiar contraseña</Text>
      <Aviso mensaje={error} />
      {exito ? <Text style={estilos.exito}>{exito}</Text> : null}
      <Campo etiqueta="Contraseña actual" value={actual} onChangeText={setActual} error={errores.actual}
        secureTextEntry autoComplete="current-password" textContentType="password" />
      <Campo etiqueta="Nueva contraseña" value={nueva} onChangeText={setNueva} error={errores.nueva}
        secureTextEntry autoComplete="new-password" textContentType="newPassword" ayuda="Mínimo 8 caracteres, con letras y números." />
      <Campo etiqueta="Repite la nueva contraseña" value={repetir} onChangeText={setRepetir} error={errores.repetir}
        secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Boton titulo="Cambiar contraseña" onPress={cambiar} cargando={guardando} deshabilitado={!actual || !nueva || !repetir} />
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto, marginBottom: espacio.m },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto, marginBottom: espacio.xs },
  fijo: { fontSize: 16, color: colores.textoSuave, marginBottom: espacio.m },
  exito: { color: colores.verificado, fontSize: 14, fontWeight: '600', marginBottom: espacio.m },
  enlaceFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espacio.s },
  enlace: { color: colores.primario, fontWeight: '700', fontSize: 15 },
  opcionesTema: { flexDirection: 'row', gap: espacio.s },
  opcionTema: {
    flex: 1, alignItems: 'center', gap: espacio.xs, paddingVertical: espacio.m, borderRadius: radio.m,
    borderWidth: 1.5, borderColor: colores.borde, backgroundColor: colores.fondo,
  },
  opcionTemaElegida: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  opcionIcono: { fontSize: 22, color: colores.texto },
  opcionTexto: { fontSize: 14, fontWeight: '600', color: colores.texto },
  opcionTextoElegida: { color: colores.primarioOscuro },
  ayudaTema: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.s },
  ok: { color: colores.exitoTexto, fontWeight: '700', fontSize: 14, marginBottom: espacio.xs },
  enlacePeligro: { color: colores.error, fontWeight: '700', fontSize: 14, textAlign: 'center', paddingVertical: espacio.m },
  tarjetaPeligro: { marginTop: espacio.m, borderColor: colores.errorBorde },
  punto: { fontSize: 14, color: colores.texto, lineHeight: 20 },
  filaNombre: { flexDirection: 'row', gap: espacio.s },
}));
