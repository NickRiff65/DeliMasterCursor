import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { api } from '../lib/api';
import { useSesion } from '../context/sesion';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { colores, crearEstilos, espacio } from '../theme';
import { useTema } from '../context/tema';

// Recuperar la contraseña en dos pasos: 1) pedir un código al correo · 2) crear una nueva con él
export default function Recuperar() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { abrirSesion } = useSesion();
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function pedirCodigo() {
    setEnviando(true);
    setError(null);
    setErrores({});
    try {
      const r = await api.post('/auth/recuperar', { email: email.trim() });
      setAviso(r.mensaje);
      setPaso(2);
    } catch (e) {
      setErrores(e.campos ?? {});
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function crearNueva() {
    setError(null);
    setErrores({});
    if (nueva !== repetir) {
      setErrores({ repetir: 'Las contraseñas no coinciden' });
      return;
    }
    setEnviando(true);
    try {
      // Si el código es correcto, la API cambia la contraseña e inicia la sesión
      await abrirSesion(await api.post('/auth/restablecer', { email: email.trim(), codigo: codigo.trim(), nueva }));
    } catch (e) {
      setErrores(e.campos ?? {});
      setError(e.message);
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {paso === 1 ? (
          <>
            <Text style={estilos.intro}>Escribe el correo de tu cuenta y te enviaremos un código de 6 dígitos para crear una nueva contraseña.</Text>
            <Aviso mensaje={error} />
            <Campo etiqueta="Correo" value={email} onChangeText={setEmail} error={errores.email}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
            <Boton titulo="Enviar código" onPress={pedirCodigo} cargando={enviando} deshabilitado={!email.trim()} />
          </>
        ) : (
          <>
            {aviso ? <Text style={estilos.exito}>{aviso}</Text> : null}
            <Text style={estilos.intro}>Revisa tu correo (también la carpeta de spam). El código vence en 15 minutos.</Text>
            <Aviso mensaje={error} />
            <Campo etiqueta="Código" value={codigo} onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
              error={errores.codigo} keyboardType="number-pad" placeholder="123456" autoComplete="one-time-code" textContentType="oneTimeCode" />
            <Campo etiqueta="Nueva contraseña" value={nueva} onChangeText={setNueva} error={errores.nueva}
              secureTextEntry autoComplete="new-password" textContentType="newPassword" ayuda="Mínimo 8 caracteres, con letras y números." />
            <Campo etiqueta="Repite la nueva contraseña" value={repetir} onChangeText={setRepetir} error={errores.repetir}
              secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <Boton titulo="Guardar y entrar" onPress={crearNueva} cargando={enviando}
              deshabilitado={codigo.length !== 6 || !nueva || !repetir} />
            <Text style={estilos.enlace} onPress={() => { setPaso(1); setCodigo(''); setError(null); }}>
              ¿No te llegó? Pide otro código
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.l, maxWidth: 480, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 15, lineHeight: 22, color: colores.textoSuave, marginBottom: espacio.l },
  exito: { fontSize: 14, color: colores.verificado, fontWeight: '600', marginBottom: espacio.s },
  enlace: { color: colores.primario, fontWeight: '700', textAlign: 'center', marginTop: espacio.l },
}));
