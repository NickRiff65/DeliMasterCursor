import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// host: true permite abrir el panel desde otro equipo de la misma red (http://<ip>:5173)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: true },
  // Pruebas automáticas (npm.cmd test): navegador simulado con jsdom y la API simulada
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/preparar.js'],
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
