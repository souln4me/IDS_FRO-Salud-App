// Ruta: fro-vista/src/screens/Profesional/MisLiquidacionesScreen.js
//
// CU75 — El profesional consulta su historial de liquidaciones. Es solo
// lectura por diseño: el monto lo emite el administrador y el registro queda
// inalterable, que es lo que le da valor como respaldo del pago.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';

import { getMisLiquidaciones } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFecha } from '../../utils/fechas';
import { colores, espacio, piezas, tipografia } from '../../theme';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const pesos = (valor) => `$${Number(valor || 0).toLocaleString('es-CL')}`;

export default function MisLiquidacionesScreen() {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setError(false);
    try {
      const datos = await getMisLiquidaciones();
      setLiquidaciones(datos.liquidaciones || []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No se pudieron cargar tus liquidaciones." onRetry={() => cargar()} />
      </View>
    );
  }

  const total = liquidaciones.reduce((suma, l) => suma + Number(l.monto_total), 0);

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
      }
    >
      <Text style={estilos.intro}>
        Tus liquidaciones mensuales, tal como quedaron emitidas. Son de solo lectura: si algo
        no calza, avísale al administrador.
      </Text>

      {liquidaciones.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioIcono}>💼</Text>
          <Text style={estilos.vacioTitulo}>Todavía no hay liquidaciones emitidas</Text>
          <Text style={estilos.vacioTexto}>
            Se emiten al cierre de cada mes, con las prestaciones que quedaron validadas.
          </Text>
        </View>
      ) : (
        <>
          <View style={estilos.resumen}>
            <Text style={estilos.resumenMonto}>{pesos(total)}</Text>
            <Text style={estilos.resumenTexto}>
              acumulado en {liquidaciones.length} liquidación(es)
            </Text>
          </View>

          {liquidaciones.map((l) => (
            <View key={l.liquidacion_id} style={estilos.tarjeta}>
              <View style={estilos.cabecera}>
                <Text style={estilos.periodo}>
                  {MESES[l.mes - 1]} {l.anio}
                </Text>
                <Text style={estilos.montoTotal}>{pesos(l.monto_total)}</Text>
              </View>

              <View style={estilos.fila}>
                <Text style={estilos.concepto}>
                  {l.sesiones_validadas} prestación(es) validada(s)
                </Text>
                <Text style={estilos.monto}>{pesos(l.monto_prestaciones)}</Text>
              </View>

              {Number(l.bonificacion) > 0 && (
                <View style={estilos.fila}>
                  <Text style={estilos.concepto}>Bonificaciones</Text>
                  <Text style={estilos.monto}>{pesos(l.bonificacion)}</Text>
                </View>
              )}

              {l.observacion ? <Text style={estilos.observacion}>{l.observacion}</Text> : null}

              <Text style={estilos.emision}>Emitida el {formatearFecha(l.momento_emision)}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  resumen: {
    ...piezas.tarjeta,
    alignItems: 'center',
    marginBottom: espacio.base,
    backgroundColor: colores.primarioSuave,
    borderColor: colores.primarioBorde,
  },
  resumenMonto: { ...tipografia.display, color: colores.primario },
  resumenTexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  periodo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, textTransform: 'capitalize' },
  montoTotal: { ...tipografia.subtitulo, color: colores.exito },
  fila: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espacio.sm },
  concepto: { ...tipografia.meta, color: colores.textoSuave },
  monto: { ...tipografia.meta, color: colores.texto },
  observacion: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm, fontStyle: 'italic' },
  emision: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.sm },

  vacio: { alignItems: 'center', paddingTop: espacio.xxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, textAlign: 'center' },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.sm },
});
