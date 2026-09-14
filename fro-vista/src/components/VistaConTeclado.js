// Ruta: fro-vista/src/components/VistaConTeclado.js
//
// Contenedor con scroll que evita que el teclado tape los campos de texto.
//
// ¿Por qué no usar KeyboardAvoidingView? Desde que Android dibuja las apps
// "de borde a borde" (comportamiento por defecto en las versiones nuevas de
// Expo), el sistema ya no encoge la ventana al abrir el teclado, así que
// KeyboardAvoidingView se queda sin nada que ajustar y el teclado termina
// encima de los campos.
//
// Este componente no depende de ese comportamiento: escucha al teclado, deja
// espacio libre equivalente a su altura y desplaza la vista hasta el campo
// que se está escribiendo. Funciona igual en Android y iOS, y no necesita
// librerías adicionales ni configuración nativa (sirve en Expo Go).

import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, ScrollView, TextInput } from 'react-native';

// Aire que se deja entre el campo enfocado y el borde superior del teclado.
const MARGEN_VISIBLE = 16;

export default function VistaConTeclado({
  children,
  style,
  contentContainerStyle,
  espacioExtra = 24,
  ...props
}) {
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  const referenciaScroll = useRef(null);
  const desplazamientoActual = useRef(0);

  useEffect(() => {
    // Se usa "Did" (y no "Will") en ambas plataformas a propósito: hasta que
    // el teclado no terminó de aparecer, medir la posición del campo devuelve
    // valores previos al ajuste y el desplazamiento queda mal calculado.
    const alMostrar = Keyboard.addListener('keyboardDidShow', (evento) => {
      const altura = evento?.endCoordinates?.height ?? 0;
      setAlturaTeclado(altura);
      mostrarCampoActivo(altura);
    });

    const alOcultar = Keyboard.addListener('keyboardDidHide', () => setAlturaTeclado(0));

    return () => {
      alMostrar.remove();
      alOcultar.remove();
    };
  }, []);

  /**
   * Desplaza la vista lo justo para que el campo que se está escribiendo
   * quede por encima del teclado. Si ya se ve, no hace nada.
   */
  const mostrarCampoActivo = (altura) => {
    // Se espera un instante a que el teclado y el layout se asienten.
    setTimeout(() => {
      try {
        const campo = TextInput.State?.currentlyFocusedInput?.();
        const scroll = referenciaScroll.current;
        if (!campo?.measureInWindow || !scroll?.scrollTo) return;

        campo.measureInWindow((_x, y, _ancho, alto) => {
          if (typeof y !== 'number' || typeof alto !== 'number') return;

          const alturaVentana = Dimensions.get('window').height;
          const limiteVisible = alturaVentana - altura - MARGEN_VISIBLE;
          const bordeInferiorCampo = y + alto;

          // Solo se mueve si el campo quedó tapado (total o parcialmente).
          if (bordeInferiorCampo > limiteVisible) {
            const cuantoFalta = bordeInferiorCampo - limiteVisible;
            scroll.scrollTo({
              y: Math.max(0, desplazamientoActual.current + cuantoFalta),
              animated: true,
            });
          }
        });
      } catch {
        // Si algo falla al medir, el espacio inferior extra ya permite
        // desplazarse a mano: nunca se deja la pantalla inutilizable.
      }
    }, 150);
  };

  return (
    <ScrollView
      ref={referenciaScroll}
      style={style}
      contentContainerStyle={[
        contentContainerStyle,
        // Espacio libre bajo el contenido para poder subirlo sobre el teclado.
        { paddingBottom: alturaTeclado + espacioExtra },
      ]}
      onScroll={(evento) => {
        desplazamientoActual.current = evento.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      // Permite tocar botones sin tener que cerrar el teclado primero.
      keyboardShouldPersistTaps="handled"
      {...props}
    >
      {children}
    </ScrollView>
  );
}
