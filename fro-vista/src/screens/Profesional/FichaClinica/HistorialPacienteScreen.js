/**
 * Componente: Cliente Móvil — Vista "Historial del paciente" (Ficha Clínica)
 * Casos de uso: CU28, CU20, CU76, CU18, CU22, CU73, CU38, CU39, CU40, CU41,
 * CU42, CU43, CU55, CU30, CU31, CU78, CU25, CU44, CU50, CU71, CU72, CU09,
 * CU33, CU35, CU29, CU32.
 *
 * Historial consolidado del paciente: sus citas con las acciones de la
 * atención, episodios, evoluciones y reportes que el profesional lee antes de atender.
 */
// Ruta: fro-vista/src/screens/Profesional/FichaClinica/HistorialPacienteScreen.js

import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';

import {
  getReportePreclinico,
  getSintomasDePaciente,
  getAdherenciaDePaciente,
} from '../../../api/client';
import apiClient, {
  finalizarAtencion,
  getHistorialPaciente,
  iniciarAtencion,
} from '../../../api/client';
import { AuthContext } from '../../../context/AuthContext';
import DialogoMotivo from '../../../components/DialogoMotivo';
import DialogoAviso from '../../../components/DialogoAviso';
// Las horas de la base son hora de pared: se formatean sin convertir huso.
import { formatearFechaHora as formatearFecha } from '../../../utils/fechas';
import { etiquetaModalidad, iconoModalidad } from '../../../utils/modalidad';
import { ubicacionActual, coordenadasDeDireccion } from '../../../utils/ubicacion';
import { datosEstado, etiquetaEstado, esEstadoTerminal } from '../../../utils/estados';
import { colores, espacio, piezas, radio, sombra, tipografia, interaccion } from '../../../theme';
import SeccionHistorial from '../../../components/SeccionHistorial';
import DialogoConfirmacion from '../../../components/DialogoConfirmacion';

/**
 * CU09 — Configurando privacidad de datos de contacto
 * Arma la dirección del paciente para mostrarla en pantalla. El servidor
 * devuelve los campos en NULL cuando el paciente ocultó su dirección (CU09),
 * y en ese caso hay que explicarlo en vez de dejar el dato en blanco.
 */
function textoDireccion(paciente) {
  if (!paciente) return 'No informada';
  if (paciente.direccion_oculta) return 'Oculta por el paciente';

  const calle = [paciente.calle, paciente.numero_calle].filter(Boolean).join(' ');
  const partes = [
    calle,
    paciente.departamento ? `depto. ${paciente.departamento}` : null,
    paciente.comuna,
  ].filter(Boolean);

  return partes.length > 0 ? partes.join(', ') : 'No informada';
}

