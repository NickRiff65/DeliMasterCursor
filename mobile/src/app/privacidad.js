import { DocumentoLegal } from '../components/DocumentoLegal';
import { PRIVACIDAD, paraApp } from '../legal/textos';
import { ROL_APP } from '../lib/variante';
import { useTema } from '../context/tema';

export default function Privacidad() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  return <DocumentoLegal titulo="Política de privacidad" secciones={paraApp(PRIVACIDAD, ROL_APP)} />;
}
