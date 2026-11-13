/**
 * Componente: Cliente Móvil
 * Casos de uso: apoyo común, usado por CU38.
 */
// Ruta: fro-vista/src/components/SelectorFechaRapido.js
//
// Calendario desplegable para saltar de una vez a una fecha, sin recorrer la
// agenda semana por semana con las flechas.
//
// En Android se abre el diálogo de calendario propio del teléfono (el mismo
// que usa el resto de la app). En iPhone ese diálogo no existe: se muestra el
// calendario dentro de una ventana con "Cancelar" e "Ir a esta fecha", porque
// ahí la fecha cambia apenas se toca y no hay un momento claro de confirmar.

import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { colores, espacio, radio, sombra, tipografia, piezas, interaccion } from '../theme';

// Lunes como primer día de la semana, igual que la agenda.
const LUNES = 1;

/**
 * @param {boolean}  visible   abre el calendario cuando pasa a true
 * @param {Date}     fecha     fecha con la que se abre
 * @param {function} onElegir  recibe el Date elegido
 * @param {function} onCerrar  se llama siempre al cerrarse (con o sin elección)
 */
export default function SelectorFechaRapido({ visible, fecha, onElegir, onCerrar }) {
  // En Android el diálogo se abre con una llamada, no se dibuja. Las
  // funciones se guardan en una referencia para abrirlo una sola vez por
  // cada apertura, aunque la pantalla se vuelva a dibujar mientras tanto.
  const avisos = useRef({ onElegir, onCerrar });
  avisos.current = { onElegir, onCerrar };

  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    DateTimePickerAndroid.open({
      value: fecha || new Date(),
      mode: 'date',
      firstDayOfWeek: LUNES,
      positiveButton: { label: 'Ir a esta fecha', textColor: colores.primario },
      negativeButton: { label: 'Cancelar', textColor: colores.textoSuave },
      onValueChange: (evento, elegida) => {
        avisos.current.onCerrar?.();
        if (elegida) avisos.current.onElegir?.(elegida);
      },
      onDismiss: () => avisos.current.onCerrar?.(),
      onError: () => avisos.current.onCerrar?.(),
    });
    // Solo se reacciona a la apertura; la fecha se toma en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === 'android') return null;
  return <VentanaCalendario visible={visible} fecha={fecha} onElegir={onElegir} onCerrar={onCerrar} />;
}

/** iPhone: calendario en una ventana, con confirmación explícita. */
function VentanaCalendario({ visible, fecha, onElegir, onCerrar }) {
  const [provisoria, setProvisoria] = useState(fecha || new Date());

  // Cada vez que se abre parte desde la fecha que se está mirando.
  useEffect(() => {
    if (visible) setProvisoria(fecha || new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const confirmar = () => {
    onCerrar?.();
    onElegir?.(provisoria);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar} statusBarTranslucent>
      <View style={estilos.velo}>
        <View style={estilos.caja}>
          <Text style={estilos.titulo}>Ir a una fecha</Text>

          <DateTimePicker
            value={provisoria}
            mode="date"
            display="inline"
            locale="es-CL"
            themeVariant="light"
            accentColor={colores.primario}
            textColor={colores.texto}
            onValueChange={(evento, elegida) => {
              if (elegida) setProvisoria(elegida);
            }}
          />

          <View style={estilos.botones}>
            <TouchableOpacity
              style={[piezas.botonSecundario, estilos.boton]}
              onPress={onCerrar}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.textoSecundario}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[piezas.botonPrimario, estilos.boton]}
              onPress={confirmar}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.textoPrimario}>Ir a esta fecha</Text>
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
    padding: espacio.lg,
  },
  caja: {
    backgroundColor: colores.superficie,
    borderRadius: radio.xl,
    padding: espacio.base,
    ...sombra.elevada,
  },
  titulo: {
    ...tipografia.subtitulo,
    color: colores.textoTitulo,
    textAlign: 'center',
    marginBottom: espacio.sm,
  },
  botones: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.sm },
  boton: { flex: 1, paddingHorizontal: espacio.sm },
  textoSecundario: { ...tipografia.cuerpoFuerte, color: colores.primario },
  textoPrimario: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
});
