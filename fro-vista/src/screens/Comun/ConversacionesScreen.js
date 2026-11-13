/**
 * Componente: Cliente Móvil — Vista "Mensajes"
 * Casos de uso: CU53, CU35.
 */
// Ruta: fro-vista/src/screens/Comun/ConversacionesScreen.js
//
// CU53 — Bandeja de conversaciones. Hay un solo chat por pareja paciente–
// profesional: el paciente ve uno por cada profesional que lo atiende y el
// profesional, uno por cada paciente.
//
// Las conversaciones sin episodio abierto ni cita vigente siguen apareciendo,
// al final y marcadas: quedan como historial de solo lectura (Excepción 3).

import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';

import Icono from '../../components/Icono';
import Avatar from '../../components/Avatar';
import { getMisConversaciones } from '../../api/client';
import { AuthContext } from '../../context/AuthContext';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

export default function ConversacionesScreen({ navigation }) {
  // Para el paciente, Mensajes es una pestaña de la barra inferior y arriba de
  // todo lleva el acceso a sus documentos (CU35).
  const { userData } = useContext(AuthContext);
  const esPaciente = userData?.rol === 'Paciente';
  const [conversaciones, setConversaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);

  // CU53 — Comunicando mediante mensajería clínica cifrada: cargar la bandeja de chats
  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setError(false);
    try {
      const { conversaciones: recibidas } = await getMisConversaciones();
      // Las de solo lectura van al final, sin alterar el orden del servidor
      // dentro de cada grupo.
      const lista = recibidas || [];
      setConversaciones([...lista.filter((c) => c.activa), ...lista.filter((c) => !c.activa)]);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    // Al volver del chat, los contadores de no leídos cambian.
    const quitar = navigation.addListener('focus', () => cargar(true));
    return quitar;
  }, [cargar, navigation]);

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
        <ErrorRetry mensaje="No pudimos cargar tus conversaciones." onRetry={() => cargar()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
      }
    >
      {/* CU35: acceso del paciente a sus documentos */}
      {esPaciente && (
        <TouchableOpacity
          style={estilos.botonDocumentos}
          onPress={() => navigation.navigate('Documentos')}
          activeOpacity={interaccion.opacidadActiva}
          accessibilityRole="button"
        >
          <View style={estilos.documentosIcono}>
            <Icono name="folder-open-outline" size={22} color={colores.primario} />
          </View>
          <View style={estilos.cuerpo}>
            <Text style={estilos.nombre}>Mis documentos</Text>
            <Text style={estilos.motivo}>Tus exámenes e informes clínicos, sin descargarlos.</Text>
          </View>
          <Text style={estilos.chevron}>›</Text>
        </TouchableOpacity>
      )}

      <Text style={estilos.intro}>
        {esPaciente
          ? 'Un chat directo con cada profesional que te atiende.'
          : 'Un chat directo con cada uno de tus pacientes.'}{' '}
        Los mensajes viajan cifrados y solo los ven los dos participantes.
      </Text>

      {conversaciones.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioIcono}>💬</Text>
          <Text style={estilos.vacioTitulo}>Sin conversaciones</Text>
          <Text style={estilos.vacioTexto}>
            {esPaciente
              ? 'Cuando tengas una cita o un tratamiento en curso con un profesional, su chat aparecerá aquí.'
              : 'Cuando un paciente tenga una cita o un tratamiento en curso contigo, su chat aparecerá aquí.'}
          </Text>
        </View>
      ) : (
        conversaciones.map((c) => {
          const soloLectura = !c.activa;
          return (
            <TouchableOpacity
              key={`${c.paciente_id}-${c.profesional_id}`}
              style={[estilos.tarjeta, soloLectura && estilos.tarjetaCerrada]}
              onPress={() =>
                navigation.navigate('ChatClinico', {
                  pacienteId: c.paciente_id,
                  profesionalId: c.profesional_id,
                  nombreOtro: c.con,
                })
              }
              activeOpacity={interaccion.opacidadActiva}
            >
              {/* Foto de la otra persona; sin foto, sus iniciales. */}
              <Avatar foto={c.foto} nombre={c.con} tamano={48} style={estilos.avatar} />
              <View style={estilos.cuerpo}>
                <View style={estilos.filaNombre}>
                  <Text style={[estilos.nombre, estilos.nombreFlexible]} numberOfLines={1}>
                    {c.con}
                  </Text>
                  {soloLectura && (
                    <View style={estilos.etiquetaLectura}>
                      <Text style={estilos.etiquetaLecturaTexto}>Solo lectura</Text>
                    </View>
                  )}
                </View>
                {c.detalle ? (
                  <Text style={estilos.motivo} numberOfLines={1}>
                    {c.detalle}
                  </Text>
                ) : null}
                <Text style={estilos.momento}>
                  {c.ultimo_momento
                    ? `Último mensaje: ${formatearFechaHora(c.ultimo_momento)}`
                    : 'Sin mensajes todavía'}
                </Text>
              </View>

              {c.sin_leer > 0 && (
                <View style={estilos.globo}>
                  <Text style={estilos.globoTexto}>{c.sin_leer}</Text>
                </View>
              )}
              <Text style={estilos.chevron}>›</Text>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  botonDocumentos: {
    ...piezas.tarjeta,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espacio.lg,
  },
  documentosIcono: {
    width: 48,
    height: 48,
    borderRadius: radio.md,
    backgroundColor: colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espacio.md,
  },

  tarjeta: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', marginBottom: espacio.md },
  tarjetaCerrada: { backgroundColor: colores.superficieSuave },
  cuerpo: { flex: 1 },
  avatar: { marginRight: espacio.md },
  filaNombre: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  nombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  nombreFlexible: { flexShrink: 1 },
  etiquetaLectura: {
    paddingHorizontal: espacio.sm,
    paddingVertical: 1,
    borderRadius: radio.completo,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  etiquetaLecturaTexto: { ...tipografia.micro, color: colores.textoSuave },
  motivo: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  momento: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.xs },

  globo: {
    minWidth: 22,
    height: 22,
    borderRadius: radio.completo,
    paddingHorizontal: 6,
    backgroundColor: colores.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espacio.sm,
  },
  globoTexto: { ...tipografia.micro, color: colores.textoInverso },
  chevron: { fontSize: 24, color: colores.textoDeshabilitado },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', paddingHorizontal: espacio.xl },
});
