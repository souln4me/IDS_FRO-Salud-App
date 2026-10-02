// Ruta: fro-vista/src/navigation/PestanasPaciente.js
//
// Barra de navegación inferior del paciente (estilo Instagram), de izquierda a
// derecha: Inicio (Mis citas) · Mi tratamiento · ＋ (buscar y agendar) ·
// Mensajes · Mi perfil. Las demás pantallas del paciente siguen en el stack
// raíz y se abren encima de la barra.

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import MisCitasScreen from '../screens/Paciente/MisCitasScreen';
import MiTratamientoScreen from '../screens/Paciente/MiTratamientoScreen';
import ConversacionesScreen from '../screens/Comun/ConversacionesScreen';
import SeguridadScreen from '../screens/Comun/SeguridadScreen';
import CampanaNotificaciones from '../components/CampanaNotificaciones';
import LogoMarca from '../components/LogoMarca';
import { opcionesDeBarra } from './barraInferior';
import { colores, radio, sombra } from '../theme';

const Tab = createBottomTabNavigator();

const ICONOS = {
  Inicio: 'home',
  Tratamiento: 'pulse',
  Mensajes: 'chatbubbles',
  Perfil: 'person-circle',
};

// "Mi perfil" parte de la antigua "Seguridad de la cuenta", reordenada.
function PerfilPaciente(props) {
  return <SeguridadScreen {...props} comoPerfil />;
}

// La pestaña del centro no tiene pantalla propia: abre el buscador de horas.
function SinContenido() {
  return null;
}

function BotonAgendar({ onPress }) {
  return (
    <View style={styles.celdaAgendar}>
      <TouchableOpacity
        style={styles.botonAgendar}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Buscar y agendar cita"
      >
        <Ionicons name="add" size={30} color={colores.textoInverso} />
      </TouchableOpacity>
    </View>
  );
}

export default function PestanasPaciente({ navigation }) {
  return (
    <Tab.Navigator
      backBehavior="firstRoute"
      screenOptions={opcionesDeBarra(ICONOS)}
    >
      <Tab.Screen
        name="Inicio"
        component={MisCitasScreen}
        options={{
          tabBarLabel: 'Inicio',
          headerTitle: () => <LogoMarca tamano="sm" />,
          // CU52: la campana con el globo de avisos sin leer.
          headerRight: () => <CampanaNotificaciones navigation={navigation} />,
        }}
      />
      <Tab.Screen
        name="Tratamiento"
        component={MiTratamientoScreen}
        options={{ title: 'Mi tratamiento', tabBarLabel: 'Tratamiento' }}
      />
      <Tab.Screen
        name="Agendar"
        component={SinContenido}
        options={{
          tabBarLabel: () => null,
          tabBarButton: () => <BotonAgendar onPress={() => navigation.navigate('BuscarCita')} />,
        }}
      />
      <Tab.Screen
        name="Mensajes"
        component={ConversacionesScreen}
        options={{ title: 'Mensajes', tabBarLabel: 'Mensajes' }}
      />
      <Tab.Screen
        name="Perfil"
        component={PerfilPaciente}
        options={{ title: 'Mi perfil', tabBarLabel: 'Mi perfil' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  celdaAgendar: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  botonAgendar: {
    width: 46,
    height: 46,
    borderRadius: radio.completo,
    backgroundColor: colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra.suave,
  },
});
