// Ruta: fro-vista/src/components/CampoContrasena.js
//
// Campo de contraseña con un "ojito" para ver lo que se está escribiendo.
// Recibe las mismas props que un TextInput; los márgenes del estilo se pasan
// al contenedor para que el botón quede centrado en el campo.

import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';

import { colores } from '../theme';

const CLAVES_MARGEN = [
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'flex', 'alignSelf', 'width',
];

function Ojo({ tachado }) {
  const color = colores.textoSuave;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      {tachado ? (
        <Line x1={4} y1={4} x2={20} y2={20} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}

export default function CampoContrasena({ style, ...props }) {
  const [visible, setVisible] = useState(false);

  const plano = StyleSheet.flatten(style) || {};
  const estiloContenedor = {};
  const estiloCampo = {};
  for (const [clave, valor] of Object.entries(plano)) {
    if (CLAVES_MARGEN.includes(clave)) estiloContenedor[clave] = valor;
    else estiloCampo[clave] = valor;
  }

  return (
    <View style={[estilos.contenedor, estiloContenedor]}>
      <TextInput
        {...props}
        style={[estiloCampo, estilos.campo]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={estilos.boton}
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        <Ojo tachado={visible} />
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { position: 'relative', justifyContent: 'center' },
  // Espacio a la derecha para que el texto no quede bajo el botón.
  campo: { paddingRight: 48 },
  boton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
