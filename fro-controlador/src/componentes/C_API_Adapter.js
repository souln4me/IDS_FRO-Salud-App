/**
 * C_API_Adapter
 *
 * Componente "API Adapter" del Diagrama de Componentes (Incremento 1).
 * Único punto de contacto con los servicios externos: financiador de bonos y
 * pasarela de pagos (con reintentos y bitácora de transacciones), Cloudinary
 * para los archivos y Brevo para el correo.
 *
 * Casos de uso: CU04, CU06, CU33, CU52, CU68, CU69, CU70.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_API_Adapter.ejecutarTransaccion(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const proveedor = () => require('../services/external/providerAdapter');
const archivos = () => require('../config/cloudinary');
const correo = () => require('../services/notifications/otpService');

module.exports = {
  // ── providerAdapter.js
  // CU68, CU69, CU70
  ejecutarTransaccion: (...args) => proveedor().ejecutarTransaccion(...args),
  // CU68 — Intercambiando Datos con Proveedor Externo
  get PROVIDERS() { return proveedor().PROVIDERS; },

  // ── cloudinary.js
  // CU33 — Almacenando archivos en repositorio multimedia
  get cloudinary() { return archivos().cloudinary; },
  // CU33 — Almacenando archivos en repositorio multimedia
  cloudinaryConfigurado: (...args) => archivos().cloudinaryConfigurado(...args),
  // CU33 — Almacenando archivos en repositorio multimedia
  subirBuffer: (...args) => archivos().subirBuffer(...args),

  // ── otpService.js
  // CU52 — Emitiendo notificaciones multicanal
  enviarCorreo: (...args) => correo().enviarCorreo(...args),
  // CU52 — Emitiendo notificaciones multicanal
  entregarCorreo: (...args) => correo().entregarCorreo(...args),
  // CU04, CU06
  enviarPorEmail: (...args) => correo().enviarPorEmail(...args),
  // CU04 — Verificando identidad mediante código OTP
  explicarErrorSMTP: (...args) => correo().explicarErrorSMTP(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_API_Adapter', module.exports);
