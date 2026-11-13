/**
 * C_Motor_Refuerzos
 *
 * Componente "Motor de Refuerzos" del Diagrama de Componentes (Incremento 4).
 * Tras cada marca de ejercicio compara el índice de adherencia de
 * C_Motor_Clinico con el anterior y envía como máximo un mensaje de ánimo al
 * día por C_Despachador_Notificaciones.
 *
 * Casos de uso: CU54.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Motor_Refuerzos.evaluarRefuerzo(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const refuerzo = () => require('../services/clinico/refuerzoService');

module.exports = {
  // ── refuerzoService.js
  // CU54 — Enviando Mensajes de Refuerzo Positivo
  evaluarRefuerzo: (...args) => refuerzo().evaluarRefuerzo(...args),
  // CU54 — Enviando Mensajes de Refuerzo Positivo
  textoRefuerzo: (...args) => refuerzo().textoRefuerzo(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Motor_Refuerzos', module.exports);
