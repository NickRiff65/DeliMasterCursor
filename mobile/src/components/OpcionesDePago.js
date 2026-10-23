import { useState } from 'react';
import { Text, View } from 'react-native';
import { pesos } from '../lib/formato';
import { Boton } from './Boton';
import { Casilla } from './Casilla';
import { colores, crearEstilos, espacio, radio } from '../theme';

// Cómo pagar (Lite). Con una tarjeta guardada se paga con un toque, sin volver a ingresarla, y se
// puede cambiar. Sin tarjeta guardada, se ofrece guardarla al pagar (Transbank la guarda; DeliMaster
// solo ve el tipo y los últimos 4 dígitos), marcado por defecto cuando habrá un segundo pago (la visita).
export function OpcionesDePago({ monto, tarjeta, onPagar, cargando, guardarPorDefecto = false, etiqueta = 'Pagar' }) {
  const [guardar, setGuardar] = useState(guardarPorDefecto);
  const [otras, setOtras] = useState(false);

  if (tarjeta) {
    return (
      <View style={{ gap: espacio.s }}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.icono}>💳</Text>
          <View style={{ flex: 1 }}>
            <Text style={estilos.tarjetaNombre}>{tarjeta.tipo ?? 'Tarjeta'} •••• {tarjeta.ultimos4}</Text>
            <Text style={estilos.suave}>Tu tarjeta guardada</Text>
          </View>
        </View>
        <Boton titulo={`${etiqueta} ${pesos(monto)} con •••• ${tarjeta.ultimos4}`} cargando={cargando === 'tarjeta_guardada'}
          deshabilitado={Boolean(cargando)} onPress={() => onPagar('tarjeta_guardada')} />
        {otras ? (
          <>
            <Boton titulo="Cambiar tarjeta y pagar" variante="secundario" cargando={cargando === 'guardar_tarjeta'}
              deshabilitado={Boolean(cargando)} onPress={() => onPagar('guardar_tarjeta')} />
            <Boton titulo="Pagar con otra tarjeta sin guardarla" variante="secundario" cargando={cargando === 'webpay'}
              deshabilitado={Boolean(cargando)} onPress={() => onPagar('webpay')} />
            <Text style={estilos.suave}>Al cambiarla, la nueva reemplaza a la que tienes guardada.</Text>
          </>
        ) : (
          <Text style={estilos.enlace} onPress={() => setOtras(true)} accessibilityRole="button">Cambiar tarjeta de pago</Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: espacio.s }}>
      <Casilla marcada={guardar} onCambio={setGuardar}>
        Guardar mi tarjeta para no volver a ingresarla en el próximo pago.{' '}
        <Text style={estilos.suave}>
          Transbank la guarda (hace un pequeño cobro de validación que se devuelve); DeliMaster solo ve los últimos 4 dígitos.
        </Text>
      </Casilla>
      <Boton titulo={`${etiqueta} ${pesos(monto)} con Webpay`} cargando={Boolean(cargando)} deshabilitado={Boolean(cargando)}
        onPress={() => onPagar(guardar ? 'guardar_tarjeta' : 'webpay')} />
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  tarjeta: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.s, padding: espacio.s, borderRadius: radio.s,
    backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  icono: { fontSize: 24 },
  tarjetaNombre: { fontSize: 15, fontWeight: '700', color: colores.texto },
  suave: { fontSize: 13, color: colores.textoSuave },
  enlace: { color: colores.primario, fontWeight: '700', fontSize: 14, textAlign: 'center', paddingVertical: 4 },
}));
