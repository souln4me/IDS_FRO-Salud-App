/**
 * Componente: Cliente Móvil
 * Casos de uso: CU58; también lo usa CU56.
 */
// Ruta: fro-vista/src/components/EtiquetaEvaluacion.js
//
// Cabecera de un testimonio: estrellas si es la calificación del tratamiento,
// o una etiqueta pequeña si es el comentario de una sesión (que no lleva
// estrellas). Las estrellas y la etiqueta tienen estilos separados: con el
// estilo grande y espaciado de las estrellas, el texto se veía deformado.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colores, espacio, radio, tipografia } from '../theme';

export default function EtiquetaEvaluacion({ puntuacion, satisfecho, tamanoEstrellas = 18 }) {
  if (puntuacion) {
    return (
      <View style={estilos.fila}>
        <Text style={[estilos.estrellas, { fontSize: tamanoEstrellas }]}>
          {'★'.repeat(puntuacion)}{'☆'.repeat(5 - puntuacion)}
        </Text>
        <View style={estilos.chip}>
          <Text style={estilos.chipTexto}>Tratamiento</Text>
        </View>
      </View>
    );
  }
  const si = Boolean(Number(satisfecho));
  return (
    <View style={estilos.fila}>
      <View style={estilos.chip}>
        <Text style={estilos.chipTexto}>Sesión</Text>
      </View>
      <View style={[estilos.chip, si ? estilos.chipSi : estilos.chipNo]}>
        <Text style={[estilos.chipTexto, si ? estilos.textoSi : estilos.textoNo]}>
          {si ? 'Satisfecho' : 'No satisfecho'}
        </Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs, flexShrink: 1 },
  estrellas: { color: colores.secundario, letterSpacing: 2 },
  chip: {
    paddingVertical: 2,
    paddingHorizontal: espacio.sm,
    borderRadius: radio.completo,
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
  },
  chipTexto: { ...tipografia.meta, fontWeight: '600', color: colores.textoSuave },
  chipSi: { backgroundColor: colores.exitoSuave, borderColor: colores.exitoBorde },
  chipNo: { backgroundColor: colores.errorSuave, borderColor: colores.errorBorde },
  textoSi: { color: colores.exito },
  textoNo: { color: colores.error },
});
