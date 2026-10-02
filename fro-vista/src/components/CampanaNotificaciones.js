// Ruta: fro-vista/src/components/CampanaNotificaciones.js
//
// CU52 — La campana con el globo de avisos sin leer. Va en la cabecera de los
// paneles de inicio de los tres roles, que es de donde parte cualquier
// recorrido dentro de la app.
//
// El contador se refresca al volver a la pantalla: si el usuario acaba de leer
// sus avisos, el globo tiene que apagarse solo.

import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';

import { getResumenNotificaciones } from '../api/client';
import { colores, espacio, tipografia, interaccion } from '../theme';

export default function CampanaNotificaciones({ navigation }) {
  const [sinLeer, setSinLeer] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const { no_leidas } = await getResumenNotificaciones();
      setSinLeer(Number(no_leidas) || 0);
    } catch {
      // El globo es un adorno: sin red, simplemente no muestra número.
      setSinLeer(0);
    }
  }, []);

  useEffect(() => {
    cargar();
    const quitar = navigation?.addListener?.('focus', cargar);
    return quitar;
  }, [navigation, cargar]);

  return (
    <TouchableOpacity
      style={estilos.contenedor}
      onPress={() => navigation.navigate('Notificaciones')}
      activeOpacity={interaccion.opacidadActiva}
      accessibilityRole="button"
      accessibilityLabel={
        sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'
      }
    >
      <Text style={estilos.icono}>🔔</Text>
      {sinLeer > 0 && (
        <View style={estilos.globo}>
          <Text style={estilos.globoTexto}>{sinLeer > 99 ? '99+' : sinLeer}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  contenedor: { paddingHorizontal: espacio.md, paddingVertical: espacio.xs },
  icono: { fontSize: 22 },
  globo: {
    position: 'absolute',
    top: 0,
    right: espacio.sm,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colores.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globoTexto: { ...tipografia.micro, color: colores.textoInverso, fontSize: 10 },
});
