// Ruta: fro-vista/src/components/LienzoFirma.js
//
// Lienzo táctil para capturar la firma manuscrita (CU42). Registra los trazos
// como listas de puntos {x, y} y los dibuja con SVG; los mismos trazos se
// guardan en el servidor y permiten re-renderizar la firma después.
//
// Dos errores que tuvo esta pantalla y que explican cómo está escrita:
// 1. Al soltar el dedo se avisaba al padre (onCambio) DENTRO de la función de
//    actualización de estado. React ejecuta esas funciones mientras renderiza,
//    y actualizar otro componente ahí lanza "Cannot update a component while
//    rendering a different component" y descarta la actualización: el trazo
//    desaparecía. Ahora el aviso se hace fuera, con los trazos calculados
//    aparte (se guarda una copia en un ref porque el PanResponder se crea una
//    sola vez y no ve el estado actual).
// 2. El lienzo vive dentro de un ScrollView; al mover el dedo, el scroll pedía
//    quedarse con el gesto y el trazo se cortaba. Se le niega la cesión y, si
//    igual lo interrumpe, el trazo en curso se conserva.

import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, PanResponder, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { colores, radio } from '../theme';

const ALTO_LIENZO = 220;

const redondear = (p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

export default function LienzoFirma({ onCambio }) {
  const [trazos, setTrazos] = useState([]);
  const trazosRef = useRef([]);       // copia siempre vigente para el PanResponder
  const trazoActual = useRef([]);
  const [, forzarRender] = useState(0);

  const publicar = (lista) => {
    trazosRef.current = lista;
    setTrazos(lista);
    if (onCambio) onCambio(lista);   // fuera de cualquier actualizador de estado
  };

  const cerrarTrazo = () => {
    if (trazoActual.current.length >= 2) {
      publicar([...trazosRef.current, trazoActual.current.map(redondear)]);
    }
    trazoActual.current = [];
    forzarRender((n) => n + 1);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // El ScrollView de la pantalla no puede quitarnos el gesto a mitad de trazo.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evento) => {
        const { locationX, locationY } = evento.nativeEvent;
        trazoActual.current = [{ x: locationX, y: locationY }];
        forzarRender((n) => n + 1);
      },
      onPanResponderMove: (evento) => {
        const { locationX, locationY } = evento.nativeEvent;
        trazoActual.current.push({ x: locationX, y: locationY });
        forzarRender((n) => n + 1);
      },
      onPanResponderRelease: cerrarTrazo,
      // Si el sistema interrumpe el gesto igual, lo dibujado no se pierde.
      onPanResponderTerminate: cerrarTrazo,
    })
  ).current;

  const limpiar = () => {
    trazoActual.current = [];
    publicar([]);
  };

  const aPuntosSVG = (trazo) => trazo.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View>
      <View style={estilos.lienzo} {...panResponder.panHandlers}>
        <Svg width="100%" height={ALTO_LIENZO}>
          {trazos.map((trazo, i) => (
            <Polyline
              key={i}
              points={aPuntosSVG(trazo)}
              fill="none"
              stroke={colores.primario}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {trazoActual.current.length >= 2 && (
            <Polyline
              points={aPuntosSVG(trazoActual.current)}
              fill="none"
              stroke={colores.primario}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
        {trazos.length === 0 && trazoActual.current.length === 0 && (
          <Text style={estilos.marcaAgua} pointerEvents="none">
            Firma aquí
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={limpiar}>
        <Text style={estilos.limpiar}>Limpiar lienzo</Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  lienzo: {
    height: ALTO_LIENZO,
    backgroundColor: colores.superficie,
    borderWidth: 2,
    borderColor: colores.primario,
    borderRadius: radio.md,
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  marcaAgua: {
    position: 'absolute',
    alignSelf: 'center',
    color: colores.textoDeshabilitado,
    fontSize: 22,
    fontStyle: 'italic',
  },
  limpiar: { color: colores.error, fontWeight: '600', textAlign: 'right', marginTop: 8 },
});
