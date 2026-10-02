import React, { useEffect, useState, useContext } from 'react';
import {
  Image,
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';

import apiClient, { inscribirseListaEspera } from '../../api/client';
import { AuthContext } from '../../context/AuthContext';
import DialogoMotivo from '../../components/DialogoMotivo';
import ErrorRetry from '../../components/ErrorRetry';
// El formateador local de arriba arma AAAA-MM-DD para el servidor; este es para mostrar.
import { formatearFecha as fechaLegible } from '../../utils/fechas';
import { colores, radio, espacio, tipografia, sombra, interaccion } from '../../theme';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ─── CU14: Motor de búsqueda de citas
// ─── CU15: Bloqueo síncrono del horario seleccionado
// ─── CU17: la misma pantalla sirve para reprogramar una cita existente
//          cuando llega route.params.reprogramacion = { cita_id }
export default function BuscarCitaScreen({ navigation, route }) {
  const { userData } = useContext(AuthContext);
  const reprogramacion = route?.params?.reprogramacion || null;
  // La barra de confirmación va fija abajo: hay que respetar el gesto del sistema.
  const bordes = useSafeAreaInsets();

  // CU17: motivo pendiente mientras se muestra el diálogo
  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).
  const [aviso, setAviso] = useState(null);
  // Confirmaciones con el diálogo de la app (el Alert nativo no se estiliza).
  const [confirmacion, setConfirmacion] = useState(null);
  const [pedirMotivoReprogramacion, setPedirMotivoReprogramacion] = useState(false);

  // ── CU14: filtros de búsqueda ─────────────────────────────────────────────
  const [especialidades, setEspecialidades] = useState([]);
  const [especialidadId, setEspecialidadId] = useState('');
  const [tipoSede, setTipoSede] = useState('DOMICILIO');
  const [fechaSeleccionada, setFechaSeleccionada] = useState('');
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [nombreProfesional, setNombreProfesional] = useState('');
  const [disponibilidad, setDisponibilidad] = useState([]);
  // Lo que el servidor aplicó: comuna del paciente y cuántos quedaron fuera.
  const [filtroAplicado, setFiltroAplicado] = useState(null);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);
  const [errorEspecialidades, setErrorEspecialidades] = useState(false);

  // ── CU15: bloqueo del horario ─────────────────────────────────────────────
  const [bloqueSeleccionado, setBloqueSeleccionado] = useState(null);
  const [cargandoBloqueo, setCargandoBloqueo] = useState(false);
  // CU19: inscripción en la lista de espera de un bloque ya tomado.
  const [inscribiendo, setInscribiendo] = useState(null);

  useEffect(() => {
    cargarEspecialidades();
  }, []);

  const formatearFecha = (fecha) => {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ── CU14 — Excepción 1: fallo al cargar especialidades ───────────────────
  const cargarEspecialidades = async () => {
    setErrorEspecialidades(false);
    try {
      const response = await apiClient.get('/citas/especialidades');
      const data = response.data.data || [];
      setEspecialidades(data);
      if (data.length > 0) {
        setEspecialidadId(String(data[0].especialidad_id));
      }
    } catch (error) {
      // Excepción 1: el servicio de catálogos no carga las especialidades
      setErrorEspecialidades(true);
    }
  };

  // ── CU14 — Buscar disponibilidad (Excepción 2 si no hay resultados) ───────
  const buscarDisponibilidad = async () => {
    if (!especialidadId || !tipoSede || !fechaSeleccionada) {
      setAviso({ tono: 'error', titulo: 'Campos incompletos', mensaje: 'Debe seleccionar especialidad, modalidad y fecha.' });
      return;
    }
    setBloqueSeleccionado(null);
    setCargandoBusqueda(true);
    try {
      const response = await apiClient.get('/citas/disponibilidad', {
        params: {
          especialidad_id: especialidadId,
          tipo_sede: tipoSede,
          fecha: fechaSeleccionada,
          // Filtro adicional: se suma a especialidad, modalidad y fecha.
          ...(nombreProfesional.trim() ? { nombre: nombreProfesional.trim() } : {}),
        },
      });
      setDisponibilidad(response.data.data || []);
      setFiltroAplicado(response.data.filtro || null);
      // Excepción 2 se muestra visualmente cuando disponibilidad.length === 0
    } catch (error) {
      setAviso({ tono: 'error', titulo: 'Error', mensaje: error.response?.data?.error || 'No se pudo obtener la disponibilidad.' });
    } finally {
      setCargandoBusqueda(false);
    }
  };

  // ── CU14 → CU15: el paciente selecciona un bloque y confirma ─────────────
  // CU10/CU14: perfil público completo del profesional, de solo lectura.
  const verPerfil = (item) =>
    navigation.navigate('PerfilProfesional', {
      profesionalId: item.profesional_id,
      nombre: `${item.nombres} ${item.apellido_paterno}`,
    });

  const seleccionarBloque = (item) => {
    setBloqueSeleccionado(item);
  };

  // ── CU19: anotarse en la lista de espera de un bloque ocupado ───────────
  const anotarseEnEspera = async (item) => {
    setInscribiendo(item.cita_id);
    try {
      const datos = await inscribirseListaEspera(item.cita_id);
      setAviso({
        tono: 'ok',
        titulo: 'Quedaste en la lista',
        mensaje:
          `${datos.mensaje} Si el bloque se libera te avisamos, y si eres el primero ` +
          'tendrás un plazo para tomarlo antes de que pase al siguiente.',
        alCerrar: buscarDisponibilidad,
      });
    } catch (error) {
      const err = error.response?.data;
      // Excepción 1: la lista llegó a su tope.
      setAviso({
        tono: err?.error === 'LISTA_COMPLETA' ? 'alerta' : 'error',
        titulo: err?.error === 'LISTA_COMPLETA' ? 'Lista completa' : 'No se pudo inscribir',
        mensaje:
          err?.mensaje ||
          // Excepción 2: falla de sincronización al guardar la posición.
          'No pudimos guardar tu lugar en la lista. Vuelve a intentarlo.',
        alCerrar: err?.error ? buscarDisponibilidad : undefined,
      });
    } finally {
      setInscribiendo(null);
    }
  };

  // ── CU15: confirmar y bloquear el horario ─────────────────────────────────
  const confirmarAgendamiento = () => {
    if (!bloqueSeleccionado) return;

    const { nombres, apellido_paterno, apellido_materno, fecha, hora_inicio, hora_fin } =
      bloqueSeleccionado;

    // CU17: en modo reprogramación, el bloque elegido pasa a ser el nuevo
    // horario de la cita existente; se pide el motivo y se envía el cambio.
    if (reprogramacion) {
      setConfirmacion({
        titulo: 'Confirmar nuevo horario',
        mensaje: `¿Mover tu cita al bloque ${hora_inicio.slice(0, 5)} – ${hora_fin.slice(0, 5)} del ${fechaLegible(fecha)}, con ${nombres} ${apellido_paterno} ${apellido_materno || ''}?`,
        etiqueta: 'Continuar',
        accion: () => setPedirMotivoReprogramacion(true),
      });
      return;
    }

    setConfirmacion({
      titulo: 'Confirmar reserva',
      mensaje: `¿Reservar el bloque ${hora_inicio.slice(0, 5)} – ${hora_fin.slice(0, 5)} del ${fechaLegible(fecha)}, con ${nombres} ${apellido_paterno} ${apellido_materno || ''}?`,
      etiqueta: 'Reservar',
      accion: ejecutarBloqueo,
    });
  };

  // ── CU17: enviar la reprogramación con su motivo ──────────────────────────
  const ejecutarReprogramacion = async (motivo) => {
    setPedirMotivoReprogramacion(false);
    setCargandoBloqueo(true);

    const fecha_hora_inicio = `${bloqueSeleccionado.fecha} ${bloqueSeleccionado.hora_inicio}`;
    const fecha_hora_fin = `${bloqueSeleccionado.fecha} ${bloqueSeleccionado.hora_fin}`;

    try {
      const { data } = await apiClient.post(
        `/citas/${reprogramacion.cita_id}/reprogramar`,
        { fecha_hora_inicio, fecha_hora_fin, motivo }
      );

      setAviso({
        tono: 'ok',
        titulo: 'Cita reprogramada',
        mensaje: data?.mensaje || 'Tu cita quedó en el nuevo horario.',
        alCerrar: () => navigation.goBack(),
      });
    } catch (error) {
      const respuesta = error.response?.data;
      setAviso({ tono: 'error', titulo: 'No se pudo reprogramar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
      // Si el bloque fue tomado por otro (colisión), refrescar la búsqueda.
      if (respuesta?.error === 'BLOQUE_OCUPADO') {
        setBloqueSeleccionado(null);
        buscarDisponibilidad();
      }
    } finally {
      setCargandoBloqueo(false);
    }
  };

  const ejecutarBloqueo = async () => {
    setCargandoBloqueo(true);

    const fecha_hora_inicio = `${bloqueSeleccionado.fecha} ${bloqueSeleccionado.hora_inicio}`;
    const fecha_hora_fin = `${bloqueSeleccionado.fecha} ${bloqueSeleccionado.hora_fin}`;

    try {
      const { data } = await apiClient.post('/citas/bloquear', {
        profesional_id: bloqueSeleccionado.profesional_id,
        sede_id: bloqueSeleccionado.sede_id,
        fecha_hora_inicio,
        fecha_hora_fin,
        // CU39/CU43: la modalidad de la cita define su evidencia.
        modalidad: bloqueSeleccionado.tipo_sede === 'AMBOS' ? 'DOMICILIO' : bloqueSeleccionado.tipo_sede,
      });

      // Poscondición CU15: bloque reservado exclusivamente.
      // CU73: la reserva es temporal hasta que se paga, así que el paso
      // siguiente es el cobro anticipado, no volver al listado.
      setAviso({
        tono: 'ok',
        titulo: 'Bloque reservado',
        mensaje:
          `Reservamos el ${fechaLegible(bloqueSeleccionado.fecha)} de ` +
          `${bloqueSeleccionado.hora_inicio.slice(0, 5)} a ${bloqueSeleccionado.hora_fin.slice(0, 5)}. ` +
          'Ahora completa el pago; después el profesional confirmará la cita.',
        alCerrar: () => {
          setBloqueSeleccionado(null);
          setDisponibilidad([]);
          navigation.navigate('PagarReserva', { citaId: data.cita_id });
        },
      });
    } catch (error) {
      const err = error.response?.data;

      // CU15 — Excepción 2: token caducado
      if (error.response?.status === 401) {
        setAviso({ tono: 'error', titulo: 'Sesión expirada', mensaje: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.' });
        return;
      }

      // CU15 — Excepción 4: colisión de reserva simultánea. Una hora que ya
      // pasó mientras la pantalla estaba abierta se trata igual.
      if (err?.error === 'BLOQUE_OCUPADO' || err?.error === 'HORA_PASADA') {
        setAviso({
          tono: 'alerta',
          titulo: 'Horario no disponible',
          mensaje: err.mensaje,
          etiqueta: 'Elegir otro horario',
          alCerrar: () => {
            setBloqueSeleccionado(null);
            buscarDisponibilidad(); // refrescar la lista
          },
        });
        return;
      }

      // CU15 — Excepción 1: pérdida de conexión
      if (!error.response) {
        setAviso({ tono: 'error', titulo: 'Sin conexión', mensaje: 'Verifica tu conexión a internet e intenta nuevamente.' });
        return;
      }

      setAviso({ tono: 'error', titulo: 'Error', mensaje: err?.error || 'No se pudo completar la reserva. Intenta nuevamente.' });
    } finally {
      setCargandoBloqueo(false);
    }
  };

  // ─ CU14 — Excepción 1: mostrar pantalla de reintento 
  if (errorEspecialidades) {
    return (
      <ErrorRetry
        mensaje="El servicio de especialidades no está disponible momentáneamente. Verifica tu conexión e intenta de nuevo."
        onRetry={cargarEspecialidades}
      />
    );
  }

  return (
    <View style={styles.pantalla}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bloqueSeleccionado ? 140 : 40 }}
    >
      <Text style={styles.title}>
        {reprogramacion ? 'Reprogramar cita' : 'Buscar cita médica'}
      </Text>

      {reprogramacion && (
        <View style={styles.bannerReprogramacion}>
          <Text style={styles.bannerTexto}>
            Estás eligiendo un nuevo horario para tu cita. El bloque actual se
            liberará al confirmar.
          </Text>
        </View>
      )}

      {/* ─ Filtros CU14  */}
      <Text style={styles.label}>Especialidad</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={especialidadId}
          onValueChange={(value) => {
            setEspecialidadId(String(value));
            setDisponibilidad([]);
            setBloqueSeleccionado(null);
          }}
        >
          {especialidades.map((item) => (
            <Picker.Item
              key={item.especialidad_id}
              label={item.nombre}
              value={String(item.especialidad_id)}
            />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Modalidad de atención</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={tipoSede}
          onValueChange={(value) => {
            setTipoSede(value);
            setDisponibilidad([]);
            setBloqueSeleccionado(null);
          }}
        >
          {/* A domicilio primero: es la opción por defecto y la más usada. */}
          <Picker.Item label="Atención Domiciliaria" value="DOMICILIO" />
          <Picker.Item label="Teleconsulta Online" value="ONLINE" />
          <Picker.Item label="Ambas modalidades" value="AMBOS" />
        </Picker>
      </View>

      <Text style={styles.label}>Fecha</Text>
      <TouchableOpacity style={styles.fechaBtn} onPress={() => setMostrarCalendario(true)}>
        <Text style={styles.fechaBtnText}>
          {fechaSeleccionada ? `📅  ${fechaLegible(fechaSeleccionada)}` : '📅  Seleccionar fecha'}
        </Text>
      </TouchableOpacity>

      {mostrarCalendario && (
        <DateTimePicker
          value={fechaSeleccionada ? new Date(`${fechaSeleccionada}T00:00:00`) : new Date()}
          // No tiene sentido agendar hacia atrás: el calendario parte hoy.
          minimumDate={new Date()}
          mode="date"
          display="default"
          // El calendario nativo sale azul si no se le pasan los colores.
          accentColor={colores.primario}
          textColor={colores.texto}
          positiveButton={{ label: 'Aceptar', textColor: colores.primario }}
          negativeButton={{ label: 'Cancelar', textColor: colores.textoSuave }}
          onChange={(event, selectedDate) => {
            setMostrarCalendario(false);
            if (selectedDate) {
              setFechaSeleccionada(formatearFecha(selectedDate));
              setDisponibilidad([]);
              setBloqueSeleccionado(null);
            }
          }}
        />
      )}

      <Text style={styles.label}>Profesional (opcional)</Text>
      <TextInput
        style={styles.campoNombre}
        placeholder="Buscar por nombre o apellido"
        placeholderTextColor={colores.textoTenue}
        value={nombreProfesional}
        onChangeText={setNombreProfesional}
        autoCorrect={false}
      />
      <Text style={styles.ayudaFiltro}>
        Déjalo vacío para ver a todos los profesionales de la especialidad.
      </Text>

      <TouchableOpacity
        style={[styles.btnBuscar, cargandoBusqueda && styles.btnDeshabilitado]}
        onPress={buscarDisponibilidad}
        disabled={cargandoBusqueda}
      >
        {cargandoBusqueda ? (
          <ActivityIndicator color={colores.superficie} />
        ) : (
          <Text style={styles.btnTexto}>Buscar disponibilidad</Text>
        )}
      </TouchableOpacity>

      {/* ─ CU14 — Excepción 2: sin resultados  */}
      {!cargandoBusqueda && disponibilidad.length === 0 && fechaSeleccionada !== '' && (
        <View style={styles.sinResultados}>
          <Text style={styles.sinResultadosTexto}>
            No hay profesionales disponibles para los filtros seleccionados.
          </Text>
          <Text style={styles.sinResultadosHint}>
            Prueba cambiando la fecha, la especialidad o la modalidad
            {nombreProfesional.trim() ? ', o borra el nombre del profesional' : ''}.
          </Text>
          {filtroAplicado?.descartados_por_comuna > 0 && (
            <Text style={styles.sinResultadosHint}>
              {filtroAplicado.descartados_por_comuna} hora(s) quedaron fuera porque
              esos profesionales no atienden a domicilio en
              {filtroAplicado.comuna_paciente ? ` ${filtroAplicado.comuna_paciente}` : ' tu comuna'}.
              Puedes buscarlas como teleconsulta.
            </Text>
          )}
        </View>
      )}

      {/* ─ Lista de bloques disponibles  */}
      {disponibilidad.length > 0 && (
        <>
          <Text style={styles.subtitulo}>Selecciona un bloque horario</Text>
          {filtroAplicado?.comuna_paciente && tipoSede !== 'ONLINE' && (
            <Text style={styles.ayudaFiltro}>
              Atención a domicilio en {filtroAplicado.comuna_paciente}, la comuna de tu cuenta.
            </Text>
          )}
          {disponibilidad.map((item, index) => {
            const estaSeleccionado =
              !item.ocupado &&
              bloqueSeleccionado?.profesional_id === item.profesional_id &&
              bloqueSeleccionado?.hora_inicio === item.hora_inicio &&
              bloqueSeleccionado?.fecha === item.fecha;

            // CU19: un bloque tomado no se puede reservar, pero sí esperar.
            if (item.ocupado) {
              const enLista = Boolean(item.mi_posicion);
              const bloqueado = item.es_mi_cita || item.lista_llena || enLista;
              return (
                <View
                  key={`ocupado-${item.profesional_id}-${item.hora_inicio}-${index}`}
                  style={[styles.card, styles.cardOcupada]}
                >
                  <Text style={styles.nombreOcupado}>
                    {item.nombres} {item.apellido_paterno} {item.apellido_materno || ''}
                  </Text>
                  <Text style={styles.detalle}>🏥  {item.especialidad}</Text>
                  <View style={styles.datosCita}>
                    <Text style={styles.detalle}>📅  {fechaLegible(item.fecha)}</Text>
                    <Text style={styles.bloqueOcupado}>
                      🕐  {item.hora_inicio.slice(0, 5)} – {item.hora_fin.slice(0, 5)} · bloque tomado
                    </Text>
                    <Text style={styles.detalle}>
                      {item.en_espera > 0
                        ? `👥  ${item.en_espera} persona(s) en lista de espera`
                        : '👥  Nadie en la lista de espera todavía'}
                    </Text>

                    {item.es_mi_cita ? (
                      <Text style={styles.notaEspera}>Esta hora ya es tuya.</Text>
                    ) : enLista ? (
                      <Text style={styles.notaEspera}>
                        Ya estás en esta lista, en la posición {item.mi_posicion}.
                      </Text>
                    ) : item.lista_llena ? (
                      <Text style={styles.notaEspera}>
                        La lista de espera está completa. Prueba con otro horario o profesional.
                      </Text>
                    ) : null}

                    {!bloqueado && (
                      <TouchableOpacity
                        style={[
                          styles.btnEspera,
                          inscribiendo === item.cita_id && styles.btnDeshabilitado,
                        ]}
                        onPress={() => anotarseEnEspera(item)}
                        disabled={inscribiendo === item.cita_id}
                      >
                        <Text style={styles.btnEsperaTexto}>
                          {inscribiendo === item.cita_id
                            ? 'Inscribiendo…'
                            : '🔔 Avisarme si se libera'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={`${item.profesional_id}-${item.hora_inicio}-${index}`}
                style={[styles.card, estaSeleccionado && styles.cardSeleccionada]}
                onPress={() => seleccionarBloque(item)}
              >
                {/* CU10: la foto del perfil público ayuda a reconocer al
                    profesional antes de reservar. Sin foto, sus iniciales. */}
                <View style={styles.cabeceraProfesional}>
                  {/* Tocar la foto o el nombre abre su perfil público completo. */}
                  <TouchableOpacity onPress={() => verPerfil(item)} activeOpacity={interaccion.opacidadActiva}>
                    {item.foto_url ? (
                      <Image source={{ uri: item.foto_url }} style={styles.foto} />
                    ) : (
                      <View style={[styles.foto, styles.fotoVacia]}>
                        <Text style={styles.iniciales}>
                          {`${item.nombres?.[0] || ''}${item.apellido_paterno?.[0] || ''}`.toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.datosProfesional}>
                    <TouchableOpacity
                      onPress={() => verPerfil(item)}
                      activeOpacity={interaccion.opacidadActiva}
                      accessibilityRole="link"
                      accessibilityHint="Abre el perfil público del profesional"
                    >
                      <Text style={styles.nombre}>
                        {item.nombres} {item.apellido_paterno} {item.apellido_materno || ''}
                      </Text>
                      {/* En su propia línea: junto al nombre quedaba cortado. */}
                      <Text style={styles.verPerfil}>Ver perfil ›</Text>
                    </TouchableOpacity>
                    <Text style={styles.detalle}>🏥  {item.especialidad}</Text>

                    {/* CU58 — Excepción 2: sin evaluaciones no se muestra un
                        promedio inventado, se dice que el perfil es nuevo. */}
                    {item.total_evaluaciones > 0 ? (
                      <TouchableOpacity
                        onPress={() =>
                          navigation.navigate('ResenasProfesional', {
                            profesionalId: item.profesional_id,
                            nombre: `${item.nombres} ${item.apellido_paterno}`,
                          })
                        }
                      >
                        <Text style={styles.calificacion}>
                          {'★'.repeat(Math.round(item.calificacion))}
                          {'☆'.repeat(5 - Math.round(item.calificacion))}{'  '}
                          {item.calificacion.toFixed(1)} ({item.total_evaluaciones})
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.perfilIncipiente}>Perfil nuevo · sin evaluaciones aún</Text>
                    )}
                  </View>
                </View>
                {/* CU10: catálogo público del profesional */}
                {item.areas_experticia ? (
                  <Text style={[styles.detalle, styles.experticia]}>🎯  {item.areas_experticia}</Text>
                ) : null}
                {/* Quién atiende y qué se reserva son dos lecturas distintas:
                    los datos del bloque van separados de los del profesional. */}
                <View style={styles.datosCita}>
                  <Text style={styles.detalle}>
                    📍  {item.tipo_sede === 'ONLINE'
                      ? 'Teleconsulta Online'
                      : item.tipo_sede === 'AMBOS'
                        ? 'Online o a Domicilio (a elección)'
                        : 'Atención Domiciliaria'}
                  </Text>
                  {item.comunas_atencion && item.tipo_sede !== 'ONLINE' ? (
                    <Text style={styles.detalle}>🗺️  Atiende en: {item.comunas_atencion}</Text>
                  ) : null}
                  <Text style={styles.detalle}>📅  {fechaLegible(item.fecha)}</Text>
                  <Text style={styles.bloque}>
                    🕐  {item.hora_inicio.slice(0, 5)} – {item.hora_fin.slice(0, 5)}
                  </Text>
                  {estaSeleccionado && (
                    <Text style={styles.seleccionadoLabel}>✓ Bloque seleccionado</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* CU17 + CU22: la reprogramación exige justificación */}
      <DialogoMotivo
        visible={pedirMotivoReprogramacion}
        titulo="Motivo de la reprogramación"
        descripcion="Indica brevemente por qué cambias el horario:"
        etiquetaConfirmar="Reprogramar"
        colorConfirmar={colores.primario}
        onConfirmar={ejecutarReprogramacion}
        onCancelar={() => setPedirMotivoReprogramacion(false)}
      />
    <DialogoConfirmacion
      visible={confirmacion !== null}
      titulo={confirmacion?.titulo || ''}
      mensaje={confirmacion?.mensaje}
      etiquetaConfirmar={confirmacion?.etiqueta || 'Confirmar'}
      etiquetaCancelar={confirmacion?.etiquetaCancelar || 'Cancelar'}
      tono={confirmacion?.tono || 'normal'}
      onConfirmar={() => {
        const accion = confirmacion?.accion;
        setConfirmacion(null);
        if (accion) accion();
      }}
      onCancelar={() => setConfirmacion(null)}
    />

    <DialogoAviso
      visible={aviso !== null}
      titulo={aviso?.titulo || ''}
      mensaje={aviso?.mensaje}
      tono={aviso?.tono}
      etiquetaCerrar={aviso?.etiqueta || 'Entendido'}
      onCerrar={() => {
        const seguir = aviso?.alCerrar;
        setAviso(null);
        if (seguir) seguir();
      }}
    />
    </ScrollView>

      {/* ─ CU15: la confirmación queda fija al pie, siempre alcanzable sin
            tener que volver al final de la lista. */}
      {bloqueSeleccionado && (
        <View style={[styles.barraConfirmar, { paddingBottom: espacio.md + bordes.bottom }]}>
          <Text style={styles.resumenBloque} numberOfLines={1}>
            {bloqueSeleccionado.hora_inicio.slice(0, 5)} – {bloqueSeleccionado.hora_fin.slice(0, 5)}
            {'  ·  '}{fechaLegible(bloqueSeleccionado.fecha)}
          </Text>
          <TouchableOpacity
            style={[styles.btnConfirmar, cargandoBloqueo && styles.btnDeshabilitado]}
            onPress={confirmarAgendamiento}
            disabled={cargandoBloqueo}
          >
            {cargandoBloqueo ? (
              <ActivityIndicator color={colores.superficie} />
            ) : (
              <Text style={styles.btnTexto}>
                {reprogramacion ? 'Confirmar nuevo horario' : 'Confirmar reserva'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bannerReprogramacion: {
    backgroundColor: colores.primarioSuave,
    borderLeftWidth: 4,
    borderLeftColor: colores.primario,
    borderRadius: radio.sm,
    padding: 12,
    marginBottom: 16,
  },
  bannerTexto: { color: colores.primario },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colores.superficieSuave,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colores.primario,
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitulo: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colores.texto,
    marginTop: 20,
    marginBottom: 10,
  },
  label: {
    fontWeight: '600',
    color: colores.texto,
    marginBottom: 6,
    fontSize: 15,
  },
  // Los tres filtros comparten forma: pastillas bien redondeadas.
  pickerContainer: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.xl,
    marginBottom: 14,
    overflow: 'hidden',
    paddingHorizontal: espacio.sm,
  },
  fechaBtn: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.xl,
    paddingVertical: 15,
    paddingHorizontal: espacio.lg,
    marginBottom: 14,
  },
  fechaBtnText: {
    color: colores.texto,
    fontSize: 15,
  },
  campoNombre: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.xl,
    paddingVertical: 14,
    paddingHorizontal: espacio.lg,
    fontSize: 15,
    color: colores.texto,
  },
  ayudaFiltro: {
    ...tipografia.meta,
    color: colores.textoTenue,
    marginTop: espacio.xs,
    marginBottom: espacio.md,
  },
  btnBuscar: {
    backgroundColor: colores.primario,
    padding: 15,
    borderRadius: radio.xl,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnConfirmar: {
    backgroundColor: colores.primario,
    padding: 16,
    borderRadius: radio.md,
    alignItems: 'center',
  },
  pantalla: { flex: 1, backgroundColor: colores.superficieSuave },
  barraConfirmar: {
    backgroundColor: colores.superficie,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.md,
    ...sombra.media,
  },
  resumenBloque: {
    ...tipografia.cuerpoFuerte,
    color: colores.primario,
    textAlign: 'center',
    marginBottom: espacio.sm,
  },
  btnDeshabilitado: {
    opacity: 0.6,
  },
  btnTexto: {
    color: colores.superficie,
    fontWeight: 'bold',
    fontSize: 15,
  },
  card: {
    backgroundColor: colores.superficie,
    padding: 16,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    marginBottom: 12,
  },
  // CU58 — calificación del profesional en la tarjeta de resultados.
  calificacion: { ...tipografia.meta, color: colores.secundarioFuerte, marginTop: 2 },
  perfilIncipiente: { ...tipografia.meta, color: colores.textoTenue, marginTop: 2 },

  // CU19 — el bloque ocupado se ve apagado: no se puede reservar, solo esperar.
  cardOcupada: { backgroundColor: colores.superficieSuave, borderStyle: 'dashed' },
  nombreOcupado: { fontWeight: 'bold', fontSize: 17, color: colores.textoSuave, marginBottom: 4 },
  bloqueOcupado: { fontSize: 15, fontWeight: '600', color: colores.textoSuave, marginTop: 6 },
  notaEspera: { ...tipografia.meta, color: colores.textoTenue, marginTop: espacio.sm },
  btnEspera: {
    marginTop: espacio.md,
    borderWidth: 1.5,
    borderColor: colores.secundario,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  btnEsperaTexto: { ...tipografia.cuerpoFuerte, color: colores.secundarioFuerte },

  cardSeleccionada: {
    borderColor: colores.primario,
    borderWidth: 2,
    backgroundColor: colores.primarioSuave,
  },
  verPerfil: { ...tipografia.metaFuerte, color: colores.secundarioFuerte, marginBottom: 2 },
  nombre: {
    fontWeight: 'bold',
    fontSize: 17,
    color: colores.primario,
    marginBottom: 4,
  },
  // Con nombres largos el texto ocupa dos o tres líneas: centrar verticalmente
  // dejaba la foto "hundida", así que se alinea con la primera línea del nombre.
  cabeceraProfesional: { flexDirection: 'row', alignItems: 'flex-start', gap: espacio.md },
  datosProfesional: { flex: 1, minWidth: 0 },
  foto: { width: 48, height: 48, borderRadius: 24, backgroundColor: colores.primarioSuave },
  fotoVacia: { justifyContent: 'center', alignItems: 'center' },
  iniciales: { ...tipografia.cuerpoFuerte, color: colores.primario },
  detalle: {
    fontSize: 15,
    color: colores.textoSuave,
    marginBottom: 3,
  },
  experticia: { marginTop: espacio.sm },
  // Aire y una línea suave separan "quién atiende" de "qué se reserva".
  datosCita: {
    marginTop: espacio.md,
    paddingTop: espacio.md,
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
  },
  bloque: {
    fontSize: 15,
    fontWeight: '600',
    color: colores.primario,
    marginTop: 6,
  },
  seleccionadoLabel: {
    marginTop: 8,
    color: colores.primario,
    fontWeight: 'bold',
    fontSize: 13,
  },
  sinResultados: {
    marginTop: 24,
    alignItems: 'center',
    padding: 20,
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  sinResultadosTexto: {
    color: colores.textoSuave,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 6,
  },
  sinResultadosHint: {
    color: colores.textoTenue,
    fontSize: 13,
    textAlign: 'center',
  },
});