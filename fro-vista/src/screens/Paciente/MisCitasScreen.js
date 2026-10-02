// Ruta: fro-vista/src/screens/Paciente/MisCitasScreen.js
//
// Vista única de gestión de citas del paciente: muestra sus horas agendadas y
// concentra la acción de reservar en un botón flotante que abre el buscador.
// Reemplaza el flujo separado de agendamiento/búsqueda por uno continuo.

import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';

import apiClient, {
  actualizarAPaquete,
  getEvaluacionesPendientes,
  registrarEvaluacion,
  getConfirmacionesPendientes,
  pedirNuevaSolicitudConfirmacion,
  getMisListasEspera,
  salirListaEspera,
  tomarCupoListaEspera,
} from '../../api/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthContext } from '../../context/AuthContext';
import DialogoMotivo from '../../components/DialogoMotivo';
import ErrorRetry from '../../components/ErrorRetry';
// Las horas de la base son hora de pared: se formatean sin convertir huso.
import { formatearFechaHora as formatearFecha, parsearFecha } from '../../utils/fechas';
import { etiquetaModalidad, iconoModalidad } from '../../utils/modalidad';
import { ordenarCitas, esEstadoTerminal } from '../../utils/estados';
import SeccionHistorial from '../../components/SeccionHistorial';
import { colores, espacio, radio, sombra, tipografia, piezas, interaccion } from '../../theme';
import EtiquetaEstado from '../../components/EtiquetaEstado';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoEvaluacion from '../../components/DialogoEvaluacion';

// Estados desde los que el paciente todavía puede anular o mover la hora.
const ESTADOS_CANCELABLES = ['AGENDADA', 'CONFIRMADA'];

// Una cita va al historial cuando terminó (realizada, cancelada, inasistencia)
// o cuando su hora pasó hace más de un día sin cerrarse. Las que están en
// curso nunca se esconden.
const UN_DIA_MS = 24 * 60 * 60 * 1000;
function vaAlHistorial(cita) {
  if (esEstadoTerminal(cita.estado)) return true;
  if (cita.estado === 'EN_CURSO') return false;
  const inicio = parsearFecha(cita.fecha_hora_inicio);
  return Boolean(inicio) && Date.now() - inicio.getTime() > UN_DIA_MS;
}

