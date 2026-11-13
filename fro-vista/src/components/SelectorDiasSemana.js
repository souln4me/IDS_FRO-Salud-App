/**
 * Componente: Cliente Móvil
 * Casos de uso: CU47; también lo usa CU48.
 */
// Ruta: fro-vista/src/components/SelectorDiasSemana.js
//
// Fila de siete botones L M X J V S D para elegir en qué días de la semana
// se hace un ejercicio de la pauta. Es opcional: sin días marcados, el
// ejercicio sigue su frecuencia diaria o semanal de siempre.
// La numeración es la del servidor: 1 = lunes … 7 = domingo.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { colores, espacio, radio, tipografia, interaccion } from '../theme';

export const DIAS_SEMANA = [
  { numero: 1, corto: 'L', nombre: 'lunes' },
  { numero: 2, corto: 'M', nombre: 'martes' },
  { numero: 3, corto: 'X', nombre: 'miércoles' },
  { numero: 4, corto: 'J', nombre: 'jueves' },
  { numero: 5, corto: 'V', nombre: 'viernes' },
  { numero: 6, corto: 'S', nombre: 'sábado' },
  { numero: 7, corto: 'D', nombre: 'domingo' },
];

/** "lunes, miércoles y viernes" (mismo formato que arma el servidor). */
export function textoDias(dias = []) {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b);
  if (ordenados.length === 7) return 'todos los días';
  const nombres = ordenados
    .map((n) => DIAS_SEMANA.find((d) => d.numero === n)?.nombre)
    .filter(Boolean);
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Día de hoy en la numeración del servidor (1 = lunes … 7 = domingo). */
export function diaSemanaHoy() {
  return ((new Date().getDay() + 6) % 7) + 1;
}

export default function SelectorDiasSemana({ dias = [], onCambiar, deshabilitado = false }) {
  const alternar = (numero) => {
    const siguiente = dias.includes(numero)
      ? dias.filter((n) => n !== numero)
      : [...dias, numero].sort((a, b) => a - b);
    onCambiar?.(siguiente);
  };

  return (
    <View style={estilos.fila}>
      {DIAS_SEMANA.map((dia) => {
        const marcado = dias.includes(dia.numero);
        return (
          <TouchableOpacity
            key={dia.numero}
            style={[estilos.chip, marcado && estilos.chipMarcado, deshabilitado && estilos.deshabilitado]}
            onPress={() => alternar(dia.numero)}
            disabled={deshabilitado}
            activeOpacity={interaccion.opacidadActiva}
            accessibilityRole="checkbox"
            accessibilityLabel={dia.nombre}
            accessibilityState={{ checked: marcado, disabled: deshabilitado }}
          >
            <Text style={[estilos.chipTexto, marcado && estilos.chipTextoMarcado]}>{dia.corto}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', gap: espacio.xs, marginBottom: espacio.sm },
  chip: {
    flex: 1,
    height: 40,
    borderRadius: radio.sm,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    backgroundColor: colores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipMarcado: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { ...tipografia.cuerpoFuerte, color: colores.textoSuave },
  chipTextoMarcado: { color: colores.textoInverso },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },
});
