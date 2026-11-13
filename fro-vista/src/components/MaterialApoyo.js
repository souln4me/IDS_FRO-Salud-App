/**
 * Componente: Cliente Móvil
 * Casos de uso: CU47, CU48, CU35.
 */
// Ruta: fro-vista/src/components/MaterialApoyo.js
//
// Material de apoyo propio de un ejercicio de la pauta (fotos, videos, PDF y
// Word que subió el profesional). Las imágenes se ven como miniaturas y el
// resto como filas con su ícono; al tocar cualquiera se abre en el visor.
// Si se pasa onEliminar, cada elemento muestra una ✕ para quitarlo.

import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

import Icono from './Icono';
import { colores, espacio, radio, tipografia, interaccion } from '../theme';

const FORMATOS_IMAGEN = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'];
const FORMATOS_VIDEO = ['mp4', 'mov'];

export const esImagen = (formato) => FORMATOS_IMAGEN.includes(String(formato || '').toLowerCase());
export const esVideo = (formato) => FORMATOS_VIDEO.includes(String(formato || '').toLowerCase());

export function pesoLegible(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Video", "PDF", "Word"… para la línea de detalle. */
function tipoLegible(formato) {
  const f = String(formato || '').toLowerCase();
  if (esVideo(f)) return 'Video';
  if (esImagen(f)) return 'Imagen';
  if (f === 'docx') return 'Word';
  return f.toUpperCase() || 'Archivo';
}

/** Miniatura de una imagen; si no carga, muestra el ícono de documento. */
function Miniatura({ material, onAbrir, onEliminar, eliminando }) {
  const [fallo, setFallo] = useState(false);
  return (
    <View style={estilos.miniaturaCaja}>
      <TouchableOpacity
        onPress={() => onAbrir?.(material)}
        activeOpacity={interaccion.opacidadActiva}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Ver ${material.nombre}`}
      >
        {material.url && !fallo ? (
          <Image source={{ uri: material.url }} style={estilos.miniatura} onError={() => setFallo(true)} />
        ) : (
          <View style={[estilos.miniatura, estilos.miniaturaVacia]}>
            <Icono name="document-text-outline" size={24} color={colores.textoTenue} />
          </View>
        )}
      </TouchableOpacity>
      {onEliminar && (
        <TouchableOpacity
          style={estilos.quitarMiniatura}
          onPress={() => onEliminar(material)}
          disabled={eliminando}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${material.nombre}`}
        >
          {eliminando ? (
            <ActivityIndicator size="small" color={colores.error} />
          ) : (
            <Text style={estilos.quitarTexto}>✕</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// CU47, CU48 — material de apoyo del ejercicio; se abre en el visor (CU35)
export default function MaterialApoyo({ materiales = [], onAbrir, onEliminar, eliminandoId = null, titulo = 'Material de apoyo' }) {
  if (!materiales.length) return null;

  const imagenes = materiales.filter((m) => esImagen(m.formato));
  const otros = materiales.filter((m) => !esImagen(m.formato));

  return (
    <View style={estilos.contenedor}>
      {titulo ? <Text style={estilos.titulo}>{titulo}</Text> : null}

      {imagenes.length > 0 && (
        <View style={estilos.galeria}>
          {imagenes.map((m) => (
            <Miniatura
              key={m.pauta_ejercicio_material_id}
              material={m}
              onAbrir={onAbrir}
              onEliminar={onEliminar}
              eliminando={eliminandoId === m.pauta_ejercicio_material_id}
            />
          ))}
        </View>
      )}

      {otros.map((m) => {
        const eliminando = eliminandoId === m.pauta_ejercicio_material_id;
        return (
          <View key={m.pauta_ejercicio_material_id} style={estilos.fila}>
            <TouchableOpacity
              style={estilos.filaToque}
              onPress={() => onAbrir?.(m)}
              activeOpacity={interaccion.opacidadActiva}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${m.nombre}`}
            >
              <Icono
                name={esVideo(m.formato) ? 'videocam-outline' : 'document-text-outline'}
                size={20}
                color={colores.primario}
              />
              <View style={estilos.filaInfo}>
                <Text style={estilos.filaNombre} numberOfLines={1}>{m.nombre}</Text>
                <Text style={estilos.filaDetalle}>
                  {tipoLegible(m.formato)}
                  {m.tamano_bytes ? ` · ${pesoLegible(m.tamano_bytes)}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
            {onEliminar && (
              <TouchableOpacity
                onPress={() => onEliminar(m)}
                disabled={eliminando}
                style={estilos.quitarFila}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Eliminar ${m.nombre}`}
              >
                {eliminando ? (
                  <ActivityIndicator size="small" color={colores.error} />
                ) : (
                  <Text style={estilos.quitarTexto}>✕</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { marginTop: espacio.sm },
  titulo: { ...tipografia.metaFuerte, color: colores.textoSuave, marginBottom: espacio.xs },

  galeria: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, marginBottom: espacio.xs },
  miniaturaCaja: { position: 'relative' },
  miniatura: {
    width: 72,
    height: 72,
    borderRadius: radio.sm,
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
  },
  miniaturaVacia: { alignItems: 'center', justifyContent: 'center' },
  quitarMiniatura: {
    position: 'absolute',
    top: -espacio.xs,
    right: -espacio.xs,
    width: 24,
    height: 24,
    borderRadius: radio.completo,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.errorBorde,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    backgroundColor: colores.superficieSuave,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
    marginBottom: espacio.xs,
  },
  filaToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  filaInfo: { flex: 1 },
  filaNombre: { ...tipografia.metaFuerte, color: colores.texto },
  filaDetalle: { ...tipografia.meta, color: colores.textoSuave },
  quitarFila: { paddingLeft: espacio.md, minWidth: 28, alignItems: 'center' },
  quitarTexto: { ...tipografia.metaFuerte, color: colores.error },
});
