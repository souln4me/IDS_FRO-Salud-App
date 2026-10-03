// Ruta: fro-vista/src/screens/Paciente/ResenasProfesionalScreen.js
//
// CU58 — El detalle detrás de la calificación: promedio, cantidad de
// evaluaciones y los testimonios que el administrador aprobó (CU56).
//
// Excepción 4: mientras la consulta viaja se muestra un esqueleto de carga en
// vez de dejar la pantalla vacía.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';

import { getResenasProfesional } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFecha } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia } from '../../theme';

export default function ResenasProfesionalScreen({ route, navigation }) {
  const { profesionalId, nombre } = route?.params || {};
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    navigation.setOptions?.({ title: nombre || 'Evaluaciones' });
  }, [navigation, nombre]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      setDatos(await getResenasProfesional(profesionalId));
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [profesionalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
        <Text style={estilos.cargandoTexto}>Buscando las evaluaciones…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No pudimos cargar las evaluaciones." onRetry={cargar} />
      </View>
    );
  }

  const promedio = Number(datos?.promedio || 0);

  return (
    <ScrollView style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <View style={estilos.resumen}>
        <Text style={estilos.numero}>{datos?.perfil_incipiente ? '—' : promedio.toFixed(1)}</Text>
        <Text style={estilos.estrellas}>
          {'★'.repeat(Math.round(promedio))}
          {'☆'.repeat(5 - Math.round(promedio))}
        </Text>
        <Text style={estilos.total}>
          {datos?.perfil_incipiente
            ? 'Perfil nuevo: todavía no tiene evaluaciones.'
            : `${datos.total_evaluaciones} evaluación(es) de pacientes atendidos`}
        </Text>
      </View>

      {datos?.resenas?.length > 0 ? (
        datos.resenas.map((r) => (
          <View key={r.evaluacion_satisfaccion_id} style={estilos.tarjeta}>
            <View style={estilos.cabecera}>
              <Text style={estilos.estrellasChicas}>
                {'★'.repeat(r.puntuacion)}
                {'☆'.repeat(5 - r.puntuacion)}
              </Text>
              <Text style={estilos.momento}>{formatearFecha(r.momento_creacion)}</Text>
            </View>
            <Text style={estilos.texto}>“{r.resena}”</Text>
            {/* Quién la escribió: nombre e inicial, o "Anónimo" si lo pidió. */}
            <Text style={estilos.autor}>— {r.autor || 'Paciente'}</Text>
          </View>
        ))
      ) : (
        <Text style={estilos.sinComentarios}>
          {datos?.perfil_incipiente
            ? 'Cuando atienda a sus primeros pacientes, sus evaluaciones aparecerán aquí.'
            : 'Las evaluaciones de este profesional no incluyen comentarios publicados.'}
        </Text>
      )}

      <Text style={estilos.nota}>
        Los comentarios se publican solo después de ser revisados. Las calificaciones son
        anónimas.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  cargandoTexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.md },

  resumen: {
    ...piezas.tarjeta,
    alignItems: 'center',
    marginBottom: espacio.lg,
    backgroundColor: colores.secundarioSuave,
    borderColor: colores.secundarioBorde,
  },
  numero: { ...tipografia.display, fontSize: 44, lineHeight: 50, color: colores.secundarioFuerte },
  estrellas: { fontSize: 22, color: colores.secundario, letterSpacing: 3 },
  total: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm, textAlign: 'center' },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  estrellasChicas: { fontSize: 15, color: colores.secundario, letterSpacing: 2 },
  momento: { ...tipografia.micro, color: colores.textoTenue },
  texto: { ...tipografia.cuerpo, color: colores.texto, marginTop: espacio.sm, fontStyle: 'italic' },
  autor: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm, fontStyle: 'italic' },

  sinComentarios: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center' },
  nota: {
    ...tipografia.micro,
    color: colores.textoTenue,
    marginTop: espacio.xl,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
    paddingTop: espacio.base,
    borderRadius: radio.sm,
  },
});
