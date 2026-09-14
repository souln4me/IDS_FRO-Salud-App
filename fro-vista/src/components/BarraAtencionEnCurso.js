// Ruta: fro-vista/src/components/BarraAtencionEnCurso.js
//
// Barra que aparece sola mientras el profesional tiene una atención abierta y
// lo sigue por sus pantallas principales.
//
// Resuelve la queja de fondo: antes, al iniciar una atención no quedaba
// ninguna señal de que había una sesión en curso ni de dónde continuarla; el
// profesional tenía que acordarse de a quién estaba atendiendo y volver a
// buscarlo. Ahora la sesión abierta se ve siempre y está a un toque.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { getAtencionEnCurso } from '../api/client';
import { formatearHora } from '../utils/fechas';
import { colores, espacio, radio, tipografia, interaccion } from '../theme';

/**
 * @param {function} onAbrir  recibe la atención; decide a dónde llevar
 * @param {object}   navigation  si no se pasa onAbrir, abre la ficha del paciente
 */
export default function BarraAtencionEnCurso({ onAbrir, navigation, recargarEn }) {
  const [atencion, setAtencion] = useState(null);

  const consultar = useCallback(async () => {
    try {
      const datos = await getAtencionEnCurso();
      setAtencion(datos?.atencion || null);
    } catch (error) {
      // Sin atención visible es preferible a un error: la barra es un apoyo,
      // no una función crítica.
      setAtencion(null);
    }
  }, []);

  useEffect(() => {
    consultar();
  }, [consultar, recargarEn]);

  // Se refresca al volver a la pantalla: la atención pudo cerrarse en otra.
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    return navigation.addListener('focus', consultar);
  }, [navigation, consultar]);

  if (!atencion) return null;

  const abrir = () => {
    if (onAbrir) {
      onAbrir(atencion);
      return;
    }
    navigation?.navigate('FichaClinica', {
      pacienteId: atencion.paciente_id,
      nombrePaciente: atencion.paciente,
      episodioId: atencion.episodio_clinico_id ? String(atencion.episodio_clinico_id) : '',
      irASesion: true,
    });
  };

  const desde = atencion.checkin_profesional || atencion.fecha_hora_inicio;

  return (
    <TouchableOpacity
      style={estilos.barra}
      onPress={abrir}
      activeOpacity={interaccion.opacidadActiva}
      accessibilityRole="button"
      accessibilityLabel={`Atención en curso con ${atencion.paciente}. Toca para continuar.`}
    >
      <View style={estilos.punto} />
      <View style={estilos.texto}>
        <Text style={estilos.titulo} numberOfLines={1}>
          Atendiendo a {atencion.paciente}
        </Text>
        <Text style={estilos.detalle}>
          Desde las {formatearHora(desde)} · toca para continuar
        </Text>
      </View>
      <Text style={estilos.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  // Ámbar, no verde: es un estado temporal que pide acción, no una
  // confirmación. Así se distingue del resto de la interfaz de un vistazo.
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.advertenciaSuave,
    borderBottomWidth: 1,
    borderBottomColor: colores.advertenciaBorde,
    paddingHorizontal: espacio.lg,
    paddingVertical: espacio.md,
    gap: espacio.md,
  },
  punto: {
    width: 10,
    height: 10,
    borderRadius: radio.completo,
    backgroundColor: colores.advertencia,
  },
  texto: { flex: 1 },
  titulo: { ...tipografia.cuerpoFuerte, color: colores.advertencia },
  detalle: { ...tipografia.meta, color: colores.advertencia, opacity: 0.85 },
  chevron: { fontSize: 24, color: colores.advertencia },
});
