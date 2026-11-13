/**
 * Componente: Cliente Móvil
 * Casos de uso: CU05, CU08, CU10, CU11, CU14, CU19, CU21, CU25, CU26, CU28,
 * CU29, CU37, CU38, CU40, CU44, CU45, CU50, CU51, CU52, CU53, CU55, CU56, CU57,
 * CU58, CU60, CU61, CU62, CU63, CU64, CU65, CU70, CU72, CU73, CU74, CU75, CU78.
 *
 * Cliente HTTP de la app: agrega el token a cada llamada y reúne las funciones
 * que hablan con el servidor. Cada función indica su caso de uso.
 */
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { registrarLlamada, registrarSalida } from '../utils/registroApp';

// ── Dirección del backend ────────────────────────────────────────────────────
// En la nube se define EXPO_PUBLIC_API_URL en el archivo .env de fro-vista
// (ej. EXPO_PUBLIC_API_URL=https://fro-salud-api.onrender.com).
// Si no está definida, se usa la IP local de respaldo para trabajar sin nube.
const COMPUTADORA_IP = '192.168.1.130';
const URL_LOCAL = `http://${COMPUTADORA_IP}:3000`;

const servidor = (process.env.EXPO_PUBLIC_API_URL || URL_LOCAL).replace(/\/+$/, '');
// Se acepta tanto la URL con /api al final como sin ella.
const baseURL = servidor.endsWith('/api') ? servidor : `${servidor}/api`;

