/**
 * C_Seguridad_JWT_BCrypt
 *
 * Componente "Seguridad JWT/BCrypt" del Diagrama de Componentes (Incremento 1).
 * Autentica a cada usuario con su token JWT, revisa que su rol pueda usar la
 * ruta (RBAC), encripta las contraseñas con BCrypt, maneja los códigos OTP y
 * las sesiones por dispositivo, y registra en la bitácora cada acceso a la
 * ficha clínica.
 *
 * Casos de uso: CU01, CU02, CU04, CU05, CU06, CU07, CU08, CU12, CU13, CU79.
 *
 * Este archivo es la puerta de entrada al componente: el resto del servidor
 * lo llama siempre por este nombre, igual que en los diagramas de secuencia.
 * Ejemplo: C_Seguridad_JWT_BCrypt.verifyToken(...)
 * La lógica vive en los archivos que se cargan abajo.
 *
 * Cada función se carga recién cuando se usa (el require va dentro de la
 * flecha). Así dos componentes pueden llamarse entre sí sin que Node se
 * enrede con dependencias circulares al arrancar.
 */

const autenticacion = () => require('../middlewares/authMiddleware');
const roles = () => require('../middlewares/roleMiddleware');
const bitacoraAcceso = () => require('../middlewares/auditarAcceso');
const bcrypt = () => require('../utils/encriptar_bcrypt');
const sesiones = () => require('../services/auth/seguridadService');
const otp = () => require('../services/notifications/otpService');

module.exports = {
  // ── authMiddleware.js
  // CU05, CU08
  verifyToken: (...args) => autenticacion().verifyToken(...args),

  // ── roleMiddleware.js
  // CU12, CU79
  authorizeRoles: (...args) => roles().authorizeRoles(...args),

  // ── auditarAcceso.js
  // CU13 — Registrando bitácora de auditoría de seguridad
  auditarAccesoClinico: (...args) => bitacoraAcceso().auditarAccesoClinico(...args),

  // ── encriptar_bcrypt.js
  // CU01, CU02
  hashPassword: (...args) => bcrypt().hashPassword(...args),
  // CU05 — Autenticando usuario y resguardando credenciales
  comparePassword: (...args) => bcrypt().comparePassword(...args),

  // ── seguridadService.js
  // CU08 — Gestionando sesiones y tokens de acceso
  get DURACION_SESION_HORAS() { return sesiones().DURACION_SESION_HORAS; },
  // CU07 — Ejecutando cambio de contraseña
  validarRobustezContrasena: (...args) => sesiones().validarRobustezContrasena(...args),
  // CU08 — Gestionando sesiones y tokens de acceso
  crearSesion: (...args) => sesiones().crearSesion(...args),
  // CU08 — Gestionando sesiones y tokens de acceso
  sesionVigente: (...args) => sesiones().sesionVigente(...args),
  // CU08 — Gestionando sesiones y tokens de acceso
  revocarTodasLasSesiones: (...args) => sesiones().revocarTodasLasSesiones(...args),

  // ── otpService.js
  // CU04, CU06
  crearOTP: (...args) => otp().crearOTP(...args),
  // CU04, CU06
  validarOTP: (...args) => otp().validarOTP(...args),
};

// Registro de actividad: anota este componente en la línea de cada petición.
require('../services/registro/registroActividad').trazarComponente('C_Seguridad_JWT_BCrypt', module.exports);
