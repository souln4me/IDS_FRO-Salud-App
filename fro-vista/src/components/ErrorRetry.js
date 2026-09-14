// Ruta: fro-vista/src/components/ErrorRetry.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colores, espacio, radio, sombra, tipografia, piezas } from '../theme';

/**
 * Componente reutilizable para manejar la Excepción 3 (Caída de red o servidor).
 * @param {string} mensaje - El texto explicativo del error.
 * @param {function} onRetry - La función que se ejecutará al presionar "Reintentar".
 */
export default function ErrorRetry({ mensaje, onRetry }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔌</Text>
      <Text style={styles.title}>Servicio no disponible</Text>
      <Text style={styles.message}>
        {mensaje || 'El servicio de validación de políticas no está disponible momentáneamente. Comprueba tu conexión a internet o intenta más tarde.'}
      </Text>
      
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>REINTENTAR CONEXIÓN</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: espacio.xl,
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    alignItems: 'center',
    margin: espacio.lg,
    ...sombra.suave,
  },
  icon: { fontSize: 40, marginBottom: espacio.md },
  title: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.sm },
  message: {
    ...tipografia.meta,
    color: colores.textoSuave,
    textAlign: 'center',
    marginBottom: espacio.lg,
  },
  retryButton: {
    ...piezas.botonPrimario,
    width: '100%',
  },
  retryButtonText: {
    ...tipografia.metaFuerte,
    color: colores.textoInverso,
    letterSpacing: 0.8,
  },
});
