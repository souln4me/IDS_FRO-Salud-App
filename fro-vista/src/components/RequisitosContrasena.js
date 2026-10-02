// Ruta: fro-vista/src/components/RequisitosContrasena.js
//
// Lista de requisitos de la contraseña, marcados en tiempo real mientras se
// escribe (✓ cumplido, ✗ pendiente). La usan el registro, el cambio de
// contraseña desde el perfil y la recuperación por olvido.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { REQUISITOS_CONTRASENA } from '../utils/contrasena';
import { colores, espacio, tipografia } from '../theme';

/** Requisitos evaluados contra el texto, incluida la coincidencia de ambos campos. */
export function evaluarRequisitos(contrasena = '', confirmacion = '') {
  return [
    ...REQUISITOS_CONTRASENA.map((requisito) => ({
      etiqueta: requisito.etiqueta,
      cumple: requisito.cumple(contrasena),
    })),
    { etiqueta: 'Las dos contraseñas coinciden', cumple: contrasena !== '' && contrasena === confirmacion },
  ];
}

export default function RequisitosContrasena({ contrasena = '', confirmacion = '', style }) {
  return (
    <View style={[estilos.requisitos, style]}>
      {evaluarRequisitos(contrasena, confirmacion).map((requisito) => (
        <Text
          key={requisito.etiqueta}
          style={[
            estilos.requisito,
            requisito.cumple ? estilos.requisitoCumplido : contrasena !== '' && estilos.requisitoIncumplido,
          ]}
        >
          {requisito.cumple ? '✓' : '✗'}  {requisito.etiqueta}
        </Text>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  requisitos: { marginBottom: espacio.xs },
  requisito: { ...tipografia.meta, color: colores.textoTenue, marginBottom: 2 },
  requisitoCumplido: { color: colores.exito },
  requisitoIncumplido: { color: colores.error },
});
