/**
 * C_Motor_Clinico
 *
 * Componente "Motor Clínico" del Diagrama de Componentes (Incremento 3).
 * Análisis del triaje (reporte pre-clínico, banderas rojas y sugerencia de
 * especialidad), índice de adherencia, alertas por deterioro clínico y
 * reglas del episodio clínico, incluido el avance de sus metas.
 *
 * Casos de uso: CU23, CU24, CU25, CU26, CU27, CU28, CU32, CU44, CU45, CU48, CU50, CU51, CU77, CU78.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Motor_Clinico.estructurarTriaje(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const triaje = () => require('../services/clinico/triajeService');
const preclinico = () => require('../services/clinico/preclinicoService');
const adherencia = () => require('../services/clinico/adherenciaService');
const alertas = () => require('../services/clinico/alertaClinicaService');
const episodio = () => require('../services/clinico/episodioService');

module.exports = {
  // ── triajeService.js
  // CU27 — Registrando aceptación de disclaimer legal
  get DISCLAIMER() { return triaje().DISCLAIMER; },
  // CU23 — Ejecutando entrevista clínica automatizada de triaje
  get ARBOL_TRIAJE() { return triaje().ARBOL_TRIAJE; },
  // CU24 — Estructurando datos de sintomatología a Ficha Clínica
  estructurarTriaje: (...args) => triaje().estructurarTriaje(...args),
  // CU77 — Renderizando plantillas dinámicas de evaluación
  plantillaParaEspecialidad: (...args) => triaje().plantillaParaEspecialidad(...args),

  // ── preclinicoService.js
  // CU25 — Sintetizando reporte de hallazgos pre-clínicos
  analizarTriaje: (...args) => preclinico().analizarTriaje(...args),
  // CU26 — Sugiriendo derivación por especialidad clínica
  resolverDerivacion: (...args) => preclinico().resolverDerivacion(...args),
  // CU25, CU26
  generarReporte: (...args) => preclinico().generarReporte(...args),
  // CU26 — Sugiriendo derivación por especialidad clínica
  get DERIVACION() { return preclinico().DERIVACION; },

  // ── adherenciaService.js
  // CU44 — Actualizando indicadores de adherencia y síntomas
  calcularAdherencia: (...args) => adherencia().calcularAdherencia(...args),
  // CU44 — Actualizando indicadores de adherencia y síntomas
  actualizarIndicador: (...args) => adherencia().actualizarIndicador(...args),
  // CU44, CU45
  serieAdherencia: (...args) => adherencia().serieAdherencia(...args),
  // CU44 — Actualizando indicadores de adherencia y síntomas
  ultimoIndicador: (...args) => adherencia().ultimoIndicador(...args),
  // CU48 — Registrando cumplimiento diario de tareas
  hoySQL: (...args) => adherencia().hoySQL(...args),
  // CU50 — Generando y notificando alerta por deterioro clínico
  debeAlertarAdherencia: (...args) => adherencia().debeAlertarAdherencia(...args),

  // ── alertaClinicaService.js
  // CU50 — Generando y notificando alerta por deterioro clínico
  evaluarDeterioro: (...args) => alertas().evaluarDeterioro(...args),
  // CU50 — Generando y notificando alerta por deterioro clínico
  crearAlerta: (...args) => alertas().crearAlerta(...args),
  // CU50 — Generando y notificando alerta por deterioro clínico
  umbralesVigentes: (...args) => alertas().umbralesVigentes(...args),
  // CU50 — Generando y notificando alerta por deterioro clínico
  profesionalesDelPaciente: (...args) => alertas().profesionalesDelPaciente(...args),

  // ── episodioService.js
  // CU78 — Agrupando registros bajo entidad episodio clínico
  get ESTADO_ABIERTO() { return episodio().ESTADO_ABIERTO; },
  // CU78 — Agrupando registros bajo entidad episodio clínico
  get ESTADO_CERRADO() { return episodio().ESTADO_CERRADO; },
  // CU78 — Agrupando registros bajo entidad episodio clínico
  estaCerrado: (...args) => episodio().estaCerrado(...args),
  // CU78 — Agrupando registros bajo entidad episodio clínico
  obtenerEpisodio: (...args) => episodio().obtenerEpisodio(...args),
  // CU78 — Agrupando registros bajo entidad episodio clínico
  rechazarSiCerrado: (...args) => episodio().rechazarSiCerrado(...args),
  // CU28, CU32
  esProfesionalACargo: (...args) => episodio().esProfesionalACargo(...args),
  // CU28, CU32
  rechazarSiAjeno: (...args) => episodio().rechazarSiAjeno(...args),
  // CU32, CU51
  porcentajeObjetivosEpisodio: (...args) => episodio().porcentajeObjetivosEpisodio(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Motor_Clinico', module.exports);
