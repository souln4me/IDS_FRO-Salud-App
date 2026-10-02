// Ruta: fro-vista/App.js
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';

export default function App() {
  return (
    // Las barras fijas al pie (p. ej. confirmar reserva) necesitan saber cuánto
    // espacio ocupa el gesto del sistema para no quedar debajo de él.
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