export default function MisCitasScreen({ navigation, route }) {
  // Mis citas es el inicio del paciente: aquí va su saludo.
  const { userData } = useContext(AuthContext);
  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).
  const [aviso, setAviso] = useState(null);
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [errorRed, setErrorRed] = useState(false);
  const [cancelandoId, setCancelandoId] = useState(null);
  // CU21: citas con una solicitud de confirmación abierta.
  const [porConfirmar, setPorConfirmar] = useState([]);
  const [confirmandoId, setConfirmandoId] = useState(null);
  // CU19: bloques ocupados en los que el paciente está esperando su turno.
  const [listasEspera, setListasEspera] = useState([]);
  const [tomandoCupo, setTomandoCupo] = useState(null);
  // CU55: atenciones cerradas que todavía no se evalúan.
  const [porEvaluar, setPorEvaluar] = useState([]);
  const [evaluando, setEvaluando] = useState(null);
  const [enviandoEvaluacion, setEnviandoEvaluacion] = useState(false);
  // CU74: cambio de sesión unitaria a plan, con su diferencia.
  const [actualizandoId, setActualizandoId] = useState(null);

  const cargarCitas = useCallback(async (esRefresco = false) => {
    if (esRefresco) {
      setRefrescando(true);
    } else {
      setCargando(true);
    }
    setErrorRed(false);

    try {
      const { data } = await apiClient.get('/citas/mis-citas');
      setCitas(ordenarCitas(Array.isArray(data) ? data : []));

      // CU21 y CU19 viajan junto con las citas: son parte de la misma vista.
      // Si alguno falla, las citas se muestran igual.
      const [confirmaciones, listas, evaluaciones] = await Promise.all([
        getConfirmacionesPendientes().catch(() => ({ pendientes: [] })),
        getMisListasEspera().catch(() => ({ listas: [] })),
        getEvaluacionesPendientes().catch(() => ({ pendientes: [] })),
      ]);
      setPorConfirmar(confirmaciones.pendientes || []);
      setListasEspera(listas.listas || []);
      setPorEvaluar(evaluaciones.pendientes || []);
    } catch (error) {
      console.error('ERROR MIS CITAS:', error?.response?.data || error.message);
      setErrorRed(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargarCitas();
  }, [cargarCitas]);

  // Al volver del buscador, la lista se actualiza con la hora recién reservada.
  useEffect(() => {
    const quitarListener = navigation.addListener('focus', () => cargarCitas(true));
    return quitarListener;
  }, [navigation, cargarCitas]);

  // CU55: el aviso "Califica tu atención" llega con la cita a evaluar. Cuando
  // esa cita aparece entre las pendientes, el formulario se abre solo.
  const citaAEvaluar = route?.params?.evaluar_cita_id;
  useEffect(() => {
    if (!citaAEvaluar) return;
    const cita = porEvaluar.find((c) => Number(c.cita_id) === Number(citaAEvaluar));
    if (cita) {
      setEvaluando(cita);
      navigation.setParams({ evaluar_cita_id: undefined });
    }
  }, [citaAEvaluar, porEvaluar, navigation]);

  // CU22: cancelar exige un motivo, así que se pide en un diálogo propio.
  const [citaPorCancelar, setCitaPorCancelar] = useState(null);

  const cancelarCita = async (cita, motivo) => {
    setCitaPorCancelar(null);
    setCancelandoId(cita.cita_id);

    try {
      const { data } = await apiClient.post(`/citas/${cita.cita_id}/transicionar`, {
        evento: 'CANCELAR',
        motivo,
      });
      // A quien cancela no se le informa si había otros pacientes esperando
      // esa hora: la lista de espera es información de terceros.
      // RF74: cancelar con la anticipación mínima devuelve el pago de la sesión.
      if (data?.devolucion?.devuelto) {
        setAviso({
          tono: 'ok',
          titulo: 'Cita cancelada y pago devuelto',
          mensaje:
            `Como cancelaste con tiempo, te devolvimos $${Number(data.devolucion.devuelto).toLocaleString('es-CL')}. ` +
            'Lo verás como devolución en Pagos y Bonos.',
        });
      } else if (data?.devolucion?.sesion_en_plan) {
        setAviso({
          tono: 'info',
          titulo: 'Cita cancelada',
          mensaje: 'Tu hora fue liberada. La sesión sigue disponible en tu plan para cuando vuelvas a agendar.',
        });
      } else {
        setAviso({ tono: 'info', titulo: 'Cita cancelada', mensaje: 'Tu hora fue liberada correctamente.' });
      }
      await cargarCitas(true);
    } catch (error) {
      const respuesta = error.response?.data;
      setAviso({ tono: 'error', titulo: 'No se pudo cancelar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setCancelandoId(null);
    }
  };

  // CU17: reprogramar = elegir un bloque nuevo en el buscador de horas.
  const reprogramarCita = (cita) => {
    navigation.navigate('BuscarCita', {
      reprogramacion: {
        cita_id: cita.cita_id,
        fecha_original: cita.fecha_hora_inicio,
      },
    });
  };

  // ── CU21: confirmar o cancelar desde la app ────────────────────────────
  const responderSolicitud = async (cita, evento, motivo) => {
    setConfirmandoId(cita.cita_id);
    try {
      await apiClient.post(`/citas/${cita.cita_id}/transicionar`, {
        evento,
        ...(motivo ? { motivo } : {}),
      });
      setAviso({
        tono: 'ok',
        titulo: evento === 'CONFIRMAR' ? 'Asistencia confirmada' : 'Cita cancelada',
        mensaje:
          evento === 'CONFIRMAR'
            ? 'Gracias por confirmar. Te esperamos a la hora agendada.'
            : 'Tu cita quedó cancelada y el bloque se liberó.',
      });
      await cargarCitas(true);
    } catch (error) {
      // Excepción 4 del CU21: la respuesta no se pudo guardar.
      setAviso({
        tono: 'error',
        titulo: 'No se pudo guardar',
        mensaje:
          error.response?.data?.mensaje ||
          error.response?.data?.error ||
          'Refresca la pantalla e inténtalo otra vez.',
      });
    } finally {
      setConfirmandoId(null);
    }
  };

  // Excepción 2 del CU21: pedir un enlace nuevo cuando el anterior venció.
  const pedirOtroEnlace = async (cita) => {
    try {
      const datos = await pedirNuevaSolicitudConfirmacion(cita.cita_id);
      setAviso({ tono: 'ok', titulo: 'Solicitud reenviada', mensaje: datos.mensaje });
      await cargarCitas(true);
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo reenviar',
        mensaje: error.response?.data?.mensaje || 'Intenta nuevamente.',
      });
    }
  };

  // ── CU19: tomar el cupo o salir de la lista ────────────────────────────
  const tomarCupo = async (lista) => {
    setTomandoCupo(lista.lista_espera_id);
    try {
      const datos = await tomarCupoListaEspera(lista.lista_espera_id);
      setAviso({
        tono: 'ok',
        titulo: '¡Cupo tomado!',
        mensaje: datos.mensaje || 'La hora quedó agendada a tu nombre.',
      });
      await cargarCitas(true);
    } catch (error) {
      setAviso({
        tono: 'alerta',
        titulo: 'No se pudo tomar el cupo',
        mensaje:
          error.response?.data?.mensaje ||
          'El cupo ya no está disponible. Busca otro horario.',
        alCerrar: () => cargarCitas(true),
      });
    } finally {
      setTomandoCupo(null);
    }
  };

  const salirDeLista = async (lista) => {
    try {
      await salirListaEspera(lista.cita_id);
      await cargarCitas(true);
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo salir',
        mensaje: error.response?.data?.mensaje || 'Intenta nuevamente.',
      });
    }
  };

  // ── CU55: calificar una atención ya cerrada ───────────────────────────
  const enviarEvaluacion = async ({ puntuacion, resena }) => {
    if (!evaluando) return;
    setEnviandoEvaluacion(true);
    try {
      const datos = await registrarEvaluacion(evaluando.cita_id, { puntuacion, resena });
      setEvaluando(null);
      setAviso({
        tono: datos.resena_bloqueada ? 'alerta' : 'ok',
        titulo: datos.resena_bloqueada ? 'Aviso' : '¡Gracias!',
        mensaje: datos.mensaje,
      });
      await cargarCitas(true);
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo evaluar',
        mensaje: error.response?.data?.mensaje || 'Intenta nuevamente.',
      });
    } finally {
      setEnviandoEvaluacion(false);
    }
  };

  // ── CU74: pasar la sesión pagada a un plan, cobrando solo la diferencia ─
  const cambiarAPlan = async (cita, sesiones) => {
    setActualizandoId(cita.cita_id);
    try {
      const datos = await actualizarAPaquete(cita.cita_id, {
        sesiones,
        metodo_pago: 'TARJETA_OK',
      });
      setAviso({
        tono: datos.devolucion ? 'alerta' : 'ok',
        titulo: datos.devolucion ? 'Te devolvimos el pago' : 'Plan activado',
        mensaje: datos.mensaje,
      });
      await cargarCitas(true);
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo cambiar',
        mensaje: error.response?.data?.mensaje || 'Inténtalo nuevamente.',
      });
      await cargarCitas(true);
    } finally {
      setActualizandoId(null);
    }
  };

  const renderCita = ({ item }) => {
    const puedeCancelar = ESTADOS_CANCELABLES.includes(item.estado);
    const cancelando = cancelandoId === item.cita_id;
    const solicitud = porConfirmar.find((p) => Number(p.cita_id) === Number(item.cita_id));
    const confirmando = confirmandoId === item.cita_id;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.fecha}>{formatearFecha(item.fecha_hora_inicio)}</Text>
          <EtiquetaEstado estado={item.estado} style={styles.estadoPastilla} />
        </View>

        <Text style={styles.profesional}>
          Profesional: {item.nombre_profesional}
          {`  ·  ${iconoModalidad(item.modalidad)} ${etiquetaModalidad(item.modalidad)}`}
        </Text>

        {/* CU21: si hay una solicitud abierta, la cita se responde aquí mismo. */}
        {solicitud && (
          <View style={styles.cajaConfirmar}>
            <Text style={styles.confirmarTitulo}>
              {solicitud.vencida ? '⌛ El enlace de confirmación venció' : '📅 Confirma tu asistencia'}
            </Text>
            <Text style={styles.confirmarTexto}>
              {solicitud.vencida
                ? 'Puedes responder igual desde aquí, o pedir que te reenviemos el correo.'
                : 'Te enviamos esta solicitud por correo y aquí. Responde para mantener tu hora reservada.'}
            </Text>
            <View style={styles.filaAcciones}>
              <TouchableOpacity
                style={[styles.botonConfirmar, confirmando && styles.botonDeshabilitado]}
                onPress={() => responderSolicitud(item, 'CONFIRMAR')}
                disabled={confirmando}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={styles.botonConfirmarTexto}>
                  {confirmando ? 'Guardando…' : '✓ Confirmar asistencia'}
                </Text>
              </TouchableOpacity>
            </View>
            {solicitud.vencida && (
              <TouchableOpacity onPress={() => pedirOtroEnlace(item)}>
                <Text style={styles.enlaceReenviar}>Enviarme un enlace nuevo</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* CU73: sin pago la hora es una reserva temporal. Pagada, queda a la
            espera de que el profesional la confirme. */}
        {item.estado === 'AGENDADA' && !item.pago_tipo && (
          <TouchableOpacity
            style={styles.botonPagar}
            onPress={() => navigation.navigate('PagarReserva', { citaId: item.cita_id })}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={styles.botonPagarTexto}>💳 Pagar esta hora</Text>
          </TouchableOpacity>
        )}
        {item.estado === 'AGENDADA' && item.pago_tipo ? (
          <Text style={styles.notaPagada}>
            ✓ {item.pago_tipo === 'SESION_PLAN' ? 'Cubierta con tu plan' : 'Pagada'} · esperando que el profesional confirme
          </Text>
        ) : null}

        {/* CU74: cambiar la sesión suelta por un plan, pagando la diferencia. */}
        {['AGENDADA', 'CONFIRMADA'].includes(item.estado) && item.pago_tipo === 'PRESTACION' && (
          <View style={styles.cajaPlan}>
            <Text style={styles.planTexto}>
              ¿Vas a necesitar más sesiones? Cambia a un plan y paga solo la diferencia.
            </Text>
            <View style={styles.filaPlanes}>
              {[10, 15, 20].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.botonPlan, actualizandoId === item.cita_id && styles.botonDeshabilitado]}
                  onPress={() => cambiarAPlan(item, n)}
                  disabled={actualizandoId === item.cita_id}
                  activeOpacity={interaccion.opacidadActiva}
                >
                  <Text style={styles.botonPlanTexto}>Plan {n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* CU39/CU43: evidencia de la sesión (check-in GPS o teleconsulta) */}
        {['CONFIRMADA', 'EN_CURSO'].includes(item.estado) && (
          <TouchableOpacity
            style={styles.botonEvidencia}
            onPress={() =>
              navigation.navigate('EvidenciaSesion', {
                citaId: item.cita_id,
                modalidad: item.modalidad,
              })
            }
          >
            <Text style={styles.botonEvidenciaTexto}>🛰️ Evidencia de sesión</Text>
          </TouchableOpacity>
        )}

        {puedeCancelar && (
          <View style={styles.filaAcciones}>
            <TouchableOpacity
              style={styles.botonReprogramar}
              onPress={() => reprogramarCita(item)}
              disabled={cancelando}
            >
              <Text style={styles.botonReprogramarTexto}>Reprogramar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.botonCancelar, cancelando && styles.botonDeshabilitado]}
              onPress={() => setCitaPorCancelar(item)}
              disabled={cancelando}
            >
              <Text style={styles.botonCancelarTexto}>
                {cancelando ? 'Cancelando…' : 'Cancelar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // Saludo del inicio, con el acceso a Pagos y bonos arriba a la derecha.
  const encabezado = (
    <View style={styles.saludoFila}>
      <View style={styles.saludoTextos}>
        <Text style={styles.saludo}>Hola,</Text>
        <Text style={styles.saludoNombre} numberOfLines={1}>
          {userData?.nombres || 'Usuario'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.botonPagos}
        onPress={() => navigation.navigate('Pagos')}
        activeOpacity={interaccion.opacidadActiva}
        accessibilityRole="button"
      >
        <Ionicons name="card-outline" size={18} color={colores.primario} />
        <Text style={styles.botonPagosTexto}>Pagos y bonos</Text>
      </TouchableOpacity>
    </View>
  );

  if (cargando) {
    return (
      <View style={styles.contenedor}>
        {encabezado}
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={colores.primario} />
        </View>
      </View>
    );
  }

  const citasHistorial = citas.filter(vaAlHistorial);
  const citasVigentes = citas.filter((c) => !vaAlHistorial(c));

  if (errorRed) {
    return (
      <View style={styles.contenedor}>
        {encabezado}
        <View style={styles.centrado}>
          <ErrorRetry
            mensaje="No pudimos cargar tus citas. Revisa tu conexión."
            onRetry={() => cargarCitas(false)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      {encabezado}
      <FlatList
        data={citasVigentes}
        keyExtractor={(item) => String(item.cita_id)}
        renderItem={renderCita}
        contentContainerStyle={styles.lista}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => cargarCitas(true)}
            colors={[colores.primario]}
          />
        }
        ListHeaderComponent={
          <>
            {/* CU55 — Excepción 2: si el formulario no alcanzó a mostrarse al
                cerrar la sesión, queda este acceso directo. */}
            {porEvaluar.length > 0 && (
              <View style={styles.bloqueEvaluar}>
                <Text style={styles.esperaTitulo}>Califica tu atención</Text>
                {porEvaluar.map((cita) => (
                  <View key={cita.cita_id} style={styles.tarjetaEvaluar}>
                    <Text style={styles.esperaFecha}>
                      {formatearFecha(cita.fecha_hora_inicio)} · {cita.profesional}
                    </Text>
                    <Text style={styles.esperaDato}>
                      Tu opinión ayuda a otros pacientes a elegir.
                    </Text>
                    <TouchableOpacity
                      style={styles.botonEvaluar}
                      onPress={() => setEvaluando(cita)}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <Text style={styles.botonEvaluarTexto}>★ Calificar</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {listasEspera.length > 0 ? (
            <View style={styles.bloqueEspera}>
              <Text style={styles.esperaTitulo}>En lista de espera</Text>
              {listasEspera.map((lista) => {
                const esMiTurno = lista.estado === 'NOTIFICADO';
                return (
                  <View
                    key={lista.lista_espera_id}
                    style={[styles.tarjetaEspera, esMiTurno && styles.tarjetaTurno]}
                  >
                    <Text style={styles.esperaFecha}>
                      {formatearFecha(lista.fecha_hora_inicio)} · {lista.profesional}
                    </Text>
                    <Text style={styles.esperaDato}>
                      {esMiTurno
                        ? '🎟️ ¡Es tu turno! El cupo se liberó y es tuyo si lo tomas ahora.'
                        : `Posición ${lista.posicion} de ${lista.en_espera} · ${lista.especialidad}`}
                    </Text>

                    {esMiTurno ? (
                      <TouchableOpacity
                        style={[
                          styles.botonTomarCupo,
                          tomandoCupo === lista.lista_espera_id && styles.botonDeshabilitado,
                        ]}
                        onPress={() => tomarCupo(lista)}
                        disabled={tomandoCupo === lista.lista_espera_id}
                        activeOpacity={interaccion.opacidadActiva}
                      >
                        <Text style={styles.botonTomarCupoTexto}>
                          {tomandoCupo === lista.lista_espera_id ? 'Reservando…' : 'Tomar el cupo'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.botonSalirLista}
                        onPress={() => salirDeLista(lista)}
                        activeOpacity={interaccion.opacidadActiva}
                        accessibilityRole="button"
                      >
                        <Text style={styles.botonSalirListaTexto}>Salir de la lista de espera</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text style={styles.vacioIcono}>📅</Text>
            <Text style={styles.vacioTitulo}>
              {citasHistorial.length > 0 ? 'No tienes citas próximas' : 'Aún no tienes citas'}
            </Text>
            <Text style={styles.vacioTexto}>
              Toca el botón ＋ de la barra inferior para buscar disponibilidad y reservar una hora.
            </Text>
          </View>
        }
        ListFooterComponent={
          <SeccionHistorial
            cantidad={citasHistorial.length}
            ayuda="Citas realizadas, canceladas o ya pasadas"
          >
            {citasHistorial.map((item) => (
              <React.Fragment key={String(item.cita_id)}>{renderCita({ item })}</React.Fragment>
            ))}
          </SeccionHistorial>
        }
      />

      {/* CU22: la cancelación requiere justificación */}
      <DialogoMotivo
        visible={citaPorCancelar !== null}
        titulo="Cancelar cita"
        descripcion={
          citaPorCancelar
            ? `Hora del ${formatearFecha(citaPorCancelar.fecha_hora_inicio)} con ${citaPorCancelar.nombre_profesional}. Indica el motivo de la cancelación:`
            : ''
        }
        etiquetaConfirmar="Cancelar cita"
        onConfirmar={(motivo) => cancelarCita(citaPorCancelar, motivo)}
        onCancelar={() => setCitaPorCancelar(null)}
      />
    <DialogoEvaluacion
      visible={evaluando !== null}
      profesional={evaluando?.profesional}
      enviando={enviandoEvaluacion}
      onEnviar={enviarEvaluacion}
      onCancelar={() => setEvaluando(null)}
    />
    <DialogoAviso
      visible={aviso !== null}
      titulo={aviso?.titulo || ''}
      mensaje={aviso?.mensaje}
      tono={aviso?.tono}
      onCerrar={() => {
        const seguir = aviso?.alCerrar;
        setAviso(null);
        if (seguir) seguir();
      }}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.fondo },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  lista: { padding: 16, paddingTop: espacio.xs, paddingBottom: espacio.xxl },

  // Saludo del inicio y acceso a Pagos y bonos.
  saludoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.md,
    paddingHorizontal: espacio.base,
    paddingTop: espacio.lg,
    paddingBottom: espacio.md,
    backgroundColor: colores.fondo,
  },
  saludoTextos: { flex: 1 },
  saludo: { ...tipografia.cuerpo, color: colores.textoSuave },
  saludoNombre: { ...tipografia.display, color: colores.textoTitulo },
  botonPagos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.primarioBorde,
    backgroundColor: colores.superficie,
    ...sombra.suave,
  },
  botonPagosTexto: { ...tipografia.metaFuerte, color: colores.primario },

  card: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 16,
    marginBottom: 12,
    ...sombra.suave,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  fecha: { flex: 1, fontSize: 15, fontWeight: 'bold', color: colores.texto, textTransform: 'capitalize' },
  estadoPastilla: { marginLeft: espacio.sm },
  profesional: { color: colores.textoSuave },

  filaAcciones: { flexDirection: 'row', gap: 10, marginTop: 12 },
  botonEvidencia: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colores.primario,
    borderRadius: radio.sm,
    padding: 10,
    alignItems: 'center',
  },
  botonEvidenciaTexto: { color: colores.primario, fontWeight: 'bold' },
  botonReprogramar: {
    flex: 1,
    borderWidth: 1,
    borderColor: colores.primario,
    borderRadius: radio.sm,
    padding: 10,
    alignItems: 'center',
  },
  botonReprogramarTexto: { color: colores.primario, fontWeight: 'bold' },
  botonCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: colores.error,
    borderRadius: radio.sm,
    padding: 10,
    alignItems: 'center',
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonCancelarTexto: { color: colores.error, fontWeight: 'bold' },

  vacio: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  vacioIcono: { fontSize: 48, marginBottom: 12 },
  vacioTitulo: { fontSize: 17, fontWeight: 'bold', color: colores.texto, marginBottom: 6 },
  vacioTexto: { color: colores.textoSuave, textAlign: 'center' },

  // CU21 — la solicitud de confirmación, dentro de la tarjeta de la cita.
  cajaConfirmar: {
    marginTop: espacio.md,
    padding: espacio.md,
    borderRadius: radio.md,
    backgroundColor: colores.primarioSuave,
    borderWidth: 1,
    borderColor: colores.primarioBorde,
  },
  confirmarTitulo: { ...tipografia.cuerpoFuerte, color: colores.primario },
  confirmarTexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2, marginBottom: espacio.sm },
  botonConfirmar: {
    flex: 1,
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonConfirmarTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  enlaceReenviar: { ...tipografia.metaFuerte, color: colores.secundario, marginTop: espacio.sm },

  // CU73 — la cita agendada está reservada pero no pagada.
  botonPagar: {
    marginTop: espacio.md,
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonPagarTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  notaPagada: { ...tipografia.meta, color: colores.exito, marginTop: espacio.sm },

  // CU74 — cambio a plan desde la cita ya pagada.
  cajaPlan: {
    marginTop: espacio.md,
    padding: espacio.md,
    borderRadius: radio.md,
    backgroundColor: colores.secundarioSuave,
    borderWidth: 1,
    borderColor: colores.secundarioBorde,
  },
  planTexto: { ...tipografia.meta, color: colores.secundarioFuerte },
  filaPlanes: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.sm },
  botonPlan: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colores.secundarioFuerte,
    borderRadius: radio.md,
    paddingVertical: espacio.sm,
    alignItems: 'center',
  },
  botonPlanTexto: { ...tipografia.metaFuerte, color: colores.secundarioFuerte },

  // CU55 — atenciones cerradas pendientes de calificar.
  bloqueEvaluar: { marginBottom: espacio.lg },
  tarjetaEvaluar: {
    ...piezas.tarjeta,
    marginBottom: espacio.md,
    backgroundColor: colores.secundarioSuave,
    borderColor: colores.secundarioBorde,
  },
  botonEvaluar: {
    marginTop: espacio.sm,
    borderWidth: 1.5,
    borderColor: colores.secundarioFuerte,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonEvaluarTexto: { ...tipografia.cuerpoFuerte, color: colores.secundarioFuerte },

  // CU19 — los bloques que el paciente está esperando.
  bloqueEspera: { marginBottom: espacio.lg },
  esperaTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.sm },
  tarjetaEspera: { ...piezas.tarjeta, marginBottom: espacio.md },
  // Cuando el cupo es suyo la tarjeta cambia de color: es una oportunidad con
  // plazo, no un dato más de la lista.
  tarjetaTurno: { borderColor: colores.exito, borderWidth: 1.5, backgroundColor: colores.exitoSuave },
  esperaFecha: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  esperaDato: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  botonTomarCupo: {
    marginTop: espacio.sm,
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonTomarCupoTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  botonSalirLista: {
    marginTop: espacio.md,
    borderWidth: 1.5,
    borderColor: colores.error,
    borderRadius: radio.md,
    paddingVertical: espacio.sm,
    alignItems: 'center',
    backgroundColor: colores.superficie,
  },
  botonSalirListaTexto: { ...tipografia.metaFuerte, color: colores.error },

});
