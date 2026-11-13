/**
 * Componente: Cliente Móvil
 * Casos de uso: CU53, CU35.
 */
// Ruta: fro-vista/src/components/AdjuntoChat.js
//
// Archivo adjunto dentro de una burbuja del chat clínico (CU53).
//  · Imagen → miniatura que se toca para verla en grande.
//  · Video o documento → fila con ícono, nombre y formato.
// Al tocar cualquiera de los dos se abre el visor de documentos; la pantalla
// del chat decide a cuál ruta del visor ir (documento de la ficha o archivo
// subido al chat).

import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';

import Icono from './Icono';
import { colores, espacio, radio, tipografia, interaccion } from '../theme';

function pesoLegible(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function AdjuntoChat({ adjunto, mio = false, onAbrir }) {
  // Si la miniatura no carga (sin señal, enlace vencido) se muestra la fila.
  const [falloMiniatura, setFalloMiniatura] = useState(false);
  if (!adjunto) return null;

  const nombre = adjunto.nombre || 'Archivo adjunto';

  if (adjunto.tipo === 'IMAGEN' && adjunto.url && !falloMiniatura) {
    return (
      <TouchableOpacity
        onPress={onAbrir}
        activeOpacity={interaccion.opacidadActiva}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Ver imagen ${nombre}`}
      >
        <Image
          source={{ uri: adjunto.url }}
          style={estilos.miniatura}
          resizeMode="cover"
          onError={() => setFalloMiniatura(true)}
        />
      </TouchableOpacity>
    );
  }

  const icono = adjunto.tipo === 'VIDEO' ? 'videocam-outline' : 'document-text-outline';
  const detalle = [
    adjunto.formato ? String(adjunto.formato).toUpperCase() : null,
    pesoLegible(adjunto.bytes) || null,
    adjunto.origen === 'FICHA' ? 'de la ficha clínica' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      style={[estilos.fila, mio ? estilos.filaMia : estilos.filaOtro]}
      onPress={onAbrir}
      activeOpacity={interaccion.opacidadActiva}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${nombre}`}
    >
      <View style={[estilos.icono, mio ? estilos.iconoMio : estilos.iconoOtro]}>
        <Icono name={icono} size={22} color={mio ? colores.textoInverso : colores.primario} />
      </View>
      <View style={estilos.cuerpo}>
        <Text style={[estilos.nombre, mio && estilos.textoMio]} numberOfLines={2}>
          {nombre}
        </Text>
        {detalle ? (
          <Text style={[estilos.detalle, mio && estilos.detalleMio]} numberOfLines={1}>
            {detalle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  miniatura: {
    width: 200,
    height: 150,
    borderRadius: radio.md,
    backgroundColor: colores.superficieSuave,
  },

  fila: {
    width: 230,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    padding: espacio.sm,
    borderRadius: radio.md,
  },
  // Sobre la burbuja propia (azul de marca) la fila va un tono más claro;
  // sobre la del otro (blanca), en el gris cálido de las superficies hundidas.
  filaMia: { backgroundColor: colores.primarioPresionado },
  filaOtro: { backgroundColor: colores.superficieSuave, borderWidth: 1, borderColor: colores.bordeSuave },

  icono: {
    width: 38,
    height: 38,
    borderRadius: radio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconoMio: { backgroundColor: colores.primarioFuerte },
  iconoOtro: { backgroundColor: colores.primarioSuave },

  cuerpo: { flex: 1 },
  nombre: { ...tipografia.metaFuerte, color: colores.texto },
  textoMio: { color: colores.textoInverso },
  detalle: { ...tipografia.micro, color: colores.textoSuave, marginTop: 2 },
  detalleMio: { color: colores.primarioBorde },
});
