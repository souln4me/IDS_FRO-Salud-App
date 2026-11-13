/**
 * C_Validador_Presencialidad
 *
 * Componente "Validador de Presencialidad" del Diagrama de Componentes (Incremento 4).
 * Registra en cada marca de inicio y término la ubicación del profesional y
 * la del paciente, mide la distancia contra el radio permitido y evalúa los
 * factores para certificar la sesión. Trabaja junto a C_Motor_Agendamiento.
 *
 * Casos de uso: CU38, CU39, CU41.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Validador_Presencialidad.distanciaMetros(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const presencialidad = () => require('../services/agenda/presencialidadService');

module.exports = {
  // ── presencialidadService.js
  // CU39 — Validando presencialidad mediante coordenadas GPS
  distanciaMetros: (...args) => presencialidad().distanciaMetros(...args),
  // CU39 — Validando presencialidad mediante coordenadas GPS
  parsearJSON: (...args) => presencialidad().parsearJSON(...args),
  // CU39 — Validando presencialidad mediante coordenadas GPS
  coordenadas: (...args) => presencialidad().coordenadas(...args),
  // CU38, CU39
  registrarMarcaPresencial: (...args) => presencialidad().registrarMarcaPresencial(...args),
  // CU38 — Registrando marcas temporales de la prestación
  resumenMarca: (...args) => presencialidad().resumenMarca(...args),
  // CU41 — Validando sesión mediante protocolo multi-factor
  analizarFactores: (...args) => presencialidad().analizarFactores(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Validador_Presencialidad', module.exports);
