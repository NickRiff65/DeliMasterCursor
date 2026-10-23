import { DocumentoLegal } from '../components/DocumentoLegal';
import { TERMINOS } from '../legal/textos';
import { useTema } from '../context/tema';

export default function Terminos() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  return <DocumentoLegal titulo="Términos de uso" secciones={TERMINOS} />;
}
