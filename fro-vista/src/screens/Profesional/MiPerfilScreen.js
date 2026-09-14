// Ruta: fro-vista/src/screens/Profesional/MiPerfilScreen.js
//
// CU10 — Administrando catálogo de perfil profesional (decisión D1).
// El profesional edita lo que el paciente ve al buscar hora: fotografía,
// reseña curricular, áreas de experticia y modalidad general de atención.
// La foto viaja al repositorio en la nube (misma infraestructura del CU33).

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';

import apiClient from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import { colores, espacio, radio, tipografia, piezas, interaccion } from '../../theme';

const MODALIDADES = [
  { valor: 'DOMICILIO', etiqueta: 'A domicilio' },
  { valor: 'ONLINE', etiqueta: 'Virtual' },
  { valor: 'AMBOS', etiqueta: 'A domicilio y virtual' },
];

export default function MiPerfilScreen() {
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null);

  const [resena, setResena] = useState('');
  const [areas, setAreas] = useState('');
  const [modalidad, setModalidad] = useState('DOMICILIO');
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [erroresCampo, setErroresCampo] = useState({});

  const cargar = async () => {
    setError('');
    try {
      const { data } = await apiClient.get('/profesionales/mi-perfil');
      setPerfil(data);
      setResena(data.resena_curricular || '');
      setAreas(data.areas_experticia || '');
      setModalidad(data.tipo_sede || 'DOMICILIO');
    } catch (err) {
      // CU10 Exc.1: el módulo no carga.
      setError(err.response?.data?.error || 'No se pudo cargar tu perfil. Revisa tu conexión.');
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const limiteResena = perfil?.limites?.resena || 1000;
  const limiteAreas = perfil?.limites?.areas || 255;

  const guardar = async () => {
    // CU10 Exc.4 y Exc.5: largo de la reseña y modalidad obligatoria.
    const errores = {};
    if (resena.length > limiteResena) errores.resena = `Máximo ${limiteResena} caracteres.`;
    if (areas.length > limiteAreas) errores.areas = `Máximo ${limiteAreas} caracteres.`;
    if (!modalidad) errores.modalidad = 'Indica la modalidad de atención.';
    setErroresCampo(errores);
    if (Object.keys(errores).length > 0) return;

    setGuardando(true);
    try {
      const { data } = await apiClient.put('/profesionales/mi-perfil', {
        resena_curricular: resena,
        areas_experticia: areas,
        tipo_sede: modalidad,
      });
      setAviso({ tono: 'ok', titulo: 'Perfil actualizado', mensaje: data.mensaje });
    } catch (err) {
      const respuesta = err.response?.data;
      // CU10 Exc.6: fallo de persistencia.
      setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  };

  const elegirFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setAviso({ tono: 'info', titulo: 'Permiso necesario', mensaje: 'Autoriza el acceso a tus fotos para cambiar la imagen de perfil.' });
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (resultado.canceled || !resultado.assets?.length) return;

    const activo = resultado.assets[0];
    const nombre = activo.fileName || `perfil-${Date.now()}.jpg`;

    setSubiendoFoto(true);
    try {
      const formulario = new FormData();
      formulario.append('foto', {
        uri: activo.uri,
        name: nombre,
        type: activo.mimeType || 'image/jpeg',
      });
      const { data } = await apiClient.post('/profesionales/mi-perfil/foto', formulario, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPerfil((previo) => ({ ...previo, foto_url: data.foto_url }));
      setAviso({ tono: 'ok', titulo: 'Fotografía actualizada', mensaje: data.mensaje });
    } catch (err) {
      const respuesta = err.response?.data;
      // CU10 Exc.3: formato o peso no permitidos, o repositorio no disponible.
      setAviso({ tono: 'error', titulo: 'No se pudo subir la foto', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setSubiendoFoto(false);
    }
  };

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje={error} onRetry={cargar} />
      </View>
    );
  }
  if (!perfil) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  const iniciales = `${perfil.nombres?.[0] || ''}${perfil.apellido_paterno?.[0] || ''}`.toUpperCase();

  return (
    <VistaConTeclado style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.intro}>
        Así te ven los pacientes al buscar una hora. Los cambios se publican de inmediato.
      </Text>

      {/* Fotografía */}
      <View style={estilos.bloqueFoto}>
        {perfil.foto_url ? (
          <Image source={{ uri: perfil.foto_url }} style={estilos.foto} />
        ) : (
          <View style={[estilos.foto, estilos.fotoVacia]}>
            <Text style={estilos.iniciales}>{iniciales || '👤'}</Text>
          </View>
        )}
        <View style={estilos.fotoTexto}>
          <Text style={estilos.nombre}>
            {perfil.nombres} {perfil.apellido_paterno} {perfil.apellido_materno}
          </Text>
          <Text style={estilos.meta}>{perfil.especialidad || 'Sin especialidad'} · Reg. {perfil.num_registro_salud}</Text>
          <TouchableOpacity
            style={estilos.botonFoto}
            onPress={elegirFoto}
            disabled={subiendoFoto}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={estilos.botonFotoTexto}>
              {subiendoFoto ? 'Subiendo…' : perfil.foto_url ? 'Cambiar fotografía' : 'Agregar fotografía'}
            </Text>
          </TouchableOpacity>
          <Text style={estilos.ayuda}>JPG, PNG o WEBP · hasta {perfil.limites?.foto_mb || 5} MB</Text>
        </View>
      </View>

      {/* Reseña */}
      <Text style={estilos.etiqueta}>Reseña curricular</Text>
      <TextInput
        style={[estilos.campo, estilos.campoLargo, erroresCampo.resena && estilos.campoError]}
        placeholder="Formación, experiencia y enfoque de atención"
        placeholderTextColor={colores.textoTenue}
        multiline
        value={resena}
        onChangeText={setResena}
      />
      <Text style={[estilos.contador, resena.length > limiteResena && estilos.contadorError]}>
        {resena.length}/{limiteResena}
      </Text>
      {erroresCampo.resena ? <Text style={estilos.textoError}>{erroresCampo.resena}</Text> : null}

      {/* Áreas de experticia */}
      <Text style={estilos.etiqueta}>Áreas de experticia</Text>
      <TextInput
        style={[estilos.campo, erroresCampo.areas && estilos.campoError]}
        placeholder="Ej: rehabilitación deportiva, columna, adulto mayor"
        placeholderTextColor={colores.textoTenue}
        value={areas}
        onChangeText={setAreas}
      />
      <Text style={estilos.ayuda}>Sepáralas con comas. Se muestran junto a tu nombre en el buscador de horas.</Text>
      {erroresCampo.areas ? <Text style={estilos.textoError}>{erroresCampo.areas}</Text> : null}

      {/* Modalidad */}
      <Text style={estilos.etiqueta}>Modalidad general de atención</Text>
      <View style={[estilos.selector, erroresCampo.modalidad && estilos.campoError]}>
        <Picker selectedValue={modalidad} onValueChange={setModalidad} dropdownIconColor={colores.primario}>
          {MODALIDADES.map((opcion) => (
            <Picker.Item key={opcion.valor} label={opcion.etiqueta} value={opcion.valor} />
          ))}
        </Picker>
      </View>
      <Text style={estilos.ayuda}>
        Cada bloque de tu jornada puede tener su propia modalidad; esta es la que se muestra como general.
      </Text>

      <TouchableOpacity
        style={[estilos.botonGuardar, guardando && estilos.botonDeshabilitado]}
        onPress={guardar}
        disabled={guardando}
        activeOpacity={interaccion.opacidadActiva}
      >
        <Text style={estilos.botonGuardarTexto}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Text>
      </TouchableOpacity>

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.lg, backgroundColor: colores.fondo },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  bloqueFoto: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', marginBottom: espacio.lg },
  foto: { width: 84, height: 84, borderRadius: 42, backgroundColor: colores.primarioSuave },
  fotoVacia: { justifyContent: 'center', alignItems: 'center' },
  iniciales: { ...tipografia.titulo, color: colores.primario },
  fotoTexto: { flex: 1, marginLeft: espacio.base },
  nombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.sm },
  botonFoto: { ...piezas.botonSecundario, paddingVertical: espacio.sm, alignSelf: 'flex-start' },
  botonFotoTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },

  etiqueta: { ...piezas.etiqueta, marginTop: espacio.md },
  campo: { ...piezas.campo },
  campoLargo: { minHeight: 110, textAlignVertical: 'top' },
  campoError: { borderColor: colores.error },
  selector: { ...piezas.campo, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' },
  contador: { ...tipografia.micro, color: colores.textoTenue, textAlign: 'right', marginTop: 4 },
  contadorError: { color: colores.error },
  ayuda: { ...tipografia.meta, color: colores.textoTenue, marginTop: 4 },
  textoError: { ...tipografia.meta, color: colores.error, marginTop: 4 },

  botonGuardar: { ...piezas.botonPrimario, alignItems: 'center', marginTop: espacio.xl },
  botonDeshabilitado: { opacity: 0.6 },
  botonGuardarTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
});
