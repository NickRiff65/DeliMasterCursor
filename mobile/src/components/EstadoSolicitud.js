import { Text, View } from 'react-native';
import { colores, crearEstilos } from '../theme';

// Etiqueta de color para cada estado de la máquina de estados de la solicitud.
// Los textos cambian según quién mira (cliente o prestador).
// fondo y color son nombres de la paleta (theme.js), así sirven en modo claro y oscuro
const ESTADOS = {
  creada: { cliente: 'Elige un maestro', prestador: 'Disponible', fondo: 'infoFondo', color: 'infoTexto' },
  asignada: { cliente: 'Esperando respuesta', prestador: 'Responde ahora', fondo: 'avisoInsignia', color: 'avisoTexto' },
  // Modalidad "visita + cotización"
  visita_por_pagar: { cliente: 'Paga la visita', prestador: 'Esperando pago de visita', fondo: 'avisoInsignia', color: 'avisoTexto' },
  visita_pagada: { cliente: 'Visita agendada', prestador: 'Visita agendada', fondo: 'infoFondo', color: 'infoTexto' },
  en_diagnostico: { cliente: 'En diagnóstico', prestador: 'Envía la cotización', fondo: 'indigoFondo', color: 'indigoTexto' },
  cotizada: { cliente: 'Revisa la cotización', prestador: 'Cotización enviada', fondo: 'avisoInsignia', color: 'avisoTexto' },
  confirmada: { cliente: 'Lista para pagar', prestador: 'Esperando pago', fondo: 'exitoInsignia', color: 'exitoTexto' },
  pagada: { cliente: 'Pagada', prestador: 'Pagada', fondo: 'exitoInsignia', color: 'exitoTexto' },
  finalizada: { cliente: 'Por confirmar cierre', prestador: 'Finalizada', fondo: 'indigoFondo', color: 'indigoTexto' },
  cerrada: { cliente: 'Cerrada', prestador: 'Cerrada', fondo: 'neutroFondo', color: 'neutroTexto' },
  cancelada: { cliente: 'Cancelada', prestador: 'Cancelada', fondo: 'errorSuave', color: 'errorTexto' },
  en_disputa: { cliente: 'En revisión', prestador: 'En revisión', fondo: 'errorSuave', color: 'errorTexto' },
};

export function EstadoSolicitud({ estado, vista = 'cliente' }) {
  const e = ESTADOS[estado] ?? ESTADOS.cerrada;
  return (
    <View style={[estilos.etiqueta, { backgroundColor: colores[e.fondo] }]}>
      <View style={[estilos.punto, { backgroundColor: colores[e.color] }]} />
      <Text style={[estilos.texto, { color: colores[e.color] }]}>{e[vista]}</Text>
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  etiqueta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  punto: { width: 7, height: 7, borderRadius: 4 },
  texto: { fontSize: 12, fontWeight: '700' },
}));
