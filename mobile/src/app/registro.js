import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Casilla } from '../components/Casilla';
import { useSesion } from '../context/sesion';
import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { Aviso } from '../components/Aviso';
import { SelectorComuna } from '../components/SelectorComuna';
import { HorarioAtencion } from '../components/HorarioAtencion';
import { HORARIO_INICIAL } from '../lib/horario';
import { ES_PRO, ROL_APP } from '../lib/variante';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Lite registra clientes; Pro registra maestros, que eligen sus días y horario de trabajo
// (y luego completan su ficha).
export default function Registro() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { registrar } = useSesion();
  const [datos, setDatos] = useState({ nombre: '', apellido: '', email: '', telefono: '', comuna: '', password: '' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [horario, setHorario] = useState(HORARIO_INICIAL);
  const horarioValido = horario.dias.length > 0 && horario.hasta > horario.desde;

  const cambiar = (campo) => (valor) => setDatos((d) => ({ ...d, [campo]: valor }));

  async function enviar() {
    setError(null);
    setErrores({});
    setEnviando(true);
    try {
      // Los campos opcionales vacíos no se envían
      const cuerpo = Object.fromEntries(Object.entries(datos).filter(([, v]) => v.trim() !== ''));
      await registrar({ ...cuerpo, rol: ROL_APP, acepta_terminos: acepta, ...(ES_PRO ? { horario } : {}) });
    } catch (e) {
      setErrores(e.campos);
      setError(Object.keys(e.campos).length ? 'Revisa los campos marcados.' : e.message);
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.intro}>
          {ES_PRO
            ? 'Crea tu cuenta de maestro. Después completarás tu ficha y, si tu oficio es regulado, tu verificación.'
            : 'Crea tu cuenta para contratar maestros verificados con pago protegido.'}
        </Text>
        <Aviso mensaje={error} />
        {/* Nombre y apellido por separado: así nadie se registra sin apellido */}
        <View style={estilos.fila}>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="Nombre" value={datos.nombre} onChangeText={cambiar('nombre')} error={errores.nombre}
              autoComplete="given-name" textContentType="givenName" placeholder="Ej.: Ana" />
          </View>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="Apellido" value={datos.apellido} onChangeText={cambiar('apellido')} error={errores.apellido}
              autoComplete="family-name" textContentType="familyName" placeholder="Ej.: Pérez" />
          </View>
        </View>
        <Campo etiqueta="Correo" value={datos.email} onChangeText={cambiar('email')} error={errores.email}
          keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        <Campo etiqueta="Celular (opcional)" value={datos.telefono} onChangeText={cambiar('telefono')}
          error={errores.telefono} placeholder="9 1234 5678" keyboardType="phone-pad"
          ayuda={ES_PRO ? 'Nunca se muestra a los clientes.' : 'Nunca se muestra a los maestros.'} />
        <SelectorComuna etiqueta="Tu comuna (opcional)" valor={datos.comuna || null}
          onCambio={(c) => cambiar('comuna')(c ?? '')} opcional error={errores.comuna} />
        <Campo etiqueta="Contraseña" value={datos.password} onChangeText={cambiar('password')}
          error={errores.password} secureTextEntry autoComplete="new-password" textContentType="newPassword"
          ayuda="Mínimo 8 caracteres, con letras y números." />
        {ES_PRO ? (
          <View style={estilos.horario}>
            <Text style={estilos.horarioTitulo}>🗓️ ¿Cuándo trabajas?</Text>
            <Text style={estilos.horarioAyuda}>
              Los clientes verán tu horario y las visitas se agendarán dentro de él. Puedes cambiarlo después en tu ficha.
            </Text>
            <HorarioAtencion valor={horario} onCambio={setHorario}
              error={errores['horario.dias'] ?? errores['horario.desde'] ?? errores['horario.hasta'] ?? errores.horario} />
          </View>
        ) : null}
        <Casilla marcada={acepta} onCambio={setAcepta} error={errores.acepta_terminos}>
          Acepto los{' '}
          <Text style={estilos.enlace} onPress={() => router.push('/terminos')}>Términos de uso</Text>
          {' '}y la{' '}
          <Text style={estilos.enlace} onPress={() => router.push('/privacidad')}>Política de privacidad</Text>
          {' '}de DeliMaster.
        </Casilla>
        <Boton titulo="Crear cuenta" onPress={enviar} cargando={enviando}
          deshabilitado={!acepta || (ES_PRO && !horarioValido) || datos.nombre.trim().length < 2 || datos.apellido.trim().length < 2} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.l, maxWidth: 480, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 15, color: colores.textoSuave, marginBottom: espacio.l },
  enlace: { color: colores.primario, fontWeight: '700', textDecorationLine: 'underline' },
  fila: { flexDirection: 'row', gap: espacio.s },
  horario: {
    backgroundColor: colores.superficie, borderRadius: radio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
    padding: espacio.m, marginBottom: espacio.m, boxShadow: colores.sombra, overflow: 'hidden',
  },
  horarioTitulo: { fontSize: 16, fontWeight: '800', color: colores.texto },
  horarioAyuda: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.xs, lineHeight: 18 },
}));
