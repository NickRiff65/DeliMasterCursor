import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { pesos } from '../lib/formato';
import { elegirFoto } from '../lib/fotos';
import { Boton } from './Boton';
import { BotonesFoto } from './BotonesFoto';
import { Campo } from './Campo';
import { Aviso } from './Aviso';
import { colores, crearEstilos, espacio, radio } from '../theme';

const aEntero = (texto) => Number(String(texto).replace(/\D/g, '')) || 0;
const ADVERTENCIA = 'Adjunta la boleta de cada gasto. Sin boleta, el gasto no es válido para el cliente '
  + 'y él puede apelarlo ante la administración de DeliMaster.';

// HU-09: gastos de un trabajo y ganancia neta (DeliMaster Pro).
// Un solo camino para no confundir a quien recién empieza: "Ingresar gasto" abre el formulario y ahí
// se adjunta la boleta (cámara o galería); el sistema la lee y propone el total.
export function GastosDelTrabajo({ solicitudId }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [boleta, setBoleta] = useState(null);           // boleta adjunta al formulario (respuesta del OCR)
  const [leyendo, setLeyendo] = useState(null);         // 'formulario' | id del gasto al que se adjunta
  const [adjuntandoA, setAdjuntandoA] = useState(null); // gasto sin boleta que muestra los botones de foto
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.get(`/solicitudes/${solicitudId}/gastos`));
    } catch (e) {
      setError(e.message);
    }
  }, [solicitudId]);

  useEffect(() => { cargar(); }, [cargar]);

  function cerrar() {
    setAbierto(false);
    setBoleta(null);
    setMonto('');
    setDescripcion('');
  }

  // Sube la foto de una boleta: el servidor la guarda, la lee y propone el total
  async function subirBoleta(desdeCamara, donde) {
    setError(null);
    try {
      const foto = await elegirFoto(desdeCamara);
      if (!foto) return null;
      setLeyendo(donde);
      return await api.post(`/solicitudes/${solicitudId}/boletas`, { imagen_base64: foto.base64 });
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLeyendo(null);
    }
  }

  async function adjuntarAlFormulario(desdeCamara) {
    const b = await subirBoleta(desdeCamara, 'formulario');
    if (!b) return;
    setBoleta(b);
    if (!aEntero(monto) && b.monto_propuesto) setMonto(String(b.monto_propuesto));
  }

  async function adjuntarAGasto(gastoId, desdeCamara) {
    const b = await subirBoleta(desdeCamara, gastoId);
    if (!b) return;
    try {
      setDatos(await api.patch(`/gastos/${gastoId}`, { boleta_id: b.boleta_id }));
      setAdjuntandoA(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function guardar() {
    const valor = aEntero(monto);
    if (!valor) return setError('Indica el monto del gasto.');
    setGuardando(true);
    setError(null);
    try {
      setDatos(await api.post(`/solicitudes/${solicitudId}/gastos`, {
        monto: valor,
        ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
        ...(boleta ? { boleta_id: boleta.boleta_id } : {}),
      }));
      cerrar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    try {
      await api.delete(`/gastos/${id}`);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!datos) return error ? <Aviso mensaje={error} /> : <ActivityIndicator color={colores.primario} />;
  const { resumen, gastos } = datos;
  // Una vez marcado como terminado, los gastos quedan fijos (el cliente los revisa y puede apelarlos)
  const editable = datos.editable !== false;
  const leidoDistinto = boleta?.monto_propuesto && aEntero(monto) && aEntero(monto) !== boleta.monto_propuesto;

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>💰 Gastos y ganancia de este trabajo</Text>

      {/* Resumen: precio → comisión → ingreso neto → gastos → ganancia */}
      <View style={estilos.resumen}>
        <Fila etiqueta="Precio cobrado" valor={pesos(resumen.precio)} />
        {resumen.reembolsado ? <Fila etiqueta="Devuelto al cliente" valor={`− ${pesos(resumen.reembolsado)}`} suave /> : null}
        <Fila etiqueta="Comisión DeliMaster" valor={`− ${pesos(resumen.comision)}`} suave />
        <Fila etiqueta="Gastos en materiales" valor={`− ${pesos(resumen.gastos)}`} suave />
        <View style={estilos.separador} />
        <Fila etiqueta="Tu ganancia neta" valor={pesos(resumen.ganancia_neta)} destacado />
        {!resumen.ingreso_confirmado ? (
          <Text style={estilos.nota}>Estimado: se confirma cuando el cliente pague.</Text>
        ) : null}
      </View>

      <Aviso mensaje={error} />

      {gastos.map((g) => (
        <View key={g.id} style={estilos.gasto}>
          <View style={estilos.gastoFila}>
            {g.imagen_url ? <Image source={{ uri: g.imagen_url }} style={estilos.miniatura} /> : (
              <View style={[estilos.miniatura, estilos.sinFoto]}><Text>🧾</Text></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[estilos.gastoMonto, g.rechazado && { textDecorationLine: 'line-through', color: colores.textoSuave }]}>{pesos(g.monto)}</Text>
              <Text style={estilos.suave} numberOfLines={1}>{g.descripcion ?? 'Sin descripción'}</Text>
              {g.rechazado
                ? <Text style={estilos.rechazado}>✖ Rechazado por la administración: se devolvió al cliente y no cuenta como gasto</Text>
                : g.con_boleta
                  ? <Text style={estilos.conBoleta}>✓ Con boleta</Text>
                  : <Text style={estilos.sinBoleta}>⚠️ Sin boleta: no es válido para el cliente</Text>}
            </View>
            {editable ? (
              <Pressable onPress={() => eliminar(g.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Eliminar gasto">
                <Text style={{ color: colores.error, fontSize: 13, fontWeight: '600' }}>Eliminar</Text>
              </Pressable>
            ) : null}
          </View>
          {!g.con_boleta && !g.rechazado && editable ? (
            leyendo === g.id ? (
              <View style={estilos.leyendo}><ActivityIndicator color={colores.primario} /><Text style={estilos.texto}>Subiendo la boleta…</Text></View>
            ) : adjuntandoA === g.id ? (
              <BotonesFoto onElegir={(camara) => adjuntarAGasto(g.id, camara)} web="🧾 Subir foto de la boleta" />
            ) : (
              <Text style={estilos.enlace} onPress={() => setAdjuntandoA(g.id)} accessibilityRole="button">🧾 Adjuntar boleta</Text>
            )
          ) : null}
        </View>
      ))}

      {!editable ? (
        <Text style={estilos.cerrado}>🔒 Marcaste el trabajo como terminado: los gastos quedaron registrados y ya no se pueden modificar.</Text>
      ) : abierto ? (
        <View style={estilos.formulario}>
          <Text style={estilos.subtitulo}>Nuevo gasto</Text>
          <Campo etiqueta="Monto (CLP)" value={monto} onChangeText={setMonto} keyboardType="number-pad" placeholder="Ej.: 14780" />
          <Campo etiqueta="Descripción (opcional)" value={descripcion} onChangeText={setDescripcion}
            placeholder="Ej.: cable y enchufes" maxLength={200} />

          <Text style={estilos.subtitulo}>🧾 Boleta</Text>
          {leyendo === 'formulario' ? (
            <View style={estilos.leyendo}><ActivityIndicator color={colores.primario} /><Text style={estilos.texto}>Leyendo la boleta…</Text></View>
          ) : boleta ? (
            <View style={{ gap: espacio.xs }}>
              <Image source={{ uri: boleta.imagen_url }} style={estilos.vistaBoleta} resizeMode="contain" />
              <Text style={[estilos.texto, (boleta.revisar || leidoDistinto) && { color: colores.avisoTexto }]}>
                {boleta.monto_propuesto == null
                  ? 'No pudimos leer el total de la boleta. Revisa que el monto esté bien.'
                  : leidoDistinto
                    ? `La boleta dice ${pesos(boleta.monto_propuesto)}. Revisa el monto.`
                    : boleta.revisar
                      ? `Leímos ${pesos(boleta.monto_propuesto)}, pero no estamos seguros. Revísalo.`
                      : `✓ Leímos un total de ${pesos(boleta.monto_propuesto)}.`}
              </Text>
            </View>
          ) : (
            <>
              <View style={estilos.advertencia}><Text style={estilos.advertenciaTexto}>⚠️ {ADVERTENCIA}</Text></View>
              <BotonesFoto onElegir={adjuntarAlFormulario} camara="📷 Fotografiar" web="📷 Subir foto de la boleta" />
            </>
          )}

          <View style={{ marginTop: espacio.m, gap: espacio.s }}>
            <Boton titulo={boleta ? 'Guardar gasto' : 'Guardar sin boleta por ahora'} onPress={guardar} cargando={guardando}
              variante={boleta ? 'primario' : 'secundario'} deshabilitado={leyendo === 'formulario'} />
            <Boton titulo="Cancelar" variante="secundario" onPress={cerrar} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: espacio.s }}>
          <Boton titulo="✍️ Ingresar gasto a mano" onPress={() => setAbierto(true)} />
        </View>
      )}
    </View>
  );
}

function Fila({ etiqueta, valor, suave, destacado }) {
  return (
    <View style={estilos.fila}>
      <Text style={[estilos.texto, suave && { color: colores.textoSuave }, destacado && estilos.destacado]}>{etiqueta}</Text>
      <Text style={[estilos.texto, suave && { color: colores.textoSuave }, destacado && estilos.destacado]}>{valor}</Text>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  titulo: { fontSize: 16, fontWeight: '700', color: colores.texto, marginBottom: espacio.s },
  subtitulo: { fontSize: 15, fontWeight: '700', color: colores.texto, marginTop: espacio.s },
  resumen: { backgroundColor: colores.fondo, borderRadius: radio.s, padding: espacio.m, marginBottom: espacio.m, gap: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
  separador: { height: 1, backgroundColor: colores.borde, marginVertical: 4 },
  destacado: { fontWeight: '800', fontSize: 17, color: colores.primarioOscuro },
  nota: { fontSize: 12, color: colores.textoSuave, marginTop: 4 },
  texto: { fontSize: 15, color: colores.texto },
  suave: { fontSize: 13, color: colores.textoSuave },
  gasto: { paddingVertical: espacio.s, borderTopWidth: 1, borderTopColor: colores.fondo, gap: espacio.xs },
  gastoFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.s },
  miniatura: { width: 44, height: 44, borderRadius: 6, backgroundColor: colores.fondo },
  sinFoto: { alignItems: 'center', justifyContent: 'center' },
  gastoMonto: { fontSize: 15, fontWeight: '700', color: colores.texto },
  conBoleta: { fontSize: 12, fontWeight: '700', color: colores.exitoTexto, marginTop: 2 },
  sinBoleta: { fontSize: 12, fontWeight: '700', color: colores.avisoTexto, marginTop: 2 },
  rechazado: { fontSize: 12, fontWeight: '700', color: colores.error, marginTop: 2 },
  enlace: { color: colores.primario, fontWeight: '700', fontSize: 14, paddingVertical: 4 },
  leyendo: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, padding: espacio.s },
  formulario: { marginTop: espacio.s, gap: espacio.xs, borderTopWidth: 1, borderTopColor: colores.fondo, paddingTop: espacio.s },
  advertencia: { backgroundColor: colores.avisoFondo, borderWidth: 1, borderColor: colores.avisoBorde, borderRadius: radio.s, padding: espacio.s },
  advertenciaTexto: { color: colores.avisoTexto, fontSize: 13, lineHeight: 18 },
  vistaBoleta: { width: '100%', height: 220, borderRadius: radio.s, backgroundColor: colores.fondo },
  cerrado: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.s, lineHeight: 18 },
}));
