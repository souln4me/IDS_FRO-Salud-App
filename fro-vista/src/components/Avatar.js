/**
 * Componente: Cliente Móvil
 * Casos de uso: apoyo común, usado por CU09, CU11 y CU53.
 */
// Ruta: fro-vista/src/components/Avatar.js
//
// Foto de perfil redonda o, si la persona no subió una, sus iniciales sobre el
// color de marca. Lo usan el perfil del paciente, la bandeja de mensajes, el
// chat y la lista de pacientes del profesional.

import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

import { colores } from '../theme';

/** "Paula Paciente Prueba" → "PP". */
export function iniciales(nombre) {
  return String(nombre || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

export default function Avatar({ foto, nombre, tamano = 48, style }) {
  // Si la imagen no carga (sin señal, URL vencida), se vuelve a las iniciales.
  const [fallo, setFallo] = useState(false);
  const dimension = { width: tamano, height: tamano, borderRadius: tamano / 2 };
  const valida = foto && foto !== 'default.jpg' && !fallo;

  if (valida) {
    return <Image source={{ uri: foto }} style={[estilos.base, dimension, style]} onError={() => setFallo(true)} />;
  }
  return (
    <View style={[estilos.base, estilos.vacio, dimension, style]} accessibilityLabel={nombre ? `Iniciales de ${nombre}` : undefined}>
      <Text style={[estilos.iniciales, { fontSize: Math.round(tamano * 0.36) }]}>{iniciales(nombre) || '?'}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  base: { backgroundColor: colores.primarioSuave, overflow: 'hidden' },
  vacio: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colores.primarioBorde },
  iniciales: { color: colores.primario, fontWeight: '700', letterSpacing: 0.5 },
});
