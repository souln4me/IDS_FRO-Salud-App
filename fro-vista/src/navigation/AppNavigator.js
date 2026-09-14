// Ruta: fro-vista/src/navigation/AppNavigator.js
import React, { useContext, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthContext } from '../context/AuthContext';

// Pantallas — Autenticación
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import OTPScreen from '../screens/Auth/OTPScreen';
import RecuperarContrasenaScreen from '../screens/Auth/RecuperarContrasenaScreen';
// Pantallas — Paciente
import DashboardPaciente from '../screens/Paciente/DashboardPaciente';
import MisCitasScreen from '../screens/Paciente/MisCitasScreen';
import MisPautasScreen from '../screens/Paciente/MisPautasScreen';
import TriajeScreen from '../screens/Paciente/TriajeScreen';
import PagosScreen from '../screens/Paciente/PagosScreen';
import BuscarCitaScreen from '../screens/Paciente/BuscarCitaScreen';
// Pantallas — Profesional
import DashboardProfesional from '../screens/Profesional/DashboardProfesional';
import GestionDisponibilidadScreen from '../screens/Profesional/GestionDisponibilidadScreen';
import FichaClinicaScreen from '../screens/Profesional/FichaClinica/FichaClinicaScreen';
import MiJornadaScreen from '../screens/Profesional/MiJornadaScreen';
import MiPerfilScreen from '../screens/Profesional/MiPerfilScreen';
// Pantallas — Administrador
import ParametrosScreen from '../screens/Admin/ParametrosScreen';
import SesionesSuspendidasScreen from '../screens/Admin/SesionesSuspendidasScreen';
// Pantallas — Comunes a todos los roles
import SeguridadScreen from '../screens/Comun/SeguridadScreen';
import EvidenciaSesionScreen from '../screens/Comun/EvidenciaSesionScreen';
import FirmaConformidadScreen from '../screens/Profesional/FirmaConformidadScreen';
import DocumentosScreen from '../screens/Comun/DocumentosScreen';
import VisorDocumentoScreen from '../screens/Comun/VisorDocumentoScreen';
import { colores, tipografia } from '../theme';
import LogoFro from '../components/LogoFro';
import DialogoAviso from '../components/DialogoAviso';

const Stack = createNativeStackNavigator();

// Acciones que llevan a una pantalla por su nombre: si ningún navegador las
// atiende es porque la ruta no está registrada (error de ruteo).
const ACCIONES_DE_RUTEO = ['NAVIGATE', 'NAVIGATE_DEPRECATED', 'PUSH', 'REPLACE', 'JUMP_TO'];

