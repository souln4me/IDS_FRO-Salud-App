/**
 * Componente: Cliente Móvil — Vista "Mis datos"
 * Casos de uso: CU09.
 */
// Ruta: fro-vista/src/screens/Paciente/MisDatosScreen.js
//
// Datos de contacto del paciente, editables desde "Mi perfil": dirección,
// teléfono y contacto de emergencia. Vive junto a la privacidad de esos
// mismos datos (CU09). RUT, nombre y correo se muestran pero no se editan:
// identifican la cuenta.

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import apiClient from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const VACIO = {
  calle: '', numero_calle: '', departamento: '', comuna_id: '',
  telefono: '', emergencia_nombre: '', emergencia_telefono: '', emergencia_parentesco: '',
};

function Campo({ etiqueta, valor, onCambiar, error, ...props }) {
  return (
    <View style={estilos.campoGrupo}>
      <Text style={piezas.etiqueta}>{etiqueta}</Text>
      <TextInput
        style={[piezas.campo, error && piezas.campoError]}
        value={valor}
        onChangeText={onCambiar}
        placeholderTextColor={colores.textoTenue}
        {...props}
      />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
    </View>
  );
}

export default function MisDatosScreen({ navigation }) {
  const [datos, setDatos] = useState(VACIO);
  const [identidad, setIdentidad] = useState(null);
  const [comunas, setComunas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // CU09: carga los datos de contacto del paciente
  const cargar = async () => {
    setCargando(true);
    setErrorCarga(false);
    try {
      const [perfil, listaComunas] = await Promise.all([
        apiClient.get('/auth/mi-perfil-paciente'),
        apiClient.get('/auth/comunas'),
      ]);
      const d = perfil.data.datos;
      setIdentidad(d);
      setDatos({
        calle: d.calle || '',
        numero_calle: d.numero_calle || '',
        departamento: d.departamento || '',
        comuna_id: d.comuna_id ? String(d.comuna_id) : '',
        telefono: d.telefono || '',
        emergencia_nombre: d.emergencia_nombre || '',
        emergencia_telefono: d.emergencia_telefono || '',
        emergencia_parentesco: d.emergencia_parentesco || '',
      });
      setComunas(Array.isArray(listaComunas.data) ? listaComunas.data : []);
    } catch {
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cambiar = (campo) => (valor) => {
    setDatos((previos) => ({ ...previos, [campo]: valor }));
    if (errores[campo]) setErrores((previos) => ({ ...previos, [campo]: null }));
  };

  // CU09: guarda los datos de contacto editados
  const guardar = async () => {
    setGuardando(true);
    try {
      const { data } = await apiClient.put('/auth/mi-perfil-paciente', { ...datos, comuna_id: Number(datos.comuna_id) });
      setErrores({});
      setAviso({ tono: 'ok', titulo: 'Datos actualizados', mensaje: data.mensaje, volver: true });
    } catch (error) {
      const respuesta = error.response?.data;
      if (respuesta?.campos) {
        setErrores(respuesta.campos);
        setAviso({ tono: 'alerta', titulo: 'Revisa tus datos', mensaje: respuesta.mensaje || 'Hay campos por corregir.' });
      } else {
        setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: respuesta?.mensaje || 'Revisa tu conexión e intenta nuevamente.' });
      }
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator size="large" color={colores.primario} /></View>;
  }
  if (errorCarga) {
    return <View style={estilos.centrado}><ErrorRetry mensaje="No se pudieron cargar tus datos." onRetry={cargar} /></View>;
  }

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      {identidad && (
        <View style={estilos.identidad}>
          <Text style={estilos.nombre}>
            {[identidad.nombres, identidad.apellido_paterno, identidad.apellido_materno].filter(Boolean).join(' ')}
          </Text>
          <Text style={estilos.meta}>RUT {identidad.rut} · {identidad.email}</Text>
          <Text style={estilos.nota}>El nombre, el RUT y el correo identifican tu cuenta y no se cambian aquí.</Text>
        </View>
      )}

      <Text style={estilos.seccion}>Teléfono</Text>
      <Campo etiqueta="Teléfono" valor={datos.telefono} onCambiar={cambiar('telefono')} error={errores.telefono} keyboardType="phone-pad" placeholder="+56 9 1234 5678" />

      <Text style={estilos.seccion}>Dirección</Text>
      <Campo etiqueta="Calle" valor={datos.calle} onCambiar={cambiar('calle')} error={errores.calle} maxLength={100} placeholder="Av. Siempre Viva" />
      <View style={estilos.fila}>
        <View style={estilos.flex}>
          <Campo etiqueta="Número" valor={datos.numero_calle} onCambiar={cambiar('numero_calle')} error={errores.numero_calle} maxLength={10} placeholder="742" />
        </View>
        <View style={estilos.flex}>
          <Campo etiqueta="Depto. (opcional)" valor={datos.departamento} onCambiar={cambiar('departamento')} maxLength={10} placeholder="12B" />
        </View>
      </View>
      <View style={estilos.campoGrupo}>
        <Text style={piezas.etiqueta}>Comuna</Text>
        <View style={[estilos.selector, errores.comuna_id && piezas.campoError]}>
          <Picker selectedValue={datos.comuna_id} onValueChange={(v) => cambiar('comuna_id')(String(v))} dropdownIconColor={colores.primario}>
            <Picker.Item label="Elige tu comuna…" value="" color={colores.textoTenue} />
            {comunas.map((c) => (
              <Picker.Item key={c.comuna_id} label={c.nombre} value={String(c.comuna_id)} />
            ))}
          </Picker>
        </View>
        {errores.comuna_id ? <Text style={estilos.error}>{errores.comuna_id}</Text> : null}
      </View>

      <Text style={estilos.seccion}>Contacto de emergencia</Text>
      <Campo etiqueta="Nombre" valor={datos.emergencia_nombre} onCambiar={cambiar('emergencia_nombre')} error={errores.emergencia_nombre} maxLength={100} placeholder="Nombre y apellido" />
      <View style={estilos.fila}>
        <View style={estilos.flex}>
          <Campo etiqueta="Parentesco" valor={datos.emergencia_parentesco} onCambiar={cambiar('emergencia_parentesco')} error={errores.emergencia_parentesco} maxLength={50} placeholder="Madre, hermano…" />
        </View>
        <View style={estilos.flex}>
          <Campo etiqueta="Teléfono" valor={datos.emergencia_telefono} onCambiar={cambiar('emergencia_telefono')} error={errores.emergencia_telefono} keyboardType="phone-pad" placeholder="+56 9 …" />
        </View>
      </View>

      <TouchableOpacity
        style={[estilos.boton, guardando && estilos.deshabilitado]}
        onPress={guardar}
        disabled={guardando}
        activeOpacity={interaccion.opacidadActiva}
      >
        {guardando ? <ActivityIndicator color={colores.textoInverso} /> : <Text style={estilos.botonTexto}>Guardar cambios</Text>}
      </TouchableOpacity>

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => {
          const volver = aviso?.volver;
          setAviso(null);
          if (volver) navigation.goBack();
        }}
      />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  identidad: { ...piezas.tarjeta, marginBottom: espacio.base },
  nombre: { ...tipografia.subtitulo, color: colores.textoTitulo },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  nota: { ...tipografia.meta, color: colores.textoTenue, marginTop: espacio.sm },
  seccion: { ...tipografia.subtitulo, color: colores.primario, marginTop: espacio.lg, marginBottom: espacio.sm },
  campoGrupo: { marginBottom: espacio.md },
  fila: { flexDirection: 'row', gap: espacio.md },
  flex: { flex: 1 },
  selector: { ...piezas.campo, paddingHorizontal: espacio.xs, paddingVertical: 0 },
  error: { ...tipografia.meta, color: colores.error, marginTop: espacio.xs },
  boton: { ...piezas.botonPrimario, marginTop: espacio.xl },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },
});
