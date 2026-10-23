import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { Aviso } from '../components/Aviso';
import { Boton } from '../components/Boton';
import { Campo } from '../components/Campo';
import { Chip } from '../components/Chip';
import { colores, crearEstilos, espacio, radio } from '../theme';
import { useTema } from '../context/tema';

const TIPOS_CUENTA = ['Cuenta Corriente', 'Cuenta Vista', 'Cuenta de Ahorro', 'CuentaRUT'];
const BANCOS = ['BancoEstado', 'Banco de Chile', 'Santander', 'BCI', 'Scotiabank', 'Itaú', 'Banco Falabella', 'Mercado Pago', 'Tenpo'];

// HU-13: datos para que DeliMaster transfiera al prestador los pagos de sus trabajos cerrados.
// Solo los ven el prestador y el equipo; nunca el cliente.
export default function DatosPago() {
  useTema();   // vuelve a dibujarse al cambiar entre modo claro y oscuro
  const [datos, setDatos] = useState(null);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get('/prestadores/yo/datos-pago')
      .then((r) => setDatos({
        rut: r.datos_pago.rut ?? '',
        banco: r.datos_pago.banco ?? '',
        tipo_cuenta: r.datos_pago.tipo_cuenta ?? 'CuentaRUT',
        numero_cuenta: r.datos_pago.numero_cuenta ?? '',
      }))
      .catch((e) => setError(e.message));
  }, []);

  const cambiar = (campo) => (valor) => setDatos((d) => ({ ...d, [campo]: valor }));

  async function guardar() {
    setGuardando(true);
    setError(null);
    setErrores({});
    setExito(null);
    try {
      const r = await api.put('/prestadores/yo/datos-pago', {
        rut: datos.rut.trim(),
        banco: datos.banco.trim(),
        tipo_cuenta: datos.tipo_cuenta,
        numero_cuenta: datos.numero_cuenta.trim(),
      });
      setDatos((d) => ({ ...d, rut: r.datos_pago.rut, numero_cuenta: r.datos_pago.numero_cuenta }));
      setExito('Datos guardados. Te transferiremos aquí cada trabajo cerrado.');
    } catch (e) {
      setErrores(e.campos ?? {});
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (!datos) {
    return error ? <View style={estilos.contenido}><Aviso mensaje={error} /></View>
      : <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />;
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>Datos para recibir tus pagos</Text>
        <Text style={estilos.ayuda}>
          Cuando un trabajo se cierra, DeliMaster te transfiere lo cobrado menos la comisión dentro de 48 horas hábiles.
          Estos datos solo los ve el equipo de DeliMaster.
        </Text>

        <Aviso mensaje={error} />
        {exito ? <Text style={estilos.exito}>{exito}</Text> : null}

        <Campo etiqueta="RUT del titular" value={datos.rut} onChangeText={cambiar('rut')} error={errores.rut}
          placeholder="Ej.: 12.345.678-5" autoCapitalize="characters" />

        <Text style={estilos.etiqueta}>Banco</Text>
        <View style={estilos.chips}>
          {BANCOS.map((b) => <Chip key={b} texto={b} activo={datos.banco === b} onPress={() => cambiar('banco')(b)} />)}
        </View>
        <Campo etiqueta="Otro banco" value={BANCOS.includes(datos.banco) ? '' : datos.banco}
          onChangeText={cambiar('banco')} error={errores.banco} placeholder="Escríbelo si no está en la lista" />

        <Text style={estilos.etiqueta}>Tipo de cuenta</Text>
        <View style={estilos.chips}>
          {TIPOS_CUENTA.map((t) => <Chip key={t} texto={t} activo={datos.tipo_cuenta === t} onPress={() => cambiar('tipo_cuenta')(t)} />)}
        </View>
        {errores.tipo_cuenta ? <Text style={estilos.error}>{errores.tipo_cuenta}</Text> : null}

        <Campo etiqueta="Número de cuenta" value={datos.numero_cuenta} onChangeText={cambiar('numero_cuenta')}
          error={errores.numero_cuenta} keyboardType="number-pad" placeholder="Solo números"
          ayuda={datos.tipo_cuenta === 'CuentaRUT' ? 'En la CuentaRUT es tu RUT sin dígito verificador.' : undefined} />

        <Boton titulo="Guardar datos" onPress={guardar} cargando={guardando}
          deshabilitado={!datos.rut.trim() || !datos.banco.trim() || !datos.numero_cuenta.trim()} />
        {exito ? (
          <View style={{ marginTop: espacio.s }}>
            <Boton titulo="Volver al panel" variante="secundario" onPress={() => router.back()} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const estilos = crearEstilos((colores) => ({
  contenido: { padding: espacio.m, paddingBottom: espacio.xl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie, boxShadow: colores.sombra, borderRadius: radio.m, padding: espacio.m,
    borderWidth: 1, borderColor: colores.bordeTarjeta,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  ayuda: { fontSize: 14, color: colores.textoSuave, marginTop: espacio.xs, marginBottom: espacio.m },
  etiqueta: { fontSize: 14, fontWeight: '600', color: colores.texto, marginBottom: espacio.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m },
  error: { color: colores.error, fontSize: 13, marginTop: -espacio.s, marginBottom: espacio.m },
  exito: { color: colores.verificado, fontSize: 14, marginBottom: espacio.m, fontWeight: '600' },
}));
