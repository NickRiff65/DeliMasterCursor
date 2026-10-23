import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { usarToken } from '../src/api.js';

// Cada prueba parte sin sesión, sin almacenamiento y con la API sin simular
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  usarToken(null);
});