export default function HistorialPacienteScreen({ route, navigation }) {
  const { pacienteId, nombrePaciente, resaltarCitaId, resaltarEn } = route.params;
  const { userData } = useContext(AuthContext);

  // La sesión clínica manda aquí con "Finalizar sesión": hay que dejar la cita
  // en curso a la vista y señalada, en vez de hacer buscarla entre todas.
  const refScroll = useRef(null);
  const posicionCitas = useRef({});

  const [historial, setHistorial] = useState([]);
  const [episodios, setEpisodios] = useState([]);
  const [evoluciones, setEvoluciones] = useState([]);
  const [paciente, setPaciente] = useState(null);
  // CU25: síntesis de la entrevista previa; CU50: reportes de evolución.
  const [preclinico, setPreclinico] = useState(null);
  const [errorPreclinico, setErrorPreclinico] = useState(false);
  const [seguimiento, setSeguimiento] = useState([]);
  // CU44: índice de adherencia del paciente, calculado por el servidor.
  const [adherencia, setAdherencia] = useState(null);
  // CU33: aviso cuando el repositorio multimedia no está disponible.
  const [mensajeMultimedia, setMensajeMultimedia] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // CU22: cancelar exige motivo; se pide en un diálogo propio.
  const [citaPorCancelar, setCitaPorCancelar] = useState(null);
  // CU71: informe de cuadratura de coberturas (se descarta en memoria).
  const [cuadratura, setCuadratura] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  // CU41: cierre manual justificado cuando el paciente no marcó su término.
  const [cierreManualCita, setCierreManualCita] = useState(null);
  // Mientras se toma la ubicación y se registra la marca (CU39), los botones esperan.
  const [marcando, setMarcando] = useState(null);
  // CU33/CU35: disponibilidad del repositorio multimedia y conteo de archivos.
  const [multimediaDisponible, setMultimediaDisponible] = useState(false);
  const [totalDocumentos, setTotalDocumentos] = useState(0);
  // CU31: evolución sobre la que se redacta una corrección versionada.
  const [correccionEvolucion, setCorreccionEvolucion] = useState(null);
  // CU31: versiones desplegadas por evolución { evolucionId: [versiones] }.
  const [versionesPorEvolucion, setVersionesPorEvolucion] = useState({});
  // Avisos de resultado con el diálogo de la app (Alert nativo no se estiliza).
  const [aviso, setAviso] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  // CU38: marca horaria manual con justificación, para cuando el profesional
  // olvidó marcar en su momento. Antes vivía en la pantalla de marcas
  // temporales, que ahora solo muestra la jornada.
  const [marcaManual, setMarcaManual] = useState(null);
  const [verAntiguas, setVerAntiguas] = useState(false);

  // CU28 — Consolidando historial en ficha clínica electrónica
  const cargarHistorial = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const data = await getHistorialPaciente(
        pacienteId,
        userData?.usuario_id
      );

      if (data.ok) {
        setPaciente(data.paciente || null);
        setHistorial(data.historial || []);
        setEpisodios(data.episodios || []);
        setEvoluciones(data.evoluciones || []);
        setMensajeMultimedia(data.mensajeMultimedia || '');
        setMultimediaDisponible(Boolean(data.multimediaDisponible));
        setTotalDocumentos(data.totalDocumentos || 0);
      } else {
        setError(data.message || 'Error al recuperar historial');
      }
    } catch (err) {
      console.error('ERROR HISTORIAL:', err?.response?.data || err.message);
      setError(
        err?.response?.data?.message ||
          'Error de conexión con la base de datos'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    cargarHistorial();
  }, []);

  // ── CU31: correcciones versionadas sobre evoluciones cerradas ──────────────
  // El original nunca se toca: cada aclaración post-firma queda como una
  // versión indexada aparte, y el servidor valida autoría y tope de versiones.
  // CU31 — ver u ocultar las versiones de una evolución
  const alternarVersiones = async (evolucionId) => {
    if (versionesPorEvolucion[evolucionId]) {
      setVersionesPorEvolucion((previas) => {
        const copia = { ...previas };
        delete copia[evolucionId];
        return copia;
      });
      return;
    }
    try {
      const { data } = await apiClient.get(`/clinica/evolucion/${evolucionId}/versiones`);
      setVersionesPorEvolucion((previas) => ({
        ...previas,
        [evolucionId]: data.versiones || [],
      }));
    } catch (err) {
      setAviso({ tono: 'error', titulo: 'Error', mensaje: 'No se pudieron cargar las versiones de este registro.' });
    }
  };

  // CU31 — Gestionando versionado de correcciones auditadas
  const crearCorreccion = async (evolucionId, texto) => {
    setCorreccionEvolucion(null);
    try {
      const { data } = await apiClient.post(`/clinica/evolucion/${evolucionId}/versiones`, {
        texto,
      });
      setAviso({ tono: 'ok', titulo: 'Corrección guardada', mensaje: data?.mensaje || 'Versión creada.' });
      // Refrescar el desplegable si estaba abierto y el contador del historial.
      setVersionesPorEvolucion((previas) => {
        const copia = { ...previas };
        delete copia[evolucionId];
        return copia;
      });
      await cargarHistorial(true);
    } catch (err) {
      const respuesta = err.response?.data;
      // Excepciones CU31: sin autoría (403), tope de versiones o registro
      // abierto (409), corrección vacía (400) y fallo de vinculación (500).
      setAviso({ tono: 'error', titulo: 'Corrección no guardada', mensaje: respuesta?.mensaje || respuesta?.error || 'Reintenta el guardado.' });
    }
  };

  // CU38 Exc.2 — registrar a mano y con justificación la marca de inicio o término
  const enviarMarcaManual = async () => {
    if (!marcaManual?.fechaHora?.trim() || !marcaManual?.justificacion?.trim()) {
      setAviso({
        tono: 'info',
        titulo: 'Faltan datos',
        mensaje: 'Indica la fecha y hora de la marca y el motivo por el que se registra a mano.',
      });
      return;
    }
    const { tipo, citaId, fechaHora, justificacion } = marcaManual;
    const cuerpo = {
      marca_manual: fechaHora.trim(),
      justificacion_manual: justificacion.trim(),
    };
    setMarcaManual(null);
    try {
      if (tipo === 'INICIO') {
        const data = await iniciarAtencion(citaId, cuerpo);
        setAviso({ tono: 'ok', titulo: 'Inicio registrado', mensaje: `Marca de inicio: ${formatearFecha(data.marca_inicio)}` });
      } else {
        const data = await finalizarAtencion(citaId, cuerpo);
        setAviso({ tono: 'ok', titulo: 'Término registrado', mensaje: `Duración total: ${data.duracion_minutos} minutos.` });
      }
      cargarHistorial(true);
    } catch (err) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo registrar',
        mensaje: err.response?.data?.mensaje || 'Revisa el formato de la fecha e intenta nuevamente.',
      });
    }
  };

  /**
   * CU38, CU39 — iniciar o finalizar la atención con su marca horaria y ubicación
   * Iniciar y finalizar una atención no son un simple cambio de estado: además
   * dejan la marca horaria auditable de la prestación (CU38). Por eso usan los
   * mismos servicios que la pantalla de Marcas Temporales, en vez de la
   * transición genérica, que dejaría la hora real sin registrar.
   */
  const registrarMarcaAtencion = async (citaId, evento) => {
    // CU39 (corrección Inc 4): el inicio y el término los dispara solo el
    // profesional. En domicilio se manda su GPS y, como respaldo del GPS del
    // paciente, su dirección registrada convertida a coordenadas.
    const cita = historial.find((c) => String(c.cita_id) === String(citaId));
    let cuerpo = {};
    if (String(cita?.modalidad || '').toUpperCase() === 'DOMICILIO') {
      setMarcando(evento);
      const [ubicacion, direccionPaciente] = await Promise.all([
        ubicacionActual(),
        coordenadasDeDireccion(paciente),
      ]);
      cuerpo = { ubicacion, direccion_paciente: direccionPaciente };
    }
    setMarcando(evento);
    try {
      if (evento === 'INICIAR') {
        const data = await iniciarAtencion(citaId, cuerpo);
        avisarInicio(data);
      } else {
        const data = await finalizarAtencion(citaId, cuerpo);
        avisarTermino(data);
      }
      cargarHistorial(false);
    } catch (err) {
      const detalle = err.response?.data;

      // CU38 Exc.1: la atención comienza antes de su bloque horario: queda auditado.
      if (detalle?.error === 'INICIO_ANTICIPADO') {
        setConfirmacion({
          tono: 'peligro',
          titulo: 'Inicio anticipado',
          mensaje: 'La cita aún no alcanza su bloque horario. El inicio quedará auditado.',
          etiqueta: 'Confirmar inicio',
          accion: async () => {
            try {
              const data = await iniciarAtencion(citaId, { ...cuerpo, confirmar_inicio_anticipado: true });
              avisarInicio(data);
              cargarHistorial(false);
            } catch (error) {
              setAviso({ tono: 'info', titulo: 'No fue posible iniciar', mensaje: error.response?.data?.mensaje || 'Intenta nuevamente.' });
            }
          },
        });
        return;
      }

      setAviso({ tono: 'alerta', titulo: evento === 'INICIAR' ? 'No fue posible iniciar' : 'No fue posible finalizar', mensaje: detalle?.mensaje || 'Revisa la conexión e intenta nuevamente.' });
    } finally {
      setMarcando(null);
    }
  };

  // CU38, CU39 — aviso de inicio, con la advertencia de presencialidad si la hay
  const avisarInicio = (data) => {
    setAviso({
      tono: data.presencialidad && !data.presencialidad.dentro_del_radio ? 'alerta' : 'ok',
      titulo: 'Atención iniciada',
      mensaje:
        `Marca de inicio: ${formatearFecha(data.marca_inicio)}` +
        (data.aviso_presencialidad ? `\n\n${data.aviso_presencialidad}` : ''),
    });
  };

  /**
   * CU38, CU41, CU76 — resumen del término: duración, sesión descontada y certificación
   * Corrección Inc 4 (punto 7): al finalizar se confirma que la atención se
   * realizó y, si el registro clínico aún no está firmado, se ofrece
   * documentarlo ahora o dejarlo para el final de la jornada.
   */
  const avisarTermino = (data) => {
    const inv = data.inventario;
    const detalleInventario = !inv
      ? ''
      : inv.sin_paquete
        ? '\nEl paciente no tiene un paquete de sesiones activo: no se descontó ninguna sesión.'
        : `\nSesiones restantes del paquete: ${inv.sesiones_restantes}${inv.paquete_agotado ? ' (paquete agotado)' : ''}`;
    const cert = data.certificacion;
    const detalleCertificacion = cert?.certificada
      ? '\n\n✅ Sesión certificada automáticamente: las marcas y ubicaciones coinciden.'
      : cert?.requiere_cierre_manual
        ? `\n\n⚠️ No se pudo validar la presencialidad:\n${textoFactores((cert.factores || []).filter((f) => !f.ok))}\nCierra la sesión con una justificación desde "Validar sesión".` +
          (cert.administradores_avisados ? ' El caso también se informó a administración.' : '')
        : '';
    // CU55: el servidor ya avisó al paciente para que califique la atención.
    const resumen =
      `Duración total: ${data.duracion_minutos} minutos.${detalleInventario}` +
      `${detalleCertificacion}\n\nLe enviamos al paciente un aviso para que califique la atención.`;

    // CU40: documentar la sesión ahora o al final de la jornada.
    if (data.documentacion_pendiente && data.episodio_clinico_id) {
      setConfirmacion({
        titulo: 'Atención realizada',
        mensaje: `${resumen}\n\nEl registro clínico de esta sesión aún no está firmado. ¿Lo completas ahora o al final de la jornada?`,
        etiqueta: 'Documentar ahora',
        etiquetaCancelar: 'Al final de la jornada',
        accion: () =>
          navigation.navigate('SesionClinica', {
            episodioId: String(data.episodio_clinico_id),
            episodio_id: String(data.episodio_clinico_id),
          }),
        alCancelar: () =>
          setAviso({
            tono: 'info',
            titulo: 'Queda pendiente',
            mensaje: 'La encontrarás en Mi Jornada, en "Pendientes de documentar". La sesión clínica sigue abierta para completarla hasta que firmes el registro.',
          }),
      });
      return;
    }
    setAviso({ tono: cert?.requiere_cierre_manual ? 'alerta' : 'ok', titulo: 'Atención realizada', mensaje: resumen });
  };

  // CU20 — Transicionando máquina de estados de cita
  const modificarEstadoCita = async (citaId, estadoActual, evento, motivo) => {
    // Exclusión local preventiva para estados terminales
    const deEstado = (estadoActual || '').toUpperCase();

    if (esEstadoTerminal(deEstado)) {
      setAviso({ tono: 'info', titulo: "Acción no permitida", mensaje: "El Sistema bloquea la interacción debido a que la cita ya se encuentra en un estado terminal." });
      return;
    }

    // CU38: estos dos eventos llevan marca horaria; el resto son cambios de estado.
    if (evento === 'INICIAR' || evento === 'FINALIZAR') {
      return registrarMarcaAtencion(citaId, evento);
    }

    // CU18, CU22: la cancelación necesita justificación; se pide y se retoma después.
    if (evento === 'CANCELAR' && !motivo) {
      setCitaPorCancelar({ citaId, estadoActual });
      return;
    }

    try {
      const response = await apiClient.post(`/citas/${citaId}/transicionar`, { evento, motivo });

      if (response.data.ok || response.status === 200) {
        setAviso({ tono: 'ok', titulo: "Éxito", mensaje: `Cita actualizada exitosamente a: ${response.data.nuevo_estado || 'nuevo estado'}` });
        cargarHistorial(false); // Recargar la lista para reflejar los cambios inmediatos
      }
    } catch (err) {
      if (err.response) {
        const { status, data } = err.response;

        // CU73: la hora todavía no está pagada. Se explica y se refresca la
        // lista para que el botón pase a "Esperando pago".
        if (data?.error === 'CITA_SIN_PAGO') {
          setAviso({ tono: 'info', titulo: 'Esperando pago', mensaje: data.mensaje });
          cargarHistorial(true);
        }
        // CU20 EXCEPCIÓN 2: Muestra el error exacto que envía el backend para saber qué falló
        else if (status === 422 || data.code === 'TRANSICION_INVALIDA') {
          setAviso({ tono: 'error', titulo: "Error de validación de flujo lógico", mensaje: `${data.error || 'La transición no está permitida por las reglas de negocio.'}\n\nPor favor, sigue el orden del flujo clínico.` });
        } 
        // CU20 EXCEPCIÓN 4: Fallo de persistencia en BD
        else if (status === 500 || data.code === 'PERSIST_FAIL') {
          setAviso({ tono: 'error', titulo: "Alerta de Error Crítica", mensaje: "El motor de base de datos no logró guardar el nuevo estado debido a un fallo de persistencia. Intente nuevamente o contacte a soporte." });
        } else {
          setAviso({ tono: 'error', titulo: "No se pudo cambiar el estado", mensaje: data.mensaje || data.error || "Intenta nuevamente." });
        }
      } else {
        // CU20 EXCEPCIÓN 3: Latencia o pérdida de red
        setConfirmacion({
          titulo: 'Sincronización en curso',
          mensaje: 'La red está lenta y el cambio de estado aún no se ve. Refresca para volver a consultarlo.',
          etiqueta: 'Refrescar ahora',
          etiquetaCancelar: 'Más tarde',
          accion: () => cargarHistorial(true),
        });
      }
    }
  };

  // CU41: certificación multi-factor de la sesión.
  const textoFactores = (factores) =>
    (factores || []).map((f) => `${f.ok ? '✅' : '❌'} ${f.factor}`).join('\n');

  // CU41 — Validando sesión mediante protocolo multi-factor
  const validarSesion = async (citaId, extras = {}) => {
    try {
      const { data } = await apiClient.post(`/citas/${citaId}/validar-sesion`, extras);

      if (data.certificada) {
        setAviso({ tono: 'ok', titulo: 'Sesión certificada', mensaje: `${data.mensaje}\n\n${textoFactores(data.factores)}` });
        // Refresca la lista para que el botón dé paso a "Sesión validada".
        cargarHistorial(true);
        return;
      }

      // Excepción 1: falta una ubicación → cierre manual justificado.
      if (data.requiere_cierre_manual) {
        setConfirmacion({
          tono: 'peligro',
          titulo: 'Presencialidad sin validar',
          mensaje: `${data.mensaje}\n\n${textoFactores(data.factores)}`,
          etiqueta: 'Cierre manual',
          etiquetaCancelar: 'Volver',
          accion: () => setCierreManualCita(citaId),
        });
        return;
      }

      // Excepción 3: el resumen se muestra y nada se persiste sin confirmar.
      if (data.resumen_pendiente) {
        setConfirmacion({
          titulo: 'Resumen de factores',
          mensaje: `${textoFactores(data.factores)}\n\n¿Confirmas la certificación de la sesión?`,
          etiqueta: 'Certificar sesión',
          etiquetaCancelar: 'Rechazar',
          accion: () => validarSesion(citaId, { confirmar: true }),
        });
      }
    } catch (err) {
      const respuesta = err.response?.data;
      // Excepción 2: discrepancias críticas suspenden la validación.
      // El caso queda en manos del Administrador, y el profesional puede
      // igual cerrar la sesión con una justificación.
      if (respuesta?.error === 'VALIDACION_SUSPENDIDA') {
        setConfirmacion({
          tono: 'peligro',
          titulo: 'Validación suspendida',
          mensaje: `${respuesta.mensaje}\n\n${textoFactores(respuesta.factores)}`,
          etiqueta: 'Cierre manual',
          etiquetaCancelar: 'Volver',
          accion: () => setCierreManualCita(citaId),
        });
        return;
      }
      setAviso({ tono: 'error', titulo: 'No se pudo validar', mensaje: respuesta?.mensaje || 'El cierre quedó encolado. Reintenta en unos minutos.' });
    }
  };

  // CU71: contrasta sesiones ejecutadas contra coberturas autorizadas.
  const sincronizarCoberturas = async () => {
    setSincronizando(true);
    try {
      const { data } = await apiClient.get(`/pagos/cuadratura/${pacienteId}`);
      setCuadratura(data);
    } catch (err) {
      // Excepción 4: la sincronización queda pendiente y se reintenta.
      setAviso({ tono: 'alerta', titulo: 'Sincronización pendiente', mensaje: err.response?.data?.mensaje || 'No se pudo completar. Reintenta en unos minutos.' });
    } finally {
      setSincronizando(false);
    }
  };

  // CU22: muestra el historial de cambios de una cita (responsable y motivo).
  const verTrazabilidad = async (citaId) => {
    try {
      const { data } = await apiClient.get(`/citas/${citaId}/trazabilidad`);
      const eventos = data?.eventos || [];

      if (eventos.length === 0) {
        setAviso({ tono: 'info', titulo: 'Trazabilidad', mensaje: 'Esta cita aún no registra cambios auditados.' });
        return;
      }

      // Cada evento es una fila de la línea de tiempo, no texto amontonado.
      const filas = eventos.map((e) => ({
        titulo:
          e.accion === 'REPROGRAMACION_CITA'
            ? `Reprogramada al ${formatearFecha(e.bloque_nuevo?.fecha_hora_inicio) || 'nuevo bloque'}`
            : `${etiquetaEstado(e.estado_anterior)} → ${etiquetaEstado(e.nuevo_estado)}`,
        detalle: `${formatearFecha(e.momento)}${e.rol_actor ? ` · ${e.rol_actor}` : ''}`,
        nota: e.motivo ? `Motivo: ${e.motivo}` : null,
      }));

      setAviso({
        tono: 'info',
        titulo: `Trazabilidad de la cita #${citaId}`,
        mensaje: `${eventos.length} cambio(s) auditado(s), del más reciente al más antiguo.`,
        lista: filas,
      });
    } catch (error) {
      setAviso({ tono: 'error', titulo: 'Sin trazabilidad', mensaje: 'No se pudo obtener la trazabilidad de la cita.' });
    }
  };

  // CU25, CU50, CU44 — reporte pre-clínico, reportes de síntomas y adherencia
  // CU25 y CU50 viajan aparte del historial: si fallan, la ficha se muestra igual.
  const cargarPreclinico = useCallback(async () => {
    setErrorPreclinico(false);
    try {
      const datos = await getReportePreclinico(pacienteId);
      setPreclinico(datos);
    } catch {
      // Excepción 2 del CU25: la vista ofrece recargar.
      setErrorPreclinico(true);
    }
    try {
      const { reportes } = await getSintomasDePaciente(pacienteId);
      setSeguimiento(reportes || []);
    } catch {
      setSeguimiento([]);
    }
    try {
      const datos = await getAdherenciaDePaciente(pacienteId);
      setAdherencia(datos?.adherencia || null);
    } catch {
      setAdherencia(null);
    }
  }, [pacienteId]);

  useEffect(() => {
    cargarPreclinico();
  }, [cargarPreclinico]);

  // Al llegar desde la sesión, la cita acaba de cambiar de estado: se recarga
  // para que el botón de finalizar aparezca con el estado real.
  useEffect(() => {
    if (!resaltarCitaId) return;
    cargarHistorial(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltarCitaId, resaltarEn]);

  useEffect(() => {
    if (!resaltarCitaId || historial.length === 0) return;
    // Un turno de reloj para que las tarjetas ya hayan medido su posición.
    const t = setTimeout(() => {
      const y = posicionCitas.current[resaltarCitaId];
      if (y !== undefined) {
        refScroll.current?.scrollTo({ y: Math.max(y - 16, 0), animated: true });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [resaltarCitaId, resaltarEn, historial.length]);

  // El historial se parte en dos: lo que todavía tiene acción (por confirmar,
  // iniciar o finalizar) y lo ya cerrado, que se consulta pero no estorba.
  const citasActivas = historial.filter((c) => !esEstadoTerminal(c.estado));
  const citasAntiguas = historial.filter((c) => esEstadoTerminal(c.estado));

  // CU28: episodios y evoluciones: el más reciente a la vista y los anteriores en
  // el desplegable de historial. El identificador crece con cada registro,
  // así que ordena por antigüedad sin depender del formato de las fechas.
  const episodiosOrdenados = [...episodios].sort(
    (x, y) => Number(y.episodio_clinico_id) - Number(x.episodio_clinico_id)
  );
  const evolucionesOrdenadas = [...evoluciones].sort(
    (x, y) => Number(y.evolucion_clinica_id) - Number(x.evolucion_clinica_id)
  );

  // CU28, CU78 — tarjeta de un episodio clínico con sus metas (CU32)
  const renderEpisodio = (item) => (
    <View key={item.episodio_clinico_id} style={styles.cardEpisodio}>
      <Text style={styles.fecha}>
        Episodio #{item.episodio_clinico_id}
      </Text>
      <Text>Motivo: {item.motivo_consulta}</Text>
      <Text>Estado: {item.estado ? etiquetaEstado(item.estado) : 'No informado'}</Text>
      <Text>Inicio: {formatearFecha(item.fecha_inicio)}</Text>
      <Text>
        Término:{' '}
        {item.fecha_terminado
          ? formatearFecha(item.fecha_terminado)
          : 'En curso · el episodio sigue abierto'}
      </Text>

      {/* Las metas del episodio, que son las que dan el porcentaje de
          avance de cada evolución. */}
      {(item.metas || []).length === 0 ? (
        <Text style={styles.metaEpisodioVacia}>
          Sin metas definidas en este episodio
        </Text>
      ) : (
        item.metas.map((meta) => {
          const pct = Math.min(
            100,
            Math.round(
              (Number(meta.valor_actual || 0) / Number(meta.meta_valor || 1)) * 100
            )
          );
          return (
            <Text key={meta.objetivo_terapeutico_id} style={styles.metaEpisodio}>
              🎯 {meta.descripcion}: {Number(meta.valor_actual)} de{' '}
              {Number(meta.meta_valor)} {meta.unidad} · {pct}%
            </Text>
          );
        })
      )}
    </View>
  );

  // CU28, CU30 — tarjeta de una evolución clínica, con su firma e inalterabilidad
  const renderEvolucion = (item) => (
    <View key={item.evolucion_clinica_id} style={styles.cardEvolucion}>
      <Text style={styles.fecha}>
        Evolución #{item.evolucion_clinica_id}
      </Text>
      <Text>Episodio: #{item.episodio_clinico_id}</Text>
      <Text>Motivo episodio: {item.motivo_consulta}</Text>
      {/* El porcentaje sale de las metas del episodio. Si el episodio
          no tiene metas, no hay nada que medir: decirlo es más claro
          que mostrar "No informado%". */}
      <Text>
        Avance de las metas:{' '}
        {item.porcentaje_objetivo === null || item.porcentaje_objetivo === undefined
          ? 'sin metas medidas en este episodio'
          : `${item.porcentaje_objetivo}%`}
      </Text>
      <Text>
        Respuesta fisiológica:{' '}
        {item.respuesta_fisiologica || 'No informado'}
      </Text>
      <Text>
        Técnicas aplicadas:{' '}
        {item.tecnicas_aplicadas || 'No informado'}
      </Text>
      <Text>Inalterable: {item.inalterable === 1 ? 'Sí' : 'No'}</Text>
      <Text>
        Firma digital:{' '}
        {item.firma_digital ? 'Registrada' : 'No registrada'}
      </Text>
      <Text>Hora firma: {formatearFecha(item.hora_firma_digital)}</Text>

      {/* CU31: correcciones versionadas solo sobre registros cerrados.
          En un registro abierto se explica dónde cerrarlo: el botón
          "vivía" en otra pantalla y nadie lograba encontrarlo. */}
      {item.inalterable !== 1 && (
        <Text style={styles.pistaCorreccion}>
          ✏️ Registro abierto: se edita directo. Las correcciones versionadas se
          habilitan al cerrarlo y firmarlo en Trazabilidad → Inalterabilidad.
        </Text>
      )}
      {item.inalterable === 1 && (
        <View style={styles.filaVersiones}>
          <TouchableOpacity
            onPress={() => alternarVersiones(item.evolucion_clinica_id)}
          >
            <Text style={styles.enlaceVersiones}>
              {versionesPorEvolucion[item.evolucion_clinica_id]
                ? '▲ Ocultar versiones'
                : `📑 Versiones (${item.total_versiones || 0})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCorreccionEvolucion(item)}>
            <Text style={styles.enlaceCorreccion}>➕ Agregar corrección</Text>
          </TouchableOpacity>
        </View>
      )}

      {versionesPorEvolucion[item.evolucion_clinica_id] && (
        <View style={styles.cajaVersiones}>
          {versionesPorEvolucion[item.evolucion_clinica_id].length === 0 ? (
            <Text style={styles.textoVersion}>
              Sin correcciones. El registro original está íntegro.
            </Text>
          ) : (
            versionesPorEvolucion[item.evolucion_clinica_id].map((v) => (
              <View key={v.version_id} style={styles.itemVersion}>
                <Text style={styles.tituloVersion}>
                  Versión {v.numero_version} ·{' '}
                  {formatearFecha(v.fecha_creacion)} · {v.autor?.trim() || 'Autor no informado'}
                </Text>
                <Text style={styles.textoVersion}>{v.texto_correccion}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );

  // CU20, CU38 — una sola tarjeta de cita con sus acciones, reutilizada por las
  // citas activas y por el desplegable de anteriores.
  const renderCita = (item) => {
              // Normalizamos el estado actual a mayúsculas para las comparaciones visuales
              const estadoCita = (item.estado || '').toUpperCase();

              // La marca se apaga sola en cuanto la atención queda finalizada.
              const resaltada =
                String(item.cita_id) === String(resaltarCitaId) && !esEstadoTerminal(estadoCita);

              return (
                <View
                  key={item.cita_id}
                  style={[styles.card, resaltada && styles.cardResaltada]}
                  onLayout={(e) => {
                    posicionCitas.current[item.cita_id] = e.nativeEvent.layout.y;
                  }}
                >
                  {resaltada && (
                    <Text style={styles.avisoResaltada}>
                      👇 Esta es la sesión que estás atendiendo
                    </Text>
                  )}
                  <Text style={styles.fecha}>
                    {formatearFecha(item.fecha_hora_inicio)}
                  </Text>
                  <Text style={{ fontWeight: 'bold', color: colores.texto }}>
                    Estado: <Text style={[styles.estadoTexto, { color: datosEstado(item.estado).color }]}>{etiquetaEstado(item.estado)}</Text>
                  </Text>
                  <Text>Profesional: {item.profesional}</Text>
                  <Text>Especialidad: {item.especialidad}</Text>
                  <Text>Modalidad: {iconoModalidad(item.modalidad)} {etiquetaModalidad(item.modalidad)}</Text>

                  {Number(item.es_propia) !== 1 ? (
                    // Cita con otro profesional: se ve para tener la agenda
                    // completa del paciente, pero la gestiona ese profesional.
                    <View style={styles.cajaAjena}>
                      <Text style={styles.textoAjena}>
                        🔒 Bloqueado: esta hora es con otro profesional ({item.especialidad}).
                        Solo ese profesional puede confirmarla, iniciarla o cancelarla.
                      </Text>
                    </View>
                  ) : (
                  <>
                  {/* CU20: PANEL DE ACCIONES INTELIGENTES (MÁQUINA DE ESTADOS DINÁMICA) */}
                  <View style={styles.containerAcciones}>
                    
                    {/* ACCIONES SI LA CITA ESTÁ AGENDADA */}
                    {estadoCita === 'AGENDADA' && (
                      <>
                        {/* CU73: solo se confirma una hora ya pagada. */}
                        {item.pago_tipo ? (
                          <TouchableOpacity 
                            style={[styles.botonAccion, { backgroundColor: colores.advertencia }]}
                            onPress={() => modificarEstadoCita(item.cita_id, item.estado, 'CONFIRMAR')}
                          >
                            <Text style={styles.textoBotonAccion}>👍 Confirmar</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={[styles.botonAccion, styles.esperaPago]}>
                            <Text style={styles.textoEsperaPago}>⏳ Esperando pago</Text>
                          </View>
                        )}

                        <TouchableOpacity 
                          style={[styles.botonAccion, { backgroundColor: colores.error }]}
                          onPress={() => modificarEstadoCita(item.cita_id, item.estado, 'CANCELAR')}
                        >
                          <Text style={styles.textoBotonAccion}>❌ Cancelar</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {/* ACCIONES SI LA CITA ESTÁ CONFIRMADA (iniciar: CU38) */}
                    {estadoCita === 'CONFIRMADA' && (
                      <>
                        <TouchableOpacity 
                          style={[styles.botonAccion, { backgroundColor: colores.primario }, marcando && { opacity: interaccion.opacidadDeshabilitada }]}
                          onPress={() => modificarEstadoCita(item.cita_id, item.estado, 'INICIAR')}
                          disabled={Boolean(marcando)}
                        >
                          <Text style={styles.textoBotonAccion}>{marcando === 'INICIAR' ? 'Registrando…' : '▶️ Iniciar'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.botonAccion, { backgroundColor: colores.advertencia }]}
                          onPress={() => modificarEstadoCita(item.cita_id, item.estado, 'REGISTRAR_INASISTENCIA')}
                        >
                          <Text style={styles.textoBotonAccion}>🤷‍♂️ Ausente</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.botonAccion, { backgroundColor: colores.error }]}
                          onPress={() => modificarEstadoCita(item.cita_id, item.estado, 'CANCELAR')}
                        >
                          <Text style={styles.textoBotonAccion}>❌ Cancelar</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {/* ACCIONES SI LA CITA ESTÁ EN CURSO (finalizar: CU38) */}
                    {estadoCita === 'EN_CURSO' && (
                      <TouchableOpacity 
                        style={[styles.botonAccion, { backgroundColor: colores.primario, marginHorizontal: 0 }]}
                        onPress={() => modificarEstadoCita(item.cita_id, item.estado, 'FINALIZAR')}
                        disabled={Boolean(marcando)}
                      >
                        <Text style={styles.textoBotonAccion}>{marcando === 'FINALIZAR' ? 'Registrando…' : '✅ Finalizar atención'}</Text>
                      </TouchableOpacity>
                    )}

                    {/* MENSAJE SI LA CITA ESTÁ EN UN ESTADO FINAL O TERMINAL */}
                    {esEstadoTerminal(estadoCita) && (
                      <Text style={styles.textoTerminal}>🔒 Flujo concluido (Registro histórico cerrado)</Text>
                    )}
                  </View>

                  {/* CU39: las ubicaciones se registran solas al comenzar y al
                      finalizar. Va fuera de la fila de botones: dentro, su
                      ancho completo aplastaba los botones hasta ocultarlos. */}
                  {['CONFIRMADA', 'EN_CURSO'].includes(estadoCita) && String(item.modalidad || '').toUpperCase() === 'DOMICILIO' && (
                    <Text style={styles.notaPresencialidad}>
                      📍 Al {estadoCita === 'CONFIRMADA' ? 'iniciar' : 'finalizar'} se registran la hora y la ubicación tuya y del paciente; deben estar a menos de 100 m.
                    </Text>
                  )}

                  {/* CU38 Excepción 2: esta marca es SOLO para cuando la hora
                      automática del servidor no es utilizable. El inicio antes
                      del bloque horario (Excepción 1) se hace con "Iniciar",
                      que pide confirmar y queda auditado. */}
                  {['CONFIRMADA', 'EN_CURSO'].includes(estadoCita) && (
                    <TouchableOpacity
                      onPress={() =>
                        setMarcaManual({
                          tipo: estadoCita === 'CONFIRMADA' ? 'INICIO' : 'TERMINO',
                          citaId: item.cita_id,
                          fechaHora: new Date().toISOString(),
                          justificacion: '',
                        })
                      }
                    >
                      <Text style={styles.enlaceMarcaManual}>
                        🕗 ¿La hora automática falló? Registrar{' '}
                        {estadoCita === 'CONFIRMADA' ? 'inicio' : 'término'} manual justificado
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* CU39/CU43: evidencia de la sesión */}
                  {['CONFIRMADA', 'EN_CURSO'].includes(estadoCita) && (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('EvidenciaSesion', {
                          citaId: item.cita_id,
                          modalidad: item.modalidad,
                        })
                      }
                    >
                      <Text style={styles.enlaceEvidencia}>🛰️ Evidencia y firma de conformidad</Text>
                    </TouchableOpacity>
                  )}

                  {/* CU41 + CU42: cierre certificado de sesiones realizadas */}
                  {estadoCita === 'REALIZADA' && (
                    <View style={styles.filaCierre}>
                      {item.sesion_certificada_en ? (
                        // Ya certificada: se resume, y el detalle con fecha y
                        // hora se consulta al tocar.
                        <TouchableOpacity
                          onPress={() =>
                            setAviso({
                              tono: 'ok',
                              titulo: 'Sesión verificada',
                              mensaje:
                                `Validada el ${formatearFecha(item.sesion_certificada_en)}.` +
                                (item.certificacion_tipo === 'MANUAL'
                                  ? '\n\nSe cerró con justificación manual porque no se pudo validar la presencialidad.'
                                  : '\n\nTodos los factores del protocolo multi-factor coincidieron.'),
                            })
                          }
                        >
                          <Text style={styles.textoCertificada}>✅ Sesión verificada</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => validarSesion(item.cita_id)}>
                          <Text style={styles.enlaceEvidencia}>🔏 Validar sesión</Text>
                        </TouchableOpacity>
                      )}
                      {item.firma_tipo === 'FIRMA' ? (
                        // Firmada: se resume igual que la validación.
                        <TouchableOpacity
                          onPress={() =>
                            setAviso({
                              tono: 'ok',
                              titulo: 'Firma verificada',
                              mensaje: `El paciente firmó su conformidad el ${formatearFecha(item.firma_momento)}.`,
                            })
                          }
                        >
                          <Text style={styles.textoCertificada}>✅ Firma verificada</Text>
                        </TouchableOpacity>
                      ) : (
                        <View>
                          {item.firma_tipo === 'RECHAZO' && (
                            <Text style={styles.textoPendienteFirma}>
                              ⛔ Firma rechazada el {formatearFecha(item.firma_momento)}
                            </Text>
                          )}
                          {item.firma_tipo === 'CONFORMIDAD_POR_CORREO' && (
                            <Text style={styles.textoPendienteFirma}>
                              📧 Enviada por correo el {formatearFecha(item.firma_momento)}
                            </Text>
                          )}
                          <TouchableOpacity
                            onPress={() =>
                              navigation.navigate('FirmaConformidad', {
                                citaId: item.cita_id,
                                nombrePaciente,
                              })
                            }
                          >
                            <Text style={styles.enlaceEvidencia}>✍️ Firma de conformidad</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {/* CU22: historial de cambios de la cita para auditoría */}
                  <TouchableOpacity onPress={() => verTrazabilidad(item.cita_id)}>
                    <Text style={styles.enlaceTrazabilidad}>📜 Ver trazabilidad de la cita</Text>
                  </TouchableOpacity>
                  </>
                  )}
                </View>
              );
  };

  return (
    <ScrollView 
      ref={refScroll}
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => cargarHistorial(true)} colors={[colores.primario]} />
      }
    >
      <Text style={styles.titulo}>Ficha Clínica Electrónica</Text>
      <Text style={styles.subtitulo}>Historial consolidado del paciente</Text>

      <View style={styles.infoPaciente}>
        <Text style={styles.infoTitulo}>Paciente</Text>
        <Text>Nombre: {paciente?.nombre_completo || nombrePaciente}</Text>
        <Text>ID paciente: {pacienteId}</Text>
        <Text>RUT: {paciente?.rut || 'No informado'}</Text>
        <Text>Sexo clínico: {paciente?.sexo_clinico || 'No informado'}</Text>
        {/* CU09: la dirección es clave para las atenciones a domicilio, pero
            el paciente puede haberla ocultado desde su configuración. */}
        <Text>Dirección: {textoDireccion(paciente)}</Text>
      </View>

      {/* CU29: acceso a la evaluación inicial (anamnesis) */}
      <TouchableOpacity
        style={styles.botonAnamnesis}
        onPress={() =>
          navigation.navigate('Anamnesis', {
            pacienteId,
            nombrePaciente,
          })
        }
      >
        <Text style={styles.botonAnamnesisTexto}>📋 Registrar Anamnesis</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator size="large" style={styles.loading} color={colores.primario} />}

      {error !== '' && (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.boton} onPress={() => cargarHistorial(false)}>
            <Text style={styles.botonTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && error === '' && (
        <>
          {/* CU33: repositorio multimedia no disponible */}
          {mensajeMultimedia !== '' && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Multimedia no disponible</Text>
              <Text style={styles.warningText}>{mensajeMultimedia}</Text>
            </View>
          )}

          {/* CU33/CU34/CU35: repositorio multimedia del paciente */}
          {multimediaDisponible && (
            <TouchableOpacity
              style={styles.botonDocumentos}
              onPress={() =>
                navigation.navigate('Documentos', {
                  pacienteId,
                  nombrePaciente: nombrePaciente || paciente?.nombre_completo,
                })
              }
            >
              <Text style={styles.botonDocumentosTexto}>
                📁 Documentos del paciente{totalDocumentos > 0 ? ` (${totalDocumentos})` : ''}
              </Text>
            </TouchableOpacity>
          )}

          {/* ── CU25: reporte de hallazgos pre-clínicos ──
              Lo primero que el profesional debe leer antes de atender. */}
          <View style={styles.tarjetaPreclinico}>
            <Text style={styles.tituloPreclinico}>🩺 Entrevista previa del paciente</Text>

            {errorPreclinico ? (
              <>
                <Text style={styles.textoPreclinico}>
                  No pudimos cargar el reporte. Puede ser una demora del servidor.
                </Text>
                <TouchableOpacity onPress={cargarPreclinico}>
                  <Text style={styles.enlacePreclinico}>Reintentar</Text>
                </TouchableOpacity>
              </>
            ) : !preclinico ? (
              <ActivityIndicator color={colores.primario} />
            ) : !preclinico.hay_triaje ? (
              <Text style={styles.textoPreclinico}>{preclinico.mensaje}</Text>
            ) : !preclinico.reporte?.suficiente ? (
              // Excepción 1 del CU25: sin datos suficientes no se inventa nada.
              <>
                <Text style={styles.etiquetaInsuficiente}>Información insuficiente</Text>
                <Text style={styles.textoPreclinico}>{preclinico.reporte.resumen}</Text>
              </>
            ) : (
              <>
                {preclinico.reporte.banderas?.length > 0 ? (
                  <View style={styles.cajaBanderas}>
                    {preclinico.reporte.banderas.map((b, i) => (
                      <Text
                        key={`${b.codigo}-${i}`}
                        style={[
                          styles.bandera,
                          b.severidad === 'CRITICA' && styles.banderaCritica,
                        ]}
                      >
                        {b.severidad === 'CRITICA' ? '🚩' : '⚠️'} {b.texto}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.sinBanderas}>✅ Sin banderas rojas en la entrevista.</Text>
                )}

                <Text style={styles.textoPreclinico}>{preclinico.reporte.resumen}</Text>

                {preclinico.reporte.especialidad_sugerida ? (
                  <Text style={styles.sugerenciaPreclinico}>
                    Orientación sugerida al paciente: {preclinico.reporte.especialidad_sugerida}.
                  </Text>
                ) : null}

                <Text style={styles.momentoPreclinico}>
                  Entrevista respondida el {formatearFecha(preclinico.reporte.momento_triaje)}
                </Text>
              </>
            )}
          </View>

          {/* ── CU44: compromiso del paciente con su pauta de ejercicios ── */}
          {adherencia && adherencia.porcentaje !== null && adherencia.porcentaje !== undefined && (
            <View style={styles.tarjetaAdherencia}>
              <Text style={styles.tituloSeguimiento}>
                🏋️ Adherencia a la pauta: {adherencia.porcentaje}%
              </Text>
              <Text style={styles.lineaSeguimiento}>
                Cumplió {adherencia.cumplidas} de {adherencia.programadas} tareas programadas.
              </Text>
              <View style={styles.barraAdherencia}>
                <View
                  style={[
                    styles.barraAdherenciaLlena,
                    {
                      width: `${adherencia.porcentaje}%`,
                      backgroundColor:
                        adherencia.porcentaje >= 80
                          ? colores.exito
                          : adherencia.porcentaje >= 50
                            ? colores.advertencia
                            : colores.error,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {/* ── CU50: cómo ha reportado el paciente su evolución ── */}
          {seguimiento.length > 0 && (
            <View style={styles.tarjetaSeguimiento}>
              <Text style={styles.tituloSeguimiento}>📈 Reportes del paciente entre sesiones</Text>
              {seguimiento.slice(0, 6).map((r) => (
                <Text key={r.reporte_sintoma_id} style={styles.lineaSeguimiento}>
                  {formatearFecha(r.momento_registro)} · dolor {r.nivel_dolor}/10 ·
                  limitación {r.limitacion_funcional}/10
                  {r.comentario ? ` · "${r.comentario}"` : ''}
                </Text>
              ))}
            </View>
          )}

          {/* ── CU71: cuadratura de sesiones bonificables ── */}
          <View style={styles.tarjetaCuadratura}>
            <Text style={styles.tituloCuadratura}>💳 Cuadratura de coberturas</Text>
            {cuadratura === null ? (
              <TouchableOpacity
                style={styles.botonCuadratura}
                onPress={sincronizarCoberturas}
                disabled={sincronizando}
              >
                {sincronizando ? (
                  <ActivityIndicator color={colores.superficie} size="small" />
                ) : (
                  <Text style={styles.botonCuadraturaTexto}>Sincronizar con coberturas</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.lineaCuadratura}>
                  Sesiones realizadas: {cuadratura.sesiones_realizadas} · Autorizadas por planes:{' '}
                  {cuadratura.sesiones_autorizadas} (usadas {cuadratura.sesiones_usadas})
                </Text>
                {cuadratura.discrepancia_saldo && (
                  <Text style={styles.alertaCuadratura}>
                    ⚠️ Discrepancia de saldo: las sesiones ejecutadas superan las
                    autorizadas. Regulariza la cobertura con el paciente.
                  </Text>
                )}
                {cuadratura.realizadas_sin_bono.length > 0 && (
                  <Text style={styles.alertaCuadratura}>
                    ⚠️ {cuadratura.realizadas_sin_bono.length} atención(es) realizadas sin
                    bono registrado (citas #{cuadratura.realizadas_sin_bono.join(', #')}).
                  </Text>
                )}
                {/* CU72: bonos ingresados a mano mientras el financiador no respondía. */}
                {(cuadratura.bonos_provisorios || []).length > 0 && (
                  <Text style={styles.lineaCuadratura}>
                    ⏳ {cuadratura.bonos_provisorios.length} bono(s) provisorio(s) por contingencia, pendientes
                    de validar con el financiador.
                  </Text>
                )}
                {cuadratura.realizadas_sin_bono.length > 0 && (
                  <TouchableOpacity onPress={() => navigation.navigate('ContingenciaBonos')}>
                    <Text style={styles.descartarCuadratura}>
                      ¿El financiador no responde? Ingresar bono por contingencia
                    </Text>
                  </TouchableOpacity>
                )}
                {!cuadratura.discrepancia_saldo && cuadratura.realizadas_sin_bono.length === 0 && (
                  <Text style={styles.okCuadratura}>
                    ✅ El registro contable está alineado con las autorizaciones.
                  </Text>
                )}
                <TouchableOpacity onPress={() => setCuadratura(null)}>
                  <Text style={styles.descartarCuadratura}>Descartar informe</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* CU20, CU38: citas del paciente, activas y anteriores */}
          <Text style={styles.seccionTitulo}>Atenciones / Citas</Text>

          {citasActivas.length === 0 ? (
            <Text style={styles.sinResultados}>
              {historial.length === 0
                ? 'Sin atenciones registradas'
                : 'Sin citas por atender. Las anteriores están más abajo.'}
            </Text>
          ) : (
            citasActivas.map(renderCita)
          )}

          {/* Las citas ya cerradas (realizadas, inasistencias y canceladas) no
              deben llenar la vista: quedan plegadas, disponibles al abrirlas. */}
          {citasAntiguas.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.cabeceraAntiguas}
                onPress={() => setVerAntiguas((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.enlaceAntiguas}>
                  {verAntiguas ? '▾' : '▸'} Citas anteriores ({citasAntiguas.length})
                </Text>
              </TouchableOpacity>
              {verAntiguas && citasAntiguas.map(renderCita)}
            </>
          )}

          {/* CU28, CU78: episodios clínicos del paciente */}
          <Text style={styles.seccionTitulo}>Episodios Clínicos</Text>

          {episodiosOrdenados.length === 0 ? (
            <Text style={styles.sinResultados}>Sin episodios registrados</Text>
          ) : (
            <>
              {renderEpisodio(episodiosOrdenados[0])}
              <SeccionHistorial
                titulo="Historial de episodios"
                cantidad={episodiosOrdenados.length - 1}
                ayuda="Episodios anteriores del paciente"
              >
                {episodiosOrdenados.slice(1).map(renderEpisodio)}
              </SeccionHistorial>
            </>
          )}

          {/* CU28, CU30, CU31: evoluciones clínicas con sus versiones */}
          <Text style={styles.seccionTitulo}>Evoluciones Clínicas</Text>

          {evolucionesOrdenadas.length === 0 ? (
            <Text style={styles.sinResultados}>
              Sin evoluciones clínicas registradas
            </Text>
          ) : (
            <>
              {renderEvolucion(evolucionesOrdenadas[0])}
              <SeccionHistorial
                titulo="Historial de evoluciones"
                cantidad={evolucionesOrdenadas.length - 1}
                ayuda="Evoluciones anteriores, con sus versiones y correcciones"
              >
                {evolucionesOrdenadas.slice(1).map(renderEvolucion)}
              </SeccionHistorial>
            </>
          )}
        </>
      )}

      <View style={{ height: 30 }} />

      {/* CU31: la corrección exige texto descriptivo; el original no se toca */}
      <DialogoMotivo
        visible={correccionEvolucion !== null}
        titulo="Corrección versionada"
        descripcion={
          correccionEvolucion
            ? `Evolución #${correccionEvolucion.evolucion_clinica_id} (cerrada). Redacta la aclaración: se guardará como una nueva versión y el registro original quedará íntegro para auditoría.`
            : ''
        }
        etiquetaConfirmar="Guardar versión"
        colorConfirmar={colores.primario}
        onConfirmar={(texto) => crearCorreccion(correccionEvolucion.evolucion_clinica_id, texto)}
        onCancelar={() => setCorreccionEvolucion(null)}
      />

      {/* CU41: cierre manual auditado cuando falta una ubicación o estaban lejos */}
      <DialogoMotivo
        visible={cierreManualCita !== null}
        titulo="Cierre manual auditado"
        descripcion="Justifica por qué la presencialidad no pudo validarse:"
        etiquetaConfirmar="Certificar sesión"
        colorConfirmar={colores.primario}
        onConfirmar={(motivo) => {
          const cita = cierreManualCita;
          setCierreManualCita(null);
          validarSesion(cita, { confirmar: true, cierre_manual: true, justificacion: motivo });
        }}
        onCancelar={() => setCierreManualCita(null)}
      />

      {/* CU38 Exc.2: marca horaria manual justificada */}
      <Modal
        visible={marcaManual !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMarcaManual(null)}
      >
        <View style={styles.veloManual}>
          <View style={styles.cajaManual}>
            <Text style={styles.tituloManual}>
              Marca de {marcaManual?.tipo === 'INICIO' ? 'inicio' : 'término'} manual
            </Text>
            <Text style={styles.ayudaManual}>
              Queda auditada como registro manual. Usa el formato
              AAAA-MM-DDTHH:MM:SS, por ejemplo 2026-09-09T14:30:00.
            </Text>
            <TextInput
              style={styles.campoManual}
              value={marcaManual?.fechaHora || ''}
              onChangeText={(v) => setMarcaManual((m) => ({ ...m, fechaHora: v }))}
              autoCapitalize="none"
              placeholder="Fecha y hora"
              placeholderTextColor={colores.textoTenue}
            />
            <TextInput
              style={[styles.campoManual, styles.campoManualAlto]}
              value={marcaManual?.justificacion || ''}
              onChangeText={(v) => setMarcaManual((m) => ({ ...m, justificacion: v }))}
              multiline
              textAlignVertical="top"
              placeholder="Motivo por el que se registra a mano"
              placeholderTextColor={colores.textoTenue}
            />
            <View style={styles.accionesManual}>
              <TouchableOpacity style={styles.botonManualCancelar} onPress={() => setMarcaManual(null)}>
                <Text style={styles.textoManualCancelar}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botonManualConfirmar} onPress={enviarMarcaManual}>
                <Text style={styles.textoManualConfirmar}>Registrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
        onCancelar={() => {
          const alCancelar = confirmacion?.alCancelar;
          setConfirmacion(null);
          if (alCancelar) alCancelar();
        }}
      />


      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        lista={aviso?.lista}
        tono={aviso?.tono}
        onCerrar={() => {
          const seguir = aviso?.alCerrar;
          setAviso(null);
          if (seguir) seguir();
        }}
      />

      {/* CU22: la cancelación del profesional también exige justificación */}
      <DialogoMotivo
        visible={citaPorCancelar !== null}
        titulo="Cancelar cita"
        descripcion="Indica el motivo de la cancelación (queda en la auditoría):"
        etiquetaConfirmar="Cancelar cita"
        onConfirmar={(motivo) => {
          const pendiente = citaPorCancelar;
          setCitaPorCancelar(null);
          modificarEstadoCita(pendiente.citaId, pendiente.estadoActual, 'CANCELAR', motivo);
        }}
        onCancelar={() => setCitaPorCancelar(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colores.fondo,
    // El contenido no puede quedar al ras del borde de la pantalla.
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.base,
  },
  titulo: {
    ...tipografia.titulo,
    color: colores.textoTitulo,
    marginBottom: 4,
  },
  subtitulo: {
    ...tipografia.meta,
    color: colores.textoSuave,
    marginBottom: 16,
  },
  infoPaciente: {
    ...piezas.tarjeta,
    marginBottom: 12,
  },
  infoTitulo: {
    ...tipografia.micro,
    color: colores.textoTenue,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  loading: { marginTop: 20 },
  seccionTitulo: {
    ...tipografia.micro,
    color: colores.textoTenue,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 10,
  },
  card: {
    ...piezas.tarjeta,
    marginBottom: 12,
  },
  cardEpisodio: {
    ...piezas.tarjeta,
    marginBottom: 12,
  },
  cardEvolucion: {
    ...piezas.tarjeta,
    marginBottom: 12,
  },
  // CU33/CU35: acceso al repositorio multimedia
  botonDocumentos: {
    borderWidth: 1,
    borderColor: colores.primario,
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.sm,
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  botonDocumentosTexto: { color: colores.primario, fontWeight: 'bold' },
  // CU31: correcciones versionadas
  filaVersiones: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  enlaceVersiones: { color: colores.primario, fontWeight: '600', fontSize: 13 },
  pistaCorreccion: { color: colores.textoSuave, fontSize: 13, fontStyle: 'italic', marginTop: 8 },
  enlaceCorreccion: { color: colores.primario, fontWeight: '600', fontSize: 13 },
  cajaVersiones: {
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: colores.primario,
    paddingLeft: 10,
  },
  itemVersion: { marginBottom: 8 },
  tituloVersion: { fontWeight: 'bold', fontSize: 13, color: colores.primario },
  textoVersion: { color: colores.texto, fontSize: 13 },
  fecha: { fontWeight: 'bold', marginBottom: 6 },
  errorContainer: { marginTop: 20 },
  error: { color: 'red', marginBottom: 10 },
  boton: {
    ...piezas.botonPrimario,
    alignItems: 'center',
  },
  botonTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.textoInverso,
  },
  botonAnamnesis: {
    ...piezas.botonPrimario,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  botonAnamnesisTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.textoInverso,
  },
  warningBox: {
    backgroundColor: colores.advertenciaSuave,
    borderLeftWidth: 4,
    borderLeftColor: colores.advertencia,
    padding: 12,
    borderRadius: radio.sm,
    marginTop: 16,
  },
  warningTitle: {
    fontWeight: 'bold',
    color: colores.advertencia,
    marginBottom: 4,
  },
  warningText: { color: colores.advertencia },
  sinResultados: { color: colores.textoSuave, marginBottom: 12 },
  
  containerAcciones: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
    paddingTop: 12,
  },
  // Acciones de la cita: misma altura, radio y tipografía que el resto de
  // los botones de la app; el color lo pone el estado al que llevan.
  botonAccion: {
    flex: 1,
    paddingVertical: espacio.md,
    marginHorizontal: espacio.xs,
    borderRadius: radio.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra.suave,
  },
  textoBotonAccion: {
    ...tipografia.metaFuerte,
    color: colores.textoInverso,
  },
  esperaPago: { backgroundColor: colores.superficieSuave, borderWidth: 1, borderColor: colores.borde },
  textoEsperaPago: { ...tipografia.metaFuerte, color: colores.textoSuave, textAlign: 'center' },
  estadoTexto: {
    fontWeight: '600',
    color: colores.primario
  },
  tarjetaCuadratura: {
    backgroundColor: colores.advertenciaSuave,
    borderWidth: 1,
    borderColor: colores.advertenciaBorde,
    borderRadius: radio.md,
    padding: 12,
    marginTop: 14,
    marginBottom: 6,
  },
  tituloCuadratura: { fontWeight: 'bold', color: colores.advertencia, marginBottom: 8, fontSize: 15 },
  botonCuadratura: {
    ...piezas.botonPrimario,
    alignItems: 'center',
  },
  botonCuadraturaTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.textoInverso,
  },
  lineaCuadratura: { color: colores.advertencia, marginBottom: 6 },
  alertaCuadratura: { color: colores.error, marginBottom: 6, fontWeight: '600' },
  okCuadratura: { color: colores.exito, marginBottom: 6, fontWeight: '600' },
  descartarCuadratura: { color: colores.advertencia, fontWeight: 'bold', textAlign: 'right', marginTop: 4 },
  enlaceEvidencia: {
    color: colores.exito,
    fontWeight: 'bold',
    fontSize: 13,
    marginTop: 10,
  },
  filaCierre: { flexDirection: 'row', justifyContent: 'space-between' },
  enlaceTrazabilidad: {
    color: colores.primario,
    fontWeight: 'bold',
    fontSize: 13,
    marginTop: 10,
  },
  // CU25 — el reporte pre-clínico, arriba de todo.
  tarjetaPreclinico: {
    ...piezas.tarjeta,
    marginBottom: espacio.base,
    backgroundColor: colores.primarioSuave,
    borderColor: colores.primarioBorde,
  },
  tituloPreclinico: { ...tipografia.cuerpoFuerte, color: colores.primario, marginBottom: espacio.sm },
  textoPreclinico: { ...tipografia.meta, color: colores.texto, marginTop: espacio.xs },
  enlacePreclinico: { ...tipografia.metaFuerte, color: colores.primario, marginTop: espacio.sm },
  etiquetaInsuficiente: {
    ...tipografia.micro,
    color: colores.advertencia,
    backgroundColor: colores.advertenciaSuave,
    borderRadius: radio.sm,
    paddingVertical: 4,
    paddingHorizontal: espacio.sm,
    alignSelf: 'flex-start',
  },
  cajaBanderas: { marginBottom: espacio.sm },
  bandera: {
    ...tipografia.meta,
    color: colores.advertencia,
    backgroundColor: colores.advertenciaSuave,
    borderRadius: radio.sm,
    paddingVertical: 6,
    paddingHorizontal: espacio.sm,
    marginBottom: 4,
  },
  // La crítica se lee distinta de la alta sin tener que leer el texto entero.
  banderaCritica: { color: colores.error, backgroundColor: colores.errorSuave, fontWeight: '700' },
  sinBanderas: { ...tipografia.meta, color: colores.exito },
  sugerenciaPreclinico: { ...tipografia.meta, color: colores.secundarioFuerte, marginTop: espacio.sm },
  momentoPreclinico: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.sm },

  // CU44 — el índice de adherencia, con la misma barra que ve el paciente.
  tarjetaAdherencia: { ...piezas.tarjeta, marginBottom: espacio.base },
  barraAdherencia: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colores.superficieSuave,
    overflow: 'hidden',
    marginTop: espacio.sm,
  },
  barraAdherenciaLlena: { height: '100%', borderRadius: 4 },

  // CU50 — reportes de evolución enviados por el paciente.
  tarjetaSeguimiento: { ...piezas.tarjeta, marginBottom: espacio.base },
  tituloSeguimiento: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginBottom: espacio.sm },
  lineaSeguimiento: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },

  metaEpisodio: { ...tipografia.meta, color: colores.primario, marginTop: espacio.xs },
  metaEpisodioVacia: { ...tipografia.meta, color: colores.textoTenue, marginTop: espacio.xs },
  cardResaltada: {
    borderWidth: 2,
    borderColor: colores.exito,
    backgroundColor: colores.exitoSuave,
  },
  avisoResaltada: {
    color: colores.exito,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  cabeceraAntiguas: {
    marginTop: espacio.sm,
    paddingVertical: espacio.sm,
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
  },
  enlaceAntiguas: { ...tipografia.metaFuerte, color: colores.primario },
  enlaceMarcaManual: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm },
  veloManual: { flex: 1, backgroundColor: colores.velo, justifyContent: 'center', padding: espacio.xl },
  cajaManual: { backgroundColor: colores.superficie, borderRadius: radio.xl, padding: espacio.xl, ...sombra.elevada },
  tituloManual: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.sm },
  ayudaManual: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },
  campoManual: { ...piezas.campo, marginBottom: espacio.md },
  campoManualAlto: { minHeight: 84, textAlignVertical: 'top' },
  accionesManual: { flexDirection: 'row', gap: espacio.md, marginTop: espacio.sm },
  notaPresencialidad: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm },
  botonManualCancelar: { flex: 1, paddingVertical: espacio.md, borderRadius: radio.md, borderWidth: 1.5, borderColor: colores.borde, alignItems: 'center' },
  textoManualCancelar: { ...tipografia.cuerpoFuerte, color: colores.textoSuave },
  botonManualConfirmar: { flex: 1, paddingVertical: espacio.md, borderRadius: radio.md, backgroundColor: colores.primario, alignItems: 'center' },
  textoManualConfirmar: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  textoCertificada: { color: colores.exito, fontWeight: '600', fontSize: 13 },
  textoPendienteFirma: { color: colores.advertencia, fontSize: 13, marginBottom: 4 },
  cajaAjena: {
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.sm,
    padding: 10,
    marginTop: 10,
  },
  textoAjena: { color: colores.textoSuave, fontSize: 13, lineHeight: 18 },
  textoTerminal: {
    color: colores.textoSuave,
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 4,
    textAlign: 'center',
    flex: 1,
  }
});