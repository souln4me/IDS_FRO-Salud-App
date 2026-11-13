/**
 * C_Despachador_Notificaciones
 *
 * Componente "Despachador de Notificaciones" del Diagrama de Componentes (Incremento 3).
 * Punto único de salida de los avisos: los guarda en el centro de
 * notificaciones y, según las preferencias del usuario, los envía por push
 * (API Expo Push) y por correo (API Brevo) a través de C_API_Adapter.
 *
 * Casos de uso: CU52.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Despachador_Notificaciones.despachar(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const despachador = () => require('../services/notifications/despachador');
const agenda = () => require('../services/agenda/agendaService');

module.exports = {
  // ── despachador.js
  // CU52 — Emitiendo notificaciones multicanal
  despachar: (...args) => despachador().despachar(...args),
  // CU52 — Emitiendo notificaciones multicanal
  enviarPush: (...args) => despachador().enviarPush(...args),
  // CU52 — Emitiendo notificaciones multicanal
  get TIPOS() { return despachador().TIPOS; },

  // ── agendaService.js
  // CU52 — Emitiendo notificaciones multicanal
  notificarUsuario: (...args) => agenda().notificarUsuario(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Despachador_Notificaciones', module.exports);
