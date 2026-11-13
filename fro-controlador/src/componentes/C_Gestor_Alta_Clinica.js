/**
 * C_Gestor_Alta_Clinica
 *
 * Componente "Gestor de Alta Clínica" del Diagrama de Componentes (Incremento 4).
 * Calcula el avance de las metas frente al umbral de egreso, habilita los
 * contenidos de prevención y genera el informe de alta en PDF, que se guarda
 * en Cloudinary a través de C_API_Adapter, antes de cerrar el episodio.
 *
 * Casos de uso: CU37, CU51, CU78.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Gestor_Alta_Clinica.umbralEgreso(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const alta = () => require('../services/clinico/altaService');

module.exports = {
  // ── altaService.js
  // CU37 — Emitiendo informe de alta y cierre de episodio
  get LIMITE_PAUTAS_CONTINUIDAD() { return alta().LIMITE_PAUTAS_CONTINUIDAD; },
  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  umbralEgreso: (...args) => alta().umbralEgreso(...args),
  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  metasDelEpisodio: (...args) => alta().metasDelEpisodio(...args),
  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  reglasContradictorias: (...args) => alta().reglasContradictorias(...args),
  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  evaluarPreparacionAlta: (...args) => alta().evaluarPreparacionAlta(...args),
  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  recursosPrevencion: (...args) => alta().recursosPrevencion(...args),
  // CU37, CU78
  resumenCierre: (...args) => alta().resumenCierre(...args),
  // CU37, CU78
  impedimentoDeCierre: (...args) => alta().impedimentoDeCierre(...args),
  // CU37 — Emitiendo informe de alta y cierre de episodio
  generarPdfInformeAlta: (...args) => alta().generarPdfInformeAlta(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Gestor_Alta_Clinica', module.exports);
