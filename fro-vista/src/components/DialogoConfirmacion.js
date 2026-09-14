// Ruta: fro-vista/src/components/DialogoConfirmacion.js
//
// Diálogo de confirmación con la identidad de la app. Reemplaza a Alert.alert
// en los avisos importantes: el diálogo nativo de Android no se puede
// estilizar, así que rompía el rediseño justo en los momentos de decisión
// (cerrar sesión, bloquear la agenda).
//
// Para avisos sin consecuencias (un "guardado con éxito") Alert.alert sigue
// siendo suficiente y más liviano.

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { colores, espacio, radio, sombra, tipografia, interaccion } from '../theme';

/**
 * @param {'peligro'|'normal'} tono  color de la acción principal
 */
export default function DialogoConfirmacion({
  visible,
  titulo,
  mensaje,
  etiquetaConfirmar = 'Confirmar',
  etiquetaCancelar = 'Cancelar',
  tono = 'normal',
  onConfirmar,
  onCancelar,
}) {
  const peligro = tono === 'peligro';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancelar}
      statusBarTranslucent
    >
      <View style={estilos.velo}>
        <View style={estilos.caja}>
          <Text style={estilos.titulo}>{titulo}</Text>
          {mensaje ? <Text style={estilos.mensaje}>{mensaje}</Text> : null}

          <View style={estilos.acciones}>
            <TouchableOpacity
              style={estilos.botonCancelar}
              onPress={onCancelar}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.textoCancelar}>{etiquetaCancelar}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[estilos.botonConfirmar, peligro && estilos.botonPeligro]}
              onPress={onConfirmar}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.textoConfirmar}>{etiquetaConfirmar}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  velo: {
    flex: 1,
    backgroundColor: colores.velo,
    justifyContent: 'center',
    padding: espacio.xl,
  },
  caja: {
    backgroundColor: colores.superficie,
    borderRadius: radio.xl,
    padding: espacio.xl,
    ...sombra.elevada,
  },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.sm },
  mensaje: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espacio.xl },

  acciones: { flexDirection: 'row', gap: espacio.md },
  botonCancelar: {
    flex: 1,
    paddingVertical: espacio.md,
    borderRadius: radio.md,
    borderWidth: 1.5,
    borderColor: colores.borde,
    alignItems: 'center',
  },
  textoCancelar: { ...tipografia.cuerpoFuerte, color: colores.textoSuave },
  botonConfirmar: {
    flex: 1,
    paddingVertical: espacio.md,
    borderRadius: radio.md,
    backgroundColor: colores.primario,
    alignItems: 'center',
  },
  botonPeligro: { backgroundColor: colores.error },
  textoConfirmar: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
});
