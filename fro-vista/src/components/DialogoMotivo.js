// Ruta: fro-vista/src/components/DialogoMotivo.js
//
// Diálogo para pedir una justificación antes de una acción sobre la agenda
// (cancelar o reprogramar una cita). La trazabilidad exige motivo (CU22), y
// Alert.prompt solo existe en iOS, así que se usa un modal propio.

import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

import VistaConTeclado from './VistaConTeclado';
import { colores, radio } from '../theme';

export default function DialogoMotivo({
  visible,
  titulo,
  descripcion,
  etiquetaConfirmar = 'Confirmar',
  colorConfirmar = colores.error,
  onConfirmar,
  onCancelar,
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(false);

  const confirmar = () => {
    const texto = motivo.trim();
    if (!texto) {
      setError(true);
      return;
    }
    setMotivo('');
    setError(false);
    onConfirmar(texto);
  };

  const cancelar = () => {
    setMotivo('');
    setError(false);
    onCancelar();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancelar}>
      <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.centrado}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>{titulo}</Text>
          {descripcion ? <Text style={estilos.descripcion}>{descripcion}</Text> : null}

          <TextInput
            style={[estilos.input, error && estilos.inputError]}
            value={motivo}
            onChangeText={(texto) => {
              setMotivo(texto);
              if (error) setError(false);
            }}
            placeholder="Escribe el motivo…"
            multiline
            textAlignVertical="top"
            maxLength={255}
          />
          {error && <Text style={estilos.textoError}>El motivo es obligatorio.</Text>}

          <View style={estilos.acciones}>
            <TouchableOpacity style={estilos.botonSecundario} onPress={cancelar}>
              <Text style={estilos.textoSecundario}>Volver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[estilos.botonPrimario, { backgroundColor: colorConfirmar }]}
              onPress={confirmar}
            >
              <Text style={estilos.textoPrimario}>{etiquetaConfirmar}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </VistaConTeclado>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  centrado: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: radio.lg, padding: 20 },
  titulo: { fontSize: 17, fontWeight: 'bold', color: colores.texto, marginBottom: 6 },
  descripcion: { color: colores.textoSuave, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.sm,
    padding: 12,
    minHeight: 80,
    backgroundColor: colores.superficieSuave,
  },
  inputError: { borderColor: colores.error },
  textoError: { color: colores.error, marginTop: 6, fontSize: 13 },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 10 },
  botonSecundario: { paddingVertical: 12, paddingHorizontal: 16 },
  textoSecundario: { color: colores.textoSuave, fontWeight: 'bold' },
  botonPrimario: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radio.sm },
  textoPrimario: { color: colores.superficie, fontWeight: 'bold' },
});
