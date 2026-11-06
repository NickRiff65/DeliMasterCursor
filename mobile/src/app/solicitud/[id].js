import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, consulta } from '../../lib/api';
import { pagar as pagarSolicitud } from '../../lib/pago';
import { pesos, fechaCorta, hora, diaYHora } from '../../lib/formato';
import { Aviso } from '../../components/Aviso';
import { Boton } from '../../components/Boton';
import { Estrellas } from '../../components/Estrellas';
import { EstadoSolicitud } from '../../components/EstadoSolicitud';
import { CuentaRegresiva } from '../../components/CuentaRegresiva';
import { SelectorEstrellas } from '../../components/SelectorEstrellas';
import { FotosEvidencia } from '../../components/FotosEvidencia';
import { OpcionesDePago } from '../../components/OpcionesDePago';
import { MaterialesDelTrabajo } from '../../components/MaterialesDelTrabajo';
import { Campo } from '../../components/Campo';
import { ResumenCotizacion } from '../../components/ResumenCotizacion';
import { colores, crearEstilos, espacio, radio } from '../../theme';
import { useTema } from '../../context/tema';

const RESULTADOS = {
  aprobado: { texto: '✔ Pago aprobado. Tu dinero quedó protegido.', fondo: 'exitoFondo', borde: 'exitoBorde', color: 'exitoTexto' },
  rechazado: { texto: 'El pago fue rechazado. Puedes intentarlo de nuevo con otro medio de pago.', fondo: 'errorSuave', borde: 'errorBorde', color: 'errorTexto' },
  cancelado: { texto: 'Cancelaste el pago en Webpay. Puedes intentarlo de nuevo cuando quieras.', fondo: 'avisoFondo', borde: 'avisoBorde', color: 'avisoTexto' },
  tarjeta_guardada: { texto: '✔ Tu tarjeta quedó guardada.', fondo: 'exitoFondo', borde: 'exitoBorde', color: 'exitoTexto' },
};

const NOMBRE_EVENTO = {
  creada: 'Solicitud publicada', asignada: 'Maestro elegido', confirmada: 'Maestro aceptó',
  visita_por_pagar: 'Maestro aceptó con visita', visita_pagada: 'Visita pagada', en_diagnostico: 'El maestro llegó',
  cotizada: 'Cotización recibida',
  cancelada: 'Solicitud cancelada', pagada: 'Pago realizado', finalizada: 'Maestro terminó el trabajo', cerrada: 'Cierre oficial · pago liberado',
  en_disputa: 'Problema reportado',
};

// El mismo estado puede venir de pasos distintos: se nombra según de dónde viene
function nombreEvento(e) {
  if (e.estado_anterior === 'cotizada' && ['confirmada', 'pagada'].includes(e.estado_nuevo)) return 'Aceptaste la cotización';
  if (e.estado_anterior === 'asignada' && e.estado_nuevo === 'creada') return 'Volvió a estar disponible';   // el detalle dice por qué
  return NOMBRE_EVENTO[e.estado_nuevo] ?? e.estado_nuevo;
}

