// Ruta: fro-vista/src/screens/Admin/ModeracionResenasScreen.js
//
// CU56 — Moderación de testimonios públicos.
//
// La nota que dejó el paciente ya está contada en el promedio del profesional:
// lo que se decide acá es si el TEXTO se publica. Rechazar no borra la fila,
// la deja fuera de la vista pública con su causal registrada.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';

import { getBandejaModeracion, moderarResena } from '../../api/client';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoMotivo from '../../components/DialogoMotivo';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const PESTANAS = [
  { clave: 'PENDIENTE', etiqueta: 'Pendientes' },
  { clave: 'APROBADA', etiqueta: 'Publicadas' },
  { clave: 'RECHAZADA', etiqueta: 'Rechazadas' },
];

export default function ModeracionResenasScreen() {
  const [estado, setEstado] = useState('PENDIENTE');
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [porRechazar, setPorRechazar] = useState(null);

  const cargar = useCallback(
    async (cual = estado, esRefresco = false) => {
      if (esRefresco) setRefrescando(true);
      else setCargando(true);
      setError(false);
      try {
        const datos = await getBandejaModeracion(cual);
        setEvaluaciones(datos.evaluaciones || []);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [estado]
  );

  useEffect(() => {
    cargar(estado);
  }, [cargar, estado]);

  const decidir = async (evaluacion, decision, motivo) => {
    setPorRechazar(null);
    setProcesando(evaluacion.evaluacion_satisfaccion_id);
    try {
      const datos = await moderarResena(evaluacion.evaluacion_satisfaccion_id, decision, motivo);
      setAviso({ tono: 'ok', titulo: 'Decisión aplicada', mensaje: datos.mensaje });
      await cargar(estado, true);
    } catch (err) {
      // Excepción 4: si no se pudo guardar, el testimonio sigue pendiente.
      setAviso({
        tono: 'error',
        titulo: 'No se pudo aplicar',
        mensaje: err.response?.data?.mensaje || 'El testimonio sigue pendiente. Intenta otra vez.',
      });
      await cargar(estado, true);
    } finally {
      setProcesando(null);
    }
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  return (
    <View style={estilos.fondo}>
      <View style={estilos.pestanas}>
        {PESTANAS.map((p) => (
          <TouchableOpacity
            key={p.clave}
            style={[estilos.pestana, estado === p.clave && estilos.pestanaActiva]}
            onPress={() => setEstado(p.clave)}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={[estilos.pestanaTexto, estado === p.clave && estilos.pestanaTextoActiva]}>
              {p.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={estilos.centrado}>
          <ErrorRetry mensaje="No se pudo cargar la bandeja." onRetry={() => cargar(estado)} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={estilos.contenido}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={() => cargar(estado, true)}
              colors={[colores.primario]}
            />
          }
        >
          {evaluaciones.length === 0 ? (
            // Excepción 1: bandeja sin filas, con su propio mensaje.
            <View style={estilos.vacio}>
              <Text style={estilos.vacioIcono}>📝</Text>
              <Text style={estilos.vacioTitulo}>
                {estado === 'PENDIENTE' ? 'Nada por revisar' : 'Sin testimonios en este estado'}
              </Text>
              <Text style={estilos.vacioTexto}>
                {estado === 'PENDIENTE'
                  ? 'Cuando un paciente deje un comentario, aparecerá aquí para tu revisión.'
                  : 'Cambia de pestaña para ver los otros estados.'}
              </Text>
            </View>
          ) : (
            evaluaciones.map((e) => (
              <View key={e.evaluacion_satisfaccion_id} style={estilos.tarjeta}>
                <View style={estilos.cabecera}>
                  <Text style={estilos.estrellas}>{'★'.repeat(e.puntuacion)}{'☆'.repeat(5 - e.puntuacion)}</Text>
                  <Text style={estilos.momento}>{formatearFechaHora(e.momento_creacion)}</Text>
                </View>

                <Text style={estilos.resena}>“{e.resena}”</Text>

                <Text style={estilos.contexto}>
                  {e.paciente} · atención con {e.profesional}
                </Text>

                {e.estado_moderacion === 'RECHAZADA' && e.motivo_rechazo ? (
                  <Text style={estilos.causal}>Causal del rechazo: {e.motivo_rechazo}</Text>
                ) : null}

                {estado === 'PENDIENTE' && (
                  <View style={estilos.acciones}>
                    <TouchableOpacity
                      style={[estilos.botonAprobar, procesando === e.evaluacion_satisfaccion_id && estilos.deshabilitado]}
                      onPress={() => decidir(e, 'APROBAR')}
                      disabled={procesando === e.evaluacion_satisfaccion_id}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <Text style={estilos.botonAprobarTexto}>Publicar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[estilos.botonRechazar, procesando === e.evaluacion_satisfaccion_id && estilos.deshabilitado]}
                      onPress={() => setPorRechazar(e)}
                      disabled={procesando === e.evaluacion_satisfaccion_id}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <Text style={estilos.botonRechazarTexto}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Excepción 3: el rechazo exige causal, así que se pide en su propio
          diálogo en vez de permitir rechazar en seco. */}
      <DialogoMotivo
        visible={porRechazar !== null}
        titulo="Rechazar testimonio"
        descripcion="Indica la causal técnica del rechazo. Queda registrada junto a la decisión:"
        etiquetaConfirmar="Rechazar"
        onConfirmar={(motivo) => decidir(porRechazar, 'RECHAZAR', motivo)}
        onCancelar={() => setPorRechazar(null)}
      />

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl },

  pestanas: {
    flexDirection: 'row',
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
  },
  pestana: { flex: 1, paddingVertical: espacio.md, alignItems: 'center' },
  // La pestaña activa se marca con una barra inferior, no solo con el color.
  pestanaActiva: { borderBottomWidth: 2, borderBottomColor: colores.primario },
  pestanaTexto: { ...tipografia.meta, color: colores.textoSuave },
  pestanaTextoActiva: { ...tipografia.metaFuerte, color: colores.primario },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  estrellas: { fontSize: 18, color: colores.secundario, letterSpacing: 2 },
  momento: { ...tipografia.micro, color: colores.textoTenue },
  resena: { ...tipografia.cuerpo, color: colores.texto, marginTop: espacio.sm, fontStyle: 'italic' },
  contexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm },
  causal: { ...tipografia.meta, color: colores.error, marginTop: espacio.sm },

  acciones: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.base },
  botonAprobar: {
    flex: 1,
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonAprobarTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  botonRechazar: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colores.error,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonRechazarTexto: { ...tipografia.cuerpoFuerte, color: colores.error },
  deshabilitado: { opacity: 0.6 },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', paddingHorizontal: espacio.xl },
});
