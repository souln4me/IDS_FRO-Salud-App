// Ruta: fro-vista/src/utils/useEspacioInferior.js
//
// Cuánto espacio dejar al pie de una pantalla con una barra fija abajo (por
// ejemplo, la caja de texto del chat) para que no la tape nada:
//
//  · Teclado cerrado → la franja de los botones o del gesto del sistema. Desde
//    que Android dibuja la app "de borde a borde", esa franja queda encima del
//    contenido si no se reserva a mano.
//  · Teclado abierto → la altura completa del teclado, para que la barra suba
//    justo hasta donde el teclado termina.
//
// Por qué no KeyboardAvoidingView: con la app de borde a borde, Android ya no
// encoge la ventana al abrir el teclado y ese componente no tiene nada que
// ajustar. Además, React Native informa en Android la altura del teclado
// DESCONTANDO la barra de navegación (ime − systemBars en ReactRootView), así
// que hay que sumársela para que la barra no quede escondida detrás.

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function useEspacioInferior() {
  const bordes = useSafeAreaInsets();
  const [alturaTeclado, setAlturaTeclado] = useState(0);

  useEffect(() => {
    // En iOS los eventos "Will" permiten moverse junto con el teclado; Android
    // solo emite los "Did".
    const mostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const ocultar = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const alMostrar = Keyboard.addListener(mostrar, (evento) =>
      setAlturaTeclado(evento?.endCoordinates?.height ?? 0)
    );
    const alOcultar = Keyboard.addListener(ocultar, () => setAlturaTeclado(0));
    return () => {
      alMostrar.remove();
      alOcultar.remove();
    };
  }, []);

  if (alturaTeclado > 0) {
    // iOS ya incluye la zona del indicador de inicio en la altura del teclado.
    return Platform.OS === 'android' ? alturaTeclado + bordes.bottom : alturaTeclado;
  }
  return bordes.bottom;
}
