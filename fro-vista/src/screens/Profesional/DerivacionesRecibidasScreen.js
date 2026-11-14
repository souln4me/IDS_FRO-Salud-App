/**
 * Componente: Cliente Móvil — Vista "Derivaciones recibidas"
 * Casos de uso: CU65, CU28.
 */
// Ruta: fro-vista/src/screens/Profesional/DerivacionesRecibidasScreen.js
//
// CU65 — Derivaciones que otros profesionales te enviaron. Mientras están
// pendientes puedes leer la ficha del paciente para decidir. Aceptar te
// traspasa el episodio (quedas a cargo y trabajas en él con normalidad);
// rechazar exige un motivo y el episodio sigue con quien lo derivó.

import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getDerivacionesRecibidas, responderDerivacion } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import { formatearFechaHora } from '../../utils/fechas';
import { datosEstado } from '../../utils/estados';
import { colores, espacio, piezas, tipografia, interaccion } from '../../theme';

export default function DerivacionesRecibidasScreen({ navigation }) {
  const [derivaciones, setDerivaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [rechazando, setRechazando] = useState(null);   // id con el campo de motivo abierto
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState('');
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState(null);

  // CU65 — cargar las derivaciones recibidas
  const cargar = useCallback(async (refresco = false) => {
    if (refresco) setRefrescando(true);
    try {
      const datos = await getDerivacionesRecibidas();
      setDerivaciones(datos.derivaciones || []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  // CU65 — aceptar o rechazar una derivación
  const responder = async (d, accion) => {
    if (accion === 'RECHAZAR' && motivo.trim().length === 0) {
      setErrorMotivo('Indica el motivo del rechazo.');
      return;
    }
    setEnviando(d.derivacion_interna_id);
    try {
      const datos = await responderDerivacion(d.derivacion_interna_id, accion, accion === 'RECHAZAR' ? motivo.trim() : null);
      setRechazando(null);
      setMotivo('');
      setErrorMotivo('');
      await cargar();
      setAviso({ tono: 'ok', titulo: accion === 'ACEPTAR' ? 'Derivación aceptada' : 'Derivación rechazada', mensaje: datos.mensaje });
    } catch (e) {
      setAviso({ tono: 'error', titulo: 'No se pudo responder', mensaje: e.response?.data?.mensaje || e.response?.data?.error || 'Intenta nuevamente.' });
    } finally {
      setEnviando(null);
    }
  };

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator size="large" color={colores.primario} /></View>;
  }
  if (error) {
    return <View style={estilos.centrado}><ErrorRetry mensaje="No se pudieron cargar tus derivaciones." onRetry={() => cargar()} /></View>;
  }

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />}
      keyboardShouldPersistTaps="handled"
    >
      {derivaciones.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioTitulo}>No tienes derivaciones</Text>
          <Text style={estilos.vacioTexto}>
            Cuando otro profesional te derive un paciente, aparecerá aquí y podrás consultar su ficha.
          </Text>
        </View>
      ) : (
        derivaciones.map((d) => {
          const estado = datosEstado(d.estado);
          const pendiente = d.estado === 'PENDIENTE';
          const conAcceso = ['PENDIENTE', 'ACEPTADA'].includes(d.estado) && d.estado_episodio !== 'CERRADO';
          const aCargo = d.estado === 'ACEPTADA' && d.estado_episodio !== 'CERRADO';
          const ocupado = enviando === d.derivacion_interna_id;
          return (
            <View key={d.derivacion_interna_id} style={[estilos.tarjeta, pendiente && estilos.tarjetaPendiente]}>
              <View style={estilos.filaEntre}>
                <Text style={estilos.paciente}>{d.paciente}</Text>
                <Text style={[estilos.estado, { color: estado.color }]}>{estado.etiqueta}</Text>
              </View>
              <Text style={estilos.meta}>
                De {d.profesional_origen} ({d.especialidad_origen}) · {formatearFechaHora(d.momento_creacion)}
              </Text>
              <Text style={estilos.meta}>Episodio #{d.episodio_clinico_id}: {d.motivo_consulta}</Text>
              <Text style={estilos.justificacion}>“{d.justificacion}”</Text>
              {d.comentario_respuesta ? <Text style={estilos.meta}>Tu respuesta: {d.comentario_respuesta}</Text> : null}
              {aCargo && <Text style={estilos.aCargo}>El episodio está a tu cargo.</Text>}
              {pendiente && (
                <Text style={estilos.meta}>Al aceptar, el episodio pasa a tu cargo y {d.profesional_origen} lo conserva en solo lectura.</Text>
              )}

              {/* CU28, CU65: abrir la ficha del paciente derivado */}
              {conAcceso && (
                <TouchableOpacity
                  style={estilos.botonSecundario}
                  onPress={() => navigation.navigate('FichaClinica', { pacienteId: d.paciente_id, nombrePaciente: d.paciente })}
                  activeOpacity={interaccion.opacidadActiva}
                >
                  <Text style={estilos.botonSecundarioTexto}>{aCargo ? 'Abrir ficha clínica' : 'Ver ficha clínica (solo lectura)'}</Text>
                </TouchableOpacity>
              )}

              {pendiente && rechazando !== d.derivacion_interna_id && (
                <View style={estilos.acciones}>
                  <TouchableOpacity
                    style={[estilos.boton, estilos.accion, ocupado && estilos.deshabilitado]}
                    onPress={() => responder(d, 'ACEPTAR')}
                    disabled={ocupado}
                    activeOpacity={interaccion.opacidadActiva}
                  >
                    <Text style={estilos.botonTexto}>{ocupado ? 'Enviando…' : 'Aceptar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[estilos.botonPeligro, estilos.accion]}
                    onPress={() => { setRechazando(d.derivacion_interna_id); setMotivo(''); setErrorMotivo(''); }}
                    activeOpacity={interaccion.opacidadActiva}
                  >
                    <Text style={estilos.botonPeligroTexto}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {pendiente && rechazando === d.derivacion_interna_id && (
                <View style={estilos.rechazo}>
                  <TextInput
                    style={[piezas.campo, errorMotivo && piezas.campoError]}
                    value={motivo}
                    onChangeText={(t) => { setMotivo(t.slice(0, 255)); setErrorMotivo(''); }}
                    placeholder="Motivo del rechazo (lo verá quien te derivó)"
                    placeholderTextColor={colores.textoTenue}
                    multiline
                  />
                  {errorMotivo ? <Text style={estilos.error}>{errorMotivo}</Text> : null}
                  <View style={estilos.acciones}>
                    <TouchableOpacity
                      style={[estilos.botonSecundario, estilos.accion]}
                      onPress={() => setRechazando(null)}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <Text style={estilos.botonSecundarioTexto}>Volver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[estilos.botonPeligro, estilos.accion, ocupado && estilos.deshabilitado]}
                      onPress={() => responder(d, 'RECHAZAR')}
                      disabled={ocupado}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <Text style={estilos.botonPeligroTexto}>{ocupado ? 'Enviando…' : 'Confirmar rechazo'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  tarjetaPendiente: { borderColor: colores.primarioBorde, borderLeftWidth: 4, borderLeftColor: colores.primario },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.sm },
  paciente: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, flex: 1 },
  estado: { ...tipografia.metaFuerte },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  justificacion: { ...tipografia.cuerpo, color: colores.texto, fontStyle: 'italic', marginTop: espacio.sm },
  aCargo: { ...tipografia.metaFuerte, color: colores.exito, marginTop: espacio.sm },

  acciones: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.md },
  accion: { flex: 1 },
  boton: { ...piezas.botonPrimario, paddingVertical: espacio.md },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  botonSecundario: { ...piezas.botonSecundario, paddingVertical: espacio.sm, marginTop: espacio.md },
  botonSecundarioTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },
  botonPeligro: { ...piezas.botonSecundario, borderColor: colores.error, paddingVertical: espacio.md },
  botonPeligroTexto: { ...tipografia.cuerpoFuerte, color: colores.error },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },
  rechazo: { marginTop: espacio.md },
  error: { ...tipografia.meta, color: colores.error, marginTop: espacio.xs },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl, paddingHorizontal: espacio.lg },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center' },
});
