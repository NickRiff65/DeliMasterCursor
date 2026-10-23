import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { pesos } from '../lib/formato';
import { Aviso } from './Aviso';
import { Boton } from './Boton';
import { Campo } from './Campo';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Lite: gastos en materiales que el maestro registró en el trabajo y si tienen boleta. Los que no la
// tienen no están justificados: el cliente puede apelarlos ante la administración (se abre un reclamo
// y el pago sigue retenido mientras el equipo revisa).
export function MaterialesDelTrabajo({ solicitudId, maestro, onApelada }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [apelando, setApelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ampliada, setAmpliada] = useState(null);

  useEffect(() => {
    api.get(`/solicitudes/${solicitudId}/materiales`).then(setDatos).catch((e) => setError(e.message));
  }, [solicitudId]);

  if (!datos) return error ? <Aviso mensaje={error} /> : null;
  if (!datos.gastos.length) return null;   // el maestro no registró gastos en materiales
  const sinBoleta = datos.gastos.filter((g) => !g.con_boleta && !g.rechazado);

  function abrirApelacion() {
    const detalle = sinBoleta.map((g) => `${g.descripcion ?? 'sin descripción'} (${pesos(g.monto)})`).join(', ');
    setMotivo(`Apelo ${sinBoleta.length === 1 ? 'el gasto' : 'los gastos'} en materiales sin boleta: ${detalle}.`.slice(0, 500));
    setApelando(true);
  }

  async function enviar() {
    setError(null);
    setEnviando(true);
    try {
      const r = await api.post(`/solicitudes/${solicitudId}/reportar`, { motivo: motivo.trim() });
      setApelando(false);
      onApelada?.(r.solicitud);
    } catch (e) {
      setError(e.campos?.motivo ?? e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>🧾 Gastos en materiales</Text>
      <Text style={estilos.ayuda}>{maestro} registró estos gastos del trabajo. Cada uno debe tener su boleta.</Text>
      <Aviso mensaje={error} />

      {datos.gastos.map((g) => (
        <View key={g.id} style={estilos.gasto}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.texto} numberOfLines={1}>{g.descripcion ?? 'Sin descripción'}</Text>
            {g.rechazado ? (
              <Text style={estilos.sinBoleta}>✖ Rechazado por el equipo · se te devolvió</Text>
            ) : g.con_boleta ? (
              <Text style={estilos.conBoleta} onPress={() => setAmpliada(g)} accessibilityRole="button">✓ Con boleta · Ver</Text>
            ) : <Text style={estilos.sinBoleta}>⚠️ Sin boleta</Text>}
          </View>
          <Text style={[estilos.monto, g.rechazado && { textDecorationLine: 'line-through', color: colores.textoSuave }]}>{pesos(g.monto)}</Text>
        </View>
      ))}
      <View style={estilos.total}>
        <Text style={estilos.totalTexto}>Total en materiales</Text>
        <Text style={estilos.totalTexto}>{pesos(datos.total)}</Text>
      </View>

      {sinBoleta.length ? (
        <View style={estilos.advertencia}>
          <Text style={estilos.advertenciaTexto}>
            ⚠️ {sinBoleta.length === 1 ? 'Un gasto no tiene boleta: no está justificado.' : `${sinBoleta.length} gastos no tienen boleta: no están justificados.`}
            {datos.puede_apelar ? ' Si no se justifican, puedes apelarlos ante la administración de DeliMaster.' : ''}
          </Text>
        </View>
      ) : null}

      {sinBoleta.length && datos.puede_apelar ? (
        apelando ? (
          <View style={{ gap: espacio.s, marginTop: espacio.s }}>
            <Campo etiqueta="Tu apelación" value={motivo} onChangeText={setMotivo} multiline maxLength={500}
              ayuda="Tu pago seguirá retenido mientras el equipo DeliMaster revisa." />
            <Boton titulo="Enviar apelación" onPress={enviar} cargando={enviando} deshabilitado={motivo.trim().length < 10} />
            <Boton titulo="Volver" variante="secundario" onPress={() => setApelando(false)} />
          </View>
        ) : (
          <View style={{ marginTop: espacio.s }}>
            <Boton titulo="Apelar gastos sin boleta" variante="secundario" onPress={abrirApelacion} />
          </View>
        )
      ) : null}

      <Modal visible={Boolean(ampliada)} transparent animationType="fade" onRequestClose={() => setAmpliada(null)}>
        <Pressable style={estilos.fondoModal} onPress={() => setAmpliada(null)} accessibilityRole="button" accessibilityLabel="Cerrar boleta">
          {ampliada ? (
            <>
              <Image source={{ uri: ampliada.imagen_url }} style={estilos.ampliada} resizeMode="contain" />
              <Text style={estilos.pieModal}>{ampliada.descripcion ?? 'Boleta'} · {pesos(ampliada.monto)}</Text>
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
  texto: { fontSize: 15, color: colores.texto },
  gasto: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, paddingVertical: espacio.s, borderTopWidth: 1, borderTopColor: colores.fondo },
  monto: { fontSize: 15, fontWeight: '700', color: colores.texto },
  conBoleta: { fontSize: 12, fontWeight: '700', color: colores.exitoTexto, marginTop: 2 },
  sinBoleta: { fontSize: 12, fontWeight: '700', color: colores.avisoTexto, marginTop: 2 },
  total: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colores.borde, paddingTop: espacio.s },
  totalTexto: { fontSize: 15, fontWeight: '800', color: colores.texto },
  advertencia: {
    backgroundColor: colores.avisoFondo, borderWidth: 1, borderColor: colores.avisoBorde, borderRadius: radio.s,
    padding: espacio.s, marginTop: espacio.s,
  },
  advertenciaTexto: { color: colores.avisoTexto, fontSize: 13, lineHeight: 18 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: espacio.m },
  ampliada: { width: '100%', height: '75%' },
  pieModal: { color: '#FFFFFF',   // siempre sobre el fondo negro de la imagen ampliada
    fontSize: 14, marginTop: espacio.s, textAlign: 'center' },
}));