// Detalle de una solicitud del cliente: lo que se puede hacer depende del estado
export default function DetalleSolicitud() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { id, pago: resultadoPagoUrl, fotos: fotosUrl } = useLocalSearchParams();
  const [resultadoPago, setResultadoPago] = useState(resultadoPagoUrl ?? null);
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [candidatos, setCandidatos] = useState(null);
  const [todasLasComunas, setTodasLasComunas] = useState(false);
  const [accion, setAccion] = useState(null);       // id del botón en curso
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [tarjeta, setTarjeta] = useState(null);        // tarjeta guardada del cliente (Webpay Oneclick)

  const cargar = useCallback(async () => {
    try {
      setS((await api.get(`/solicitudes/${id}`)).solicitud);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  // Mientras espera algo del prestador (respuesta, llegada o cotización), se revisa cada 10 segundos
  useEffect(() => {
    if (!['asignada', 'visita_pagada', 'en_diagnostico'].includes(s?.estado)) return undefined;
    const t = setInterval(cargar, 10000);
    return () => clearInterval(t);
  }, [s?.estado, cargar]);

  // Tarjeta guardada: se consulta cuando hay algo que pagar
  const porPagar = ['visita_por_pagar', 'confirmada'].includes(s?.estado);
  useEffect(() => {
    if (!porPagar) return;
    api.get('/pagos/tarjeta').then((r) => setTarjeta(r.tarjeta)).catch(() => setTarjeta(null));
  }, [porPagar, resultadoPago]);

  // Prestadores disponibles para elegir (solo en estado "creada")
  useEffect(() => {
    if (s?.estado !== 'creada') return;
    setCandidatos(null);
    api.get(`/prestadores${consulta({ categoria: s.categoria, comuna: todasLasComunas ? null : s.comuna, limite: 20 })}`)
      .then((r) => setCandidatos(r.prestadores))
      .catch((e) => setError(e.message));
  }, [s?.estado, s?.categoria, s?.comuna, todasLasComunas]);

  async function ejecutar(nombre, fn) {
    setError(null);
    setAccion(nombre);
    try {
      setS((await fn()).solicitud);
    } catch (e) {
      setError(e.message);
      await cargar();
    } finally {
      setAccion(null);
      setConfirmarCancelar(false);
    }
  }

  if (!s) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  const cancelable = ['creada', 'asignada', 'visita_por_pagar', 'visita_pagada', 'en_diagnostico', 'confirmada'].includes(s.estado);
  const conVisita = s.modalidad === 'visita';
  const primerNombre = s.prestador?.nombre.split(' ')[0];
  // Cancelar una visita pagada con menos de 2 horas de anticipación: la visita queda para el prestador
  const cancelaSobreLaHora = s.estado === 'visita_pagada'
    && new Date(s.visita_programada_en).getTime() - Date.now() < 2 * 3_600_000;
  const puedeReclamar = s.estado === 'visita_pagada' && Date.now() >= new Date(s.reclamo_no_llego_desde).getTime();

  // medio: tarjeta_guardada (un toque), guardar_tarjeta (la registra y paga) o webpay (sin guardarla)
  async function pagar(medio) {
    setError(null);
    setAccion(medio);
    try {
      const r = await pagarSolicitud(s.id, medio);   // en web la página se va a Transbank y no vuelve aquí
      if (r) { setResultadoPago(r); await cargar(); }
    } catch (e) {
      setError(e.message);
    } finally {
      setAccion(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.tarjeta}>
        <View style={estilos.fila}>
          <Text style={estilos.categoria}>{s.categoria_nombre}</Text>
          <EstadoSolicitud estado={s.estado} />
        </View>
        <Text style={estilos.descripcion}>“{s.descripcion}”</Text>
        <Text style={estilos.suave}>📍 {s.direccion ? `${s.direccion}, ` : ''}{s.comuna} · {fechaCorta(s.creado_en)}</Text>
        {s.referencia ? <Text style={estilos.suave}>Referencia: {s.referencia}</Text> : null}
      </View>

      {/* Privacidad de la dirección: el maestro solo ve la comuna hasta que la visita se concreta */}
      {s.prestador && !['creada', 'asignada', 'cerrada', 'cancelada'].includes(s.estado) ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.subtitulo}>🔒 Tu dirección está protegida</Text>
          {s.direccion_visible_para_prestador ? (
            <Text style={estilos.texto}>
              {s.prestador.nombre.split(' ')[0]} ya puede ver tu dirección exacta, porque la visita quedó concretada
              {s.direccion_compartida_en ? ' y tú la compartiste desde esta app' : ''}.
            </Text>
          ) : (
            <>
              <Text style={estilos.texto}>
                Por tu seguridad, {s.prestador.nombre.split(' ')[0]} solo ve tu comuna ({s.comuna}), no tu dirección.
                La verá automáticamente cuando el pago de la visita o del trabajo quede confirmado.
              </Text>
              {s.puede_compartir_direccion ? (
                <View style={{ marginTop: espacio.s }}>
                  <Boton titulo="📍 Compartir mi dirección ahora" variante="secundario"
                    cargando={accion === 'compartir-direccion'} deshabilitado={Boolean(accion)}
                    onPress={() => ejecutar('compartir-direccion', () => api.post(`/solicitudes/${s.id}/compartir-direccion`))} />
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      <Aviso mensaje={error} />
      {fotosUrl === 'fallidas' ? (
        <Aviso mensaje="Tu solicitud se publicó, pero no pudimos subir alguna foto. Puedes agregarla de nuevo en «Fotos»." />
      ) : null}

      {/* creada: elegir prestador */}
      {s.estado === 'creada' ? (
        <View>
          <Text style={estilos.subtitulo}>Elige quién lo hará</Text>
          {!candidatos ? <ActivityIndicator color={colores.primario} /> : candidatos.length ? candidatos.map((p) => (
            <View key={p.id} style={[estilos.tarjeta, estilos.fila]}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/prestador/${p.id}`)} accessibilityRole="button">
                <Text style={estilos.nombre}>{p.nombre}</Text>
                <Estrellas promedio={p.calificacion_promedio} total={p.total_resenas} />
                <Text style={estilos.suave} numberOfLines={1}>{p.comunas_atendidas.join(', ')}</Text>
              </Pressable>
              <View style={{ width: 96 }}>
                <Boton titulo="Elegir" cargando={accion === p.id} deshabilitado={Boolean(accion)}
                  onPress={() => ejecutar(p.id, () => api.post(`/solicitudes/${s.id}/asignar`, { prestador_id: p.id }))} />
              </View>
            </View>
          )) : (
            <View style={estilos.tarjeta}>
              <Text style={estilos.texto}>
                {todasLasComunas ? 'No hay maestros disponibles para este servicio por ahora.'
                  : `No hay maestros disponibles en ${s.comuna}.`}
              </Text>
            </View>
          )}
          {!todasLasComunas ? (
            <Text style={estilos.enlace} onPress={() => setTodasLasComunas(true)}>Ver maestros de otras comunas</Text>
          ) : null}
        </View>
      ) : null}

      {/* asignada: esperando respuesta */}
      {s.estado === 'asignada' ? (
        <View style={[estilos.tarjeta, estilos.esperando]}>
          <Text style={estilos.nombre}>Esperando que {s.prestador.nombre} responda</Text>
          <Text style={estilos.texto}>
            Tiene hasta las {hora(s.responder_antes_de)} para aceptar. Quedan{' '}
            <CuentaRegresiva hasta={s.responder_antes_de} alVencer={cargar} />
          </Text>
          <Text style={estilos.suave}>Si no responde a tiempo, podrás elegir a otro prestador.</Text>
        </View>
      ) : null}

      {/* Resultado al volver de Webpay */}
      {resultadoPago && RESULTADOS[resultadoPago] && !(resultadoPago === 'aprobado' && !['pagada', 'visita_pagada'].includes(s.estado)) ? (
        <View style={[estilos.tarjeta, { backgroundColor: colores[RESULTADOS[resultadoPago].fondo], borderColor: colores[RESULTADOS[resultadoPago].borde] }]}>
          <Text style={[estilos.texto, { color: colores[RESULTADOS[resultadoPago].color], fontWeight: '700' }]}>
            {RESULTADOS[resultadoPago].texto}
          </Text>
        </View>
      ) : null}

      {/* Visita + cotización · 1: pagar la visita de diagnóstico */}
      {s.estado === 'visita_por_pagar' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.nombre}>{primerNombre} irá a diagnosticar el {diaYHora(s.visita_programada_en)}</Text>
          <Text style={estilos.precio}>{pesos(s.tarifa_visita)}</Text>
          <Text style={estilos.texto}>Paga la visita para confirmarla. Después del diagnóstico recibirás la cotización del trabajo aquí.</Text>
          {/* Al pagar la visita conviene guardar la tarjeta: el saldo se paga después con un toque */}
          <OpcionesDePago monto={s.tarifa_visita} etiqueta="Pagar visita" tarjeta={tarjeta} onPagar={pagar}
            cargando={accion} guardarPorDefecto />
          <Text style={estilos.suave}>
            🔒 Si contratas el trabajo, la visita se descuenta del total. Si {primerNombre} no llega, te la devolvemos.
          </Text>
        </View>
      ) : null}

      {/* 2: visita pagada; el cliente dicta su código cuando llega el prestador */}
      {s.estado === 'visita_pagada' ? (
        <View style={[estilos.tarjeta, estilos.codigoTarjeta]}>
          <Text style={estilos.nombre}>Visita: {diaYHora(s.visita_programada_en)}</Text>
          <Text style={estilos.texto}>Cuando {primerNombre} llegue, díctale este código para confirmar la visita:</Text>
          <View style={estilos.codigoFila} accessible accessibilityLabel={`Código de llegada ${s.codigo_llegada?.split('').join(' ')}`}>
            {(s.codigo_llegada ?? '····').split('').map((d, i) => (
              <View key={i} style={estilos.digito}><Text style={estilos.digitoTexto}>{d}</Text></View>
            ))}
          </View>
          <Text style={estilos.suave}>No lo compartas antes de que llegue: es lo que libera el pago de la visita.</Text>
          {puedeReclamar ? (
            <View style={{ marginTop: espacio.s }}>
              <Boton titulo="No llegó: devolverme la visita" variante="secundario" cargando={accion === 'no-llego'} deshabilitado={Boolean(accion)}
                onPress={() => ejecutar('no-llego', () => api.post(`/solicitudes/${s.id}/no-llego`, {}))} />
            </View>
          ) : (
            <Text style={estilos.suave}>Si no llega, desde las {hora(s.reclamo_no_llego_desde)} podrás pedir que te devolvamos la visita.</Text>
          )}
        </View>
      ) : null}

      {/* 3: el prestador llegó y está diagnosticando */}
      {s.estado === 'en_diagnostico' ? (
        <View style={[estilos.tarjeta, estilos.esperando]}>
          <Text style={estilos.nombre}>✔ {primerNombre} llegó y está revisando</Text>
          <Text style={estilos.texto}>Te enviará la cotización del trabajo por aquí. La visita ya quedó pagada.</Text>
        </View>
      ) : null}

      {/* 4: cotización por responder */}
      {s.estado === 'cotizada' && s.cotizacion ? (
        <View style={[estilos.tarjeta, { gap: espacio.s }]}>
          <Text style={estilos.nombre}>Cotización de {primerNombre}</Text>
          {s.cotizacion.total_anterior ? (
            <View style={estilos.corregida}>
              <Text style={estilos.corregidaTexto}>
                ✏️ {primerNombre} corrigió la cotización: antes era {pesos(s.cotizacion.total_anterior)}.
              </Text>
            </View>
          ) : null}
          <ResumenCotizacion cotizacion={s.cotizacion} tarifaVisita={s.tarifa_visita} />
          {/* Se envía la cotización que el cliente ve: si el maestro la corrigió entretanto, el servidor avisa */}
          <Boton titulo={`Aceptar y pagar ${pesos(s.cotizacion.total - s.tarifa_visita)}`} cargando={accion === 'aceptar'}
            deshabilitado={Boolean(accion)}
            onPress={() => ejecutar('aceptar', () => api.post(`/solicitudes/${s.id}/cotizacion/respuesta`,
              { aceptar: true, cotizacion_id: s.cotizacion.id }))} />
          {confirmarCancelar ? (
            <>
              <Text style={estilos.texto}>Si rechazas, la solicitud termina y la visita queda para {primerNombre} por el diagnóstico.</Text>
              <Boton titulo="Sí, rechazar la cotización" variante="secundario" cargando={accion === 'rechazar'}
                onPress={() => ejecutar('rechazar', () => api.post(`/solicitudes/${s.id}/cotizacion/respuesta`,
                  { aceptar: false, cotizacion_id: s.cotizacion.id }))} />
            </>
          ) : (
            <Boton titulo="Rechazar" variante="secundario" onPress={() => setConfirmarCancelar(true)} />
          )}
          <Text style={estilos.suave}>🔒 El saldo queda retenido por DeliMaster hasta que confirmes que el trabajo terminó.</Text>
        </View>
      ) : null}

      {/* confirmada: pagar con Webpay (HU-03): el total, o el saldo de la cotización aceptada */}
      {s.estado === 'confirmada' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.nombre}>{conVisita ? 'Aceptaste la cotización' : `${s.prestador.nombre} aceptó el trabajo`}</Text>
          <Text style={estilos.precio}>{pesos(s.monto_por_pagar)}</Text>
          {conVisita ? (
            <Text style={estilos.suave}>Total {pesos(s.precio_acordado)} menos la visita ya pagada ({pesos(s.tarifa_visita)}).</Text>
          ) : null}
          <OpcionesDePago monto={s.monto_por_pagar} tarjeta={tarjeta} onPagar={pagar} cargando={accion} />
          <Text style={estilos.suave}>
            🔒 Tu pago queda retenido por DeliMaster y solo se libera al maestro cuando confirmes que el trabajo terminó.
          </Text>
        </View>
      ) : null}

      {/* pagada: dinero retenido en garantía */}
      {s.estado === 'pagada' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.nombre}>🔒 Pago protegido</Text>
          <Text style={estilos.precio}>{pesos(s.precio_acordado)}</Text>
          <Text style={estilos.texto}>
            DeliMaster retiene tu pago. {s.prestador.nombre.split(' ')[0]} lo recibirá cuando el trabajo termine y tú confirmes el cierre.
          </Text>
        </View>
      ) : null}

      {/* finalizada: el prestador terminó; el cliente confirma o reporta un problema */}
      {s.estado === 'finalizada' ? (
        <View style={[estilos.tarjeta, estilos.esperando, { gap: espacio.s }]}>
          <Text style={estilos.nombre}>{s.prestador.nombre.split(' ')[0]} marcó el trabajo como terminado</Text>
          <Text style={estilos.texto}>¿Quedó bien? Al confirmar, se libera el pago de {pesos(s.precio_acordado)} al maestro.</Text>
          {!reportando ? (
            <>
              <Boton titulo="Sí, quedó bien: cerrar y liberar el pago" cargando={accion === 'cerrar'} deshabilitado={Boolean(accion)}
                onPress={() => ejecutar('cerrar', () => api.post(`/solicitudes/${s.id}/cerrar`, {}))} />
              <Boton titulo="Tengo un problema" variante="secundario" onPress={() => setReportando(true)} />
            </>
          ) : (
            <>
              <Campo etiqueta="¿Qué pasó?" value={motivo} onChangeText={setMotivo} multiline maxLength={500}
                placeholder="Ej.: quedaron ramas sobre el techo" ayuda="Tu pago seguirá retenido mientras el equipo DeliMaster revisa." />
              <Boton titulo="Enviar reporte" cargando={accion === 'reportar'} deshabilitado={motivo.trim().length < 10 || Boolean(accion)}
                onPress={() => ejecutar('reportar', () => api.post(`/solicitudes/${s.id}/reportar`, { motivo: motivo.trim() }))} />
              <Boton titulo="Volver" variante="secundario" onPress={() => setReportando(false)} />
            </>
          )}
          <Text style={estilos.suave}>Si no respondes, se cerrará automáticamente el {fechaCorta(s.cierre_automatico_en)}</Text>
        </View>
      ) : null}

      {/* cerrada: trabajo terminado y pago liberado; reseña (HU-06) */}
      {s.estado === 'cerrada' ? (
        <View style={[estilos.tarjeta, estilos.confirmada, { gap: espacio.s }]}>
          <Text style={estilos.nombre}>✔ Trabajo cerrado</Text>
          {s.monto_reembolsado ? (
            <Text style={estilos.texto}>
              El equipo DeliMaster revisó tu reclamo y te devolvió {pesos(s.monto_reembolsado)} a la tarjeta con que pagaste
              (el banco puede tardar unos días en reflejarlo). El resto se liberó a {s.prestador.nombre.split(' ')[0]}.
            </Text>
          ) : (
            <Text style={estilos.texto}>El pago fue liberado a {s.prestador.nombre.split(' ')[0]}. ¡Gracias por usar DeliMaster!</Text>
          )}
          {s.resena ? (
            <View style={{ marginTop: espacio.s }}>
              <Text style={estilos.suave}>Tu calificación</Text>
              <SelectorEstrellas valor={s.resena.estrellas} soloLectura tamano={24} />
              {s.resena.comentario ? <Text style={estilos.texto}>“{s.resena.comentario}”</Text> : null}
            </View>
          ) : (
            <View style={{ marginTop: espacio.s, gap: espacio.s }}>
              <Text style={estilos.nombre}>¿Cómo lo hizo {s.prestador.nombre.split(' ')[0]}?</Text>
              <SelectorEstrellas valor={estrellas} onCambio={setEstrellas} />
              <Campo etiqueta="Comentario (opcional)" value={comentario} onChangeText={setComentario} multiline maxLength={500}
                placeholder="Cuéntale a otros clientes cómo fue el trabajo" />
              <Boton titulo="Enviar calificación" cargando={accion === 'resena'} deshabilitado={!estrellas || Boolean(accion)}
                onPress={() => ejecutar('resena', () => api.post(`/solicitudes/${s.id}/resena`,
                  { estrellas, ...(comentario.trim() ? { comentario: comentario.trim() } : {}) }))} />
              <Text style={estilos.suave}>Tu opinión ayuda a otros clientes y solo se publica tu primer nombre.</Text>
            </View>
          )}
        </View>
      ) : null}

      {/* en_disputa: el cliente reportó un problema */}
      {s.estado === 'en_disputa' ? (
        <View style={[estilos.tarjeta, estilos.esperando]}>
          <Text style={estilos.nombre}>Reportaste un problema</Text>
          {s.motivo_disputa ? <Text style={estilos.texto}>“{s.motivo_disputa}”</Text> : null}
          <Text style={estilos.suave}>El equipo DeliMaster lo revisará. Tu pago sigue retenido mientras tanto.</Text>
        </View>
      ) : null}

      {/* Visita devuelta: el prestador no llegó o el cliente canceló con anticipación */}
      {s.estado === 'cancelada' && s.estado_visita === 'reembolsado' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.nombre}>Te devolvimos la visita</Text>
          <Text style={estilos.texto}>
            Webpay te devolvió {pesos(s.tarifa_visita)} a la tarjeta con que pagaste. El banco puede tardar unos días en reflejarlo.
          </Text>
        </View>
      ) : null}

      {/* Cotización rechazada: la visita quedó para el prestador */}
      {s.estado === 'cancelada' && s.cotizacion?.estado === 'rechazada' ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.nombre}>Rechazaste la cotización</Text>
          <Text style={estilos.texto}>La visita ({pesos(s.tarifa_visita)}) quedó para {primerNombre} por el diagnóstico.</Text>
        </View>
      ) : null}

      {/* HU-16: el equipo resolvió el reclamo a favor del cliente y Webpay devolvió el pago */}
      {s.estado === 'cancelada' && s.estado_pago === 'reembolsado' && s.estado_visita !== 'reembolsado' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.nombre}>Te devolvimos tu pago</Text>
          <Text style={estilos.texto}>
            El equipo DeliMaster revisó tu reclamo y te reembolsó {pesos(s.monto_por_pagar)} a la tarjeta con que pagaste.
            El banco puede tardar unos días en reflejarlo.
          </Text>
        </View>
      ) : null}

      {/* HU-09: gastos en materiales del maestro, con o sin boleta (los sin boleta se pueden apelar) */}
      {s.prestador && ['confirmada', 'pagada', 'finalizada', 'en_disputa', 'cerrada'].includes(s.estado) ? (
        <MaterialesDelTrabajo solicitudId={s.id} maestro={primerNombre} onApelada={setS} />
      ) : null}

      {/* Fotos de la solicitud: para que el maestro cotice con exactitud y, después del pago, como
          evidencia si hay que reportar un problema (HU-16) */}
      <FotosEvidencia solicitudId={s.id} titulo="Fotos"
        ayuda={['pagada', 'finalizada', 'en_disputa'].includes(s.estado)
          ? 'Si algo quedó mal, sube una foto: ayuda al equipo a resolver tu reclamo.'
          : 'Muestra lo que necesitas (el árbol, la falla, el lugar) para que el maestro cotice con más exactitud.'} />

      {/* HU-04: chat con el maestro asignado */}
      {s.prestador ? (
        <View style={{ marginBottom: espacio.m }}>
          <Boton titulo={`💬 Chat con ${s.prestador.nombre.split(' ')[0]}`} variante="secundario"
            onPress={() => router.push(`/chat/${s.id}`)} />
        </View>
      ) : null}

      {cancelable ? (
        confirmarCancelar ? (
          <View style={[estilos.tarjeta, { gap: espacio.s }]}>
            <Text style={estilos.texto}>
              {s.estado === 'visita_pagada'
                ? (cancelaSobreLaHora
                  ? `Faltan menos de 2 horas para la visita: si cancelas, la visita (${pesos(s.tarifa_visita)}) queda para ${primerNombre}.`
                  : `Cancelas con anticipación: te devolvemos la visita (${pesos(s.tarifa_visita)}).`)
                : s.estado === 'en_diagnostico' || (s.estado === 'confirmada' && conVisita)
                  ? `La visita ya fue pagada a ${primerNombre} por el diagnóstico. ¿Seguro que quieres cancelar?`
                  : '¿Seguro que quieres cancelar esta solicitud?'}
            </Text>
            <Boton titulo="Sí, cancelar" cargando={accion === 'cancelar'}
              onPress={() => ejecutar('cancelar', () => api.post(`/solicitudes/${s.id}/cancelar`, {}))} />
            <Boton titulo="No, volver" variante="secundario" onPress={() => setConfirmarCancelar(false)} />
          </View>
        ) : (
          <Text style={[estilos.enlace, { color: colores.error }]} onPress={() => setConfirmarCancelar(true)}>
            Cancelar solicitud
          </Text>
        )
      ) : null}

      <Text style={estilos.subtitulo}>Historial</Text>
      <View style={estilos.tarjeta}>
        {s.eventos.map((e, i) => (
          <View key={i} style={estilos.evento}>
            <Text style={estilos.texto}>{nombreEvento(e)}</Text>
            <Text style={estilos.suave}>{fechaCorta(e.creado_en)}{e.detalle ? ` · ${e.detalle}` : ''}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginBottom: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.s },
  categoria: { fontSize: 18, fontWeight: '800', color: colores.texto, flex: 1 },
  descripcion: { fontSize: 15, color: colores.texto, marginVertical: espacio.s, fontStyle: 'italic' },
  subtitulo: { fontSize: 17, fontWeight: '700', color: colores.texto, marginVertical: espacio.s },
  nombre: { fontSize: 16, fontWeight: '700', color: colores.texto, marginBottom: 2 },
  texto: { fontSize: 15, color: colores.texto },
  suave: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.xs },
  precio: { fontSize: 32, fontWeight: '800', color: colores.primarioOscuro, marginVertical: espacio.s },
  codigoTarjeta: { backgroundColor: colores.infoFondo, borderColor: colores.infoTexto, gap: espacio.xs },
  codigoFila: { flexDirection: 'row', justifyContent: 'center', gap: espacio.s, marginVertical: espacio.m },
  digito: {
    width: 56, height: 68, borderRadius: radio.s, backgroundColor: colores.superficie, alignItems: 'center', justifyContent: 'center',
    boxShadow: colores.sombra, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  digitoTexto: { fontSize: 34, fontWeight: '900', color: colores.texto, fontVariant: ['tabular-nums'] },
  esperando: { backgroundColor: colores.avisoFondo, borderColor: colores.avisoBorde },
  confirmada: { backgroundColor: colores.exitoFondo, borderColor: colores.exitoBorde, gap: espacio.xs },
  enlace: { color: colores.primario, fontWeight: '600', fontSize: 15, textAlign: 'center', marginVertical: espacio.m },
  evento: { paddingVertical: espacio.s, borderBottomWidth: 1, borderBottomColor: colores.fondo },
  corregida: { backgroundColor: colores.avisoFondo, borderWidth: 1, borderColor: colores.avisoBorde, borderRadius: radio.s, padding: espacio.s },
  corregidaTexto: { color: colores.avisoTexto, fontSize: 14, fontWeight: '600' },
}));
