import { DocumentoLegal } from '../components/DocumentoLegal';
import { TERMINOS, paraApp } from '../legal/textos';
import { ROL_APP } from '../lib/variante';
import { useTema } from '../context/tema';

export default function Terminos() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  return <DocumentoLegal titulo="Términos de uso" secciones={paraApp(TERMINOS, ROL_APP)} />;
}
