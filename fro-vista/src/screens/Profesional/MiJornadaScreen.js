// Ruta: fro-vista/src/screens/Profesional/MiJornadaScreen.js
//
// La agenda del día del profesional: todas sus citas, con su horario y su
// estado, ordenadas por prioridad.
//
// Antes esta pantalla se llamaba "Marcas Temporales" y traía sus propios
// botones de iniciar y finalizar atención — los mismos que ya existían dentro
// de la ficha de cada paciente, sobre los mismos datos. Parecían dos funciones
// distintas cuando eran una sola.
//
// Ahora la jornada solo muestra y lleva: al tocar una cita se abre la ficha
// clínica de ese paciente, que es donde se marca la atención y se registra el
// trabajo. Una cosa se ve en un lugar, se hace en otro, y no se repite.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
} from 'react-native';

import { getCitasMarcasTemporales } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import EtiquetaEstado from '../../components/EtiquetaEstado';
import { formatearFechaHora, formatearHora } from '../../utils/fechas';
import { datosEstado } from '../../utils/estados';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';
import BarraAtencionEnCurso from '../../components/BarraAtencionEnCurso';

function normalizar(estado) {
  return String(estado || '').trim().toUpperCase().replace(/\s+/g, '_');
}

export default function MiJornadaScreen({ navigation }) {
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setErrorCarga(false);
    try {
      const datos = await getCitasMarcasTemporales();
      const lista = datos.citas || [];
      // En curso arriba, terminadas al final: la misma prioridad que en la
      // vista del paciente, para que la app se lea igual en todas partes.
      lista.sort((a, b) => {
        const da = datosEstado(a.estado).orden;
        const db = datosEstado(b.estado).orden;
        if (da !== db) return da - db;
        return String(a.fecha_hora_inicio || '').localeCompare(String(b.fecha_hora_inicio || ''));
      });
      setCitas(lista);
    } catch (error) {
      setErrorCarga(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al volver de la ficha, la jornada se actualiza sola: puede que el
  // profesional haya iniciado o cerrado una atención allá.
  useEffect(() => {
    const quitar = navigation.addListener('focus', () => cargar(true));
    return quitar;
  }, [navigation, cargar]);

  const abrirFicha = (cita) => {
    navigation.navigate('FichaClinica', {
      pacienteId: cita.paciente_id,
      nombrePaciente: cita.paciente,
    });
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (errorCarga) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No se pudo cargar tu jornada." onRetry={() => cargar(false)} />
      </View>
    );
  }

  return (
    <View style={estilos.fondo}>
      <BarraAtencionEnCurso navigation={navigation} />

      <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
      }
    >
      <Text style={estilos.intro}>
        Toca una cita para abrir la ficha del paciente y registrar la atención.
      </Text>

      {citas.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioIcono}>📅</Text>
          <Text style={estilos.vacioTitulo}>Sin citas por atender</Text>
          <Text style={estilos.vacioTexto}>
            Cuando tengas horas agendadas aparecerán aquí, ordenadas por prioridad.
          </Text>
        </View>
      ) : (
        citas.map((cita) => {
          const estado = normalizar(cita.estado);
          const enCurso = estado === 'EN_CURSO';

          return (
            <TouchableOpacity
              key={cita.cita_id}
              style={[estilos.tarjeta, enCurso && estilos.tarjetaEnCurso]}
              onPress={() => abrirFicha(cita)}
              activeOpacity={interaccion.opacidadActiva}
            >
              <View style={estilos.hora}>
                <Text style={estilos.horaTexto}>{formatearHora(cita.fecha_hora_inicio)}</Text>
              </View>

              <View style={estilos.info}>
                <Text style={estilos.paciente} numberOfLines={1}>{cita.paciente}</Text>
                <Text style={estilos.detalle}>
                  {formatearFechaHora(cita.fecha_hora_inicio)}
                </Text>
                {cita.checkin_profesional ? (
                  <Text style={estilos.detalle}>
                    Atención iniciada a las {formatearHora(cita.checkin_profesional)}
                  </Text>
                ) : null}
                {estado === 'REALIZADA' && cita.duracion_minutos ? (
                  <Text style={estilos.detalle}>Duró {cita.duracion_minutos} minutos</Text>
                ) : null}
                <EtiquetaEstado estado={estado} tamano="sm" style={estilos.etiqueta} />
              </View>

              <Text style={estilos.chevron}>›</Text>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },

  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  tarjeta: {
    ...piezas.tarjeta,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espacio.md,
  },
  // La cita en curso se distingue sin depender solo del color de la etiqueta.
  tarjetaEnCurso: { borderColor: colores.advertencia, borderWidth: 1.5 },

  hora: {
    width: 62,
    alignItems: 'center',
    marginRight: espacio.base,
    paddingRight: espacio.base,
    borderRightWidth: 1,
    borderRightColor: colores.bordeSuave,
  },
  horaTexto: { ...tipografia.subtitulo, color: colores.primario },

  info: { flex: 1 },
  paciente: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  detalle: { ...tipografia.meta, color: colores.textoSuave, marginTop: 1 },
  etiqueta: { marginTop: espacio.sm },

  chevron: { fontSize: 26, color: colores.textoDeshabilitado, marginLeft: espacio.sm },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', paddingHorizontal: espacio.xl },
});
