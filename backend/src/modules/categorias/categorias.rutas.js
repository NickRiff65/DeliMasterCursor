import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { COMUNAS } from '../../utils/comunas.js';

export const rutasCategorias = Router();

// Oficios y trabajos de campo habilitados (para los filtros del catálogo): primero los oficios
rutasCategorias.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT slug, nombre, tipo, requiere_verificacion, organismo
       FROM categorias WHERE activa ORDER BY tipo DESC, nombre`);
  res.json({ categorias: rows });
});

export const rutasComunas = Router();

rutasComunas.get('/', (_req, res) => {
  res.json({ comunas: COMUNAS });
});
