/**
 * Componente: Cliente Móvil
 * Casos de uso: CU47.
 */
// Ruta: fro-vista/src/components/AdjuntarMaterial.js
//
// Botón "Adjuntar material de apoyo" de los ejercicios de una pauta. Al
// tocarlo ofrece dos caminos: fotos o videos de la galería (expo-image-picker)
// o documentos PDF/Word (expo-document-picker). Se pueden elegir varios a la
// vez. No sube nada: entrega la lista de archivos a la pantalla, que decide
// cuándo subirlos (al guardar la pauta o en el momento).

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import Icono from './Icono';
import { colores, espacio, radio, tipografia, interaccion } from '../theme';

// Los mismos formatos que acepta el servidor para el material del ejercicio.
export const EXTENSIONES_MATERIAL = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'pdf', 'docx', 'mp4', 'mov'];

const EXTENSION_POR_TIPO = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

function extensionDe(texto) {
  const limpio = String(texto || '').split('?')[0].split('#')[0];
  const ultimo = limpio.split('/').pop() || '';
  return ultimo.includes('.') ? ultimo.split('.').pop().toLowerCase() : '';
}

/**
 * Deja el archivo listo para FormData: { uri, name, type, size }.
 * El servidor reconoce el formato por la extensión del nombre, así que si la
 * galería no entrega nombre (pasa en Android) se arma uno con la extensión
 * correcta.
 */
function normalizar({ uri, nombre, tipo, tamano, esVideo }) {
  const extension = extensionDe(nombre) || extensionDe(uri) || EXTENSION_POR_TIPO[tipo] || (esVideo ? 'mp4' : 'jpg');
  let base;
  if (nombre && extensionDe(nombre)) base = nombre;
  else if (nombre) base = `${nombre}.${extension}`;
  // Sufijo al azar: varias fotos elegidas juntas no deben repetir nombre.
  else base = `${esVideo ? 'video' : 'imagen'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${extension}`;
  const mime = tipo || Object.keys(EXTENSION_POR_TIPO).find((k) => EXTENSION_POR_TIPO[k] === extension) || 'application/octet-stream';
  return { uri, name: base, type: mime, size: tamano || 0, extension };
}

// CU47 — Prescribiendo pautas de ejercicio técnico
export default function AdjuntarMaterial({
  onElegidos,
  onAviso,
  deshabilitado = false,
  ocupado = false,
  textoOcupado = '',
  etiqueta = 'Adjuntar material de apoyo',
}) {
  const [abierto, setAbierto] = useState(false);

  // Separa lo que el servidor aceptará de lo que no, y avisa de lo rechazado.
  const entregar = (archivos) => {
    const validos = archivos.filter((a) => EXTENSIONES_MATERIAL.includes(a.extension));
    const rechazados = archivos.filter((a) => !EXTENSIONES_MATERIAL.includes(a.extension));
    if (rechazados.length) {
      onAviso?.({
        tono: 'alerta',
        titulo: 'Algunos archivos no se agregaron',
        mensaje:
          `${rechazados.map((a) => `• ${a.name}`).join('\n')}\n\n` +
          'Se aceptan fotos (JPG, PNG, WEBP, HEIC, GIF), videos (MP4, MOV), PDF y Word (DOCX).',
      });
    }
    if (validos.length) onElegidos?.(validos.map(({ extension, ...resto }) => resto));
    setAbierto(false);
  };

  const elegirDeGaleria = async () => {
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permiso.status !== 'granted') {
        onAviso?.({
          tono: 'error',
          titulo: 'Permiso denegado',
          mensaje: 'Sin acceso a la galería no es posible elegir fotos o videos. Puedes darlo desde los ajustes del teléfono.',
        });
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (resultado.canceled || !resultado.assets?.length) return;
      entregar(
        resultado.assets.map((activo) =>
          normalizar({
            uri: activo.uri,
            nombre: activo.fileName,
            tipo: activo.mimeType,
            tamano: activo.fileSize,
            esVideo: activo.type === 'video',
          })
        )
      );
    } catch {
      onAviso?.({ tono: 'error', titulo: 'No se pudo abrir la galería', mensaje: 'Intenta nuevamente.' });
    }
  };

  const elegirDocumento = async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (resultado.canceled || !resultado.assets?.length) return;
      entregar(
        resultado.assets.map((activo) =>
          normalizar({ uri: activo.uri, nombre: activo.name, tipo: activo.mimeType, tamano: activo.size })
        )
      );
    } catch {
      onAviso?.({ tono: 'error', titulo: 'No se pudo abrir tus archivos', mensaje: 'Intenta nuevamente.' });
    }
  };

  if (ocupado) {
    return (
      <View style={estilos.ocupado}>
        <ActivityIndicator size="small" color={colores.primario} />
        <Text style={estilos.ocupadoTexto}>{textoOcupado || 'Subiendo material…'}</Text>
      </View>
    );
  }

  return (
    <View style={estilos.contenedor}>
      <TouchableOpacity
        style={[estilos.boton, deshabilitado && estilos.deshabilitado]}
        onPress={() => setAbierto((v) => !v)}
        disabled={deshabilitado}
        activeOpacity={interaccion.opacidadActiva}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto, disabled: deshabilitado }}
      >
        <Icono name="add" size={18} color={colores.primario} />
        <Text style={estilos.botonTexto}>{etiqueta}</Text>
      </TouchableOpacity>

      {abierto && !deshabilitado && (
        <View style={estilos.opciones}>
          <TouchableOpacity style={estilos.opcion} onPress={elegirDeGaleria} activeOpacity={interaccion.opacidadActiva}>
            <Icono name="videocam-outline" size={20} color={colores.primario} />
            <Text style={estilos.opcionTexto}>Fotos o videos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.opcion} onPress={elegirDocumento} activeOpacity={interaccion.opacidadActiva}>
            <Icono name="document-text-outline" size={20} color={colores.primario} />
            <Text style={estilos.opcionTexto}>PDF o Word</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { marginTop: espacio.sm },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colores.primarioBorde,
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.base,
  },
  botonTexto: { ...tipografia.metaFuerte, color: colores.primario },
  opciones: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.sm },
  opcion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.xs,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
  },
  opcionTexto: { ...tipografia.metaFuerte, color: colores.texto },
  ocupado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    marginTop: espacio.sm,
    paddingVertical: espacio.md,
  },
  ocupadoTexto: { ...tipografia.meta, color: colores.textoSuave },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },
});
