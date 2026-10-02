// Ruta: fro-vista/src/navigation/AppNavigator.js
import React, { useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AuthContext } from '../context/AuthContext';

// Pantallas — Autenticación
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import OTPScreen from '../screens/Auth/OTPScreen';
import RecuperarContrasenaScreen from '../screens/Auth/RecuperarContrasenaScreen';
// Pantallas — Paciente
import PestanasPaciente from './PestanasPaciente';
import { PESTANAS_PACIENTE, PESTANAS_PROFESIONAL, resolverDestino } from './rutasBarra';
import ResenasProfesionalScreen from '../screens/Paciente/ResenasProfesionalScreen';
import PerfilProfesionalScreen from '../screens/Paciente/PerfilProfesionalScreen';
import PagarReservaScreen from '../screens/Paciente/PagarReservaScreen';
import PagosScreen from '../screens/Paciente/PagosScreen';
import BuscarCitaScreen from '../screens/Paciente/BuscarCitaScreen';
// Pantallas — Profesional
import PestanasProfesional from './PestanasProfesional';
import GestionDisponibilidadScreen from '../screens/Profesional/GestionDisponibilidadScreen';
import FichaClinicaScreen from '../screens/Profesional/FichaClinica/FichaClinicaScreen';
import MisHorariosScreen from '../screens/Profesional/MisHorariosScreen';
import MisLiquidacionesScreen from '../screens/Profesional/MisLiquidacionesScreen';
// Pantallas — Administrador
import ParametrosScreen from '../screens/Admin/ParametrosScreen';
import SesionesSuspendidasScreen from '../screens/Admin/SesionesSuspendidasScreen';
import PalabrasRestringidasScreen from '../screens/Admin/PalabrasRestringidasScreen';
import ModeracionResenasScreen from '../screens/Admin/ModeracionResenasScreen';
import PanelAdminScreen from '../screens/Admin/PanelAdminScreen';
import BandejaSoporteScreen from '../screens/Admin/BandejaSoporteScreen';
import ReportesScreen from '../screens/Admin/ReportesScreen';
import LiquidacionesScreen from '../screens/Admin/LiquidacionesScreen';
// Pantallas — Comunes a los tres roles
import CentroNotificacionesScreen from '../screens/Comun/CentroNotificacionesScreen';
import SoporteScreen from '../screens/Comun/SoporteScreen';
import ChatClinicoScreen from '../screens/Comun/ChatClinicoScreen';
import CampanaNotificaciones from '../components/CampanaNotificaciones';
import { escucharToques } from '../utils/push';
// Pantallas — Comunes a todos los roles
import SeguridadScreen from '../screens/Comun/SeguridadScreen';
import EvidenciaSesionScreen from '../screens/Comun/EvidenciaSesionScreen';
import FirmaConformidadScreen from '../screens/Profesional/FirmaConformidadScreen';
import DocumentosScreen from '../screens/Comun/DocumentosScreen';
import VisorDocumentoScreen from '../screens/Comun/VisorDocumentoScreen';
import { colores, tipografia } from '../theme';
import LogoMarca from '../components/LogoMarca';
import DialogoAviso from '../components/DialogoAviso';

const Stack = createNativeStackNavigator();

// Acciones que llevan a una pantalla por su nombre: si ningún navegador las
// atiende es porque la ruta no está registrada (error de ruteo).
const ACCIONES_DE_RUTEO = ['NAVIGATE', 'NAVIGATE_DEPRECATED', 'PUSH', 'REPLACE', 'JUMP_TO'];

// CU52: el toque sobre una alerta del sistema tiene que abrir la pantalla que
// corresponde, y eso ocurre fuera del árbol de componentes: hace falta una
// referencia al navegador.
export const refNavegacion = createNavigationContainerRef();

// Pantallas cuya parte superior es clara (cabecera blanca o sin cabecera): ahí
// la hora, la batería y la señal del teléfono van en negro. En el resto la
// cabecera es azul de marca y van en blanco. Sin esto, algunos teléfonos
// (Samsung en modo oscuro) los pintaban blancos sobre la cabecera blanca.
const PANTALLAS_DE_ARRIBA_CLARA = ['Login', PESTANAS_PACIENTE, PESTANAS_PROFESIONAL, 'PanelAdmin'];

function estiloBarraDeEstado(estado) {
  const ruta = estado?.routes?.[estado.index]?.name;
  return !ruta || PANTALLAS_DE_ARRIBA_CLARA.includes(ruta) ? 'dark' : 'light';
}

