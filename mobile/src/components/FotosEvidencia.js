import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { elegirFoto } from '../lib/fotos';
import { fechaCorta } from '../lib/formato';
import { Aviso } from './Aviso';
import { BotonesFoto } from './BotonesFoto';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Fotos de una solicitud (ambas apps): el cliente muestra lo que necesita para que el maestro cotice con
// más exactitud, y después sirven de evidencia del trabajo terminado o del problema que se reporta.
// Incluye las que se envían por el chat. El equipo las revisa si hay una disputa (HU-16).
const AUTOR = { cliente: 'Cliente', prestador: 'Maestro' };
export function FotosEvidencia({ solicitudId, titulo, ayuda }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ampliada, setAmpliada] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.get(`/solicitudes/${solicitudId}/fotos`));
    } catch (e) {
      setError(e.message);
    }
  }, [solicitudId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregar(desdeCamara) {
    setError(null);
    try {
      const foto = await elegirFoto(desdeCamara);
      if (!foto) return;
      setSubiendo(true);
      setDatos(await api.post(`/solicitudes/${solicitudId}/fotos`, { imagen_base64: foto.base64 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  }

  if (!datos) return error ? <Aviso mensaje={error} /> : null;
  const propias = datos.fotos.filter((f) => f.propia).length;
  const puedeAgregar = datos.puede_subir && propias < datos.maximo_por_persona;
  if (!datos.fotos.length && !datos.puede_subir) return null;

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>📷 {titulo}</Text>
      {ayuda && datos.puede_subir ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}
      <Aviso mensaje={error} />

      {datos.fotos.length ? (
        <View style={estilos.grilla}>
          {datos.fotos.map((f) => (
            <Pressable key={f.id} onPress={() => setAmpliada(f)} accessibilityRole="imagebutton"
              accessibilityLabel={`Foto de ${f.propia ? 'ti' : AUTOR[f.rol].toLowerCase()}`}>
              <Image source={{ uri: f.url }} style={estilos.miniatura} />
              <Text style={estilos.autor}>{f.propia ? 'Tú' : AUTOR[f.rol]}</Text>
            </Pressable>
          ))}
        </View>
      ) : <Text style={estilos.suave}>Aún no hay fotos.</Text>}

      {subiendo ? (
        <View style={estilos.fila}><ActivityIndicator color={colores.primario} /><Text style={estilos.suave}>Subiendo foto…</Text></View>
      ) : puedeAgregar ? (
        <BotonesFoto onElegir={agregar}
          nota={`Puedes subir hasta ${datos.maximo_por_persona} fotos. Quedan como respaldo y no se pueden borrar.`} />
      ) : datos.puede_subir ? (
        <Text style={estilos.suave}>Ya subiste las {datos.maximo_por_persona} fotos permitidas.</Text>
      ) : null}

      <Modal visible={Boolean(ampliada)} transparent animationType="fade" onRequestClose={() => setAmpliada(null)}>
        <Pressable style={estilos.fondoModal} onPress={() => setAmpliada(null)} accessibilityRole="button" accessibilityLabel="Cerrar foto">
          {ampliada ? (
            <>
              <Image source={{ uri: ampliada.url }} style={estilos.ampliada} resizeMode="contain" />
              <Text style={estilos.pieModal}>
                {ampliada.propia ? 'Tu foto' : `Foto del ${AUTOR[ampliada.rol].toLowerCase()}`} · {fechaCorta(ampliada.creado_en)}
                {ampliada.descripcion ? ` · ${ampliada.descripcion}` : ''}
              </Text>
              <Text style={estilos.pieModal}>Toca para cerrar</Text>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  titulo: { fontSize: 16, fontWeight: '700', color: colores.texto, marginBottom: espacio.xs },
  ayuda: { fontSize: 14, color: colores.textoSuave, marginBottom: espacio.s },
  suave: { fontSize: 13, color: colores.textoSuave },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginVertical: espacio.s },
  miniatura: { width: 88, height: 88, borderRadius: radio.s, backgroundColor: colores.fondo },
  autor: { fontSize: 12, color: colores.textoSuave, textAlign: 'center', marginTop: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.s },
  fondoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: espacio.m },
  ampliada: { width: '100%', height: '75%' },
  pieModal: { color: '#FFFFFF',   // siempre sobre el fondo negro de la foto ampliada
    fontSize: 14, marginTop: espacio.s, textAlign: 'center' },
}));
