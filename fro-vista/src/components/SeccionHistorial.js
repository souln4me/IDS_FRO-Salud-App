// Ruta: fro-vista/src/components/SeccionHistorial.js
//
// Desplegable "Historial" para lo que ya terminó (citas realizadas o
// canceladas, pagos cerrados). Parte cerrado: lo que el usuario necesita a
// diario queda arriba, y lo pasado se consulta cuando hace falta.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { colores, espacio, radio, tipografia, interaccion } from '../theme';

export default function SeccionHistorial({ titulo = 'Historial', cantidad = 0, ayuda, children }) {
  const [abierto, setAbierto] = useState(false);
  if (cantidad === 0) return null;

  return (
    <View style={estilos.contenedor}>
      <TouchableOpacity
        style={estilos.cabecera}
        onPress={() => setAbierto((previo) => !previo)}
        activeOpacity={interaccion.opacidadActiva}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
      >
        <View style={estilos.textos}>
          <Text style={estilos.titulo}>
            {titulo} ({cantidad})
          </Text>
          {ayuda ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}
        </View>
        <Text style={estilos.flecha}>{abierto ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      {abierto ? <View style={estilos.cuerpo}>{children}</View> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { marginTop: espacio.lg },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.base,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficieSuave,
  },
  textos: { flex: 1 },
  titulo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  ayuda: { ...tipografia.micro, color: colores.textoTenue, marginTop: 2, letterSpacing: 0 },
  flecha: { ...tipografia.subtitulo, color: colores.primario, marginLeft: espacio.md },
  cuerpo: { marginTop: espacio.md },
});
