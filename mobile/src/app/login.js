import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useSesion } from '../context/sesion';
import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { Aviso } from '../components/Aviso';
import { ES_PRO, NOMBRE_APP } from '../lib/variante';
import { colores, crearEstilos, degradado, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

export default function Login() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { iniciarSesion } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function enviar() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y tu contraseña.');
      return;
    }
    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), password);
      // Al abrirse la sesión, la navegación muestra el catálogo automáticamente.
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colores.primario }, degradado(ES_PRO ? colores.degradadoHeroePro : colores.degradadoHeroe)]}>
      {/* Burbujas decorativas del fondo */}
      <View style={[estilos.burbuja, { width: 260, height: 260, top: -80, right: -90 }]} />
      <View style={[estilos.burbuja, { width: 180, height: 180, bottom: 60, left: -70 }]} />
      <View style={[estilos.burbuja, { width: 90, height: 90, top: 140, left: 30 }]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <View style={estilos.logo}>
              <Text style={[estilos.logoTexto, ES_PRO && { color: colores.logoPro }]}>D</Text>
              <View style={estilos.logoPunto} />
            </View>
            <Text style={estilos.titulo}>{NOMBRE_APP}</Text>
            <Text style={estilos.subtitulo}>
              {ES_PRO
                ? 'Más clientes, cobro asegurado y tus finanzas en orden'
                : 'Maestros y trabajos de campo verificados en Chillán'}
            </Text>
          </View>

          <View style={estilos.tarjeta}>
            <Text style={estilos.bienvenida}>Te damos la bienvenida 👋</Text>
            <Aviso mensaje={error} />
            <Campo
              etiqueta="Correo"
              value={email}
              onChangeText={setEmail}
              placeholder="tucorreo@ejemplo.cl"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Campo
              etiqueta="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="Tu contraseña"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={enviar}
            />
            <Boton titulo="Iniciar sesión" onPress={enviar} cargando={enviando} />
            <Link href="/recuperar" style={[estilos.enlace, estilos.olvido]}>¿Olvidaste tu contraseña?</Link>
          </View>

          <View style={estilos.pie}>
            <Text style={estilos.pieTexto}>¿No tienes cuenta? </Text>
            <Link href="/registro" style={estilos.pieEnlace}>Regístrate</Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { flexGrow: 1, justifyContent: 'center', padding: espacio.l, maxWidth: 480, width: '100%', alignSelf: 'center' },
  burbuja: { position: 'absolute', borderRadius: 999, backgroundColor: colores.burbujaHeroe },
  marca: { alignItems: 'center', marginBottom: espacio.l },
  logo: {
    width: 76, height: 76, borderRadius: 24, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: espacio.m,
    boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.25), 0px 0px 0px 6px rgba(255, 255, 255, 0.15)',
  },
  logoTexto: { color: '#0F766E', fontSize: 38, fontWeight: '900' },
  logoPunto: { position: 'absolute', bottom: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: colores.acento },
  titulo: { fontSize: 30, fontWeight: '900', color: colores.sobreHeroe, letterSpacing: -0.5 },
  subtitulo: { fontSize: 15, color: colores.sobreHeroeSuave, marginTop: espacio.xs, textAlign: 'center', lineHeight: 21 },
  tarjeta: {
    backgroundColor: colores.superficie, borderRadius: radio.l, padding: espacio.l,
    boxShadow: '0px 20px 50px rgba(0, 0, 0, 0.25)',
  },
  bienvenida: { fontSize: 20, fontWeight: '800', color: colores.texto, marginBottom: espacio.m },
  pie: { flexDirection: 'row', justifyContent: 'center', marginTop: espacio.l },
  pieTexto: { color: colores.sobreHeroeSuave, fontSize: 15 },
  pieEnlace: { color: colores.sobreHeroe, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
  enlace: { color: colores.primario, fontSize: 15, fontWeight: '700' },
  olvido: { textAlign: 'center', marginTop: espacio.m },
}));