const apiClient = axios.create({
  baseURL,
  timeout: 100000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// CU08 — Gestionando sesiones y tokens de acceso
// Canal para que AuthContext inyecte su logoutSession.
let _onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  _onUnauthorized = handler;
};

// CU08 — Gestionando sesiones y tokens de acceso
// Interceptor de peticiones: inyecta el token en cada llamada.
apiClient.interceptors.request.use(
  async (config) => {
    // Registro de actividad: hora de salida para medir la duración.
    config.metadata = { inicio: Date.now() };
    registrarSalida({ metodo: config.method, url: config.url });
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error("Error al obtener token en el interceptor:", error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// CU08, CU70 — sesión vencida y proveedor externo caído
// Interceptor de respuestas.
// Registro de actividad: cada respuesta (o error) queda en la terminal de Expo.
function anotarLlamada(config, response, sinConexion = false) {
  const datos = response?.data;
  registrarLlamada({
    metodo: config?.method,
    url: config?.url,
    estado: response?.status,
    ms: config?.metadata ? Date.now() - config.metadata.inicio : 0,
    casoDeUso: response?.headers?.['x-caso-uso'] || null,
    componentes: response?.headers?.['x-componentes'] || null,
    codigoError: datos && typeof datos.error === 'string' && /^[A-Z_]+$/.test(datos.error) ? datos.error : null,
    sinConexion,
  });
}

apiClient.interceptors.response.use(
  (response) => {
    anotarLlamada(response.config, response);
    return response;
  },
  (error) => {
    anotarLlamada(error.config, error.response, !error.response);
    const status = error.response?.status;

    // CU08: 401: token expirado/inválido → logout global (vía AuthContext).
    //
    // Solo aplica a peticiones que iban autenticadas: un login con contraseña
    // equivocada también responde 401, y ahí no corresponde avisar que "la
    // sesión fue cerrada" — no había ninguna sesión que cerrar.
    const ibaAutenticada = Boolean(error.config?.headers?.Authorization);

    if (status === 401 && ibaAutenticada && _onUnauthorized) {
      const datos = error.response?.data || {};
      _onUnauthorized({
        codigo: datos.code || null,
        mensaje: datos.error || datos.mensaje || null,
      });
    }

    // ── CU70 Exc 3: el backend agotó los reintentos contra el proveedor externo (HTTP 503). ──
    if (status === 503) {
      error.proveedorNoDisponible = true;
      error.mensajeUsuario = 'El proveedor externo no respondió tras varios intentos. Inténtalo nuevamente en unos minutos.';
    }

    return Promise.reject(error);
  }
);

// =========================================================================
// AUTH
// =========================================================================

// CU05 — Autenticando usuario y resguardando credenciales
export const login = async (rut, contrasena) => {
  const response = await apiClient.post('/auth/login', {
    rut,
    contrasena,
  });

  return response.data;
};

// =========================================================================
// CU11 - PACIENTES ASIGNADOS
// =========================================================================

// CU11 — Visualizando panel interno de gestión profesional
export const getPacientesProfesional =async (profesionalId, buscar = '') => {
  const response = await apiClient.get(
    `/profesionales/${profesionalId}/pacientes`,
    {
      params: { buscar },
    }
  );

  return response.data;
};

// =========================================================================
// CU28 - HISTORIAL PACIENTE
// =========================================================================

// CU28 — Consolidando historial en ficha clínica electrónica
export const getHistorialPaciente = async (pacienteId, usuarioId) => {
  const response = await apiClient.get(
    `/profesionales/pacientes/${pacienteId}/historial`,
    {
      params: { usuarioId },
    }
  );

  return response.data;
};

// CU11 — Visualizando panel interno de gestión profesional
export const getPacientesUsuarioProfesional =async (usuarioId, buscar = '') => {
  const response = await apiClient.get(
    `/profesionales/usuario/${usuarioId}/pacientes`,
    {
      params: { buscar },
    }
  );

  return response.data;
};

// =========================================================================
// CU29 - FICHA CLÍNICA / ANAMNESIS
// =========================================================================

// CU28, CU29 — leer la ficha clínica del paciente
export const getFichaClinica =async (pacienteId) => {
  const response = await apiClient.get(`/clinica/ficha/${pacienteId}`);
  return response.data;
};

// CU29 — Registrando antecedentes en evaluación inicial
export const guardarAnamnesis =async (payload) => {
  const response = await apiClient.post('/clinica/ficha', payload);
  return response.data;
};

// =========================================================================
// CU40 - INTERVENCION Y RESPUESTA FISIOLOGICA
// =========================================================================

// CU40 — Documentando intervención y respuesta fisiológica
export const getSesionesIntervencion =async () => {
  const response = await apiClient.get('/clinica/intervenciones/sesiones');
  return response.data;
};

// CU40 — Documentando intervención y respuesta fisiológica
export const getIntervencion =async (episodioId) => {
  const response = await apiClient.get(`/clinica/intervenciones/${episodioId}`);
  return response.data;
};

// CU40 — Documentando intervención y respuesta fisiológica
export const guardarIntervencion =async (episodioId, payload) => {
  const response = await apiClient.put(
    `/clinica/intervenciones/${episodioId}`,
    payload
  );
  return response.data;
};

// CU40, CU78 — trasladar la atención en curso a otro episodio
// Pasa la atención en curso a otro episodio del mismo profesional: el paciente
// llegó por un motivo nuevo y la sesión se registra en el episodio nuevo.
export const trasladarAtencion = async (episodioId) => {
  const response = await apiClient.put(`/clinica/intervenciones/${episodioId}/atencion`);
  return response.data;
};

// =========================================================================
// CU38 - MARCAS TEMPORALES DE LA PRESTACION
// =========================================================================

// CU38 — Registrando marcas temporales de la prestación
// Opción C: la atención que el profesional tiene abierta ahora mismo, o null.
export const getAtencionEnCurso = async () => {
  const response = await apiClient.get('/citas/atencion-en-curso');
  return response.data;
};

// CU38 — Registrando marcas temporales de la prestación
// Sin rango devuelve toda la agenda; con desde/hasta (AAAA-MM-DD) solo esa
// franja, que es lo que necesita la jornada por día.
export const getCitasMarcasTemporales = async (rango = {}) => {
  const params = {};
  if (rango.desde && rango.hasta) {
    params.desde = rango.desde;
    params.hasta = rango.hasta;
  }
  const response = await apiClient.get('/citas/marcas-temporales', { params });
  return response.data;
};

// CU10, CU14 — catálogo de comunas (comunas donde atiende el profesional)
export const getComunas =async () => {
  const response = await apiClient.get('/auth/comunas');
  return response.data;
};

// CU38 — Registrando marcas temporales de la prestación
export const iniciarAtencion =async (citaId, payload = {}) => {
  const response = await apiClient.post(
    `/citas/marcas-temporales/${citaId}/iniciar`,
    payload
  );
  return response.data;
};

// CU38 — Registrando marcas temporales de la prestación
export const finalizarAtencion =async (citaId, payload = {}) => {
  const response = await apiClient.post(
    `/citas/marcas-temporales/${citaId}/finalizar`,
    payload
  );
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU52 — Centro de notificaciones, preferencias y dispositivos push
// ─────────────────────────────────────────────────────────────────────────────

// CU52 — Emitiendo notificaciones multicanal
export const getNotificaciones =async (pagina = 0) => {
  const response = await apiClient.get('/notificaciones', { params: { pagina } });
  return response.data;
};

// CU52 — Emitiendo notificaciones multicanal
export const getResumenNotificaciones =async () => {
  const response = await apiClient.get('/notificaciones/resumen');
  return response.data;
};

// CU52 — Emitiendo notificaciones multicanal
export const marcarNotificacionLeida =async (id) => {
  const response = await apiClient.post(`/notificaciones/${id}/leer`);
  return response.data;
};

// CU52 — Emitiendo notificaciones multicanal
export const marcarTodasLeidas =async () => {
  const response = await apiClient.post('/notificaciones/leer-todas');
  return response.data;
};

// CU52 — Emitiendo notificaciones multicanal
export const getPreferenciasNotificacion =async () => {
  const response = await apiClient.get('/notificaciones/preferencias');
  return response.data;
};

// CU52 — Emitiendo notificaciones multicanal
export const guardarPreferenciasNotificacion =async (preferencias) => {
  const response = await apiClient.put('/notificaciones/preferencias', preferencias);
  return response.data;
};

// CU52 — Emitiendo notificaciones multicanal
export const registrarDispositivoPush =async (token, plataforma) => {
  const response = await apiClient.post('/notificaciones/dispositivo', { token, plataforma });
  return response.data;
};

// CU52 — Emitiendo notificaciones multicanal
export const olvidarDispositivoPush =async (token) => {
  const response = await apiClient.delete('/notificaciones/dispositivo', { data: { token } });
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU21 — Confirmación de asistencia
// ─────────────────────────────────────────────────────────────────────────────

// CU21 — Confirmando asistencia a cita de forma distribuida
export const getConfirmacionesPendientes =async () => {
  const response = await apiClient.get('/citas/confirmaciones/pendientes');
  return response.data;
};

// CU21 — Confirmando asistencia a cita de forma distribuida
export const pedirNuevaSolicitudConfirmacion =async (citaId) => {
  const response = await apiClient.post(`/citas/${citaId}/solicitar-confirmacion`);
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU19 — Lista de espera
// ─────────────────────────────────────────────────────────────────────────────

// CU19 — Gestionando lista de espera secuencial
export const getMisListasEspera =async () => {
  const response = await apiClient.get('/citas/mis-listas-espera');
  return response.data;
};

// CU19 — Gestionando lista de espera secuencial
export const inscribirseListaEspera =async (citaId) => {
  const response = await apiClient.post(`/citas/${citaId}/lista-espera`);
  return response.data;
};

// CU19 — Gestionando lista de espera secuencial
export const salirListaEspera =async (citaId) => {
  const response = await apiClient.delete(`/citas/${citaId}/lista-espera`);
  return response.data;
};

// CU19 — Gestionando lista de espera secuencial
export const tomarCupoListaEspera =async (listaEsperaId) => {
  const response = await apiClient.post(`/citas/lista-espera/${listaEsperaId}/tomar`);
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU25 / CU26 / CU50 — Triaje inteligente, derivación y seguimiento
// ─────────────────────────────────────────────────────────────────────────────

// CU25 — Sintetizando reporte de hallazgos pre-clínicos
export const getReportePreclinico =async (pacienteId) => {
  const response = await apiClient.get(`/clinica/pacientes/${pacienteId}/reporte-preclinico`);
  return response.data;
};

// CU26 — Sugiriendo derivación por especialidad clínica
export const getMiDerivacion =async () => {
  const response = await apiClient.get('/clinica/mi-derivacion');
  return response.data;
};

// CU51: avance hacia el umbral de egreso, contenidos de prevención e informe de alta.
export const getMiAlta = async () => {
  const response = await apiClient.get('/clinica/mi-alta');
  return response.data;
};

// CU37: resumen del episodio antes de emitir el alta, y la emisión.
export const getInformeAlta = async (episodioId) => {
  const response = await apiClient.get(`/clinica/episodio/${episodioId}/informe-alta`);
  return response.data;
};
// CU37 — Emitiendo informe de alta y cierre de episodio
export const emitirInformeAlta =async (episodioId, pautasContinuidad) => {
  const response = await apiClient.post(`/clinica/episodio/${episodioId}/informe-alta`, {
    pautas_continuidad: pautasContinuidad,
  });
  return response.data;
};

// CU50 — Generando y notificando alerta por deterioro clínico
export const enviarReporteSintomas =async (payload) => {
  const response = await apiClient.post('/clinica/sintomas', payload);
  return response.data;
};

// CU50 — Generando y notificando alerta por deterioro clínico
export const getMisSintomas =async () => {
  const response = await apiClient.get('/clinica/mis-sintomas');
  return response.data;
};

// CU50 — Generando y notificando alerta por deterioro clínico
export const getSintomasDePaciente =async (pacienteId) => {
  const response = await apiClient.get(`/clinica/pacientes/${pacienteId}/sintomas`);
  return response.data;
};

// CU50 — Generando y notificando alerta por deterioro clínico
export const getAlertasClinicas =async () => {
  const response = await apiClient.get('/clinica/alertas');
  return response.data;
};

// CU50 — Generando y notificando alerta por deterioro clínico
export const revisarAlertaClinica =async (alertaId) => {
  const response = await apiClient.post(`/clinica/alertas/${alertaId}/revisar`);
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU44 / CU45 — Adherencia y panel de progreso
// ─────────────────────────────────────────────────────────────────────────────

// CU44, CU45 — progreso y adherencia del propio paciente
export const getMiProgreso =async ({ desde, hasta } = {}) => {
  const params = {};
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  const response = await apiClient.get('/clinica/mi-progreso', { params });
  return response.data;
};

// CU44 — Actualizando indicadores de adherencia y síntomas
export const getAdherenciaDePaciente =async (pacienteId) => {
  const response = await apiClient.get(`/clinica/pacientes/${pacienteId}/adherencia`);
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU53 / CU57 — Mensajería clínica y diccionario de términos restringidos
// ─────────────────────────────────────────────────────────────────────────────

// CU53 — Comunicando mediante mensajería clínica cifrada
export const getMisConversaciones =async () => {
  const response = await apiClient.get('/clinica/mis-conversaciones');
  return response.data;
};

// CU53 — Comunicando mediante mensajería clínica cifrada
export const getMensajes =async (episodioId, desdeId = 0) => {
  const response = await apiClient.get(`/clinica/episodio/${episodioId}/mensajes`, {
    params: { desde_id: desdeId },
  });
  return response.data;
};

// CU53, CU57 — enviar mensaje; el servidor filtra términos restringidos
export const enviarMensajeClinico =async (episodioId, contenido) => {
  const response = await apiClient.post(`/clinica/episodio/${episodioId}/mensajes`, { contenido });
  return response.data;
};

// CU57 — Filtrando automáticamente contenido restringido
export const getPalabrasRestringidas =async () => {
  const response = await apiClient.get('/parametros/palabras-restringidas');
  return response.data;
};

// CU57 — Filtrando automáticamente contenido restringido
export const agregarPalabraRestringida =async (termino, categoria) => {
  const response = await apiClient.post('/parametros/palabras-restringidas', { termino, categoria });
  return response.data;
};

// CU57 — Filtrando automáticamente contenido restringido
export const alternarPalabraRestringida =async (id, activa) => {
  const response = await apiClient.put(`/parametros/palabras-restringidas/${id}`, { activa });
  return response.data;
};

// CU57 — Filtrando automáticamente contenido restringido
export const eliminarPalabraRestringida =async (id) => {
  const response = await apiClient.delete(`/parametros/palabras-restringidas/${id}`);
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU55 / CU56 / CU58 — Evaluación, moderación y calificación
// ─────────────────────────────────────────────────────────────────────────────

// CU55 — Evaluando satisfacción post-sesión
// Por sesión: { satisfecho, resena }. La nota en estrellas va por tratamiento.
export const registrarEvaluacion = async (citaId, datos) => {
  const response = await apiClient.post(`/citas/${citaId}/evaluacion`, datos);
  return response.data;
};

// CU55 (correcciones Inc 4): calificación general al cerrar el tratamiento.
export const getTratamientosPorEvaluar = async () => {
  const response = await apiClient.get('/clinica/tratamientos/por-evaluar');
  return response.data;
};
export const registrarEvaluacionTratamiento = async (episodioId, { puntuacion, resena }) => {
  const response = await apiClient.post(`/clinica/episodio/${episodioId}/evaluacion`, { puntuacion, resena });
  return response.data;
};

// CU55 — Evaluando satisfacción post-sesión
export const getEvaluacionesPendientes =async () => {
  const response = await apiClient.get('/citas/evaluaciones/pendientes');
  return response.data;
};

// CU10/CU14: perfil público de un profesional (solo lectura, para el paciente).
export const getPerfilPublicoProfesional = async (profesionalId) => {
  const response = await apiClient.get(`/profesionales/${profesionalId}/perfil-publico`);
  return response.data;
};

// CU58 — Calculando y visualizando calificación profesional
export const getResenasProfesional =async (profesionalId) => {
  const response = await apiClient.get(`/profesionales/${profesionalId}/resenas`);
  return response.data;
};

// CU56 — Moderando testimonios públicos
export const getBandejaModeracion =async (estado = 'PENDIENTE') => {
  const response = await apiClient.get('/evaluaciones/moderacion', { params: { estado } });
  return response.data;
};

// CU56 — Moderando testimonios públicos
export const moderarResena =async (evaluacionId, decision, motivo) => {
  const response = await apiClient.post(`/evaluaciones/${evaluacionId}/moderar`, {
    decision,
    motivo,
  });
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU60 / CU61 — Soporte técnico
// ─────────────────────────────────────────────────────────────────────────────

// CU60 — Registrando y siguiendo solicitudes de soporte
export const getCategoriasSoporte =async () => {
  const response = await apiClient.get('/soporte/categorias');
  return response.data;
};

// CU60 — Registrando y siguiendo solicitudes de soporte
export const getMisTickets =async () => {
  const response = await apiClient.get('/soporte/mis-tickets');
  return response.data;
};

/**
 * CU60 — Registrando y siguiendo solicitudes de soporte
 * El adjunto es opcional; cuando viene, se manda como formulario multiparte.
 */
export const crearTicketSoporte = async ({ categoria, descripcion, adjunto }) => {
  if (!adjunto) {
    const response = await apiClient.post('/soporte/tickets', { categoria, descripcion });
    return response.data;
  }
  const formulario = new FormData();
  formulario.append('categoria', categoria);
  formulario.append('descripcion', descripcion);
  formulario.append('adjunto', {
    uri: adjunto.uri,
    name: adjunto.nombre || `soporte-${Date.now()}.jpg`,
    type: adjunto.tipo || 'image/jpeg',
  });
  const response = await apiClient.post('/soporte/tickets', formulario, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// CU65: derivaciones internas entre especialidades.
export const getOpcionesDerivacion = async (episodioId) => {
  const response = await apiClient.get(`/clinica/episodio/${episodioId}/derivaciones/opciones`);
  return response.data;
};
export const getDerivacionesEpisodio = async (episodioId) => {
  const response = await apiClient.get(`/clinica/episodio/${episodioId}/derivaciones`);
  return response.data;
};
export const crearDerivacion = async (episodioId, datos) => {
  const response = await apiClient.post(`/clinica/episodio/${episodioId}/derivaciones`, datos);
  return response.data;
};
export const getDerivacionesRecibidas = async () => {
  const response = await apiClient.get('/clinica/derivaciones/recibidas');
  return response.data;
};
export const responderDerivacion = async (derivacionId, accion, comentario) => {
  const response = await apiClient.post(`/clinica/derivaciones/${derivacionId}/respuesta`, { accion, comentario });
  return response.data;
};
export const cerrarDerivacion = async (derivacionId) => {
  const response = await apiClient.post(`/clinica/derivaciones/${derivacionId}/cierre`);
  return response.data;
};

// CU72: interfaz de contingencia de bonos (profesional y administrador).
export const getContingenciaBonos = async () => {
  const response = await apiClient.get('/pagos/contingencia');
  return response.data;
};
export const registrarBonoContingencia = async (citaId, datos) => {
  const response = await apiClient.post(`/pagos/citas/${citaId}/bono-contingencia`, datos);
  return response.data;
};
export const cambiarModoContingencia = async (activo) => {
  const response = await apiClient.put('/pagos/contingencia/modo', { activo });
  return response.data;
};
export const regularizarBono = async (bonoId, financiadorId) => {
  const response = await apiClient.post(`/pagos/bonos/${bonoId}/regularizar`, financiadorId ? { financiador_id: financiadorId } : {});
  return response.data;
};

// CU62: bandeja de eventos críticos (administrador) y acuse de recibo.
export const getEventosCriticos = async (estado = 'PENDIENTE') => {
  const response = await apiClient.get('/gestion/eventos-criticos', { params: { estado } });
  return response.data;
};
export const acusarEventoCritico = async (eventoId) => {
  const response = await apiClient.post(`/gestion/eventos-criticos/${eventoId}/acuse`);
  return response.data;
};

// CU61 — Enrutando automáticamente solicitudes por categoría
export const getBandejaSoporte =async ({ estado = '', soloMios = false } = {}) => {
  const response = await apiClient.get('/soporte/bandeja', {
    params: { estado, solo_mios: soloMios ? 1 : 0 },
  });
  return response.data;
};

// CU61 — Enrutando automáticamente solicitudes por categoría
export const actualizarTicketSoporte =async (id, payload) => {
  const response = await apiClient.put(`/soporte/tickets/${id}`, payload);
  return response.data;
};

// CU61 — Enrutando automáticamente solicitudes por categoría
export const getMisAreasSoporte =async () => {
  const response = await apiClient.get('/soporte/areas');
  return response.data;
};

// CU61 — Enrutando automáticamente solicitudes por categoría
export const guardarMisAreasSoporte =async (areas) => {
  const response = await apiClient.put('/soporte/areas', { areas });
  return response.data;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU63 / CU64 — Panel de gestión e informes
// ─────────────────────────────────────────────────────────────────────────────

// CU64 — Visualizando dashboard de monitoreo de KPIs
export const getKPIs =async ({ desde, hasta } = {}) => {
  const params = {};
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  const response = await apiClient.get('/gestion/kpis', { params });
  return response.data;
};

// CU63 — Generando y exportando reportes operativos
export const getTiposDeInforme =async () => {
  const response = await apiClient.get('/gestion/informes');
  return response.data;
};

/**
 * CU63 — Generando y exportando reportes operativos
 * URL absoluta del informe: la descarga la hace expo-file-system con el token.
 */
export const urlInforme = (tipo, { desde, hasta, formato, tomo }) => {
  const parametros = new URLSearchParams();
  if (desde) parametros.append('desde', desde);
  if (hasta) parametros.append('hasta', hasta);
  if (formato) parametros.append('formato', formato);
  if (tomo) parametros.append('tomo', String(tomo));
  return `${apiClient.defaults.baseURL}/gestion/informes/${tipo}?${parametros.toString()}`;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU73 / CU74 / CU75 — Comercializacion, actualizacion y liquidaciones
// ─────────────────────────────────────────────────────────────────────────────

// CU73 — Comercializando prestaciones con restricción de cobro anticipado
export const getOpcionesDeCompra =async (citaId) => {
  const response = await apiClient.get(`/finanzas/citas/${citaId}/opciones`);
  return response.data;
};

// CU73 — Comercializando prestaciones con restricción de cobro anticipado
export const comprarPrestacion =async (citaId, payload) => {
  const response = await apiClient.post(`/finanzas/citas/${citaId}/comprar`, payload);
  return response.data;
};

// CU74 — Actualizando y devolviendo transacciones financieras
export const actualizarAPaquete =async (citaId, { sesiones, metodo_pago }) => {
  const response = await apiClient.post(`/finanzas/citas/${citaId}/actualizar-a-paquete`, {
    sesiones,
    metodo_pago,
  });
  return response.data;
};

// CU75 — Liquidando ganancias en panel financiero
export const getLiquidaciones =async (anio, mes) => {
  const response = await apiClient.get('/finanzas/liquidaciones', { params: { anio, mes } });
  return response.data;
};

// CU75 — Liquidando ganancias en panel financiero
export const emitirLiquidacion =async (payload) => {
  const response = await apiClient.post('/finanzas/liquidaciones', payload);
  return response.data;
};

// CU75 — Liquidando ganancias en panel financiero
export const getMisLiquidaciones =async () => {
  const response = await apiClient.get('/finanzas/mis-liquidaciones');
  return response.data;
};

export default apiClient;
