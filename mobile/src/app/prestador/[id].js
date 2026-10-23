import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { Estrellas } from '../../components/Estrellas';
import { Aviso } from '../../components/Aviso';
import { Boton } from '../../components/Boton';
import { Avatar } from '../../components/Avatar';
import { colores, crearEstilos, espacio, radio } from '../../theme';
import { textoHorario } from '../../lib/horario';
import { useTema } from '../../context/tema';

const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

// HU-02: perfil del maestro (sin teléfono ni correo: el contacto ocurre dentro de la app)
export default function PerfilPrestador() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const { id } = useLocalSearchParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/prestadores/${id}`).then((r) => setP(r.prestador)).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <View style={estilos.contenido}><Aviso mensaje={error} /></View>;
  if (!p) return <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;

  return (
    <ScrollView contentContainerStyle={estilos.contenido}>
      <View style={estilos.cabecera}>
        <View style={estilos.avatar}><Avatar nombre={p.nombre} tamano={92} /></View>
        <Text style={estilos.nombre}>{p.nombre}</Text>
        <Estrellas promedio={p.calificacion_promedio} total={p.total_resenas} tamano={16} />
        <Text style={estilos.meta}>
          {p.trabajos_cerrados} trabajos cerrados en DeliMaster · Miembro desde {fecha(p.miembro_desde)}
        </Text>
      </View>

      {p.verificaciones.length ? (
        <View style={estilos.verificado}>
          {p.verificaciones.map((v) => (
            <Text key={`${v.organismo}-${v.categoria}`} style={estilos.verificadoTexto}>
              ✓ {v.categoria}: verificado con {v.organismo}
            </Text>
          ))}
        </View>
      ) : null}

      <Seccion titulo="Servicios">
        <Text style={estilos.texto}>{p.categorias.map((c) => c.nombre).join(' · ')}</Text>
      </Seccion>

      {p.descripcion ? (
        <Seccion titulo="Sobre mí"><Text style={estilos.texto}>{p.descripcion}</Text></Seccion>
      ) : null}

      <Seccion titulo="Atiende en">
        <Text style={estilos.texto}>{p.comunas_atendidas.join(', ') || 'Sin comunas indicadas'}</Text>
      </Seccion>

      {p.horario ? (
        <Seccion titulo="Horario de atención">
          <Text style={estilos.texto}>🕒 {textoHorario(p.horario)}</Text>
          <Text style={estilos.textoSuave}>Las visitas se agendan dentro de este horario.</Text>
        </Seccion>
      ) : null}

      <Seccion titulo="Reseñas">
        {p.resenas.length ? p.resenas.map((r, i) => (
          <View key={i} style={estilos.resena}>
            <Text style={estilos.resenaCabecera}>
              <Text style={{ color: colores.acento }}>{'★'.repeat(r.estrellas)}</Text>  {r.cliente}
            </Text>
            {r.comentario ? <Text style={estilos.texto}>{r.comentario}</Text> : null}
          </View>
        )) : <Text style={estilos.textoSuave}>Aún no tiene reseñas en DeliMaster.</Text>}
      </Seccion>

      <View style={{ marginTop: espacio.l }}>
        <Boton titulo={`Contratar a ${p.nombre.split(' ')[0]}`} deshabilitado={!p.disponible}
          onPress={() => router.push(`/nueva-solicitud?prestador=${p.id}`)} />
        <Text style={estilos.nota}>
          {p.disponible ? 'Tu pago quedará protegido hasta que el trabajo se cierre.' : 'Este maestro no está disponible ahora.'}
        </Text>
      </View>
    </ScrollView>
  );
}

function Seccion({ titulo, children }) {
  return (
    <View style={estilos.seccion}>
      <Text style={estilos.seccionTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, maxWidth: 720, width: '100%', alignSelf: 'center' },
  cabecera: { alignItems: 'center', paddingVertical: espacio.l, gap: espacio.xs },
  avatar: { marginBottom: espacio.s, borderRadius: 999, padding: 4, backgroundColor: colores.superficie, boxShadow: colores.sombra },
  nombre: { fontSize: 24, fontWeight: '900', color: colores.texto, letterSpacing: -0.3 },
  meta: { fontSize: 13, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.xs },
  verificado: { backgroundColor: colores.exitoSuave, borderRadius: radio.s, padding: espacio.m, gap: espacio.xs },
  verificadoTexto: { color: colores.verificado, fontWeight: '600', fontSize: 14 },
  seccion: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    marginTop: espacio.m, borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  seccionTitulo: { fontSize: 15, fontWeight: '700', color: colores.texto, marginBottom: espacio.s },
  texto: { fontSize: 15, color: colores.texto, lineHeight: 21 },
  textoSuave: { fontSize: 15, color: colores.textoSuave },
  resena: { paddingVertical: espacio.s, borderTopWidth: 1, borderTopColor: colores.fondo },
  resenaCabecera: { fontSize: 14, fontWeight: '600', color: colores.texto, marginBottom: 2 },
  nota: { textAlign: 'center', color: colores.textoSuave, fontSize: 13, marginTop: espacio.s },
}));
