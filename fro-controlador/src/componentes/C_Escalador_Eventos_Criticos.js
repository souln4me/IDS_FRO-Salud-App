/**
 * C_Escalador_Eventos_Criticos
 *
 * Componente "Escalador de Eventos Críticos" del Diagrama de Componentes (Incremento 4).
 * Detecta los términos críticos del diccionario de C_Filtro_Contenido en
 * síntomas, reseñas y tickets, registra el evento y avisa a los
 * administradores. El chat cifrado queda fuera.
 *
 * Casos de uso: CU62.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Escalador_Eventos_Criticos.escalar(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const escalamiento = () => require('../services/clinico/escalamientoService');

module.exports = {
  // ── escalamientoService.js
  // CU62 — Escalando Automáticamente Eventos Críticos a Supervisión
  escalar: (...args) => escalamiento().escalar(...args),
  // CU62 — Escalando Automáticamente Eventos Críticos a Supervisión
  get ORIGENES() { return escalamiento().ORIGENES; },
  // CU62 — Escalando Automáticamente Eventos Críticos a Supervisión
  extracto: (...args) => escalamiento().extracto(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Escalador_Eventos_Criticos', module.exports);
