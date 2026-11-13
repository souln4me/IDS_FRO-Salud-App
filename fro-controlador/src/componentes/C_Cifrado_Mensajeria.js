/**
 * C_Cifrado_Mensajeria
 *
 * Componente "Cifrado de Mensajería" del Diagrama de Componentes (Incremento 3).
 * Cifra y descifra los mensajes del chat clínico con AES-256-GCM. Es el
 * único componente que no accede a la base de datos.
 *
 * Casos de uso: CU53.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Cifrado_Mensajeria.cifrar(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const cifrado = () => require('../services/clinico/cifradoService');

module.exports = {
  // ── cifradoService.js
  // CU53 — Comunicando mediante mensajería clínica cifrada
  cifrar: (...args) => cifrado().cifrar(...args),
  // CU53 — Comunicando mediante mensajería clínica cifrada
  descifrar: (...args) => cifrado().descifrar(...args),
  // CU53 — Comunicando mediante mensajería clínica cifrada
  estadoClave: (...args) => cifrado().estadoClave(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Cifrado_Mensajeria', module.exports);
