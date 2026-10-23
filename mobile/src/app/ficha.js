import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { SeleccionMultiple } from '../components/SeleccionMultiple';
import { HorarioAtencion } from '../components/HorarioAtencion';
import { HORARIO_INICIAL } from '../lib/horario';
import { colores, crearEstilos, espacio } from '../theme';
import { useTema } from '../context/tema';

// DeliMaster Pro: edición de la ficha del maestro (PUT /prestadores/yo), incluido su horario de atención
export default function Ficha() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [opciones, setOpciones] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [comunas, setComunas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [horario, setHorario] = useState(HORARIO_INICIAL);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/prestadores/yo'), api.get('/categorias'), api.get('/comunas')])
      .then(([{ ficha }, cat, com]) => {
        setDescripcion(ficha.descripcion ?? '');
        setComunas(ficha.comunas_atendidas);
        setCategorias(ficha.categorias.map((c) => c.slug));
        if (ficha.horario) setHorario(ficha.horario);
        setOpciones({ categorias: cat.categorias, comunas: com.comunas });
      })
      .catch((e) => setError(e.message));
  }, []);

  async function guardar() {
    setError(null);
    setErrores({});
    if (!categorias.length || !comunas.length) {
      setError('Elige al menos un servicio y una comuna.');
      return;
    }
    if (!horario.dias.length || horario.hasta <= horario.desde) {
      setError('Revisa tu horario de atención.');
      return;
    }
    setGuardando(true);
    try {
      await api.put('/prestadores/yo', { descripcion: descripcion.trim(), comunas_atendidas: comunas, categorias, horario });
      // Vuelve al panel (si se abrió la ficha directamente, no hay pantalla anterior)
      if (router.canGoBack()) router.back();
      else router.replace('/panel');
    } catch (e) {
      setErrores(e.campos);
      setError(e.message);
      setGuardando(false);
    }
  }

  if (!opciones) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <Aviso mensaje={error} />

      <Text style={estilos.titulo}>¿Qué servicios ofreces?</Text>
      <Text style={estilos.ayuda}>Los servicios marcados con «requiere verificación» aparecen en el catálogo cuando se aprueba tu registro oficial.</Text>
      <SeleccionMultiple
        opciones={opciones.categorias.map((c) => ({
          valor: c.slug,
          etiqueta: c.requiere_verificacion ? `${c.nombre} (requiere verificación ${c.organismo})` : c.nombre,
        }))}
        seleccion={categorias}
        onCambio={setCategorias}
      />
      {errores.categorias ? <Text style={estilos.error}>{errores.categorias}</Text> : null}

      <Text style={[estilos.titulo, { marginTop: espacio.l }]}>¿En qué comunas trabajas?</Text>
      <SeleccionMultiple
        opciones={opciones.comunas.map((c) => ({ valor: c, etiqueta: c }))}
        seleccion={comunas}
        onCambio={setComunas}
      />
      {errores.comunas_atendidas ? <Text style={estilos.error}>{errores.comunas_atendidas}</Text> : null}

      <Text style={[estilos.titulo, { marginTop: espacio.l }]}>¿Cuándo trabajas?</Text>
      <Text style={estilos.ayuda}>Los clientes ven tu horario en tu perfil y las visitas se agendan dentro de él.</Text>
      <HorarioAtencion valor={horario} onCambio={setHorario}
        error={errores['horario.dias'] ?? errores['horario.desde'] ?? errores['horario.hasta'] ?? errores.horario} />

      <View style={{ marginTop: espacio.l }}>
        <Campo
          etiqueta="Descripción"
          value={descripcion}
          onChangeText={setDescripcion}
          error={errores.descripcion}
          placeholder="Ej.: Electricista con 10 años de experiencia, tableros y enchufes."
          multiline
          maxLength={600}
          style={estilos.areaTexto}
          ayuda={`${descripcion.length}/600 · Cuenta tu experiencia y el equipo con que trabajas.`}
        />
      </View>

      <Boton titulo="Guardar ficha" onPress={guardar} cargando={guardando} />
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto, marginBottom: espacio.xs },
  ayuda: { fontSize: 13, color: colores.textoSuave, marginBottom: espacio.m },
  error: { color: colores.error, fontSize: 13, marginTop: espacio.xs },
  areaTexto: {
    minHeight: 110, textAlignVertical: 'top', paddingTop: 12, borderWidth: 1, borderColor: colores.borde,
    borderRadius: 8, paddingHorizontal: espacio.m, fontSize: 16, color: colores.texto, backgroundColor: colores.superficie,
  },
}));
