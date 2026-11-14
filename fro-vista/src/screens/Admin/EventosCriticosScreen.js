/**
 * Componente: Cliente Móvil — Vista "Eventos críticos"
 * Casos de uso: CU62.
 */
// Ruta: fro-vista/src/screens/Admin/EventosCriticosScreen.js
//
// CU62 — Bandeja de eventos críticos escalados a supervisión. El administrador
// cumple el papel de supervisor (D1 del Incremento 4). La bandeja se
// sincroniza sola cada 15 segundos (consulta periódica, sin WebSockets): si
// la consulta falla, avisa que la sincronización quedó en pausa (Exc. 1).
// Un acuse que no se pudo guardar se reintenta en segundo plano (Exc. 4).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';

import { getEventosCriticos, acusarEventoCritico } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const CADA_MS = 15000;
const REINTENTOS_ACUSE = 3;

const ORIGEN = {
  CHAT: { etiqueta: 'Chat clínico', icono: '💬' },
  SINTOMAS: { etiqueta: 'Reporte de síntomas', icono: '📈' },
  RESENA: { etiqueta: 'Reseña', icono: '⭐' },
  TICKET: { etiqueta: 'Ticket de soporte', icono: '🎫' },
};
const FILTROS = [
  { clave: 'PENDIENTE', titulo: 'Pendientes' },
  { clave: 'ACUSADO', titulo: 'Acusados' },
  { clave: 'TODOS', titulo: 'Todos' },
];