export default function AppNavigator() {
  const { userToken, userData, isLoading } = useContext(AuthContext);

  // CU08 — Excepción 1: un enlace a una ruta que no existe para el rol no
  // hacía nada (React Navigation solo lo anota en consola). Ahora se avisa
  // del error y "Recargar aplicación" vuelve a montar la navegación desde la
  // pantalla inicial del rol.
  const [errorNavegacion, setErrorNavegacion] = useState(null);
  const [recargas, setRecargas] = useState(0);

  const alFallarNavegacion = (accion) => {
    if (!ACCIONES_DE_RUTEO.includes(accion.type)) {
      console.warn('[navegacion] Acción no atendida:', accion.type);
      return;
    }
    const destino = accion.payload?.name;
    console.warn('[navegacion] Ruta no disponible:', destino);
    setErrorNavegacion(
      destino === 'Seguridad' ? 'los ajustes de seguridad de tu cuenta' : 'la sección solicitada'
    );
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colores.fondo }}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  return (
    <NavigationContainer key={recargas} onUnhandledAction={alFallarNavegacion}>
      <Stack.Navigator
        screenOptions={{
          // Cabecera clara: el verde de marca es acento, no fondo de toda la
          // interfaz. Se separa del contenido con una línea fina en vez de
          // una sombra dura.
          // Cabecera verde de marca en toda la app. Las pantallas de inicio de
          // cada rol son la excepción: ahí va el logo sobre fondo claro.
          headerStyle: { backgroundColor: colores.primario },
          headerShadowVisible: false,
          headerTintColor: colores.textoInverso,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            ...tipografia.subtitulo,
            color: colores.textoInverso,
          },
          contentStyle: { backgroundColor: colores.fondo },
          animation: 'slide_from_right',
        }}
      >
        {userToken == null ? (
          // ── ESCENARIO A: Rutas Públicas (Sin iniciar sesión) ──
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Crear Cuenta' }} />
            <Stack.Screen
              name="RecuperarContrasena"
              component={RecuperarContrasenaScreen}
              options={{ title: 'Recuperar Contraseña' }}
            />
            <Stack.Screen
              name="OTP"
              component={OTPScreen}
              options={{ title: 'Verificar Cuenta', headerBackVisible: false, gestureEnabled: false }}
            />
          </>
        ) : userData?.rol === 'Paciente' ? (
          // ── ESCENARIO B: Paciente Autenticado ──
          <>
            <Stack.Screen
              name="DashboardPaciente"
              component={DashboardPaciente}
              options={{
                headerTitle: () => <LogoFro tamano="sm" />,
                headerStyle: {
                  backgroundColor: colores.superficie,
                  borderBottomWidth: 1,
                  borderBottomColor: colores.bordeSuave,
                },
                headerTintColor: colores.primario,
                headerBackVisible: false,
                gestureEnabled: false,
              }}
            />
            {/* Gestión de citas unificada: listado + reserva desde el botón flotante */}
            <Stack.Screen name="MisCitas" component={MisCitasScreen} options={{ title: 'Mis Citas' }} />
            <Stack.Screen name="MisPautas" component={MisPautasScreen} options={{ title: 'Mis Ejercicios' }} />
            <Stack.Screen name="Triaje" component={TriajeScreen} options={{ title: 'Entrevista Previa' }} />
            <Stack.Screen name="Pagos" component={PagosScreen} options={{ title: 'Pagos y Bonos' }} />
            <Stack.Screen name="EvidenciaSesion" component={EvidenciaSesionScreen} options={{ title: 'Evidencia de Sesión' }} />
            <Stack.Screen
              name="BuscarCita"
              component={BuscarCitaScreen}
              options={{ title: 'Buscar y Agendar Cita' }}
            />
            <Stack.Screen name="Seguridad" component={SeguridadScreen} options={{ title: 'Seguridad de la Cuenta' }} />
            {/* CU35: el paciente consulta su repositorio con el visor embebido */}
            <Stack.Screen name="Documentos" component={DocumentosScreen} options={{ title: 'Mis Documentos' }} />
            <Stack.Screen name="VisorDocumento" component={VisorDocumentoScreen} options={{ title: 'Visor de Documento' }} />
          </>
        ) : userData?.rol === 'Profesional' ? (
          // ── ESCENARIO C: Profesional Autenticado ──
          <>
            {/* El dashboard es la lista de pacientes asignados */}
            <Stack.Screen
              name="DashboardProfesional"
              component={DashboardProfesional}
              options={{
                headerTitle: () => <LogoFro tamano="sm" />,
                headerStyle: {
                  backgroundColor: colores.superficie,
                  borderBottomWidth: 1,
                  borderBottomColor: colores.bordeSuave,
                },
                headerTintColor: colores.primario,
                headerBackVisible: false,
                gestureEnabled: false,
              }}
            />
            {/* Ficha clínica consolidada: historial, anamnesis, episodios, evolución e intervención */}
            <Stack.Screen name="FichaClinica" component={FichaClinicaScreen} options={{ title: 'Ficha Clínica' }} />
            {/* Agenda del día: muestra y lleva a la ficha; ya no duplica las
                acciones de marcar la atención, que viven en la ficha. */}
            <Stack.Screen
              name="MiJornada"
              component={MiJornadaScreen}
              options={{ title: 'Mi Jornada' }}
            />
            <Stack.Screen
              name="GestionDisponibilidad"
              component={GestionDisponibilidadScreen}
              options={{ title: 'Gestión de Agenda' }}
            />
            {/* CU10: catálogo de perfil profesional */}
            <Stack.Screen name="MiPerfil" component={MiPerfilScreen} options={{ title: 'Mi perfil público' }} />
            <Stack.Screen name="Seguridad" component={SeguridadScreen} options={{ title: 'Seguridad de la Cuenta' }} />
            <Stack.Screen name="EvidenciaSesion" component={EvidenciaSesionScreen} options={{ title: 'Evidencia de Sesión' }} />
            <Stack.Screen name="FirmaConformidad" component={FirmaConformidadScreen} options={{ title: 'Firma de Conformidad' }} />
            {/* CU33/CU34/CU35: repositorio multimedia del paciente en atención */}
            <Stack.Screen name="Documentos" component={DocumentosScreen} options={{ title: 'Documentos del Paciente' }} />
            <Stack.Screen name="VisorDocumento" component={VisorDocumentoScreen} options={{ title: 'Visor de Documento' }} />
          </>
        ) : userData?.rol === 'Administrador' ? (
          // ── ESCENARIO D: Administrador Autenticado (CU59) ──
          <>
            <Stack.Screen
              name="ParametrosScreen"
              component={ParametrosScreen}
              options={{
                headerTitle: () => <LogoFro tamano="sm" />,
                headerStyle: {
                  backgroundColor: colores.superficie,
                  borderBottomWidth: 1,
                  borderBottomColor: colores.bordeSuave,
                },
                headerTintColor: colores.primario,
                headerBackVisible: false,
                gestureEnabled: false,
              }}
            />
            <Stack.Screen name="Seguridad" component={SeguridadScreen} options={{ title: 'Seguridad de la Cuenta' }} />
            {/* CU41 Exc.2 (D11): sesiones derivadas a revisión */}
            <Stack.Screen name="SesionesSuspendidas" component={SesionesSuspendidasScreen} options={{ title: 'Sesiones suspendidas' }} />
          </>
        ) : (
          // ── ESCENARIO E: Rol Desconocido ──
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Rol no autorizado' }} />
          </>
        )}
      </Stack.Navigator>
      <DialogoAviso
        visible={errorNavegacion !== null}
        titulo="Error de navegación"
        mensaje={`No se pudo abrir ${errorNavegacion}. Recarga la aplicación para restablecer el acceso.`}
        tono="error"
        etiquetaCerrar="Recargar aplicación"
        onCerrar={() => {
          setErrorNavegacion(null);
          setRecargas((n) => n + 1);
        }}
      />
    </NavigationContainer>
  );
}
