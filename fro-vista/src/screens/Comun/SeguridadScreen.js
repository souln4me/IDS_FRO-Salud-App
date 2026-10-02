// Ruta: fro-vista/src/screens/Comun/SeguridadScreen.js
//
// Panel de seguridad de la cuenta, común a los tres roles:
// - CU08: sesiones activas por dispositivo, con cierre remoto.
// - CU07: cambio de contraseña validado por código al correo.
// - CU09: privacidad de datos de contacto (solo pacientes).

import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  StyleSheet,
} from 'react-native';

import apiClient from '../../api/client';
import { AuthContext } from '../../context/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import VistaConTeclado from '../../components/VistaConTeclado';
import CambioContrasenaOTP from '../../components/CambioContrasenaOTP';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, radio, tipografia, piezas, interaccion } from '../../theme';
import DialogoAviso from '../../components/DialogoAviso';

// Sesiones, contraseña y privacidad, sin contenedor propio: la usa esta
// pantalla y el pie de los perfiles (paciente y profesional).
function SeccionesSeguridad({ contrasenaPrimero = false }) {
  const { userData, logoutSession } = useContext(AuthContext);
  const esPaciente = userData?.rol === 'Paciente';

  // ── CU08: sesiones ─────────────────────────────────────────────────────────
  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).
  const [aviso, setAviso] = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [cargandoSesiones, setCargandoSesiones] = useState(true);
  const [errorSesiones, setErrorSesiones] = useState(false);
  const [cerrandoId, setCerrandoId] = useState(null);

  // ── CU07: cambio de contraseña ─────────────────────────────────────────────
  const [cambioActivo, setCambioActivo] = useState(false);
  const [destinoOTP, setDestinoOTP] = useState('');
  const [procesandoCambio, setProcesandoCambio] = useState(false);

  // ── CU09: privacidad (solo pacientes) ──────────────────────────────────────
  const [privacidad, setPrivacidad] = useState(null);
  const [guardandoPrivacidad, setGuardandoPrivacidad] = useState(false);

  const cargarSesiones = async () => {
    setCargandoSesiones(true);
    setErrorSesiones(false);
    try {
      const { data } = await apiClient.get('/auth/sesiones');
      setSesiones(data?.sesiones || []);
    } catch {
      // CU08 — Excepción 2: no se pudo recuperar la lista en tiempo real.
      setErrorSesiones(true);
    } finally {
      setCargandoSesiones(false);
    }
  };

  const cargarPrivacidad = async () => {
    if (!esPaciente) return;
    try {
      const { data } = await apiClient.get('/auth/privacidad');
      setPrivacidad(data);
    } catch {
      setPrivacidad(null);
    }
  };

  useEffect(() => {
    cargarSesiones();
    cargarPrivacidad();
  }, []);

  // ── CU08: cierre remoto ────────────────────────────────────────────────────
  // Confirmación con el diálogo propio: el Alert nativo no sigue el diseño.
  const [sesionPorCerrar, setSesionPorCerrar] = useState(null);
  const confirmarCierre = (sesion) => setSesionPorCerrar(sesion);

  const quitarDeLaLista = (sesion) =>
    setSesiones((actuales) =>
      actuales.filter((s) => s.sesion_usuario_id !== sesion.sesion_usuario_id)
    );

  const cerrarSesion = async (sesion) => {
    setCerrandoId(sesion.sesion_usuario_id);
    try {
      await apiClient.post(`/auth/sesiones/${sesion.sesion_usuario_id}/cerrar`);
      if (sesion.actual) {
        logoutSession();
        return;
      }
      quitarDeLaLista(sesion);
      setAviso({
        tono: 'ok',
        titulo: 'Sesión revocada exitosamente',
        mensaje: `${sesion.dispositivo || 'El dispositivo'} perdió el acceso a tu cuenta.`,
      });
    } catch (err) {
      const respuesta = err.response?.data;
      if (respuesta?.error === 'SESION_NO_ACTIVA') {
        // CU08 — Excepción 3: se cerró en otro dispositivo o su token expiró
        // mientras se veía la lista. Se quita y se refresca el resto.
        quitarDeLaLista(sesion);
        setAviso({
          tono: 'alerta',
          titulo: 'La sesión seleccionada ya no está activa',
          mensaje: 'Ese dispositivo ya había cerrado su sesión o su acceso expiró. Actualizamos la lista.',
        });
      } else {
        setAviso({ tono: 'alerta', titulo: 'Aviso', mensaje: respuesta?.mensaje || 'No se pudo cerrar la sesión.' });
      }
      await cargarSesiones();
    } finally {
      setCerrandoId(null);
    }
  };

  // ── CU07: cambio de contraseña con OTP ─────────────────────────────────────
  const solicitarCodigoCambio = async () => {
    const { data } = await apiClient.post('/auth/cambio-contrasena/solicitar');
    setDestinoOTP(data?.destino || 'tu correo');
  };

  const iniciarCambio = async () => {
    setProcesandoCambio(true);
    try {
      await solicitarCodigoCambio();
      setCambioActivo(true);
    } catch {
      setAviso({ tono: 'error', titulo: 'Error', mensaje: 'No se pudo enviar el código. Intenta nuevamente.' });
    } finally {
      setProcesandoCambio(false);
    }
  };

  // ── CU09: privacidad ───────────────────────────────────────────────────────
  const cambiarPreferencia = async (campo, valor) => {
    const anterior = privacidad;
    const nueva = { ...privacidad, [campo]: valor };
    setPrivacidad(nueva);
    setGuardandoPrivacidad(true);
    try {
      await apiClient.put('/auth/privacidad', {
        mostrar_direccion: nueva.mostrar_direccion,
        mostrar_telefono: nueva.mostrar_telefono,
        nombre_en_resenas: nueva.nombre_en_resenas !== false,
      });
    } catch (err) {
      // CU09 — Excepción 4: si la escritura falla, se restaura lo anterior.
      setPrivacidad(anterior);
      setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: err.response?.data?.mensaje || 'Los cambios no se aplicaron. Intenta nuevamente.' });
    } finally {
      setGuardandoPrivacidad(false);
    }
  };

  const formatearFecha = (valor) => formatearFechaHora(valor, '—');

  // Cada bloque por separado: en "Mi perfil" del paciente cambia el orden.
  // ── CU08: Sesiones activas ──
  const bloqueSesiones = (
    <>
      <Text style={estilos.seccion}>Sesiones activas</Text>
      <Text style={estilos.ayudaSeccion}>
        Estos dispositivos tienen acceso a tu cuenta. Puedes cerrarlos de forma remota.
      </Text>

      {cargandoSesiones ? (
        <ActivityIndicator size="large" color={colores.primario} style={estilos.cargando} />
      ) : errorSesiones ? (
        // CU08 — Excepción 2: advertencia con actualización manual.
        <View style={estilos.avisoAdvertencia}>
          <Text style={estilos.avisoAdvertenciaTitulo}>
            ⚠️ Información de dispositivos no disponible momentáneamente
          </Text>
          <Text style={estilos.avisoAdvertenciaTexto}>
            No pudimos obtener tus sesiones activas. Presiona "Actualizar" para intentarlo de nuevo.
          </Text>
          <TouchableOpacity style={estilos.botonActualizar} onPress={cargarSesiones}>
            <Text style={estilos.botonActualizarTexto}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        sesiones.map((sesion) => (
          <View key={sesion.sesion_usuario_id} style={estilos.tarjetaSesion}>
            <View style={estilos.sesionInfo}>
              <Text style={estilos.sesionDispositivo}>
                {sesion.dispositivo || 'Dispositivo desconocido'}
                {sesion.actual ? '  · este dispositivo' : ''}
              </Text>
              <Text style={estilos.sesionDetalle}>
                Desde {formatearFecha(sesion.momento_inicio)}
                {sesion.ip_origen ? `  ·  IP ${sesion.ip_origen}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={estilos.botonCerrarSesion}
              onPress={() => confirmarCierre(sesion)}
              disabled={cerrandoId === sesion.sesion_usuario_id}
            >
              <Text style={estilos.botonCerrarTexto}>
                {cerrandoId === sesion.sesion_usuario_id ? '…' : 'Revocar Acceso'}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </>
  );

  // ── CU07: Cambio de contraseña ──
  const bloqueContrasena = (
    <>
      <Text style={estilos.seccion}>Contraseña</Text>

      {!cambioActivo ? (
        <TouchableOpacity
          style={[estilos.botonPrimario, procesandoCambio && estilos.deshabilitado]}
          onPress={iniciarCambio}
          disabled={procesandoCambio}
        >
          {procesandoCambio ? (
            <ActivityIndicator color={colores.superficie} />
          ) : (
            <Text style={estilos.botonPrimarioTexto}>Cambiar contraseña</Text>
          )}
        </TouchableOpacity>
      ) : (
        <View style={estilos.tarjetaCambio}>
          <CambioContrasenaOTP
            destino={destinoOTP}
            verificarCodigo={(codigo) =>
              apiClient.post('/auth/cambio-contrasena/verificar', { codigo })
            }
            confirmarContrasena={async (codigo, nuevaContrasena) => {
              const { data } = await apiClient.post('/auth/cambio-contrasena/confirmar', {
                codigo,
                nueva_contrasena: nuevaContrasena,
              });
              return data;
            }}
            reenviarCodigo={solicitarCodigoCambio}
            onExito={(data) =>
              setAviso({
                tono: 'ok',
                titulo: 'Contraseña actualizada',
                mensaje: data?.mensaje || 'Vuelve a iniciar sesión.',
                alCerrar: logoutSession,
              })
            }
          />
          <TouchableOpacity onPress={() => setCambioActivo(false)}>
            <Text style={estilos.enlace}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  // ── CU09: Privacidad (solo pacientes) ──
  const bloquePrivacidad = (
    <>
      {esPaciente && (
        <>
          <Text style={estilos.seccion}>Privacidad de mis datos</Text>
          <Text style={estilos.ayudaSeccion}>
            Define qué datos de contacto puede ver el profesional que te atiende. Tu contacto
            de emergencia siempre queda visible por seguridad.
          </Text>

          {privacidad === null ? (
            <ActivityIndicator size="small" color={colores.primario} style={estilos.cargando} />
          ) : (
            <View style={estilos.tarjetaPrivacidad}>
              <View style={estilos.filaPreferencia}>
                <Text style={estilos.preferenciaTexto}>Mostrar mi dirección</Text>
                <Switch
                  value={privacidad.mostrar_direccion}
                  onValueChange={(v) => cambiarPreferencia('mostrar_direccion', v)}
                  disabled={guardandoPrivacidad}
                  trackColor={{ false: colores.borde, true: colores.azul[300] }}
                  thumbColor={privacidad.mostrar_direccion ? colores.primario : colores.superficie}
                  ios_backgroundColor={colores.borde}
                />
              </View>
              <View style={estilos.filaPreferencia}>
                <Text style={estilos.preferenciaTexto}>Mostrar mi teléfono</Text>
                <Switch
                  value={privacidad.mostrar_telefono}
                  onValueChange={(v) => cambiarPreferencia('mostrar_telefono', v)}
                  disabled={guardandoPrivacidad}
                  trackColor={{ false: colores.borde, true: colores.azul[300] }}
                  thumbColor={privacidad.mostrar_telefono ? colores.primario : colores.superficie}
                  ios_backgroundColor={colores.borde}
                />
              </View>
              {/* CU58: nombre bajo las calificaciones escritas, o anónimo. */}
              <View style={estilos.filaPreferencia}>
                <View style={estilos.preferenciaTextos}>
                  <Text style={estilos.preferenciaTexto}>Mostrar mi nombre en mis calificaciones</Text>
                  <Text style={estilos.preferenciaAyuda}>
                    {privacidad.nombre_en_resenas !== false
                      ? 'Tus comentarios publicados muestran tu nombre y la inicial de tu apellido.'
                      : 'Tus comentarios publicados aparecen como “Anónimo”.'}
                  </Text>
                </View>
                <Switch
                  value={privacidad.nombre_en_resenas !== false}
                  onValueChange={(v) => cambiarPreferencia('nombre_en_resenas', v)}
                  disabled={guardandoPrivacidad}
                  trackColor={{ false: colores.borde, true: colores.azul[300] }}
                  thumbColor={privacidad.nombre_en_resenas !== false ? colores.primario : colores.superficie}
                  ios_backgroundColor={colores.borde}
                />
              </View>
            </View>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      {contrasenaPrimero ? (
        <>
          {bloqueContrasena}
          {bloqueSesiones}
        </>
      ) : (
        <>
          {bloqueSesiones}
          {bloqueContrasena}
        </>
      )}
      {bloquePrivacidad}
      <DialogoConfirmacion
        visible={sesionPorCerrar !== null}
        titulo={sesionPorCerrar?.actual ? 'Cerrar esta sesión' : 'Revocar acceso remoto'}
        mensaje={
          sesionPorCerrar?.actual
            ? 'Es la sesión de este dispositivo: tendrás que iniciar sesión de nuevo.'
            : `${sesionPorCerrar?.dispositivo || 'Ese dispositivo'} perderá el acceso de inmediato.`
        }
        etiquetaConfirmar={sesionPorCerrar?.actual ? 'Cerrar sesión' : 'Revocar Acceso'}
        tono="peligro"
        onConfirmar={() => {
          const sesion = sesionPorCerrar;
          setSesionPorCerrar(null);
          cerrarSesion(sesion);
        }}
        onCancelar={() => setSesionPorCerrar(null)}
      />
      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => {
          const seguir = aviso?.alCerrar;
          setAviso(null);
          if (seguir) seguir();
        }}
      />
    </>
  );
}

// Franja de color de lado a lado que abre cada sección de "Mi perfil", para
// distinguirlas de un vistazo.
function FranjaSeccion({ icono, titulo, alInicio = false }) {
  return (
    <View style={[estilos.franja, alInicio && estilos.franjaAlInicio]} accessibilityRole="header">
      <Ionicons name={icono} size={16} color={colores.primario} />
      <Text style={estilos.franjaTexto}>{titulo}</Text>
    </View>
  );
}

// Pie de "Mi perfil" (paciente y profesional), de arriba hacia abajo: la
// seguridad de la cuenta (contraseña y, justo debajo, sesiones activas), Ayuda
// y soporte y, al final de todo, Cerrar sesión.
// alInicio: el pie es lo primero de la pantalla (paciente), así que la primera
// franja va pegada a la cabecera.
export function PieDePerfil({ navigation, tituloSeguridad, alInicio = false }) {
  const { confirmarCierreSesion } = useContext(AuthContext);
  return (
    <>
      <FranjaSeccion icono="shield-checkmark-outline" titulo={tituloSeguridad} alInicio={alInicio} />
      <SeccionesSeguridad contrasenaPrimero />

      <FranjaSeccion icono="help-buoy-outline" titulo="Ayuda y soporte" />
      {/* CU60: el mismo acceso a soporte que tenía el menú de inicio. */}
      <TouchableOpacity
        style={estilos.filaMenu}
        onPress={() => navigation.navigate('Soporte')}
        activeOpacity={interaccion.opacidadActiva}
        accessibilityRole="button"
      >
        <View style={estilos.menuIconoCaja}>
          <Text style={estilos.menuIcono}>🎫</Text>
        </View>
        <View style={estilos.menuTextos}>
          <Text style={estilos.menuTitulo}>Ayuda y soporte</Text>
          <Text style={estilos.menuAyuda}>
            Reporta un problema y sigue el estado de tus solicitudes.
          </Text>
        </View>
        <Text style={estilos.menuChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={estilos.botonSalir}
        onPress={confirmarCierreSesion}
        activeOpacity={interaccion.opacidadActiva}
        accessibilityRole="button"
      >
        <Text style={estilos.botonSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </>
  );
}

// comoPerfil: la pestaña "Mi perfil" del paciente (seguridad y privacidad
// primero; la información personal irá arriba cuando exista).
export default function SeguridadScreen({ navigation, comoPerfil = false }) {
  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      {comoPerfil ? (
        <PieDePerfil navigation={navigation} tituloSeguridad="Seguridad y privacidad" alInicio />
      ) : (
        <SeccionesSeguridad />
      )}
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: 40 },
  seccion: { fontSize: 17, fontWeight: 'bold', color: colores.primario, marginTop: 18, marginBottom: 6 },
  ayudaSeccion: { color: colores.textoSuave, fontSize: 13, marginBottom: 12 },
  cargando: { marginVertical: 12 },

  avisoAdvertencia: {
    backgroundColor: colores.advertenciaSuave,
    borderWidth: 1,
    borderColor: colores.advertenciaBorde,
    borderRadius: radio.md,
    padding: 14,
  },
  avisoAdvertenciaTitulo: { color: colores.advertencia, fontWeight: 'bold', marginBottom: 4 },
  avisoAdvertenciaTexto: { color: colores.textoSuave, fontSize: 13, marginBottom: 12 },
  botonActualizar: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colores.advertencia,
    borderRadius: radio.sm,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  botonActualizarTexto: { color: colores.advertencia, fontWeight: 'bold' },

  tarjetaSesion: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 14,
    marginBottom: 10,
  },
  sesionInfo: { flex: 1 },
  sesionDispositivo: { fontWeight: 'bold', color: colores.texto },
  sesionDetalle: { color: colores.textoSuave, fontSize: 13, marginTop: 3 },
  botonCerrarSesion: {
    borderWidth: 1,
    borderColor: colores.error,
    borderRadius: radio.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginLeft: 10,
  },
  botonCerrarTexto: { color: colores.error, fontWeight: 'bold', fontSize: 13 },

  tarjetaCambio: { backgroundColor: colores.superficie, borderRadius: radio.md, borderWidth: 1, borderColor: colores.borde, padding: 16 },

  botonPrimario: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    padding: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  botonPrimarioTexto: { color: colores.superficie, fontWeight: 'bold' },
  deshabilitado: { opacity: 0.6 },
  enlace: { color: colores.primario, textAlign: 'center', marginTop: 12, fontWeight: '600' },

  tarjetaPrivacidad: { backgroundColor: colores.superficie, borderRadius: radio.md, borderWidth: 1, borderColor: colores.borde, padding: 6 },
  filaPreferencia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  preferenciaTexto: { color: colores.texto, fontSize: 15 },
  preferenciaTextos: { flex: 1, paddingRight: espacio.md },
  preferenciaAyuda: { ...tipografia.micro, color: colores.textoTenue, marginTop: 2, letterSpacing: 0 },

  // ── Mi perfil (paciente) ──
  // La franja cruza todo el ancho: anula el margen lateral del contenido
  // (espacio.lg, igual aquí y en el perfil del profesional).
  franja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    marginHorizontal: -espacio.lg,
    marginTop: espacio.xxl,
    marginBottom: espacio.sm,
    paddingHorizontal: espacio.lg,
    paddingVertical: espacio.md,
    backgroundColor: colores.primarioSuave,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colores.primarioBorde,
  },
  franjaAlInicio: { marginTop: -espacio.lg, borderTopWidth: 0 },
  franjaTexto: {
    ...tipografia.micro,
    color: colores.primario,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  filaMenu: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', marginTop: espacio.sm },
  menuIconoCaja: {
    width: 46,
    height: 46,
    borderRadius: radio.md,
    backgroundColor: colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espacio.base,
  },
  menuIcono: { fontSize: 22 },
  menuTextos: { flex: 1 },
  menuTitulo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginBottom: 2 },
  menuAyuda: { ...tipografia.meta, color: colores.textoSuave },
  menuChevron: { fontSize: 28, color: colores.textoDeshabilitado, marginLeft: espacio.sm },
  // Cerrar sesión: destructivo pero secundario, contorno y no bloque rojo.
  botonSalir: {
    marginTop: espacio.xxl,
    paddingVertical: espacio.md,
    borderRadius: radio.md,
    borderWidth: 1.5,
    borderColor: colores.error,
    alignItems: 'center',
  },
  botonSalirTexto: { ...tipografia.cuerpoFuerte, color: colores.error },
});
