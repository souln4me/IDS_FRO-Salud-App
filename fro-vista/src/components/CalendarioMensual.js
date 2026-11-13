/**
 * Componente: Cliente Móvil
 * Casos de uso: apoyo común, usado por CU38.
 */
// Ruta: fro-vista/src/components/CalendarioMensual.js
//
// Grilla de un mes, de lunes a domingo, con cuántas citas tiene cada día.
// Sirve para mirar el mes completo de un vistazo ("¿qué semanas vienen
// cargadas?") y entrar directo al día que interesa.
//
// El componente solo dibuja: la pantalla le entrega las semanas ya armadas
// (incluidos los días del mes anterior y del siguiente que completan la
// primera y la última fila) y el conteo de citas por día.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { colores, espacio, radio, tipografia, interaccion } from '../theme';

const ENCABEZADO = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/**
 * @param {Array<Array<{fecha: Date, clave: string, delMes: boolean}>>} semanas
 * @param {object}   conteos      { 'AAAA-MM-DD': cantidad de citas }
 * @param {string}   diaElegido   clave del día marcado
 * @param {string}   claveHoy     clave de hoy, que se distingue siempre
 * @param {function} onElegirDia  recibe la clave del día tocado
 */
export default function CalendarioMensual({ semanas, conteos = {}, diaElegido, claveHoy, onElegirDia }) {
  return (
    <View>
      <View style={estilos.fila}>
        {ENCABEZADO.map((letra, i) => (
          <Text key={i} style={estilos.encabezado}>{letra}</Text>
        ))}
      </View>

      {semanas.map((semana) => (
        <View key={semana[0].clave} style={estilos.fila}>
          {semana.map(({ fecha, clave, delMes }, i) => {
            const elegido = clave === diaElegido;
            const esHoy = clave === claveHoy;
            const total = conteos[clave] || 0;

            return (
              <TouchableOpacity
                key={clave}
                style={[estilos.celda, elegido && estilos.celdaElegida, esHoy && !elegido && estilos.celdaHoy]}
                onPress={() => onElegirDia(clave)}
                activeOpacity={interaccion.opacidadActiva}
                accessibilityRole="button"
                accessibilityState={{ selected: elegido }}
                accessibilityLabel={
                  `${DIAS_LARGOS[i]} ${fecha.getDate()}` +
                  (esHoy ? ', hoy' : '') +
                  (total === 0 ? ', sin citas' : total === 1 ? ', 1 cita' : `, ${total} citas`)
                }
              >
                <Text
                  style={[
                    estilos.numero,
                    !delMes && estilos.numeroFuera,
                    elegido && estilos.textoElegido,
                  ]}
                >
                  {fecha.getDate()}
                </Text>

                {/* El número dice cuántas citas hay sin tener que abrir el día;
                    sin citas queda el espacio vacío para que las filas no salten. */}
                <View
                  style={[
                    estilos.cantidad,
                    total > 0 && (elegido ? estilos.cantidadElegida : delMes ? estilos.cantidadLlena : estilos.cantidadFuera),
                  ]}
                >
                  <Text
                    style={[
                      estilos.cantidadTexto,
                      total === 0 && estilos.cantidadOculta,
                      elegido && estilos.cantidadTextoElegido,
                      !delMes && !elegido && estilos.cantidadTextoFuera,
                    ]}
                  >
                    {total > 99 ? '99+' : total}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row' },
  encabezado: {
    ...tipografia.micro,
    flex: 1,
    textAlign: 'center',
    color: colores.textoSuave,
    paddingVertical: espacio.sm,
  },

  celda: {
    flex: 1,
    alignItems: 'center',
    paddingTop: espacio.sm,
    paddingBottom: espacio.xs,
    margin: 2,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  celdaElegida: { backgroundColor: colores.primario },
  // Hoy se reconoce aunque se esté mirando otro día, igual que en la semana.
  celdaHoy: { borderColor: colores.primario },

  numero: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  // Los días del mes vecino se ven, pero apagados: completan la semana.
  numeroFuera: { color: colores.textoDeshabilitado, fontWeight: '400' },
  textoElegido: { color: colores.textoInverso },

  cantidad: {
    minWidth: 20,
    marginTop: 2,
    paddingHorizontal: espacio.xs,
    borderRadius: radio.completo,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  cantidadLlena: { backgroundColor: colores.primarioSuave },
  cantidadFuera: { backgroundColor: colores.superficieSuave },
  cantidadElegida: { backgroundColor: colores.superficie },
  cantidadTexto: { ...tipografia.micro, color: colores.primario, letterSpacing: 0 },
  cantidadOculta: { color: 'transparent' },
  cantidadTextoElegido: { color: colores.primario },
  cantidadTextoFuera: { color: colores.textoTenue },
});
