/**
 * C_Gestor_Contingencia
 *
 * Componente "Gestor de Contingencia" del Diagrama de Componentes (Incremento 4).
 * Determina si el financiador está caído, leyendo la bitácora de
 * integraciones, o si el administrador forzó el modo manual. Los bonos
 * provisorios se regularizan luego a través de C_API_Adapter.
 *
 * Casos de uso: CU72.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Gestor_Contingencia.estadoContingencia(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const contingencia = () => require('../services/external/contingenciaService');

module.exports = {
  // ── contingenciaService.js
  // CU72 — Ingresando Datos mediante Interfaz de Contingencia
  estadoContingencia: (...args) => contingencia().estadoContingencia(...args),
  // CU72 — Ingresando Datos mediante Interfaz de Contingencia
  esFalla: (...args) => contingencia().esFalla(...args),
  // CU72 — Ingresando Datos mediante Interfaz de Contingencia
  get CLAVE_MODO() { return contingencia().CLAVE_MODO; },
  // CU72 — Ingresando Datos mediante Interfaz de Contingencia
  get CLAVE_VENTANA() { return contingencia().CLAVE_VENTANA; },
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Gestor_Contingencia', module.exports);
