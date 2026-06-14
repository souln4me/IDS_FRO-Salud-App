import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BuscarCitaScreen from '../screens/BuscarCitaScreen';
import DashboardProfesionalScreen from '../screens/DashboardProfesionalScreen';
import HistorialPacienteScreen from '../screens/HistorialPacienteScreen';

// Importamos las pantallas que acabamos de crear
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="DashboardProfesional" 
        //CAMBIAR CUANDO ESTE LISTO EL C11 DEVUELTA A "Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#0052cc' }, // Azul corporativo FRO Salud
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ title: 'Ingreso al Sistema' }}
        />
        <Stack.Screen 
          name="Register" 
          component={RegisterScreen} 
          options={{ title: 'Crear Cuenta' }}
        />
        <Stack.Screen
          name="BuscarCita"
          component={BuscarCitaScreen}
          options={{ title: 'Buscar Cita Medica'}}
        />          
        <Stack.Screen
          name="DashboardProfesional"
          component={DashboardProfesionalScreen}
          options={{ title: 'Panel Profesional' }}
        />
        <Stack.Screen
          name="HistorialPaciente"
          component={HistorialPacienteScreen}
          options={{ title: 'Historial Paciente' }}
        />

      </Stack.Navigator>
    </NavigationContainer>
  );
}