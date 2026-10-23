import { z } from 'zod';

// Comunas donde opera DeliMaster: Chillán (zona urbana) y Coihueco (zona rural).
export const COMUNAS = ['Chillán', 'Coihueco'];

// Las 21 comunas de Ñuble: solo para reconocer en un texto una comuna fuera de la cobertura
// (por ejemplo, que "Chillán Viejo" no se confunda con "Chillán").
export const COMUNAS_NUBLE = [
  'Bulnes', 'Chillán', 'Chillán Viejo', 'Cobquecura', 'Coelemu', 'Coihueco', 'El Carmen',
  'Ninhue', 'Ñiquén', 'Pemuco', 'Pinto', 'Portezuelo', 'Quillón', 'Quirihue', 'Ránquil',
  'San Carlos', 'San Fabián', 'San Ignacio', 'San Nicolás', 'Treguaco', 'Yungay',
];

// "CHILLAN", "chillán" o " Chillán " → misma clave
export function clave(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const porClave = new Map(COMUNAS.map((c) => [clave(c), c]));

// Devuelve el nombre oficial de la comuna, o null si DeliMaster no opera en ella.
export function normalizarComuna(texto) {
  return typeof texto === 'string' ? (porClave.get(clave(texto)) ?? null) : null;
}

export const esquemaComuna = z.string()
  .transform(normalizarComuna)
  .refine((c) => c !== null, 'Por ahora DeliMaster atiende solo en Chillán y Coihueco');