export default function EventosCriticosScreen({ navigation }) {
  const [eventos, setEventos] = useState([]);
  const [pendientes, setPendientes] = useState(0);
  const [filtro, setFiltro] = useState('PENDIENTE');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [acusando, setAcusando] = useState({});   // id → 'enviando' | 'reintentando'
  const [aviso, setAviso] = useState(null);
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;

  // CU62 — Escalando Automáticamente Eventos Críticos a Supervisión: cargar la bandeja
  const cargar = useCallback(async ({ silencioso = false, refresco = false } = {}) => {
    if (refresco) setRefrescando(true);
    else if (!silencioso) setCargando(true);
    try {
      const datos = await getEventosCriticos(filtroRef.current);
      setEventos(datos.eventos || []);
      setPendientes(datos.pendientes || 0);
      setError(false);
      setSinConexion(false);
    } catch {
      // Exc. 1: en la sincronización periódica no se vacía la bandeja, solo
      // se avisa que quedó en pausa. En la carga inicial sí es un error.
      if (silencioso || refresco) setSinConexion(true);
      else setError(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, filtro]);

  // Sincronización en vivo mientras la pantalla está a la vista.
  useEffect(() => {
    let temporizador = null;
    const iniciar = () => {
      if (temporizador) return;
      temporizador = setInterval(() => cargar({ silencioso: true }), CADA_MS);
    };
    const detener = () => {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    };
    iniciar();
    const quitarFoco = navigation.addListener('focus', iniciar);
    const quitarBlur = navigation.addListener('blur', detener);
    return () => {
      detener();
      quitarFoco();
      quitarBlur();
    };
  }, [navigation, cargar]);

  // CU62 — registrar el acuse de recibo del supervisor
  const acusar = async (evento, intento = 1) => {
    setAcusando((previos) => ({ ...previos, [evento.evento_critico_id]: intento === 1 ? 'enviando' : 'reintentando' }));
    try {
      await acusarEventoCritico(evento.evento_critico_id);
      setAcusando((previos) => {
        const { [evento.evento_critico_id]: _omitido, ...resto } = previos;
        return resto;
      });
      await cargar({ silencioso: true });
    } catch (e) {
      const err = e.response?.data;
      if (err?.error === 'YA_ACUSADO' || err?.error === 'EVENTO_NO_ENCONTRADO') {
        setAcusando((previos) => {
          const { [evento.evento_critico_id]: _omitido, ...resto } = previos;
          return resto;
        });
        setAviso({ tono: 'info', titulo: 'Ya estaba acusado', mensaje: err.mensaje });
        cargar({ silencioso: true });
        return;
      }
      // Exc. 4: el acuse queda pendiente y se reintenta en segundo plano.
      if (intento < REINTENTOS_ACUSE) {
        setTimeout(() => acusar(evento, intento + 1), 5000 * intento);
        return;
      }
      setAcusando((previos) => {
        const { [evento.evento_critico_id]: _omitido, ...resto } = previos;
        return resto;
      });
      setAviso({
        tono: 'error',
        titulo: 'No se pudo registrar el acuse',
        mensaje: 'Se reintentó tres veces sin éxito. El evento sigue pendiente: vuelve a intentarlo cuando se restablezca la conexión.',
      });
    }
  };

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
        <ErrorRetry mensaje="No se pudo cargar la bandeja de eventos críticos." onRetry={() => cargar()} />
      </View>
    );
  }

  return (
    <View style={estilos.fondo}>
      {sinConexion && (
        <View style={estilos.cintaPausa}>
          <Text style={estilos.cintaPausaTexto}>
            ⚠️ Sin conexión: la sincronización en vivo quedó en pausa. Se reanuda sola al volver la señal.
          </Text>
        </View>
      )}

      <View style={estilos.filtros}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.clave}
            style={[estilos.filtro, filtro === f.clave && estilos.filtroActivo]}
            onPress={() => setFiltro(f.clave)}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={[estilos.filtroTexto, filtro === f.clave && estilos.filtroTextoActivo]}>
              {f.titulo}{f.clave === 'PENDIENTE' && pendientes > 0 ? ` (${pendientes})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={estilos.contenido}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar({ refresco: true })} colors={[colores.primario]} />}
      >
        {eventos.length === 0 ? (
          // Exc. 2: sin eventos pendientes de revisión.
          <View style={estilos.vacio}>
            <Text style={estilos.vacioIcono}>🛡️</Text>
            <Text style={estilos.vacioTitulo}>
              {filtro === 'PENDIENTE' ? 'No hay eventos críticos pendientes' : 'No hay eventos en esta lista'}
            </Text>
            <Text style={estilos.vacioTexto}>
              Los textos con términos críticos del diccionario (reportes de síntomas, reseñas y tickets) aparecen aquí al instante. El chat no se revisa: es privado entre paciente y profesional.
            </Text>
          </View>
        ) : (
          eventos.map((e) => {
            const origen = ORIGEN[e.origen] || { etiqueta: e.origen, icono: '🚨' };
            const pendiente = e.estado === 'PENDIENTE';
            const estadoAcuse = acusando[e.evento_critico_id];
            return (
              <View key={e.evento_critico_id} style={[estilos.tarjeta, pendiente && estilos.tarjetaPendiente]}>
                <View style={estilos.cabecera}>
                  <Text style={estilos.origen}>{origen.icono} {origen.etiqueta}</Text>
                  <Text style={[estilos.estado, pendiente ? estilos.estadoPendiente : estilos.estadoAcusado]}>
                    {pendiente ? 'PENDIENTE' : 'ACUSADO'}
                  </Text>
                </View>
                <View style={estilos.terminos}>
                  {(e.terminos?.length ? e.terminos : [e.termino]).map((t) => (
                    <View key={t} style={estilos.termino}><Text style={estilos.terminoTexto}>{t}</Text></View>
                  ))}
                </View>
                {e.extracto ? <Text style={estilos.extracto}>“{e.extracto}”</Text> : null}
                <Text style={estilos.meta}>
                  {e.usuario_origen ? `De ${e.usuario_origen}${e.rol_origen ? ` (${e.rol_origen})` : ''}` : 'Origen no identificado'}
                  {e.paciente ? ` · Paciente: ${e.paciente}` : ''}
                </Text>
                <Text style={estilos.meta}>{formatearFechaHora(e.momento_creacion)}</Text>

                {pendiente ? (
                  <TouchableOpacity
                    style={[estilos.boton, estadoAcuse && estilos.deshabilitado]}
                    onPress={() => acusar(e)}
                    disabled={Boolean(estadoAcuse)}
                    activeOpacity={interaccion.opacidadActiva}
                  >
                    <Text style={estilos.botonTexto}>
                      {estadoAcuse === 'reintentando' ? 'Reintentando el acuse…' : estadoAcuse === 'enviando' ? 'Registrando…' : 'Acusar recibo'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={estilos.acuse}>
                    Acusado por {e.acusado_por || 'un administrador'} el {formatearFechaHora(e.momento_acuse)}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

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
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },

  cintaPausa: { backgroundColor: colores.advertenciaSuave, borderBottomWidth: 1, borderBottomColor: colores.advertenciaBorde, paddingVertical: espacio.sm, paddingHorizontal: espacio.lg },
  cintaPausaTexto: { ...tipografia.meta, color: colores.advertencia },

  filtros: { flexDirection: 'row', gap: espacio.sm, paddingHorizontal: espacio.lg, paddingTop: espacio.md },
  filtro: { paddingVertical: espacio.sm, paddingHorizontal: espacio.md, borderRadius: radio.completo, borderWidth: 1, borderColor: colores.bordeCampo, backgroundColor: colores.superficie },
  filtroActivo: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  filtroTexto: { ...tipografia.meta, color: colores.textoSuave, fontWeight: '600' },
  filtroTextoActivo: { color: colores.primario },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  tarjetaPendiente: { borderColor: colores.errorBorde, borderLeftWidth: 4, borderLeftColor: colores.error },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.sm },
  origen: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  estado: { ...tipografia.micro, paddingVertical: 2, paddingHorizontal: espacio.sm, borderRadius: radio.completo },
  estadoPendiente: { backgroundColor: colores.errorSuave, color: colores.error },
  estadoAcusado: { backgroundColor: colores.superficieSuave, color: colores.textoSuave },
  terminos: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.xs, marginBottom: espacio.sm },
  termino: { paddingVertical: 2, paddingHorizontal: espacio.sm, borderRadius: radio.completo, backgroundColor: colores.errorSuave, borderWidth: 1, borderColor: colores.errorBorde },
  terminoTexto: { ...tipografia.micro, color: colores.error, letterSpacing: 0 },
  extracto: { ...tipografia.cuerpo, color: colores.texto, fontStyle: 'italic', marginBottom: espacio.sm },
  meta: { ...tipografia.meta, color: colores.textoSuave },
  boton: { ...piezas.botonPrimario, paddingVertical: espacio.md, marginTop: espacio.md },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },
  acuse: { ...tipografia.metaFuerte, color: colores.primario, marginTop: espacio.sm },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs, textAlign: 'center' },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', paddingHorizontal: espacio.xl },
});
