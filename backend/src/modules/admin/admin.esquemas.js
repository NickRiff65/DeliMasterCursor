import { z } from 'zod';

const uuid = z.uuid('Identificador no válido');

// HU-16: resolución de una disputa
export const esquemaResolverDisputa = z.object({
  decision: z.enum(['liberar', 'reembolsar', 'parcial'], { error: 'La decisión debe ser liberar, reembolsar o parcial' }),
  // Solo en la devolución parcial: cuánto se le devuelve al cliente (el resto se libera al maestro)
  monto_reembolso: z.number({ error: 'Indica cuánto devolver al cliente' }).int('Monto en pesos, sin decimales')
    .positive('Indica cuánto devolver al cliente').optional(),
  // Solo en la devolución parcial: gastos del maestro que se rechazan (no justificados con boleta)
  gastos_rechazados: z.array(z.uuid('Gasto no válido')).max(50).transform((ids) => [...new Set(ids)]).optional(),
  observacion: z.string().trim()
    .min(10, 'Explica en al menos 10 caracteres por qué se resuelve así')
    .max(500, 'La observación no puede superar 500 caracteres'),
}).refine((r) => r.decision !== 'parcial' || r.monto_reembolso, {
  path: ['monto_reembolso'], message: 'Indica cuánto devolver al cliente',
});

export const esquemaFiltroDisputas = z.object({
  estado: z.enum(['abiertas', 'resueltas']).default('abiertas'),
});

// HU-13: registro de una transferencia a un prestador (una transferencia puede pagar varios trabajos)
export const esquemaTransferencia = z.object({
  movimientos: z.array(uuid).min(1, 'Elige al menos un pago').max(100)
    .transform((ids) => [...new Set(ids)]),
  comprobante: z.string().trim()
    .min(4, 'Ingresa el número de comprobante de la transferencia')
    .max(60, 'El comprobante es demasiado largo'),
});

// Moderación: activar o desactivar una cuenta
export const esquemaEstadoUsuario = z.object({
  activo: z.boolean({ error: 'Indica si la cuenta queda activa' }),
  motivo: z.string().trim().min(5, 'Indica el motivo').max(300).optional(),
}).refine((d) => d.activo || d.motivo, { path: ['motivo'], message: 'Indica el motivo de la desactivación' });
