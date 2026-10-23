import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { pesos, fechaCorta, hora, diaYHora } from '../../lib/formato';
import { Aviso } from '../../components/Aviso';
import { Boton } from '../../components/Boton';
import { Campo } from '../../components/Campo';
import { EstadoSolicitud } from '../../components/EstadoSolicitud';
import { CuentaRegresiva } from '../../components/CuentaRegresiva';
import { SelectorEstrellas } from '../../components/SelectorEstrellas';
import { GastosDelTrabajo } from '../../components/GastosDelTrabajo';
import { FotosEvidencia } from '../../components/FotosEvidencia';
import { SelectorHorario } from '../../components/SelectorHorario';
import { textoHorario } from '../../lib/horario';
import { abrirEnMapa, ubicacionActual } from '../../lib/ubicacion';
import { ResumenCotizacion } from '../../components/ResumenCotizacion';
import { colores, crearEstilos, espacio, radio } from '../../theme';
import { useTema } from '../../context/tema';

// "45.000" o "45000" → 45000
const aPesos = (texto) => Number(String(texto).replace(/\D/g, ''));

// De dónde sale lo que recibe el maestro: precio, devolución al cliente (si la hubo) y comisión
const detalleNeto = (s) => [
  pesos(s.precio_acordado),
  s.monto_reembolsado ? `menos ${pesos(s.monto_reembolsado)} devueltos al cliente` : null,
  `menos ${pesos(s.comision)} de comisión`,
].filter(Boolean).join(' ');

