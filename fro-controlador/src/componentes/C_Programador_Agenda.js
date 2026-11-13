/**
 * C_Programador_Agenda
 *
 * Componente "Programador de Agenda" del Diagrama de Componentes (Incremento 3).
 * Temporizador del servidor: emite las solicitudes de confirmación de
 * asistencia y vence los turnos de la lista de espera, ofreciendo el cupo al
 * siguiente.
 *
 * Casos de uso: CU19, CU21.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Programador_Agenda.iniciarProgramador(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const programador = () => require('../services/agenda/programador');
const confirmacion = () => require('../services/agenda/confirmacionService');
const agenda = () => require('../services/agenda/agendaService');

module.exports = {
  // ── programador.js
  // CU19, CU21
  iniciarProgramador: (...args) => programador().iniciarProgramador(...args),
  // CU19, CU21
  repasarAgenda: (...args) => programador().repasarAgenda(...args),

  // ── confirmacionService.js
  // CU21 — Confirmando asistencia a cita de forma distribuida
  emitirSolicitud: (...args) => confirmacion().emitirSolicitud(...args),
  // CU21 — Confirmando asistencia a cita de forma distribuida
  despacharSolicitudesPendientes: (...args) => confirmacion().despacharSolicitudesPendientes(...args),

  // ── agendaService.js
  // CU19 — Gestionando lista de espera secuencial
  revisarVencimientosListaEspera: (...args) => agenda().revisarVencimientosListaEspera(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Programador_Agenda', module.exports);
