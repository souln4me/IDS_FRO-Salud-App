// Ruta: fro-vista/src/components/CodigoOTP.js
//
// Campo de código de verificación: una casilla por dígito, con avance y
// retroceso automáticos. Vive aquí porque el mismo código de 6 dígitos se pide
// en dos lugares (verificar la cuenta y cambiar la contraseña) y antes uno de
// ellos era un campo de texto corriente: la misma acción se veía distinta.

import React, { useRef } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

import { colores, espacio, radio, tipografia } from '../theme';

export default function CodigoOTP({
  valor = '',
  onCambiar,
  largo = 6,
  error = false,
  autoFocus = false,
  editable = true,
}) {
  const campos = useRef([]);
  const digitos = Array.from({ length: largo }, (_, i) => valor[i] || '');

  const escribir = (texto, indice) => {
    // Pegar el código completo desde el portapapeles debe funcionar igual.
    const limpio = texto.replace(/[^0-9]/g, '');
    if (limpio.length > 1) {
      onCambiar(limpio.slice(0, largo));
      campos.current[Math.min(limpio.length, largo - 1)]?.focus();
      return;
    }
    const nuevos = [...digitos];
    nuevos[indice] = limpio.slice(-1);
    onCambiar(nuevos.join('').slice(0, largo));
    if (limpio && indice < largo - 1) campos.current[indice + 1]?.focus();
  };

  const retroceder = (evento, indice) => {
    if (evento.nativeEvent.key === 'Backspace' && !digitos[indice] && indice > 0) {
      campos.current[indice - 1]?.focus();
    }
  };

  return (
    <View style={estilos.fila}>
      {digitos.map((digito, i) => (
        <TextInput
          key={i}
          ref={(ref) => (campos.current[i] = ref)}
          style={[
            estilos.celda,
            digito !== '' && estilos.celdaLlena,
            error && estilos.celdaError,
          ]}
          value={digito}
          onChangeText={(texto) => escribir(texto, i)}
          onKeyPress={(evento) => retroceder(evento, i)}
          keyboardType="numeric"
          maxLength={largo}
          selectTextOnFocus
          editable={editable}
          autoFocus={autoFocus && i === 0}
          accessibilityLabel={`Dígito ${i + 1} de ${largo}`}
        />
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: espacio.sm,
    marginBottom: espacio.base,
  },
  celda: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderColor: colores.bordeCampo,
    borderRadius: radio.md,
    backgroundColor: colores.superficie,
    textAlign: 'center',
    ...tipografia.titulo,
    color: colores.textoTitulo,
  },
  celdaLlena: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  celdaError: { borderColor: colores.error, backgroundColor: colores.errorSuave },
});
