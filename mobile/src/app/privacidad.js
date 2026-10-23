import { DocumentoLegal } from '../components/DocumentoLegal';
import { PRIVACIDAD } from '../legal/textos';
import { useTema } from '../context/tema';

export default function Privacidad() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  return <DocumentoLegal titulo="Política de privacidad" secciones={PRIVACIDAD} />;
}
