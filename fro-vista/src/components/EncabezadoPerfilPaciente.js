/**
 * Componente: Cliente Móvil
 * Casos de uso: CU09.
 */
// Ruta: fro-vista/src/components/EncabezadoPerfilPaciente.js
//
// Encabezado de "Mi perfil" del paciente: su foto (opcional) y su nombre. Sin
// foto se muestran sus iniciales. Puede subir una desde la galería, cambiarla
// o quitarla para volver a las iniciales.

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import apiClient from '../api/client';
import Avatar from './Avatar';
import DialogoAviso from './DialogoAviso';
import DialogoConfirmacion from './DialogoConfirmacion';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../theme';

export default function EncabezadoPerfilPaciente({ navigation }) {
  const [perfil, setPerfil] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  // CU09: cargar la foto del perfil
  useEffect(() => {
    apiClient
      .get('/auth/mi-foto')
      .then(({ data }) => setPerfil(data))
      .catch(() => setPerfil({ foto_url: null, nombre: '' }));
  }, []);

  // CU09: subir o cambiar la foto del perfil
  const elegirFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setAviso({ tono: 'info', titulo: 'Permiso necesario', mensaje: 'Autoriza el acceso a tus fotos para elegir tu imagen de perfil.' });
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
    setSubiendo(true);
    try {
      const formulario = new FormData();
      formulario.append('foto', {
        uri: activo.uri,
        name: activo.fileName || `perfil-${Date.now()}.jpg`,
        type: activo.mimeType || 'image/jpeg',
      });
      const { data } = await apiClient.post('/auth/mi-foto', formulario, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // La URL es la misma al reemplazar: se agrega una marca para que el
      // teléfono no muestre la foto anterior guardada en caché.
      setPerfil((previo) => ({ ...previo, foto_url: `${data.foto_url}?v=${Date.now()}` }));
      setAviso({ tono: 'ok', titulo: 'Foto actualizada', mensaje: 'Tu profesional verá esta foto en los mensajes y en su lista de pacientes.' });
    } catch (err) {
      const respuesta = err.response?.data;
      setAviso({ tono: 'error', titulo: 'No se pudo subir la foto', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setSubiendo(false);
    }
  };

  // CU09: quitar la foto del perfil
  const quitarFoto = async () => {
    setConfirmarQuitar(false);
    setSubiendo(true);
    try {
      await apiClient.delete('/auth/mi-foto');
      setPerfil((previo) => ({ ...previo, foto_url: null }));
    } catch {
      setAviso({ tono: 'error', titulo: 'No se pudo quitar la foto', mensaje: 'Intenta nuevamente.' });
    } finally {
      setSubiendo(false);
    }
  };

  if (!perfil) {
    return (
      <View style={estilos.tarjeta}>
        <ActivityIndicator color={colores.primario} />
      </View>
    );
  }

  return (
    <View style={estilos.tarjeta}>
      <TouchableOpacity onPress={elegirFoto} disabled={subiendo} activeOpacity={interaccion.opacidadActiva} accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil">
        <Avatar foto={perfil.foto_url} nombre={perfil.nombre} tamano={76} />
        {subiendo && (
          <View style={estilos.cargando}>
            <ActivityIndicator color={colores.textoInverso} />
          </View>
        )}
      </TouchableOpacity>
      <View style={estilos.cuerpo}>
        <Text style={estilos.nombre} numberOfLines={2}>{perfil.nombre || 'Mi perfil'}</Text>
        <Text style={estilos.ayuda}>
          {perfil.foto_url ? 'Tu foto la ve tu equipo de tratamiento.' : 'Opcional: agrega una foto. Mientras tanto se muestran tus iniciales.'}
        </Text>
        <View style={estilos.acciones}>
          <TouchableOpacity onPress={elegirFoto} disabled={subiendo} activeOpacity={interaccion.opacidadActiva}>
            <Text style={estilos.enlace}>{perfil.foto_url ? 'Cambiar foto' : 'Agregar foto'}</Text>
          </TouchableOpacity>
          {perfil.foto_url ? (
            <TouchableOpacity onPress={() => setConfirmarQuitar(true)} disabled={subiendo} activeOpacity={interaccion.opacidadActiva}>
              <Text style={estilos.enlaceQuitar}>Quitar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {navigation && (
          <TouchableOpacity
            style={estilos.botonDatos}
            onPress={() => navigation.navigate('MisDatos')}
            activeOpacity={interaccion.opacidadActiva}
            accessibilityRole="button"
          >
            <Text style={estilos.botonDatosTexto}>Editar mis datos</Text>
          </TouchableOpacity>
        )}
      </View>

      <DialogoConfirmacion
        visible={confirmarQuitar}
        titulo="Quitar foto de perfil"
        mensaje="Volverán a mostrarse tus iniciales."
        etiquetaConfirmar="Quitar foto"
        tono="peligro"
        onConfirmar={quitarFoto}
        onCancelar={() => setConfirmarQuitar(false)}
      />
      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', gap: espacio.base, marginBottom: espacio.lg },
  cargando: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 38,
    backgroundColor: colores.velo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cuerpo: { flex: 1 },
  nombre: { ...tipografia.subtitulo, color: colores.textoTitulo },
  ayuda: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  acciones: { flexDirection: 'row', gap: espacio.lg, marginTop: espacio.sm },
  enlace: { ...tipografia.metaFuerte, color: colores.primario },
  enlaceQuitar: { ...tipografia.metaFuerte, color: colores.error },
  botonDatos: { ...piezas.botonSecundario, paddingVertical: espacio.sm, paddingHorizontal: espacio.base, marginTop: espacio.md, alignSelf: 'flex-start' },
  botonDatosTexto: { ...tipografia.metaFuerte, color: colores.primario },
});
