import { Router } from 'express';

export const rutasSalud = Router();

// Permite verificar que la API está arriba (usado también por el proveedor PaaS).
rutasSalud.get('/', (_req, res) => {
  res.json({ estado: 'ok', servicio: 'delimaster-api', fecha: new Date().toISOString() });
});
