// Ruta: fro-vista/src/components/TabSelector.js
//
// Barra de pestañas horizontal reutilizable. Se implementa con componentes
// básicos de React Native para no sumar dependencias nativas al proyecto.

import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colores, espacio, tipografia } from '../theme';

export default function TabSelector({ tabs, tabActiva, onCambiarTab, color = colores.primario }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.barra}
      contentContainerStyle={styles.contenido}
    >
      {tabs.map((tab) => {
        const activa = tab.key === tabActiva;

        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activa && { borderBottomColor: color }]}
            onPress={() => onCambiarTab(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
          >
            {tab.icono ? <Text style={styles.icono}>{tab.icono}</Text> : null}
            <Text style={[styles.etiqueta, activa && { color, fontWeight: 'bold' }]}>
              {tab.titulo}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  barra: {
    // Altura fija: la barra jamás debe crecer y comerse el espacio del
    // contenido (los ScrollView horizontales tienden a estirarse en Android).
    height: 48,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  contenido: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: espacio.base,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  icono: {
    fontSize: 15,
    marginRight: 6,
  },
  etiqueta: {
    ...tipografia.cuerpo,
    fontSize: 15,
    color: colores.textoSuave,
  },
});
