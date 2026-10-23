import { z } from 'zod';

// Token que entrega Expo al pedir permiso de avisos en el celular
const token = z.string().trim().regex(
  /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/,
  'El identificador del teléfono no es válido',
);

export const esquemaDispositivo = z.object({
  token,
  plataforma: z.enum(['ios', 'android'], { error: 'Plataforma no válida' }),
});

export const esquemaQuitarDispositivo = z.object({ token });
