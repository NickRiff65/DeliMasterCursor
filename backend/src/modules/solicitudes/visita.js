import { randomInt } from 'node:crypto';
import { clave } from '../../utils/comunas.js';

// Reglas de la modalidad "visita + cotización".
// El cliente paga la visita al contratar; el prestador la recibe al llegar (código de llegada),
// cotiza el trabajo en terreno y, si el cliente acepta, paga la cotización completa con garantía.
// La visita y la cotización son valores independientes (decisión del equipo, noviembre 2026: sumar
// la visita a la cotización confundía al maestro); al maestro se le transfieren ambos.

// Tarifa de visita: DeliMaster fija un rango por zona y cada prestador elige dentro de él.
// Mínimo $5.000 en ambas zonas; la rural (Coihueco) admite un máximo mayor por el traslado.
export const RANGOS_VISITA = {
  urbano: { min: 5_000, max: 35_000, comunas: ['Chillán'] },
  rural: { min: 5_000, max: 45_000 },
};

export function rangoVisita(comuna) {
  const urbano = RANGOS_VISITA.urbano.comunas.some((c) => clave(c) === clave(comuna ?? ''));
  const { min, max } = urbano ? RANGOS_VISITA.urbano : RANGOS_VISITA.rural;
  return { min, max, zona: urbano ? 'urbana' : 'rural' };
}

export const REGLAS_VISITA = {
  // Minutos de tolerancia después de la hora acordada antes de que el cliente pueda pedir la devolución
  toleranciaMin: 30,
  // Si el prestador nunca llegó, la visita se devuelve sola pasadas estas horas
  reembolsoAutomaticoHoras: 24,
  // Cancelar con al menos estas horas de anticipación devuelve la visita; después, la recibe el prestador
  cancelacionSinCostoHoras: 2,
  // Intentos para ingresar el código de llegada (evita adivinarlo)
  maxIntentosCodigo: 5,
  // La visita se puede agendar con hasta este número de días de anticipación
  maxDiasProgramacion: 30,
};

// Código de llegada de 4 dígitos (0000–9999), con un generador criptográfico
export const nuevoCodigoLlegada = () => String(randomInt(0, 10_000)).padStart(4, '0');
