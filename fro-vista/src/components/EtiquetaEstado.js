// Ruta: fro-vista/src/components/EtiquetaEstado.js
//
// Pastilla de estado: fondo relleno con el color del estado y texto claro.
//
// Existe porque cada pantalla dibujaba la suya: en Mis Citas era una pastilla
// rellena, en Pagos y en las pautas era texto de color suelto, y en marcas
// temporales otra variante distinta. El mismo dato se leía de cuatro formas.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colores, espacio, radio, tipografia } from '../theme';
import { datosEstado } from '../utils/estados';

/**
 * @param {string} estado  valor de la base; se traduce con la tabla de estados
 * @param {string} texto   alternativa: etiqueta escrita a mano
 * @param {string} color   alternativa: color de fondo
 * @param {'sm'|'md'} tamano
 */
export default function EtiquetaEstado({ estado, texto, color, tamano = 'md', style }) {
  const datos = estado ? datosEstado(estado) : null;
  const fondo = color || datos?.color || colores.textoSuave;
  const etiqueta = texto || datos?.etiqueta || '—';

  return (
    <View
      style={[estilos.pastilla, tamano === 'sm' && estilos.pastillaSm, { backgroundColor: fondo }, style]}
    >
      <Text style={[estilos.texto, tamano === 'sm' && estilos.textoSm]} numberOfLines={1}>
        {etiqueta}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  pastilla: {
    paddingHorizontal: espacio.md,
    paddingVertical: 5,
    borderRadius: radio.completo,
    alignSelf: 'flex-start',
  },
  pastillaSm: { paddingHorizontal: espacio.sm, paddingVertical: 3 },
  texto: { ...tipografia.micro, color: colores.textoInverso, letterSpacing: 0.3 },
  textoSm: { fontSize: 10 },
});
