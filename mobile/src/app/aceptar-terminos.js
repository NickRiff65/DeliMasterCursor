import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSesion } from '../context/sesion';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { Casilla } from '../components/Casilla';
import { VERSION_TERMINOS } from '../legal/textos';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Se muestra a quien no ha aceptado la versión vigente de los términos (cuenta anterior o versión nueva)
export default function AceptarTerminos() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { usuario, aceptarTerminos, cerrarSesion } = useSesion();
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function aceptar() {
    setEnviando(true);
    setError(null);
    try {
      await aceptarTerminos();
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <Text style={estilos.saludo}>Hola, {usuario.nombre.split(' ')[0]}</Text>
      <Text style={estilos.texto}>
        Publicamos los Términos de uso y la Política de privacidad de DeliMaster (versión {VERSION_TERMINOS}).
        Para seguir usando la aplicación, revísalos y acéptalos.
      </Text>
      <View style={estilos.resumen}>
        <Text style={estilos.resumenTitulo}>Lo más importante</Text>
        {[
          'Tu pago queda retenido hasta que el trabajo se cierra.',
          'Si el maestro cobra visita, se descuenta del total al contratar y te la devolvemos si no llega.',
          'Puedes guardar tu tarjeta en Transbank para pagar con un toque; DeliMaster solo ve los últimos 4 dígitos.',
          'Antes del pago, el chat no deja compartir teléfonos, correos ni pagos por fuera.',
          'Solo se califican trabajos cerrados en DeliMaster.',
          'Tu teléfono y tus datos bancarios nunca se muestran a la otra parte.',
        ].map((t) => <Text key={t} style={estilos.punto}>• {t}</Text>)}
      </View>
      <Aviso mensaje={error} />
      <Casilla marcada={acepta} onCambio={setAcepta}>
        Leí y acepto los{' '}
        <Text style={estilos.enlace} onPress={() => router.push('/terminos')}>Términos de uso</Text>
        {' '}y la{' '}
        <Text style={estilos.enlace} onPress={() => router.push('/privacidad')}>Política de privacidad</Text>.
      </Casilla>
      <Boton titulo="Aceptar y continuar" onPress={aceptar} cargando={enviando} deshabilitado={!acepta} />
      <View style={{ marginTop: espacio.s }}>
        <Boton titulo="Cerrar sesión" variante="secundario" onPress={cerrarSesion} />
      </View>
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.l, maxWidth: 520, width: '100%', alignSelf: 'center' },
  saludo: { fontSize: 22, fontWeight: '800', color: colores.texto, marginBottom: espacio.s },
  texto: { fontSize: 15, lineHeight: 22, color: colores.texto, marginBottom: espacio.m },
  resumen: { backgroundColor: colores.superficie, boxShadow: colores.sombra, borderWidth: 1, borderColor: colores.bordeTarjeta, borderRadius: radio.m, padding: espacio.m, marginBottom: espacio.m },
  resumenTitulo: { fontSize: 15, fontWeight: '700', color: colores.texto, marginBottom: espacio.xs },
  punto: { fontSize: 14, lineHeight: 21, color: colores.texto },
  enlace: { color: colores.primario, fontWeight: '700', textDecorationLine: 'underline' },
}));
