import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAvisos } from '../context/avisos';
import { ES_PRO } from '../lib/variante';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Aviso que aparece arriba unos segundos cuando llega uno nuevo con la app abierta
// (por ejemplo, "💰 Tu pago quedó liberado"). Al tocarlo abre la solicitud o la lista de avisos.
export function AvisoFlotante() {
  const { nuevo, descartarNuevo } = useAvisos();
  const margen = useSafeAreaInsets();

  useEffect(() => {
    if (!nuevo) return undefined;
    const t = setTimeout(descartarNuevo, 6000);
    return () => clearTimeout(t);
  }, [nuevo, descartarNuevo]);

  if (!nuevo) return null;
  function abrir() {
    descartarNuevo();
    if (nuevo.solicitud_id) router.push(ES_PRO ? `/trabajo/${nuevo.solicitud_id}` : `/solicitud/${nuevo.solicitud_id}`);
    else router.push('/avisos');
  }
  return (
    <Pressable onPress={abrir} accessibilityRole="alert" accessibilityLabel={`${nuevo.titulo}. ${nuevo.texto}`}
      style={[estilos.caja, { top: margen.top + espacio.s }]}>
      <Text style={estilos.titulo}>🔔 {nuevo.titulo}</Text>
      <Text style={estilos.texto} numberOfLines={2}>{nuevo.texto}</Text>
    </Pressable>
  );
}

const estilos = crearEstilos((colores) => ({
  caja: {
    position: 'absolute', left: espacio.m, right: espacio.m, zIndex: 100, padding: espacio.m, borderRadius: radio.m,
    backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.primario, boxShadow: colores.sombraFuerte,
    maxWidth: 560, alignSelf: 'center',
  },
  titulo: { fontSize: 15, fontWeight: '800', color: colores.texto },
  texto: { fontSize: 14, color: colores.textoSuave, marginTop: 2 },
}));
