/**
 * C_Motor_Agendamiento
 *
 * Componente "Motor Agendamiento" del Diagrama de Componentes (Incremento 1).
 * Reglas de la agenda: trazabilidad de cada cambio de estado de la cita,
 * descuento de sesiones del paquete, lista de espera al liberarse un cupo,
 * respuesta a la confirmación de asistencia y solicitud de evaluación al
 * terminar la sesión.
 *
 * Casos de uso: CU09, CU16, CU18, CU19, CU21, CU22, CU55, CU76.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Motor_Agendamiento.registrarTrazabilidadAgenda(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const agenda = () => require('../services/agenda/agendaService');
const confirmacion = () => require('../services/agenda/confirmacionService');

module.exports = {
  // ── agendaService.js
  // CU22 — Registrando trazabilidad de transiciones de agenda
  registrarTrazabilidadAgenda: (...args) => agenda().registrarTrazabilidadAgenda(...args),
  // CU22 — Registrando trazabilidad de transiciones de agenda
  obtenerTrazabilidadCita: (...args) => agenda().obtenerTrazabilidadCita(...args),
  // CU55 — Evaluando satisfacción post-sesión
  pedirEvaluacion: (...args) => agenda().pedirEvaluacion(...args),
  // CU09 — Configurando privacidad de datos de contacto
  obtenerContactosCita: (...args) => agenda().obtenerContactosCita(...args),
  // CU76 — Ejecutando transacciones en máquina de estados de la cita
  descontarSesionPaquete: (...args) => agenda().descontarSesionPaquete(...args),
  // CU19 — Gestionando lista de espera secuencial
  datosDelBloque: (...args) => agenda().datosDelBloque(...args),
  // CU19 — Gestionando lista de espera secuencial
  describirBloque: (...args) => agenda().describirBloque(...args),
  // CU18, CU19
  ofrecerCupoListaEspera: (...args) => agenda().ofrecerCupoListaEspera(...args),
  // CU16 — Restringiendo disponibilidad administrativa
  agendaBloqueada: (...args) => agenda().agendaBloqueada(...args),

  // ── confirmacionService.js
  // CU21 — Confirmando asistencia a cita de forma distribuida
  leerSolicitud: (...args) => confirmacion().leerSolicitud(...args),
  // CU21 — Confirmando asistencia a cita de forma distribuida
  responderPorEnlace: (...args) => confirmacion().responderPorEnlace(...args),
  // CU21 — Confirmando asistencia a cita de forma distribuida
  cerrarSolicitudPorApp: (...args) => confirmacion().cerrarSolicitudPorApp(...args),
  // CU21 — Confirmando asistencia a cita de forma distribuida
  urlPublica: (...args) => confirmacion().urlPublica(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Motor_Agendamiento', module.exports);
