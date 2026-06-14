import React from 'react';
import { StyleSheet, Text, View, Button } from 'react-native';

export default function LoginScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔐 Iniciar Sesión (FRO Salud)</Text>
      <Button 
        title="¿No tienes cuenta? Regístrate aquí" 
        onPress={() => navigation.navigate('Register')} 
      />
      
      <View style={{ marginTop: 15}} />
      <Button
        title="Probar CU14 - Buscar Cita"
        onPress={() => navigation.navigate('BuscarCita')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 20, marginBottom: 20, fontWeight: 'bold' }
});