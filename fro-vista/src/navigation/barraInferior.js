// Ruta: fro-vista/src/navigation/barraInferior.js
//
// Estilo común de las barras de navegación inferior (paciente y profesional),
// para que ambas se vean y se comporten igual.

import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colores, tipografia } from '../theme';

// Las pestañas son pantallas raíz: cabecera clara, como el inicio de cada rol.
export const cabeceraDePestana = {
  headerStyle: {
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
  },
  headerShadowVisible: false,
  headerTitleAlign: 'center',
  headerTintColor: colores.primario,
  headerTitleStyle: { ...tipografia.subtitulo, color: colores.textoTitulo },
};

/**
 * screenOptions del Tab.Navigator. `iconos` asocia cada ruta a un ícono de
 * Ionicons: de línea cuando la pestaña está inactiva y relleno cuando está
 * activa. Una ruta sin ícono (el "+" del paciente) dibuja su propio botón.
 */
export function opcionesDeBarra(iconos) {
  return ({ route }) => ({
    ...cabeceraDePestana,
    tabBarActiveTintColor: colores.primario,
    tabBarInactiveTintColor: colores.textoSuave,
    tabBarLabelStyle: { ...tipografia.micro, fontWeight: '600', letterSpacing: 0 },
    tabBarStyle: {
      backgroundColor: colores.superficie,
      borderTopColor: colores.bordeSuave,
    },
    // Al escribir la barra se esconde para no quitarle espacio al campo.
    tabBarHideOnKeyboard: true,
    tabBarIcon: ({ focused, color, size }) =>
      iconos[route.name] ? (
        <Ionicons
          name={focused ? iconos[route.name] : `${iconos[route.name]}-outline`}
          size={size}
          color={color}
        />
      ) : null,
  });
}
