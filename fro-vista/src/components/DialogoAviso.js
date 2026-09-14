// Ruta: fro-vista/src/components/DialogoAviso.js
//
// Aviso con la identidad de la app: un solo botón para cerrar, y opción de
// mostrar una lista de detalle. Reemplaza a Alert.alert en los avisos que el
// usuario lee con atención (resultado de una atención, una firma, la
// trazabilidad de una cita), donde el diálogo nativo de Android rompía el
// diseño y, en el caso de la trazabilidad, amontonaba todo en un solo párrafo.

import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

import { colores, espacio, radio, sombra, tipografia, interaccion } from '../theme';

const TONOS = {
  ok:     { icono: '✅', color: colores.exito },
  error:  { icono: '⚠️', color: colores.error },
  alerta: { icono: '⏳', color: colores.advertencia },
  info:   { icono: 'ℹ️', color: colores.primario },
};

/**
 * @param {Array<{titulo, detalle?, nota?}>} lista  detalle opcional en filas
 */
export default function DialogoAviso({
  visible,
  titulo,
  mensaje,
  lista,
  tono = 'info',
  etiquetaCerrar = 'Entendido',
  onCerrar,
  onSeleccionarFila,   // si se pasa, cada fila se puede tocar
}) {
  const { icono, color } = TONOS[tono] || TONOS.info;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCerrar}
      statusBarTranslucent
    >
      <View style={estilos.velo}>
        <View style={estilos.caja}>
          <View style={[estilos.marca, { backgroundColor: color }]} />

          <View style={estilos.cuerpo}>
            <Text style={estilos.icono}>{icono}</Text>
            <Text style={estilos.titulo}>{titulo}</Text>
            {mensaje ? <Text style={estilos.mensaje}>{mensaje}</Text> : null}

            {Array.isArray(lista) && lista.length > 0 && (
              <ScrollView style={estilos.lista} contentContainerStyle={estilos.listaContenido}>
                {lista.map((fila, i) => {
                  const Contenedor = onSeleccionarFila ? TouchableOpacity : View;
                  return (
                    <Contenedor
                      key={i}
                      style={[estilos.fila, onSeleccionarFila && estilos.filaTocable]}
                      onPress={onSeleccionarFila ? () => onSeleccionarFila(fila) : undefined}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <View style={[estilos.punto, { backgroundColor: color }]} />
                      <View style={estilos.filaTexto}>
                        <Text style={estilos.filaTitulo}>{fila.titulo}</Text>
                        {fila.detalle ? <Text style={estilos.filaDetalle}>{fila.detalle}</Text> : null}
                        {fila.nota ? <Text style={estilos.filaNota}>{fila.nota}</Text> : null}
                      </View>
                      {onSeleccionarFila && <Text style={estilos.filaChevron}>›</Text>}
                    </Contenedor>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[estilos.boton, { backgroundColor: color }]}
              onPress={onCerrar}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.botonTexto}>{etiquetaCerrar}</Text>
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
    overflow: 'hidden',
    maxHeight: '80%',
    ...sombra.elevada,
  },
  // Franja superior con el color del tono: identifica el aviso de un vistazo.
  marca: { height: 5 },
  cuerpo: { padding: espacio.xl },

  icono: { fontSize: 28, marginBottom: espacio.sm },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.sm },
  mensaje: { ...tipografia.cuerpo, color: colores.textoSuave },

  lista: { marginTop: espacio.base, maxHeight: 320 },
  listaContenido: { paddingRight: espacio.xs },
  fila: { flexDirection: 'row', gap: espacio.md, marginBottom: espacio.base, alignItems: 'center' },
  filaTocable: {
    backgroundColor: colores.superficieSuave,
    borderRadius: radio.md,
    padding: espacio.md,
    marginBottom: espacio.sm,
  },
  filaChevron: { fontSize: 22, color: colores.textoDeshabilitado },
  punto: { width: 8, height: 8, borderRadius: radio.completo, marginTop: 7 },
  filaTexto: { flex: 1 },
  filaTitulo: { ...tipografia.metaFuerte, color: colores.textoTitulo },
  filaDetalle: { ...tipografia.meta, color: colores.textoSuave, marginTop: 1 },
  filaNota: { ...tipografia.meta, color: colores.textoTenue, fontStyle: 'italic', marginTop: 2 },

  boton: {
    marginTop: espacio.xl,
    paddingVertical: espacio.md,
    borderRadius: radio.md,
    alignItems: 'center',
  },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
});
