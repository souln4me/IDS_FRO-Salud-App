// Ruta: fro-vista/src/screens/Profesional/FirmaConformidadScreen.js
//
// CU42: el paciente firma su conformidad en el teléfono del profesional.
// Alternativas contempladas: rechazo justificado (Exc.3) y validación por
// correo cuando no hay pantalla táctil disponible (Exc.1).

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';

import apiClient from '../../api/client';
import DialogoMotivo from '../../components/DialogoMotivo';
import DialogoAviso from '../../components/DialogoAviso';
import ErrorRetry from '../../components/ErrorRetry';
import LienzoFirma from '../../components/LienzoFirma';
import VistaConTeclado from '../../components/VistaConTeclado';
import { colores, radio } from '../../theme';

export default function FirmaConformidadScreen({ route, navigation }) {
  const { citaId, nombrePaciente } = route?.params || {};

  const [declaracion, setDeclaracion] = useState(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [trazos, setTrazos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [pedirRechazo, setPedirRechazo] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Excepción 2: sin declaración legal renderizada, el lienzo queda bloqueado.
  const cargarDeclaracion = async () => {
    setErrorCarga(false);
    try {
      const { data } = await apiClient.get(`/citas/${citaId}/declaracion-conformidad`);
      setDeclaracion(data);
    } catch {
      setErrorCarga(true);
    }
  };

  useEffect(() => {
    cargarDeclaracion();
  }, []);

  const enviar = async (cuerpo, exitoTitulo) => {
    setGuardando(true);
    try {
      const { data } = await apiClient.post(`/citas/${citaId}/firma`, cuerpo);
      setAviso({ tono: 'ok', titulo: exitoTitulo, mensaje: data?.mensaje || 'Registrado.', alSalir: true });
    } catch (err) {
      const respuesta = err.response?.data;
      setAviso({ tono: 'error', titulo: 'No se pudo registrar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  };

  const guardarFirma = () => {
    // Excepción 4: un trazo vacío no constituye firma.
    if (!trazos.some((t) => t.length >= 2)) {
      setAviso({ tono: 'error', titulo: 'Lienzo vacío', mensaje: 'Pide al paciente dibujar su firma antes de guardar.' });
      return;
    }
    enviar({ trazos }, 'Firma registrada');
  };

  const enviarPorCorreo = () => {
    // Excepción 1: sin interfaz táctil operativa, conformidad por correo.
    Alert.alert(
      'Conformidad por correo',
      'Se enviará la declaración al correo del paciente para que la valide desde su casilla. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar correo', onPress: () => enviar({ por_correo: true }, 'Correo enviado') },
      ]
    );
  };

  if (errorCarga) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry
          mensaje="No se pudo cargar la declaración legal. Sin ella el lienzo queda bloqueado."
          onRetry={cargarDeclaracion}
        />
      </View>
    );
  }

  if (!declaracion) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>Conformidad del paciente</Text>
      {nombrePaciente ? <Text style={estilos.subtitulo}>{nombrePaciente}</Text> : null}

      <View style={estilos.tarjetaLegal}>
        <Text style={estilos.textoLegal}>{declaracion.texto}</Text>
        <Text style={estilos.versionLegal}>Declaración v{declaracion.version}</Text>
      </View>

      <Text style={estilos.instruccion}>
        Entrega el teléfono al paciente para que dibuje su firma:
      </Text>

      <LienzoFirma onCambio={setTrazos} />

      <TouchableOpacity
        style={[estilos.botonPrimario, guardando && estilos.deshabilitado]}
        onPress={guardarFirma}
        disabled={guardando}
      >
        {guardando ? (
          <ActivityIndicator color={colores.superficie} />
        ) : (
          <Text style={estilos.botonPrimarioTexto}>Guardar firma de conformidad</Text>
        )}
      </TouchableOpacity>

      <View style={estilos.filaAlternativas}>
        <TouchableOpacity onPress={() => setPedirRechazo(true)} disabled={guardando}>
          <Text style={estilos.enlaceRechazo}>El paciente rechaza firmar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={enviarPorCorreo} disabled={guardando}>
          <Text style={estilos.enlaceCorreo}>Validar por correo</Text>
        </TouchableOpacity>
      </View>

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => {
          const salir = aviso?.alSalir;
          setAviso(null);
          if (salir) navigation.goBack();
        }}
      />

      {/* Excepción 3: rechazo con justificación obligatoria */}
      <DialogoMotivo
        visible={pedirRechazo}
        titulo="Rechazo de firma"
        descripcion="Registra la justificación del rechazo (queda en la sesión):"
        etiquetaConfirmar="Registrar rechazo"
        onConfirmar={(motivo) => {
          setPedirRechazo(false);
          enviar({ rechazo: motivo }, 'Rechazo registrado');
        }}
        onCancelar={() => setPedirRechazo(false)}
      />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 40 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  titulo: { fontSize: 22, fontWeight: 'bold', color: colores.primario },
  subtitulo: { color: colores.textoSuave, marginBottom: 10 },
  tarjetaLegal: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 16,
    marginVertical: 12,
  },
  textoLegal: { color: colores.texto, lineHeight: 20 },
  versionLegal: { color: colores.textoTenue, fontSize: 11, marginTop: 8, textAlign: 'right' },
  instruccion: { color: colores.textoSuave, marginBottom: 10, fontWeight: '600' },

  botonPrimario: {
    backgroundColor: colores.exito,
    borderRadius: radio.md,
    padding: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  botonPrimarioTexto: { color: colores.superficie, fontWeight: 'bold', fontSize: 15 },
  deshabilitado: { opacity: 0.6 },
  filaAlternativas: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  enlaceRechazo: { color: colores.error, fontWeight: '600' },
  enlaceCorreo: { color: colores.primario, fontWeight: '600' },
});
