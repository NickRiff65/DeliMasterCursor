import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SesionProvider } from './sesion.jsx';
import App from './App.jsx';
import { aplicarTema, leerTema } from './tema.js';
import './estilos.css';

// La apariencia guardada se aplica antes de dibujar, para que no parpadee la clara
aplicarTema(leerTema());

// En el servidor el panel vive en /admin (build:servidor); en desarrollo, en la raíz
const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={base}>
      <SesionProvider>
        <App />
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
);
