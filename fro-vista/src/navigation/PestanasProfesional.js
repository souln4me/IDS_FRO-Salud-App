// Ruta: fro-vista/src/navigation/PestanasProfesional.js
//
// Barra de navegación inferior del profesional, con el mismo estilo que la
// del paciente. De izquierda a derecha: Inicio (fichas y banderas rojas) ·
// Mi jornada · Mensajes · Perfil. Las demás pantallas (ficha clínica,
// disponibilidad, liquidaciones, soporte…) se abren encima de la barra.

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import DashboardProfesional from '../screens/Profesional/DashboardProfesional';
import MiJornadaScreen from '../screens/Profesional/MiJornadaScreen';
import MiPerfilScreen from '../screens/Profesional/MiPerfilScreen';
import ConversacionesScreen from '../screens/Comun/ConversacionesScreen';
import CampanaNotificaciones from '../components/CampanaNotificaciones';
import LogoMarca from '../components/LogoMarca';
import { opcionesDeBarra } from './barraInferior';

const Tab = createBottomTabNavigator();

const ICONOS = {
  Inicio: 'home',
  Jornada: 'calendar',
  Mensajes: 'chatbubbles',
  Perfil: 'person-circle',
};

// "Perfil" parte del perfil público y suma seguridad, soporte y cierre.
function PerfilProfesional(props) {
  return <MiPerfilScreen {...props} comoPestana />;
}

export default function PestanasProfesional({ navigation }) {
  return (
    <Tab.Navigator backBehavior="firstRoute" screenOptions={opcionesDeBarra(ICONOS)}>
      <Tab.Screen
        name="Inicio"
        component={DashboardProfesional}
        options={{
          tabBarLabel: 'Inicio',
          headerTitle: () => <LogoMarca tamano="sm" />,
          // CU52: la campana con el globo de avisos sin leer.
          headerRight: () => <CampanaNotificaciones navigation={navigation} />,
        }}
      />
      <Tab.Screen
        name="Jornada"
        component={MiJornadaScreen}
        options={{ title: 'Mi jornada', tabBarLabel: 'Mi jornada' }}
      />
      <Tab.Screen
        name="Mensajes"
        component={ConversacionesScreen}
        options={{ title: 'Mensajes', tabBarLabel: 'Mensajes' }}
      />
      <Tab.Screen
        name="Perfil"
        component={PerfilProfesional}
        options={{ title: 'Mi perfil', tabBarLabel: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}
