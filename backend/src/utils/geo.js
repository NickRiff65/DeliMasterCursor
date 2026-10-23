// Distancia en metros entre dos puntos (fórmula de haversine). Sirve para comprobar
// que el prestador confirma la llegada cerca del lugar que marcó el cliente.
const RADIO_TIERRA_M = 6_371_000;

export const RADIO_LLEGADA_M = 1_500;

const aRadianes = (grados) => (grados * Math.PI) / 180;

export function distanciaMetros(lat1, lon1, lat2, lon2) {
  const dLat = aRadianes(lat2 - lat1);
  const dLon = aRadianes(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(aRadianes(lat1)) * Math.cos(aRadianes(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(a))));
}
