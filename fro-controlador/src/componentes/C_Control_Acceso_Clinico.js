/**
 * C_Control_Acceso_Clinico
 *
 * Componente "Control de Acceso Clínico" del Diagrama de Componentes (Incremento 4).
 * Decide qué profesional puede leer o registrar en la ficha de un paciente:
 * por episodio a cargo, por cita vigente o por derivación interna pendiente.
 * Complementa el control por rol de C_Seguridad_JWT_BCrypt.
 *
 * Casos de uso: CU12, CU28, CU65.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Control_Acceso_Clinico.parametrosAcceso(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const acceso = () => require('../services/clinico/accesoClinicoService');

module.exports = {
  // ── accesoClinicoService.js
  // CU65 — Registrando y Siguiendo Derivaciones Internas
  get ESTADOS_DERIVACION_CON_ACCESO() { return acceso().ESTADOS_DERIVACION_CON_ACCESO; },
  // CU28, CU65
  get SQL_PACIENTES_CON_ACCESO() { return acceso().SQL_PACIENTES_CON_ACCESO; },
  // CU28, CU65
  parametrosAcceso: (...args) => acceso().parametrosAcceso(...args),
  // CU12, CU28, CU65
  profesionalTratante: (...args) => acceso().profesionalTratante(...args),
  // CU65 — Registrando y Siguiendo Derivaciones Internas
  cerrarDerivacionesDelEpisodio: (...args) => acceso().cerrarDerivacionesDelEpisodio(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Control_Acceso_Clinico', module.exports);
