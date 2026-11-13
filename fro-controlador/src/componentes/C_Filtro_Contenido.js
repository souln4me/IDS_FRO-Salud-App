/**
 * C_Filtro_Contenido
 *
 * Componente "Filtro de Contenido" del Diagrama de Componentes (Incremento 3).
 * Contrasta los textos del chat y de las reseñas con el diccionario de
 * términos restringidos antes de que se guarden, y entrega los términos
 * críticos a C_Escalador_Eventos_Criticos.
 *
 * Casos de uso: CU53, CU55, CU57, CU62.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Filtro_Contenido.revisar(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const filtro = () => require('../services/clinico/filtroContenidoService');

module.exports = {
  // ── filtroContenidoService.js
  // CU57, CU53, CU55
  revisar: (...args) => filtro().revisar(...args),
  // CU62 — Escalando Automáticamente Eventos Críticos a Supervisión
  detectarCriticos: (...args) => filtro().detectarCriticos(...args),
  // CU57 — Filtrando automáticamente contenido restringido
  diccionario: (...args) => filtro().diccionario(...args),
  // CU57 — Filtrando automáticamente contenido restringido
  refrescar: (...args) => filtro().refrescar(...args),
  // CU57 — Filtrando automáticamente contenido restringido
  normalizar: (...args) => filtro().normalizar(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Filtro_Contenido', module.exports);