// Pro: detalle de un trabajo asignado. HU-05: aceptar o rechazar dentro del plazo, eligiendo la modalidad:
// visita de diagnóstico + cotización, o precio cerrado. Con visita: confirmar la llegada con el código
// del cliente y enviar la cotización.
export default function DetalleTrabajo() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { id } = useLocalSearchParams();
  const [s, setS] = useState(null);
  const [precio, setPrecio] = useState('');
  const [errorPrecio, setErrorPrecio] = useState(null);
  const [error, setError] = useState(null);
  const [accion, setAccion] = useState(null);
  const [confirmarFin, setConfirmarFin] = useState(false);
  const [modalidad, setModalidad] = useState('visita');
  const [tarifa, setTarifa] = useState('');
  const [horario, setHorario] = useState(null);
  const [jornada, setJornada] = useState(null);      // días y horas de atención del maestro (su ficha)
  const [campos, setCampos] = useState({});
  const [codigo, setCodigo] = useState('');
  const [manoObra, setManoObra] = useState('');
  const [materiales, setMateriales] = useState('');
  const [detalle, setDetalle] = useState('');
  const [corrigiendo, setCorrigiendo] = useState(false);   // corrigiendo la cotización ya enviada

  // Acciones que devuelven la solicitud actualizada; los errores de validación van junto a cada campo
  async function ejecutar(nombre, fn) {
    setError(null);
    setCampos({});
    setAccion(nombre);
    try {
      setS((await fn()).solicitud);
    } catch (e) {
      if (Object.keys(e.campos ?? {}).length) setCampos(e.campos);
      else setError(e.message);
      await cargar();
    } finally {
      setAccion(null);
    }
  }

  async function finalizar() {
    setError(null);
    setAccion('finalizar');
    try {
      setS((await api.post(`/solicitudes/${id}/finalizar`, {})).solicitud);
    } catch (e) {
      setError(e.message);
    } finally {
      setAccion(null);
      setConfirmarFin(false);
    }
  }

  // Para agendar la visita dentro de su horario de atención (si no se puede leer, se ofrecen todas las horas)
  useEffect(() => {
    if (s?.estado !== 'asignada' || jornada) return;
    api.get('/prestadores/yo').then((r) => setJornada(r.ficha.horario ?? null)).catch(() => {});
  }, [s?.estado, jornada]);

  const cargar = useCallback(async () => {
    try {
      setS((await api.get(`/solicitudes/${id}`)).solicitud);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function responder(aceptar) {
    setError(null);
    setErrorPrecio(null);
    setCampos({});
    const monto = aPesos(precio);
    let cuerpo = { aceptar };
    if (aceptar && modalidad === 'visita') {
      const faltan = {};
      if (!aPesos(tarifa)) faltan.tarifa_visita = 'Indica cuánto cobras por la visita';
      if (!horario) faltan.visita_programada_en = 'Elige el día y la hora de la visita';
      if (Object.keys(faltan).length) return setCampos(faltan);
      cuerpo = { aceptar, modalidad: 'visita', tarifa_visita: aPesos(tarifa), visita_programada_en: horario };
    } else if (aceptar) {
      if (!monto) return setErrorPrecio('Indica cuánto cobrarás por el trabajo');
      cuerpo = { aceptar, modalidad: 'precio_cerrado', precio: monto };
    }
    setAccion(aceptar ? 'aceptar' : 'rechazar');
    try {
      const r = await api.post(`/solicitudes/${id}/responder`, cuerpo);
      if (aceptar) setS(r.solicitud);
      else router.replace('/recibidas'); // al rechazar, la solicitud deja de ser suya
    } catch (e) {
      if (e.campos?.precio) setErrorPrecio(e.campos.precio);
      else if (e.campos?.tarifa_visita || e.campos?.visita_programada_en) setCampos(e.campos);
      else setError(e.message);
      await cargar();
    } finally {
      setAccion(null);
    }
  }

  if (!s) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <View style={estilos.tarjeta}>
        <View style={estilos.fila}>
          <Text style={estilos.categoria}>{s.categoria_nombre}</Text>
          <EstadoSolicitud estado={s.estado} vista="prestador" />
        </View>
        <Text style={estilos.descripcion}>“{s.descripcion}”</Text>
        <Text style={estilos.suave}>Cliente: {s.cliente.nombre} · 📍 {s.comuna}</Text>
        <Text style={estilos.suave}>Publicada: {fechaCorta(s.creado_en)}</Text>
      </View>

      {/* Dónde es el trabajo: la dirección exacta se muestra cuando el pago está asegurado */}
      {!['cerrada', 'cancelada'].includes(s.estado) ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>📍 Dónde es el trabajo</Text>
          {s.direccion_visible && s.direccion ? (
            <>
              <Text style={estilos.texto}>{s.direccion}, {s.comuna}</Text>
              {s.referencia ? <Text style={estilos.suave}>Referencia: {s.referencia}</Text> : null}
              <View style={{ marginTop: espacio.s }}>
                <Boton titulo="🗺️ Abrir en el mapa" variante="secundario" onPress={() => abrirEnMapa(s)} />
              </View>
            </>
          ) : s.direccion_visible ? (
            <Text style={estilos.texto}>{s.comuna}. El cliente no indicó la dirección exacta: pídesela por el chat.</Text>
          ) : (
            <Text style={estilos.texto}>
              {s.comuna}. Verás la dirección exacta cuando el cliente pague {s.modalidad === 'visita' || !s.modalidad ? 'la visita o el trabajo' : 'el trabajo'}.
            </Text>
          )}
        </View>
      ) : null}

      <Aviso mensaje={error} />

      {/* HU-04: chat con el cliente (por ejemplo, para aclarar el trabajo antes de dar un precio) */}
      <View style={{ marginBottom: espacio.m }}>
        <Boton titulo={`💬 Chat con ${s.cliente.nombre}`} variante="secundario" onPress={() => router.push(`/chat/${s.id}`)} />
      </View>

      {s.estado === 'asignada' ? (
        <View style={[estilos.tarjeta, estilos.responder]}>
          <Text style={estilos.titulo}>{s.cliente.nombre} te eligió para este trabajo</Text>
          <Text style={estilos.texto}>
            Responde antes de las {hora(s.responder_antes_de)} · quedan{' '}
            <CuentaRegresiva hasta={s.responder_antes_de} alVencer={cargar} />
          </Text>
          <Text style={[estilos.titulo, { marginTop: espacio.m }]}>¿Cómo quieres cobrar?</Text>
          <View style={estilos.opciones} accessibilityRole="radiogroup">
            {[
              ['visita', '🔍 Visita + cotización', 'Cobras la visita, diagnosticas y cotizas en la app.'],
              ['precio_cerrado', '💰 Precio cerrado', 'Ya sabes cuánto cuesta: el cliente paga el total.'],
            ].map(([valor, nombre, descripcion]) => (
              <Pressable key={valor} onPress={() => setModalidad(valor)} accessibilityRole="radio"
                accessibilityState={{ checked: modalidad === valor }} accessibilityLabel={nombre}
                style={[estilos.opcion, modalidad === valor && estilos.opcionElegida]}>
                <Text style={[estilos.opcionNombre, modalidad === valor && { color: colores.primarioOscuro }]}>{nombre}</Text>
                <Text style={estilos.suave}>{descripcion}</Text>
              </Pressable>
            ))}
          </View>
          {modalidad === 'visita' ? (
            <View style={{ marginTop: espacio.s }}>
              <Campo
                etiqueta="Tarifa de la visita (CLP)"
                value={tarifa}
                onChangeText={setTarifa}
                error={campos.tarifa_visita}
                placeholder={s.rango_visita ? `Ej.: ${s.rango_visita.min}` : 'Ej.: 25000'}
                keyboardType="number-pad"
                ayuda={s.rango_visita
                  ? `En ${s.comuna}: entre ${pesos(s.rango_visita.min)} y ${pesos(s.rango_visita.max)}. Se descuenta del total si el cliente contrata.`
                  : 'Se descuenta del total si el cliente contrata el trabajo.'}
              />
              <SelectorHorario valor={horario} onCambio={setHorario} horario={jornada} />
              {jornada ? <Text style={estilos.suave}>Según tu horario: {textoHorario(jornada)}. Lo cambias en tu ficha.</Text> : null}
              {campos.visita_programada_en ? <Text style={estilos.errorCampo}>{campos.visita_programada_en}</Text> : null}
              {horario ? <Text style={estilos.suave}>Visita: {diaYHora(horario)}</Text> : null}
            </View>
          ) : (
            <View style={{ marginTop: espacio.s }}>
              <Campo
                etiqueta="¿Cuánto cobrarás? (CLP)"
                value={precio}
                onChangeText={setPrecio}
                error={errorPrecio}
                placeholder="Ej.: 45000"
                keyboardType="number-pad"
                ayuda="El cliente paga este monto en la app y queda retenido hasta el cierre del trabajo."
              />
            </View>
          )}
          <Boton titulo="Aceptar trabajo" onPress={() => responder(true)} cargando={accion === 'aceptar'} deshabilitado={Boolean(accion)} />
          <View style={{ marginTop: espacio.s }}>
            <Boton titulo="Rechazar" variante="secundario" onPress={() => responder(false)}
              cargando={accion === 'rechazar'} deshabilitado={Boolean(accion)} />
          </View>
        </View>
      ) : null}

      {/* Visita + cotización */}
      {s.estado === 'visita_por_pagar' ? (
        <View style={[estilos.tarjeta, estilos.responder]}>
          <Text style={estilos.titulo}>Esperando que {s.cliente.nombre} pague la visita</Text>
          <Text style={estilos.texto}>Visita de {pesos(s.tarifa_visita)} · {diaYHora(s.visita_programada_en)}</Text>
          <Text style={estilos.suave}>Te avisamos aquí cuando la pague. Recién entonces queda confirmada.</Text>
        </View>
      ) : null}

      {s.estado === 'visita_pagada' ? (
        <View style={[estilos.tarjeta, estilos.confirmada, { gap: espacio.xs }]}>
          <Text style={estilos.titulo}>🔒 Visita pagada: {diaYHora(s.visita_programada_en)}</Text>
          <Text style={estilos.texto}>
            Cuando llegues, pídele a {s.cliente.nombre} su código de 4 dígitos. Al ingresarlo, la visita ({pesos(s.tarifa_visita)}) pasa a ser tuya.
            {s.latitud != null ? ' Como dejó el punto en el mapa, también confirmamos que estás en el lugar.' : ''}
          </Text>
          <Campo etiqueta="Código del cliente" value={codigo} onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 4))}
            error={campos.codigo ?? campos.latitud} placeholder="0000" keyboardType="number-pad" maxLength={4} />
          <Boton titulo="Confirmar llegada" cargando={accion === 'llegada'} deshabilitado={codigo.length !== 4 || Boolean(accion)}
            onPress={() => ejecutar('llegada', async () => {
              const cuerpo = { codigo };
              if (s.latitud != null) {
                const gps = await ubicacionActual();
                cuerpo.latitud = gps.latitud;
                cuerpo.longitud = gps.longitud;
              }
              return api.post(`/solicitudes/${id}/llegada`, cuerpo);
            })} />
          <Text style={estilos.suave}>Si no llegas, la visita se le devuelve al cliente.</Text>
        </View>
      ) : null}

      {s.estado === 'en_diagnostico' || (s.estado === 'cotizada' && corrigiendo) ? (
        <View style={[estilos.tarjeta, { gap: espacio.xs }]}>
          {corrigiendo ? (
            <>
              <Text style={estilos.titulo}>✏️ Corregir la cotización</Text>
              <Text style={estilos.texto}>{s.cliente.nombre} verá la nueva y cuánto era antes. Puedes corregirla mientras no responda.</Text>
            </>
          ) : (
            <>
              <Text style={estilos.titulo}>✔ Llegada confirmada: la visita ({pesos(s.tarifa_visita)}) ya es tuya</Text>
              <Text style={estilos.texto}>Cuando termines el diagnóstico, envía la cotización. El cliente la acepta o rechaza en la app.</Text>
            </>
          )}
          <Campo etiqueta="Mano de obra (CLP)" value={manoObra} onChangeText={setManoObra} error={campos.mano_obra}
            placeholder="Ej.: 120000" keyboardType="number-pad" />
          <Campo etiqueta="Materiales (CLP, opcional)" value={materiales} onChangeText={setMateriales} error={campos.materiales}
            placeholder="Ej.: 35000" keyboardType="number-pad" />
          <Campo etiqueta="¿Qué incluye el trabajo?" value={detalle} onChangeText={setDetalle} error={campos.detalle}
            multiline maxLength={1000} placeholder="Ej.: cambio del tablero, 3 automáticos nuevos y certificación" />
          {aPesos(manoObra) + aPesos(materiales) > 0 ? (
            <ResumenCotizacion
              cotizacion={{ mano_obra: aPesos(manoObra), materiales: aPesos(materiales), total: aPesos(manoObra) + aPesos(materiales) }}
              tarifaVisita={s.tarifa_visita} />
          ) : null}
          <Boton titulo={corrigiendo ? 'Enviar cotización corregida' : 'Enviar cotización'} cargando={accion === 'cotizar'}
            deshabilitado={!(aPesos(manoObra) + aPesos(materiales)) || detalle.trim().length < 10 || Boolean(accion)}
            onPress={() => ejecutar('cotizar', async () => {
              const r = await api.post(`/solicitudes/${id}/cotizacion`, {
                mano_obra: aPesos(manoObra), materiales: aPesos(materiales), detalle: detalle.trim(),
              });
              setCorrigiendo(false);
              return r;
            })} />
          {corrigiendo ? <Boton titulo="Cancelar" variante="secundario" onPress={() => setCorrigiendo(false)} /> : null}
          <Text style={estilos.suave}>El total incluye la visita: el cliente solo pagará la diferencia.</Text>
        </View>
      ) : null}

      {s.estado === 'cotizada' && s.cotizacion && !corrigiendo ? (
        <View style={[estilos.tarjeta, estilos.responder]}>
          <Text style={estilos.titulo}>Cotización enviada · esperando a {s.cliente.nombre}</Text>
          {s.cotizacion.total_anterior ? (
            <Text style={estilos.suave}>✏️ La corregiste (antes {pesos(s.cotizacion.total_anterior)}).</Text>
          ) : null}
          <ResumenCotizacion cotizacion={s.cotizacion} tarifaVisita={s.tarifa_visita} />
          <Text style={estilos.suave}>Si la rechaza, la visita igual queda para ti.</Text>
          {/* ¿Te equivocaste? Se puede corregir mientras el cliente no responda */}
          <View style={{ marginTop: espacio.s }}>
            <Boton titulo="✏️ Corregir cotización" variante="secundario" onPress={() => {
              setManoObra(String(s.cotizacion.mano_obra));
              setMateriales(s.cotizacion.materiales ? String(s.cotizacion.materiales) : '');
              setDetalle(s.cotizacion.detalle ?? '');
              setCorrigiendo(true);
            }} />
          </View>
        </View>
      ) : null}

      {s.estado === 'confirmada' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.titulo}>
            {s.modalidad === 'visita' ? `${s.cliente.nombre} aceptó tu cotización de ${pesos(s.precio_acordado)}` : `Aceptaste por ${pesos(s.precio_acordado)}`}
          </Text>
          <Text style={estilos.texto}>
            {s.modalidad === 'visita'
              ? `Falta que pague el saldo (${pesos(s.monto_por_pagar)}). Quedará retenido en DeliMaster y se te transferirá al cerrar el trabajo.`
              : `Cuando ${s.cliente.nombre} pague, el dinero quedará retenido en DeliMaster y se te transferirá al cerrar el trabajo.`}
          </Text>
        </View>
      ) : null}

      {s.estado === 'pagada' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.titulo}>🔒 {s.cliente.nombre} pagó {pesos(s.precio_acordado)}</Text>
          <Text style={estilos.texto}>
            El dinero está retenido en DeliMaster. Haz el trabajo y, cuando el cliente confirme el cierre, se te transferirá
            el monto menos la comisión de la plataforma. Ya pueden compartir datos de contacto en el chat.
          </Text>
          <View style={{ marginTop: espacio.m, gap: espacio.s }}>
            {confirmarFin ? (
              <>
                <Text style={estilos.texto}>¿Terminaste el trabajo? El cliente podrá confirmar el cierre o reportar un problema; si no responde, se cerrará automáticamente.</Text>
                <Boton titulo="Sí, lo terminé" onPress={finalizar} cargando={accion === 'finalizar'} />
                <Boton titulo="Todavía no" variante="secundario" onPress={() => setConfirmarFin(false)} />
              </>
            ) : (
              <Boton titulo="Marcar trabajo como terminado" onPress={() => setConfirmarFin(true)} />
            )}
          </View>
        </View>
      ) : null}

      {s.estado === 'finalizada' ? (
        <View style={[estilos.tarjeta, estilos.responder]}>
          <Text style={estilos.titulo}>Esperando que {s.cliente.nombre} confirme el cierre</Text>
          <Text style={estilos.texto}>
            Si no responde, el trabajo se cerrará automáticamente el {fechaCorta(s.cierre_automatico_en)} y se liberará tu pago.
          </Text>
        </View>
      ) : null}

      {s.estado === 'cerrada' ? (
        <View style={[estilos.tarjeta, estilos.confirmada]}>
          <Text style={estilos.titulo}>
            {s.estado_pago === 'transferido' ? '✔ Trabajo cerrado: pago transferido' : '✔ Trabajo cerrado: pago liberado'}
          </Text>
          {s.monto_reembolsado ? (
            <Text style={estilos.texto}>
              El equipo DeliMaster resolvió el reclamo en parte: devolvió {pesos(s.monto_reembolsado)} a {s.cliente.nombre} y
              liberó el resto a tu favor.
            </Text>
          ) : null}
          {s.monto_neto ? (
            <Text style={estilos.texto}>
              {s.estado_pago === 'transferido'
                ? `Te transferimos ${pesos(s.monto_neto)} el ${fechaCorta(s.transferido_en)} (${detalleNeto(s)}).`
                : `Recibirás ${pesos(s.monto_neto)} por transferencia dentro de 48 horas hábiles (${detalleNeto(s)}).`}
            </Text>
          ) : null}
          {s.resena ? (
            <View style={{ marginTop: espacio.m }}>
              <Text style={estilos.suave}>Calificación de {s.cliente.nombre}</Text>
              <SelectorEstrellas valor={s.resena.estrellas} soloLectura tamano={24} />
              {s.resena.comentario ? <Text style={estilos.texto}>“{s.resena.comentario}”</Text> : null}
            </View>
          ) : <Text style={[estilos.suave, { marginTop: espacio.s }]}>{s.cliente.nombre} aún no deja su calificación.</Text>}
        </View>
      ) : null}

      {s.estado === 'en_disputa' ? (
        <View style={[estilos.tarjeta, estilos.responder]}>
          <Text style={estilos.titulo}>{s.cliente.nombre} reportó un problema</Text>
          {s.motivo_disputa ? <Text style={estilos.texto}>“{s.motivo_disputa}”</Text> : null}
          <Text style={estilos.suave}>El equipo DeliMaster revisará el caso. El pago sigue retenido mientras tanto.</Text>
        </View>
      ) : null}

      {/* Fotos de la solicitud: las del cliente para cotizar y, después del pago, las del trabajo terminado
          como respaldo si el cliente reclama (HU-16) */}
      <FotosEvidencia solicitudId={s.id} titulo="Fotos"
        ayuda={['pagada', 'finalizada', 'en_disputa'].includes(s.estado)
          ? 'Sube fotos del trabajo terminado: son tu respaldo si el cliente reporta un problema.'
          : 'Aquí ves las fotos que envió el cliente. También puedes subir las del diagnóstico.'} />

      {/* HU-09: panel contable del trabajo (desde que el prestador aceptó) */}
      {['confirmada', 'pagada', 'finalizada', 'cerrada', 'en_disputa'].includes(s.estado) ? (
        <GastosDelTrabajo solicitudId={s.id} />
      ) : null}

      {s.estado === 'cancelada' ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.texto}>
            {s.estado_visita === 'reembolsado'
              ? 'La visita se le devolvió al cliente (no se confirmó la llegada o canceló con anticipación).'
              : s.cotizacion?.estado === 'rechazada'
                ? `${s.cliente.nombre} rechazó la cotización. La visita (${pesos(s.tarifa_visita)}) quedó para ti: se te transferirá con tus demás pagos.`
                : s.estado_pago === 'reembolsado'
                  ? 'El equipo DeliMaster revisó el reclamo del cliente y le devolvió el pago. Puedes ver el detalle en el historial.'
                  : s.estado_visita === 'liberado'
                    ? `El cliente canceló. La visita (${pesos(s.tarifa_visita)}) quedó para ti.`
                    : 'El cliente canceló esta solicitud.'}
          </Text>
        </View>
      ) : null}
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
  titulo: { fontSize: 16, fontWeight: '700', color: colores.texto, marginBottom: espacio.xs },
  texto: { fontSize: 15, color: colores.texto },
  suave: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.xs },
  responder: { backgroundColor: colores.avisoFondo, borderColor: colores.avisoBorde },
  confirmada: { backgroundColor: colores.exitoFondo, borderColor: colores.exitoBorde },
  opciones: { gap: espacio.s, marginTop: espacio.xs },
  opcion: {
    borderWidth: 1.5, borderColor: colores.borde, borderRadius: radio.s, padding: espacio.m, backgroundColor: colores.superficie,
  },
  opcionElegida: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  opcionNombre: { fontSize: 15, fontWeight: '800', color: colores.texto },
  errorCampo: { color: colores.error, fontSize: 13, marginTop: espacio.xs },
}));
