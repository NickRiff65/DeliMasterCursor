import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { elegirFoto } from '../lib/fotos';
import { fechaCorta } from '../lib/formato';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { BotonesFoto } from '../components/BotonesFoto';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

// Portafolio del maestro (Pro): fotos de sus trabajos anteriores, tipo CV visual, para que los
// clientes lo conozcan antes de contratarlo. Máximo que devuelve el servidor (12).
export default function Portafolio() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [datos, setDatos] = useState(null);          // { fotos: [{ id, url, creado_en }], maximo }
  const [error, setError] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmando, setConfirmando] = useState(null);   // id de la foto por borrar

  // Se recarga cada vez que se vuelve a esta pantalla
  useFocusEffect(useCallback(() => {
    api.get('/prestadores/yo/fotos')
      .then(setDatos)
      .catch((e) => setError(e.message));
  }, []));

  async function subir(desdeCamara) {
    setError(null);
    try {
      const foto = await elegirFoto(desdeCamara);
      if (!foto) return;
      setSubiendo(true);
      setDatos(await api.post('/prestadores/yo/fotos', { imagen_base64: foto.base64 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(id) {
    setError(null);
    try {
      setDatos(await api.delete(`/prestadores/yo/fotos/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirmando(null);
    }
  }

  if (!datos) {
    return (
      <View style={estilos.contenido}>
        {error ? <Aviso mensaje={error} /> : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />}
      </View>
    );
  }

  const maximo = datos.maximo ?? 12;
  const lleno = datos.fotos.length >= maximo;

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.fila}>
        <Text style={estilos.intro}>Muestra tus mejores trabajos: los clientes ven estas fotos en tu perfil.</Text>
        <Text style={estilos.contador}>{datos.fotos.length}/{maximo}</Text>
      </View>
      <Aviso mensaje={error} />

      {datos.fotos.length ? (
        <View style={estilos.grilla}>
          {datos.fotos.map((f, i) => (
            <View key={f.id} style={estilos.celda}>
              <Image source={{ uri: f.url }} style={estilos.miniatura} accessibilityLabel={`Foto ${i + 1} de mi portafolio`} />
              <Text style={estilos.fecha}>{fechaCorta(f.creado_en)}</Text>
              {confirmando === f.id ? (
                <View style={estilos.confirmar}>
                  <Text style={estilos.confirmarTexto}>¿Borrar esta foto?</Text>
                  <Boton titulo="Sí, borrar" variante="peligro" onPress={() => borrar(f.id)} />
                  <Boton titulo="No, volver" variante="secundario" onPress={() => setConfirmando(null)} />
                </View>
              ) : (
                <Pressable onPress={() => setConfirmando(f.id)} accessibilityRole="button"
                  accessibilityLabel={`Borrar foto ${i + 1}`} hitSlop={6} style={estilos.borrar}>
                  <Text style={estilos.borrarTexto}>Borrar</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>Aún no tienes fotos en tu portafolio</Text>
          <Text style={estilos.vacioTexto}>Sube fotos de trabajos que ya hiciste: un portafolio con fotos genera más confianza y más contrataciones.</Text>
        </View>
      )}

      {subiendo ? (
        <View style={estilos.filaSubiendo}><ActivityIndicator color={colores.primario} /><Text style={estilos.suave}>Subiendo foto…</Text></View>
      ) : lleno ? (
        <Text style={estilos.suave}>Ya tienes las {maximo} fotos permitidas. Borra una para subir otra.</Text>
      ) : (
        <BotonesFoto onElegir={subir} nota={`Puedes subir hasta ${maximo} fotos de tus trabajos.`} />
      )}
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  fila: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: espacio.s, marginBottom: espacio.m },
  intro: { flex: 1, fontSize: 14, color: colores.textoSuave, lineHeight: 20 },
  contador: { fontSize: 15, fontWeight: '800', color: colores.primarioOscuro },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m },
  celda: { width: 104 },
  miniatura: { width: 104, height: 104, borderRadius: radio.s, backgroundColor: colores.fondo },
  fecha: { fontSize: 12, color: colores.textoSuave, textAlign: 'center', marginTop: 2 },
  borrar: { alignItems: 'center', paddingVertical: espacio.xs },
  borrarTexto: { color: colores.error, fontSize: 13, fontWeight: '700' },
  confirmar: { gap: espacio.xs, marginTop: espacio.xs },
  confirmarTexto: { fontSize: 13, fontWeight: '700', color: colores.texto, textAlign: 'center' },
  filaSubiendo: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.s },
  suave: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.s },
  vacio: { alignItems: 'center', padding: espacio.xl },
  vacioTitulo: { fontSize: 17, fontWeight: '700', color: colores.texto, textAlign: 'center' },
  vacioTexto: { fontSize: 15, color: colores.textoSuave, marginTop: espacio.xs, textAlign: 'center', lineHeight: 21 },
}));
