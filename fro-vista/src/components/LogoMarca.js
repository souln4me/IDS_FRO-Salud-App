// Ruta: fro-vista/src/components/LogoMarca.js
//
// Logo oficial de Punto Paz Salud. Un solo componente para todos los lugares
// donde aparece la marca (cabecera de navegación, login, registro), de modo
// que los archivos y sus proporciones se cambien en un único sitio.
//
// Hay dos versiones, como en el manual de marca:
//   · completo → el logotipo "PUNTOPAZ" con su isotipo. Se usa donde hay ancho
//     suficiente: login, registro y cabeceras principales.
//   · icono    → solo el isotipo. Para espacios estrechos o cuadrados.
//
// Los dos archivos vienen recortados al contenido real y con fondo
// transparente, así que `tamano` es directamente el alto de la marca en
// pantalla y no hay que descontar márgenes en blanco.

import React from 'react';
import { View, Text, Image, StyleSheet, useWindowDimensions } from 'react-native';

import { colores, tipografia, espacio } from '../theme';

const COMPLETO = require('../../assets/logo-puntopaz-completo.png');
const ICONO = require('../../assets/logo-puntopaz-icono.png');

// ancho / alto de cada archivo, medidos sobre el recorte.
const PROPORCION = { completo: 1716 / 239, icono: 341 / 319 };

// Alto de la marca en pantalla. Equivalen a los tamaños que ya estaban
// calibrados a ojo con el logo anterior.
const TAMANOS = { sm: 30, md: 34, lg: 54 };

/**
 * @param {'sm'|'md'|'lg'} tamano   alto de la marca
 * @param {'completo'|'icono'} variante
 * @param {boolean} conNombre       muestra "SALUD" bajo el logotipo
 */
export default function LogoMarca({
  tamano = 'md',
  variante = 'completo',
  conNombre = false,
  style,
}) {
  const { width: anchoPantalla } = useWindowDimensions();

  const proporcion = PROPORCION[variante] || PROPORCION.completo;
  let alto = TAMANOS[tamano] || TAMANOS.md;

  // En pantallas angostas la marca se ajusta en vez de desbordarse.
  const anchoDisponible = anchoPantalla - espacio.xxl * 2;
  if (alto * proporcion > anchoDisponible) {
    alto = anchoDisponible / proporcion;
  }

  const ancho = alto * proporcion;

  return (
    <View style={[estilos.contenedor, style]}>
      <Image
        source={variante === 'icono' ? ICONO : COMPLETO}
        style={{ height: alto, width: ancho }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Punto Paz Salud"
      />
      {conNombre && (
        <Text
          style={[
            estilos.nombre,
            {
              // El interletrado se calcula desde el ancho de la marca para que
              // "SALUD" quede alineado con ella y no descuadrado.
              fontSize: Math.max(10, alto * 0.26),
              letterSpacing: ancho * 0.028,
              // El interletrado añade un hueco al final: se compensa para que
              // la palabra quede centrada bajo el logotipo.
              marginLeft: ancho * 0.028,
              marginTop: alto * 0.28,
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
  // El café del isotipo: la palabra queda como acento cálido bajo el logotipo.
  nombre: { ...tipografia.micro, color: colores.secundario },
});
