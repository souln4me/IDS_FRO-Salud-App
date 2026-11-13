/**
 * C_Generador_Informes
 *
 * Componente "Generador de Informes" del Diagrama de Componentes (Incremento 3).
 * Compila los informes operativos en XLSX, PDF y CSV, y la ficha clínica
 * completa en PDF que descarga el paciente.
 *
 * Casos de uso: CU28, CU63.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Generador_Informes.aCSV(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const exportador = () => require('../services/informes/exportadorInformes');
const fichaPdf = () => require('../services/clinico/fichaPdfService');

module.exports = {
  // ── exportadorInformes.js
  // CU63 — Generando y exportando reportes operativos
  aCSV: (...args) => exportador().aCSV(...args),
  // CU63 — Generando y exportando reportes operativos
  aXLSX: (...args) => exportador().aXLSX(...args),
  // CU63 — Generando y exportando reportes operativos
  aPDF: (...args) => exportador().aPDF(...args),

  // ── fichaPdfService.js
  // CU28 — Consolidando historial en ficha clínica electrónica
  datosFicha: (...args) => fichaPdf().datosFicha(...args),
  // CU28 — Consolidando historial en ficha clínica electrónica
  generarPdfFicha: (...args) => fichaPdf().generarPdfFicha(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Generador_Informes', module.exports);
