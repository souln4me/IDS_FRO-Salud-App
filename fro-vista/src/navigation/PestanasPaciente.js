/**
 * Componente: Cliente Móvil
 * Casos de uso: CU79, CU39, CU52; abre las vistas de CU20, CU45, CU53 y CU14.
 */
// Ruta: fro-vista/src/navigation/PestanasPaciente.js
//
// Barra de navegación inferior del paciente (estilo Instagram), de izquierda a
// derecha: Inicio (Mis citas) · Mi tratamiento · ＋ (buscar y agendar) ·
// Mensajes · Mi perfil. Las demás pantallas del paciente siguen en el stack
// raíz y se abren encima de la barra.

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icono from '../components/Icono';

import MisCitasScreen from '../screens/Paciente/MisCitasScreen';
import MiTratamientoScreen from '../screens/Paciente/MiTratamientoScreen';
import ConversacionesScreen from '../screens/Comun/ConversacionesScreen';
import SeguridadScreen from '../screens/Comun/SeguridadScreen';
import CampanaNotificaciones from '../components/CampanaNotificaciones';
import LogoMarca from '../components/LogoMarca';
import { opcionesDeBarra } from './barraInferior';
import useReporteUbicacion from '../utils/useReporteUbicacion';
import { colores, radio, sombra } from '../theme';

const Tab = createBottomTabNavigator();

const ICONOS = {
  Inicio: 'home',
  Tratamiento: 'pulse',
  Mensajes: 'chatbubbles',
  Perfil: 'person-circle',
};

// CU07, CU08, CU09 — perfil y seguridad de la cuenta del paciente
// "Mi perfil" parte de la antigua "Seguridad de la cuenta", reordenada.
function PerfilPaciente(props) {
  return <SeguridadScreen {...props} comoPerfil />;
}

// La pestaña del centro no tiene pantalla propia: abre el buscador de horas.
function SinContenido() {
  return null;
}

// CU14 — Buscando y seleccionando cita en el motor de agendamiento
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
        <Icono name="add" size={30} color={colores.textoInverso} />
      </TouchableOpacity>
    </View>
  );
}

// CU79 — Segregando interfaces según rol de acceso
export default function PestanasPaciente({ navigation }) {
  // CU39: el día de una visita a domicilio, la ubicación se envía sola.
  useReporteUbicacion();

  return (
    <Tab.Navigator
      backBehavior="firstRoute"
      screenOptions={opcionesDeBarra(ICONOS)}
    >
      {/* CU20: Mis citas, inicio del paciente */}
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
      {/* CU45, CU48, CU50, CU23, CU51: Mi tratamiento */}
      <Tab.Screen
        name="Tratamiento"
        component={MiTratamientoScreen}
        options={{ title: 'Mi tratamiento', tabBarLabel: 'Tratamiento' }}
      />
      {/* CU14: el botón central abre el buscador de horas */}
      <Tab.Screen
        name="Agendar"
        component={SinContenido}
        options={{
          tabBarLabel: () => null,
          tabBarButton: () => <BotonAgendar onPress={() => navigation.navigate('BuscarCita')} />,
        }}
      />
      {/* CU53: conversaciones con los profesionales */}
      <Tab.Screen
        name="Mensajes"
        component={ConversacionesScreen}
        options={{ title: 'Mensajes', tabBarLabel: 'Mensajes' }}
      />
      {/* CU07, CU08, CU09: Mi perfil y seguridad */}
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
