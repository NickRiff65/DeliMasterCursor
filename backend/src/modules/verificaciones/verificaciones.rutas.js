import { Router } from 'express';
import { z } from 'zod';
import { validar, validarConsulta } from '../../middlewares/validar.js';
import { autenticar, autorizar } from '../../middlewares/autenticacion.js';
import { AppError } from '../../utils/AppError.js';
import { esquemaSolicitud, esquemaFiltroAdmin, esquemaResolucion } from './verificaciones.esquemas.js';
import * as servicio from './verificaciones.servicio.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Montado en /api/prestadores/yo/verificaciones
export const rutasVerificacionPrestador = Router();
rutasVerificacionPrestador.use(autenticar, autorizar('prestador'));

rutasVerificacionPrestador.get('/', async (req, res) => {
  res.json({ verificaciones: await servicio.listarPropias(req.usuario.id) });
});

rutasVerificacionPrestador.post('/', validar(esquemaSolicitud), async (req, res) => {
  res.status(201).json({ verificacion: await servicio.solicitar(req.usuario.id, req.body) });
});

// Montado en /api/admin/verificaciones
export const rutasVerificacionAdmin = Router();
rutasVerificacionAdmin.use(autenticar, autorizar('admin'));

rutasVerificacionAdmin.get('/', validarConsulta(esquemaFiltroAdmin), async (req, res) => {
  res.json({ verificaciones: await servicio.listarParaRevision(req.consulta) });
});

// Varias resoluciones en una sola petición (revisión en lote). Cada una se aplica por separado con las
// mismas reglas que la resolución individual: si una falla, no impide a las demás, y su motivo queda en
// su propio resultado. Nunca se aprueba nada que no tenga su vencimiento y su revisión por separado.
const LOTE_MAXIMO = 50;
rutasVerificacionAdmin.post('/lote', validar(z.object({
  decisiones: z.array(z.object({ id: z.string() }).passthrough())
    .min(1, 'Elige al menos una verificación')
    .max(LOTE_MAXIMO, `Puedes resolver hasta ${LOTE_MAXIMO} verificaciones a la vez`),
})), async (req, res) => {
  const resultados = [];
  for (const d of req.body.decisiones) {
    if (!UUID.test(d.id)) {
      resultados.push({ id: d.id, ok: false, codigo: 'VERIFICACION_NO_ENCONTRADA', error: 'Solicitud de verificación no encontrada' });
      continue;
    }
    const datos = esquemaResolucion.safeParse(d);
    if (!datos.success) {
      resultados.push({ id: d.id, ok: false, codigo: 'DATOS_INVALIDOS', error: datos.error.issues[0].message });
      continue;
    }
    try {
      await servicio.resolver(d.id, req.usuario.id, datos.data);
      resultados.push({ id: d.id, ok: true, decision: datos.data.decision });
    } catch (err) {
      const conocido = err instanceof AppError;
      resultados.push({
        id: d.id, ok: false, codigo: conocido ? err.codigo : 'ERROR',
        error: conocido ? err.message : 'No se pudo resolver esta verificación',
      });
    }
  }
  res.json({ aplicadas: resultados.filter((r) => r.ok).length, resultados });
});

rutasVerificacionAdmin.patch('/:id', validar(esquemaResolucion), async (req, res) => {
  if (!UUID.test(req.params.id)) {
    throw new AppError('Solicitud de verificación no encontrada', 404, 'VERIFICACION_NO_ENCONTRADA');
  }
  res.json({ verificacion: await servicio.resolver(req.params.id, req.usuario.id, req.body) });
});