export default function AppNavigator() {
  const { userToken, userData, isLoading } = useContext(AuthContext);

  // CU08 — Excepción 1: un enlace a una ruta que no existe para el rol no
  // hacía nada (React Navigation solo lo anota en consola). Ahora se avisa
  // del error y "Recargar aplicación" vuelve a montar la navegación desde la
  // pantalla inicial del rol.
  const [errorNavegacion, setErrorNavegacion] = useState(null);
  const [estiloBarra, setEstiloBarra] = useState('dark');
  const actualizarBarra = () => setEstiloBarra(estiloBarraDeEstado(refNavegacion.getRootState?.()));
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

  // CU52 — Excepción 3/4: tocar la alerta del teléfono abre el módulo indicado
  // en la carga útil del aviso. Si el usuario la descarta, no pasa nada.
  useEffect(() => {
    const dejarDeEscuchar = escucharToques((datos) => {
      const destino = datos?.pantalla;
      if (!destino || !refNavegacion.isReady()) return;
      const rutasDelRol = refNavegacion.getRootState()?.routeNames || [];
      // Del paciente, varias pantallas ahora viven dentro de la barra inferior.
      const ruta = resolverDestino(rutasDelRol, destino, datos);
      if (ruta) {
        refNavegacion.navigate(...ruta);
      } else {
        console.warn('[notificaciones] pantalla no disponible para este rol:', destino);
      }
    });
    return dejarDeEscuchar;
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colores.fondo }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={refNavegacion}
      key={recargas}
      onUnhandledAction={alFallarNavegacion}
      onReady={actualizarBarra}
      onStateChange={(estado) => setEstiloBarra(estiloBarraDeEstado(estado))}
    >
      <StatusBar style={estiloBarra} />
      <Stack.Navigator
        screenOptions={{
          // Cabecera en el azul de marca en toda la app. Las pantallas de
          // inicio de cada rol son la excepción: ahí va el logo sobre fondo
          // claro, separado del contenido por una línea fina.
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
            {/* Barra inferior: Inicio (Mis citas) · Mi tratamiento · ＋ ·
                Mensajes · Mi perfil. Lo demás se abre encima de ella. */}
            <Stack.Screen
              name={PESTANAS_PACIENTE}
              component={PestanasPaciente}
              options={{ headerShown: false, gestureEnabled: false }}
            />
            {/* CU58: calificación y testimonios de un profesional */}
            <Stack.Screen name="ResenasProfesional" component={ResenasProfesionalScreen} options={{ title: 'Evaluaciones' }} />
            {/* CU10/CU14: perfil público del profesional, de solo lectura */}
            <Stack.Screen name="PerfilProfesional" component={PerfilProfesionalScreen} options={{ title: 'Perfil del profesional' }} />
            {/* CU73: cobro anticipado antes de confirmar la hora */}
            <Stack.Screen name="PagarReserva" component={PagarReservaScreen} options={{ title: 'Pagar tu hora' }} />
            <Stack.Screen name="Pagos" component={PagosScreen} options={{ title: 'Pagos y Bonos' }} />
            <Stack.Screen name="EvidenciaSesion" component={EvidenciaSesionScreen} options={{ title: 'Evidencia de Sesión' }} />
            <Stack.Screen
              name="BuscarCita"
              component={BuscarCitaScreen}
              options={{ title: 'Buscar y Agendar Cita' }}
            />
            <Stack.Screen name="Notificaciones" component={CentroNotificacionesScreen} options={{ title: 'Notificaciones' }} />
            {/* CU60: solicitudes de soporte y su seguimiento */}
            <Stack.Screen name="Soporte" component={SoporteScreen} options={{ title: 'Ayuda y soporte' }} />
            <Stack.Screen name="ChatClinico" component={ChatClinicoScreen} options={{ title: 'Mensajes' }} />
            {/* CU35: el paciente consulta su repositorio con el visor embebido */}
            <Stack.Screen name="Documentos" component={DocumentosScreen} options={{ title: 'Mis Documentos' }} />
            <Stack.Screen name="VisorDocumento" component={VisorDocumentoScreen} options={{ title: 'Visor de Documento' }} />
          </>
        ) : userData?.rol === 'Profesional' ? (
          // ── ESCENARIO C: Profesional Autenticado ──
          <>
            {/* Barra inferior: Inicio (fichas y banderas rojas) · Mi jornada ·
                Mensajes · Perfil. Lo demás se abre encima de ella. */}
            <Stack.Screen
              name={PESTANAS_PROFESIONAL}
              component={PestanasProfesional}
              options={{ headerShown: false, gestureEnabled: false }}
            />
            {/* Ficha clínica consolidada: historial, anamnesis, episodios, evolución e intervención */}
            <Stack.Screen name="FichaClinica" component={FichaClinicaScreen} options={{ title: 'Ficha Clínica' }} />
            <Stack.Screen
              name="GestionDisponibilidad"
              component={GestionDisponibilidadScreen}
              options={{ title: 'Gestión de Agenda' }}
            />
            {/* Jornada semanal: el profesional gestiona sus bloques horarios */}
            <Stack.Screen name="MisHorarios" component={MisHorariosScreen} options={{ title: 'Mis horarios de atención' }} />
            {/* CU58: el profesional ve sus propias evaluaciones publicadas */}
            <Stack.Screen name="ResenasProfesional" component={ResenasProfesionalScreen} options={{ title: 'Evaluaciones' }} />
            {/* CU75: historial de liquidaciones, solo lectura */}
            <Stack.Screen name="MisLiquidaciones" component={MisLiquidacionesScreen} options={{ title: 'Mis Liquidaciones' }} />
            <Stack.Screen name="Notificaciones" component={CentroNotificacionesScreen} options={{ title: 'Notificaciones' }} />
            {/* CU60: solicitudes de soporte y su seguimiento */}
            <Stack.Screen name="Soporte" component={SoporteScreen} options={{ title: 'Ayuda y soporte' }} />
            <Stack.Screen name="ChatClinico" component={ChatClinicoScreen} options={{ title: 'Mensajes' }} />
            <Stack.Screen name="EvidenciaSesion" component={EvidenciaSesionScreen} options={{ title: 'Evidencia de Sesión' }} />
            <Stack.Screen name="FirmaConformidad" component={FirmaConformidadScreen} options={{ title: 'Firma de Conformidad' }} />
            {/* CU33/CU34/CU35: repositorio multimedia del paciente en atención */}
            <Stack.Screen name="Documentos" component={DocumentosScreen} options={{ title: 'Documentos del Paciente' }} />
            <Stack.Screen name="VisorDocumento" component={VisorDocumentoScreen} options={{ title: 'Visor de Documento' }} />
          </>
        ) : userData?.rol === 'Administrador' ? (
          // ── ESCENARIO D: Administrador Autenticado (CU59) ──
          <>
            {/* CU64: el panel de indicadores es lo primero que ve el
                administrador. Parámetros pasa a ser una herramienta más. */}
            <Stack.Screen
              name="PanelAdmin"
              component={PanelAdminScreen}
              options={({ navigation }) => ({
                headerTitle: () => <LogoMarca tamano="sm" />,
                headerStyle: {
                  backgroundColor: colores.superficie,
                  borderBottomWidth: 1,
                  borderBottomColor: colores.bordeSuave,
                },
                headerTintColor: colores.primario,
                headerBackVisible: false,
                gestureEnabled: false,
                // CU52: la campana con el globo de avisos sin leer.
                headerRight: () => <CampanaNotificaciones navigation={navigation} />,
              })}
            />
            <Stack.Screen name="Notificaciones" component={CentroNotificacionesScreen} options={{ title: 'Notificaciones' }} />
            <Stack.Screen name="Seguridad" component={SeguridadScreen} options={{ title: 'Seguridad de la Cuenta' }} />
            {/* CU41 Exc.2 (D11): sesiones derivadas a revisión */}
            <Stack.Screen name="SesionesSuspendidas" component={SesionesSuspendidasScreen} options={{ title: 'Sesiones suspendidas' }} />
            {/* CU57: diccionario de términos restringidos */}
            <Stack.Screen name="PalabrasRestringidas" component={PalabrasRestringidasScreen} options={{ title: 'Términos restringidos' }} />
            {/* CU56: moderación de testimonios públicos */}
            <Stack.Screen name="ModeracionResenas" component={ModeracionResenasScreen} options={{ title: 'Testimonios' }} />
            <Stack.Screen name="Parametros" component={ParametrosScreen} options={{ title: 'Parámetros Globales' }} />
            {/* CU61: bandeja de tickets enrutados al operador */}
            <Stack.Screen name="BandejaSoporte" component={BandejaSoporteScreen} options={{ title: 'Soporte' }} />
            {/* CU63: informes operativos exportables */}
            <Stack.Screen name="Reportes" component={ReportesScreen} options={{ title: 'Informes' }} />
            {/* CU75: liquidación mensual de los profesionales */}
            <Stack.Screen name="Liquidaciones" component={LiquidacionesScreen} options={{ title: 'Liquidaciones' }} />
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
