// Ruta: fro-vista/src/components/LogoFro.js
//
// Logo oficial de FRO Salud. Un solo componente para todos los lugares donde
// aparece (cabecera de navegación, login, registro), de modo que el archivo y
// sus proporciones se cambien en un único sitio.
//
// El archivo original es cuadrado y dos tercios de su superficie son espacio
// en blanco: por eso la marca se veía pequeña para el tamaño que se le daba.
// Se usa una versión recortada al contenido real, y `tamano` sigue
// significando lo mismo que antes (el alto del cuadro original), así que los
// tamaños calibrados a ojo se mantienen válidos.

import React from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';

import { colores, tipografia, espacio } from '../theme';

const MARCA = require('../../assets/logo-fro-marca.png');

// Medidas reales del recorte respecto del archivo cuadrado de 1080 px.
const ALTO_RELATIVO = 374 / 1080;   // cuánto del cuadro ocupaba la marca
const PROPORCION = 1048 / 374;      // ancho / alto de la marca recortada

const TAMANOS = { sm: 90, md: 90, lg: 160 };

/**
 * @param {'sm'|'md'|'lg'} tamano  alto del cuadro (la marca ocupa ~35% de él)
 * @param {boolean} conNombre      muestra "SALUD" bajo el logotipo
 */
export default function LogoFro({ tamano = 'md', conNombre = false, style }) {
  const { width: anchoPantalla } = useWindowDimensions();

  const cuadro = TAMANOS[tamano] || TAMANOS.md;
  let alto = cuadro * ALTO_RELATIVO;

  // En pantallas angostas la marca se ajusta en vez de desbordarse.
  const anchoDisponible = anchoPantalla - espacio.xxl * 2;
  if (alto * PROPORCION > anchoDisponible) {
    alto = anchoDisponible / PROPORCION;
  }

  const ancho = alto * PROPORCION;

  return (
    <View style={[estilos.contenedor, style]}>
      <Image
        source={MARCA}
        style={{ height: alto, width: ancho }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="FRO Salud"
      />
      {conNombre && (
        <Text
          style={[
            estilos.nombre,
            {
              // El interletrado se calcula desde el ancho de la marca para que
              // "SALUD" quede alineado con ella y no descuadrado.
              fontSize: Math.max(10, alto * 0.26),
              letterSpacing: ancho * 0.055,
              // El interletrado añade un hueco al final: se compensa para que
              // la palabra quede centrada bajo el logotipo.
              marginLeft: ancho * 0.055,
              marginTop: alto * 0.12,
            },
          ]}
        >
          SALUD
        </Text>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { alignItems: 'center', justifyContent: 'center' },
  nombre: { ...tipografia.micro, color: colores.primario },
});
