// Ruta: fro-vista/src/components/EditorBloqueHorario.js
//
// Tarjeta para editar un bloque de la jornada semanal: día, desde/hasta (horas
// en punto, porque la agenda se ofrece en bloques de una hora) y modalidad.
// La usan "Mis horarios" del profesional y el registro de un profesional nuevo.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { colores, espacio, piezas, radio, tipografia } from '../theme';

export const DIAS = [
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
  { valor: 6, nombre: 'Sábado' },
  { valor: 7, nombre: 'Domingo' },
];

export const MODALIDADES = [
  { valor: 'DOMICILIO', nombre: 'A domicilio' },
  { valor: 'ONLINE', nombre: 'Online' },
  { valor: 'AMBOS', nombre: 'Ambas' },
];

// 06:00 a 23:00, en punto.
export const HORAS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

/** onCambiar(campo, valor); el día se entrega como número (1 = lunes). */
export default function EditorBloqueHorario({ bloque, onCambiar, onEliminar }) {
  const dia = Number(bloque.dia_semana);
  return (
    <View style={estilos.tarjeta}>
      <View style={estilos.cabecera}>
        <Text style={estilos.titulo}>
          {DIAS.find((d) => d.valor === dia)?.nombre} · {bloque.hora_inicio} a {bloque.hora_fin}
        </Text>
        <TouchableOpacity
          onPress={onEliminar}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Eliminar bloque"
        >
          <Text style={estilos.eliminar}>Eliminar</Text>
        </TouchableOpacity>
      </View>

      <Text style={estilos.etiqueta}>Día</Text>
      <View style={estilos.selector}>
        <Picker selectedValue={dia} onValueChange={(v) => onCambiar('dia_semana', Number(v))}>
          {DIAS.map((d) => (
            <Picker.Item key={d.valor} label={d.nombre} value={d.valor} />
          ))}
        </Picker>
      </View>

      <View style={estilos.fila}>
        <View style={estilos.columna}>
          <Text style={estilos.etiqueta}>Desde</Text>
          <View style={estilos.selector}>
            <Picker selectedValue={bloque.hora_inicio} onValueChange={(v) => onCambiar('hora_inicio', v)}>
              {HORAS.slice(0, -1).map((h) => (
                <Picker.Item key={h} label={h} value={h} />
              ))}
            </Picker>
          </View>
        </View>
        <View style={estilos.columna}>
          <Text style={estilos.etiqueta}>Hasta</Text>
          <View style={estilos.selector}>
            <Picker selectedValue={bloque.hora_fin} onValueChange={(v) => onCambiar('hora_fin', v)}>
              {HORAS.slice(1).map((h) => (
                <Picker.Item key={h} label={h} value={h} />
              ))}
            </Picker>
          </View>
        </View>
      </View>
      {bloque.hora_inicio >= bloque.hora_fin ? (
        <Text style={estilos.errorTexto}>La hora de término debe ser posterior al inicio.</Text>
      ) : null}

      <Text style={estilos.etiqueta}>Modalidad en este horario</Text>
      <View style={estilos.selector}>
        <Picker selectedValue={bloque.modalidad || 'DOMICILIO'} onValueChange={(v) => onCambiar('modalidad', v)}>
          {MODALIDADES.map((m) => (
            <Picker.Item key={m.valor} label={m.nombre} value={m.valor} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

/** Botón "＋ Agregar bloque horario", con el mismo trazo en ambas pantallas. */
export function BotonAgregarBloque({ onPress }) {
  return (
    <TouchableOpacity style={estilos.botonAgregar} onPress={onPress} accessibilityRole="button">
      <Text style={estilos.botonAgregarTexto}>＋ Agregar bloque horario</Text>
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.sm },
  titulo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, flex: 1 },
  eliminar: { ...tipografia.metaFuerte, color: colores.error },

  etiqueta: { ...tipografia.micro, color: colores.textoSuave, marginTop: espacio.sm, marginBottom: 4 },
  selector: {
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.sm,
    backgroundColor: colores.superficie,
    overflow: 'hidden',
  },
  fila: { flexDirection: 'row', gap: espacio.sm },
  columna: { flex: 1 },
  errorTexto: { ...tipografia.micro, color: colores.error, marginTop: espacio.xs, letterSpacing: 0 },

  botonAgregar: {
    borderWidth: 1.5,
    borderColor: colores.primario,
    borderStyle: 'dashed',
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
    marginTop: espacio.sm,
  },
  botonAgregarTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },
});
