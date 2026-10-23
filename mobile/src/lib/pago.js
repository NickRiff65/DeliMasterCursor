import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';

// Lleva al cliente a una página de Transbank (pagar con Webpay o registrar su tarjeta) y espera a que vuelva.
// En web la página completa se va y vuelve a `ruta` (devuelve null); en el celular se abre un navegador
// seguro dentro de la app y vuelve por el enlace profundo de DeliMaster con ?pago=…
const direccion = (ruta) => (Platform.OS === 'web' ? `${window.location.origin}${ruta}` : Linking.createURL(ruta));

async function irATransbank(ruta, pedir) {
  const volverA = direccion(ruta);
  const { url_pago } = await pedir(volverA);
  if (Platform.OS === 'web') {
    window.location.href = url_pago;
    return null;
  }
  const r = await WebBrowser.openAuthSessionAsync(url_pago, volverA);
  if (r.type === 'success') return new URL(r.url).searchParams.get('pago');
  return 'cancelado';
}

// HU-03: paga lo pendiente de una solicitud (visita, saldo o total) con dinero retenido en garantía.
//  · webpay           → ingresa la tarjeta en Webpay (no se guarda)
//  · guardar_tarjeta  → registra su tarjeta en Transbank y se cobra con ella al volver
//  · tarjeta_guardada → se cobra al instante con la tarjeta que ya guardó (no sale de la app)
// Devuelve el resultado: aprobado, rechazado o cancelado (null en web cuando la página se va a Transbank).
export async function pagar(solicitudId, medio = 'webpay') {
  const ruta = `/solicitud/${solicitudId}`;
  if (medio === 'tarjeta_guardada') {
    const r = await api.post(`/solicitudes/${solicitudId}/pago`, { volver_a: direccion(ruta), medio });
    return r.resultado;
  }
  return irATransbank(ruta, (volverA) => api.post(`/solicitudes/${solicitudId}/pago`, { volver_a: volverA, medio }));
}

// Mi cuenta: guardar o cambiar la tarjeta sin pagar nada
export function guardarTarjeta() {
  return irATransbank('/cuenta', (volverA) => api.post('/pagos/tarjeta', { volver_a: volverA }));
}
