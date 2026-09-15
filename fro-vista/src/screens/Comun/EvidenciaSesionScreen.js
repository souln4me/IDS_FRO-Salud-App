// Ruta: fro-vista/src/screens/Comun/EvidenciaSesionScreen.js
//
// Evidencia de la sesión, común a paciente y profesional:
// - CU39 (domicilio): check-in GPS de inicio y término, con validación cruzada.
// - CU43 (online): evidencia técnica de teleconsulta (permisos de cámara y
//   micrófono, latencia medida, dispositivo, reconexiones).

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';

import apiClient from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import VistaConTeclado from '../../components/VistaConTeclado';
import { formatearHora } from '../../utils/fechas';
import { colores, radio } from '../../theme';
import DialogoAviso from '../../components/DialogoAviso';

const clavePendiente = (citaId) => `cu43_pendiente_${citaId}`;

export default function EvidenciaSesionScreen({ route }) {
  const { citaId, modalidad } = route?.params || {};

  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).

  const [aviso, setAviso] = useState(null);

  const [resumen, setResumen] = useState(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const cargar = async () => {
    setErrorCarga(false);
    try {
      const { data } = await apiClient.get(`/citas/${citaId}/evidencia`);
      setResumen(data);

      // CU43 — Excepción 4: reenviar evidencia que quedó respaldada localmente.
      const pendiente = await SecureStore.getItemAsync(clavePendiente(citaId));
      if (pendiente) {
        try {
          await apiClient.post(`/citas/${citaId}/evidencia-teleconsulta`, JSON.parse(pendiente));
          await SecureStore.deleteItemAsync(clavePendiente(citaId));
          setAviso({ tono: 'ok', titulo: 'Sincronizado', mensaje: 'Se envió la evidencia que estaba pendiente en este dispositivo.' });
        } catch {
          // sigue pendiente; se reintentará en la próxima visita
        }
      }
    } catch {
      setErrorCarga(true);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const modalidadEfectiva = resumen?.modalidad || modalidad || null;

  // ── CU39: check-in GPS ─────────────────────────────────────────────────────
  const checkinGPS = async (momento) => {
    setProcesando(true);
    try {
      // Excepción 1: GPS apagado o sin permiso impide iniciar.
      const servicios = await Location.hasServicesEnabledAsync();
      if (!servicios) {
        setAviso({ tono: 'info', titulo: 'Ubicación desactivada', mensaje: 'Activa los servicios de ubicación de tu teléfono para hacer el check-in.' });
        return;
      }
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        setAviso({ tono: 'error', titulo: 'Permiso denegado', mensaje: 'Sin acceso a tu ubicación no es posible validar la presencialidad.' });
        return;
      }

      const posicion = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { data } = await apiClient.post(`/citas/${citaId}/checkin-gps`, {
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
        momento,
      });

      setAviso({ tono: 'ok', titulo: 'Check-in registrado', mensaje: data?.mensaje || 'Marca guardada.' });
      await cargar();
    } catch (err) {
      const respuesta = err.response?.data;
      setAviso({ tono: 'ok', titulo: 'Check-in no registrado', mensaje: respuesta?.mensaje || respuesta?.error || 'Revisa tu conexión e intenta nuevamente.' });
    } finally {
      setProcesando(false);
    }
  };

  // ── CU43: evidencia de teleconsulta ────────────────────────────────────────
  const medirLatencia = async () => {
    const mediciones = [];
    for (let i = 0; i < 3; i++) {
      const inicio = Date.now();
      try {
        await apiClient.get('/health');
        mediciones.push(Date.now() - inicio);
      } catch {
        // medición perdida: se ignora
      }
    }
    if (mediciones.length === 0) return null;
    return Math.round(mediciones.reduce((a, b) => a + b, 0) / mediciones.length);
  };

  const registrarTeleconsulta = async (evento) => {
    setProcesando(true);
    try {
      // Excepción 1: sin permisos de cámara y micrófono no hay conexión de video.
      const camara = await Camera.requestCameraPermissionsAsync();
      const microfono = await Camera.requestMicrophonePermissionsAsync();

      if (camara.status !== 'granted' || microfono.status !== 'granted') {
        setAviso({ tono: 'info', titulo: 'Permisos bloqueados', mensaje: 'La teleconsulta requiere cámara y micrófono. Otorga los permisos en la configuración de tu teléfono e intenta de nuevo.' });
        return;
      }

      const cuerpo = {
        evento,
        latencia_ms: await medirLatencia(),
        dispositivo: Platform.OS === 'ios' ? 'iPhone (app móvil)' : 'Android (app móvil)',
        permisos: { camara: camara.status, microfono: microfono.status },
      };

      try {
        const { data } = await apiClient.post(`/citas/${citaId}/evidencia-teleconsulta`, cuerpo);
        setAviso({ tono: 'ok', titulo: 'Evidencia registrada', mensaje: data?.mensaje || 'Metadatos guardados.' });
        await cargar();
      } catch (err) {
        // Excepción 4: falla de escritura → respaldo local para sincronizar.
        await SecureStore.setItemAsync(clavePendiente(citaId), JSON.stringify(cuerpo));
        setAviso({ tono: 'alerta', titulo: 'Respaldo local', mensaje: 'No se pudo guardar en el servidor. La evidencia quedó respaldada en este dispositivo y se sincronizará automáticamente.' });
      }
    } finally {
      setProcesando(false);
    }
  };

  if (errorCarga) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No se pudo cargar la evidencia de la sesión." onRetry={cargar} />
      </View>
    );
  }

  if (!resumen) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  const gps = resumen.evidencia_presencial || {};
  const tele = resumen.metadatos_teleconsulta || {};
  const segmentos = tele.segmentos || [];

  const marcaTexto = (marca) =>
    marca
      ? `✅ ${formatearHora(marca.momento_registro)} (${marca.lat.toFixed(4)}, ${marca.lng.toFixed(4)})`
      : '— pendiente';

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>Evidencia de la sesión</Text>
      <Text style={estilos.subtitulo}>
        Cita #{resumen.cita_id} · {resumen.estado} ·{' '}
        {modalidadEfectiva === 'ONLINE'
          ? 'Teleconsulta'
          : modalidadEfectiva === 'DOMICILIO'
            ? 'Domiciliaria'
            : 'Modalidad no registrada'}
      </Text>

      {/* ── CU39: GPS (domicilio o modalidad no registrada) ── */}
      {modalidadEfectiva !== 'ONLINE' && (
        <View style={estilos.tarjeta}>
          <Text style={estilos.seccion}>📍 Presencialidad por GPS</Text>
          <Text style={estilos.detalle}>Paciente — inicio: {marcaTexto(gps.paciente?.inicio)}</Text>
          <Text style={estilos.detalle}>Paciente — término: {marcaTexto(gps.paciente?.termino)}</Text>
          <Text style={estilos.detalle}>Profesional — inicio: {marcaTexto(gps.profesional?.inicio)}</Text>
          <Text style={estilos.detalle}>Profesional — término: {marcaTexto(gps.profesional?.termino)}</Text>

          <View style={estilos.filaBotones}>
            <TouchableOpacity
              style={[estilos.boton, procesando && estilos.deshabilitado]}
              onPress={() => checkinGPS('INICIO')}
              disabled={procesando}
            >
              <Text style={estilos.botonTexto}>Check-in inicio</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[estilos.boton, estilos.botonSecundario, procesando && estilos.deshabilitado]}
              onPress={() => checkinGPS('TERMINO')}
              disabled={procesando}
            >
              <Text style={estilos.botonSecundarioTexto}>Check-in término</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── CU43: teleconsulta (online o modalidad no registrada) ── */}
      {modalidadEfectiva !== 'DOMICILIO' && (
        <View style={estilos.tarjeta}>
          <Text style={estilos.seccion}>📹 Evidencia de teleconsulta</Text>
          {segmentos.length === 0 ? (
            <Text style={estilos.detalle}>Aún no hay registros de conexión.</Text>
          ) : (
            segmentos.map((segmento, i) => (
              <Text key={i} style={estilos.detalle}>
                {segmento.evento} · {segmento.rol} ·{' '}
                {formatearHora(segmento.momento)}
                {segmento.latencia_ms ? ` · ${segmento.latencia_ms} ms` : ''}
              </Text>
            ))
          )}

          <View style={estilos.filaBotones}>
            <TouchableOpacity
              style={[estilos.boton, procesando && estilos.deshabilitado]}
              onPress={() => registrarTeleconsulta(segmentos.length === 0 ? 'INICIO' : 'RECONEXION')}
              disabled={procesando}
            >
              <Text style={estilos.botonTexto}>
                {segmentos.length === 0 ? 'Iniciar conexión' : 'Registrar reconexión'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[estilos.boton, estilos.botonSecundario, procesando && estilos.deshabilitado]}
              onPress={() => registrarTeleconsulta('TERMINO')}
              disabled={procesando}
            >
              <Text style={estilos.botonSecundarioTexto}>Registrar término</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {procesando && <ActivityIndicator size="small" color={colores.primario} style={{ marginTop: 8 }} />}

      <Text style={estilos.nota}>
        Estas marcas certifican la ejecución de la prestación y quedan en la
        bitácora de la sesión.
      </Text>
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
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 40 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  titulo: { fontSize: 22, fontWeight: 'bold', color: colores.primario },
  subtitulo: { color: colores.textoSuave, marginBottom: 12 },

  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 14,
    marginBottom: 14,
  },
  seccion: { fontWeight: 'bold', color: colores.texto, fontSize: 15, marginBottom: 8 },
  detalle: { color: colores.textoSuave, fontSize: 13, marginBottom: 4 },

  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 10 },
  boton: {
    flex: 1,
    backgroundColor: colores.primario,
    borderRadius: radio.sm,
    padding: 12,
    alignItems: 'center',
  },
  botonTexto: { color: colores.superficie, fontWeight: 'bold', fontSize: 13 },
  botonSecundario: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colores.primario },
  botonSecundarioTexto: { color: colores.primario, fontWeight: 'bold', fontSize: 13 },
  deshabilitado: { opacity: 0.6 },

  nota: { color: colores.textoTenue, fontSize: 13, textAlign: 'center', marginTop: 10 },
});
