import { Navigate, Route, Routes } from 'react-router-dom';
import { useSesion } from './sesion.jsx';
import { Marco } from './componentes/Marco.jsx';
import Login from './paginas/Login.jsx';
import Resumen from './paginas/Resumen.jsx';
import Verificaciones from './paginas/Verificaciones.jsx';
import Disputas from './paginas/Disputas.jsx';
import Solicitud from './paginas/Solicitud.jsx';
import Liquidaciones from './paginas/Liquidaciones.jsx';
import Moderacion from './paginas/Moderacion.jsx';
import Contabilidad from './paginas/Contabilidad.jsx';

export default function App() {
  const { usuario } = useSesion();
  if (!usuario) return <Login />;
  return (
    <Marco>
      <Routes>
        <Route path="/" element={<Resumen />} />
        <Route path="/verificaciones" element={<Verificaciones />} />
        <Route path="/disputas" element={<Disputas />} />
        <Route path="/solicitudes/:id" element={<Solicitud />} />
        <Route path="/liquidaciones" element={<Liquidaciones />} />
        <Route path="/moderacion" element={<Moderacion />} />
        <Route path="/contabilidad" element={<Contabilidad />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Marco>
  );
}
