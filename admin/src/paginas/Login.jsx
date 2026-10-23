import { useState } from 'react';
import { useSesion } from '../sesion.jsx';
import { Aviso } from '../componentes/comunes.jsx';

export default function Login() {
  const { iniciarSesion } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await iniciarSesion(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="tarjeta login-tarjeta" onSubmit={enviar}>
        <div className="marca">
          <span className="marca-logo" aria-hidden="true">D</span>
          <div>
            <strong>DeliMaster</strong>
            <span>Panel de administración</span>
          </div>
        </div>
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <Aviso mensaje={error} />
        <button className="boton" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="suave pequeno">Solo para el equipo de DeliMaster. La sesión se cierra al cerrar la pestaña.</p>
      </form>
    </div>
  );
}
