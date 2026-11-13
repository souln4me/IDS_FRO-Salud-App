/**
 * Componente: C_API_REST
 * Casos de uso: CU01, CU02, CU03, CU04, CU05, CU06, CU07, CU08, CU09, CU12.
 *
 * Rutas de cuenta: registro, OTP, login, contraseña, sesiones, privacidad y perfil del paciente.
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const comunaController = require('../controllers/comunaController');

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');

// ── Rutas existentes (Públicas) ──────────────────────────────────────────────
// CU01 — Registrando paciente con validación de integridad
router.post('/registrar', authController.registrarPaciente);
// CU03 — Controlando unicidad de cuentas de usuario
router.post('/verificar-unicidad', authController.verificarUnicidad);
// CU02 — Registrando y acreditando profesional de salud
router.post('/registrar-profesional', authController.registrarProfesional);

// CU01, CU02 — catálogos y validación que usan los formularios de registro
router.get('/comunas', comunaController.obtenerComunas);
router.get('/especialidades', authController.obtenerEspecialidades);
router.get('/validar-profesional/:rut', authController.validarProfesional);

// ── CU05: Login ──────────────────────────────────────────────────────────────
router.post('/login', authController.login);

// ── CU04: Verificación OTP ───────────────────────────────────────────────────
router.post('/otp/solicitar', authController.solicitarOTP);
router.post('/otp/verificar', authController.verificarOTP);

// ── CU06/CU07 — Recuperación de contraseña (flujo público) ──
router.post('/recuperar/solicitar', authController.solicitarRecuperacion);
router.post('/recuperar/verificar', authController.verificarCodigoRecuperacion);
router.post('/recuperar/confirmar', authController.confirmarRecuperacion);

// ── CU07 — Cambio de contraseña desde adentro de la app ──
router.post('/cambio-contrasena/solicitar', C_Seguridad_JWT_BCrypt.verifyToken, authController.solicitarCambioContrasena);
router.post('/cambio-contrasena/verificar', C_Seguridad_JWT_BCrypt.verifyToken, authController.verificarCodigoCambioContrasena);
router.post('/cambio-contrasena/confirmar', C_Seguridad_JWT_BCrypt.verifyToken, authController.confirmarCambioContrasena);

// ── CU08 — Sesiones activas por dispositivo ──
router.get('/sesiones', C_Seguridad_JWT_BCrypt.verifyToken, authController.listarSesiones);
router.post('/sesiones/:id/cerrar', C_Seguridad_JWT_BCrypt.verifyToken, authController.cerrarSesion);
router.post('/logout', C_Seguridad_JWT_BCrypt.verifyToken, authController.cerrarSesionActual);

// ── CU09 — Privacidad de datos de contacto (solo Paciente) ──
router.get('/privacidad', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']), authController.obtenerPrivacidad);
router.put('/privacidad', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']), authController.actualizarPrivacidad);

// ── Foto de perfil opcional del paciente (sin foto se muestran sus iniciales) ──
// CU09 — Configurando privacidad de datos de contacto (perfil del paciente)
const multer = require('multer');
const perfilPacienteController = require('../controllers/perfilPacienteController');
const cargaFoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
function manejarErrorFoto(err, req, res, next) {
    if (err) {
        return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
            error: err.code === 'LIMIT_FILE_SIZE' ? 'FOTO_MUY_PESADA' : 'CARGA_INVALIDA',
            mensaje: err.code === 'LIMIT_FILE_SIZE'
                ? 'La fotografía supera el tope absoluto de 8 MB.'
                : 'No fue posible recibir la imagen. Intenta nuevamente.',
        });
    }
    next();
}
router.get('/mi-foto', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']), perfilPacienteController.obtener);
router.post('/mi-foto', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']), cargaFoto.single('foto'), manejarErrorFoto, perfilPacienteController.subir);
router.delete('/mi-foto', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']), perfilPacienteController.quitar);
// Datos de contacto editables del paciente (dirección, teléfono, contacto de emergencia).
// CU09 — Configurando privacidad de datos de contacto
router.get('/mi-perfil-paciente', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']), perfilPacienteController.obtenerDatos);
router.put('/mi-perfil-paciente', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']), perfilPacienteController.actualizarDatos);

// CU12 — Controlando acceso basado en roles RBAC (rutas de prueba del rol)
router.get('/mi-perfil', C_Seguridad_JWT_BCrypt.verifyToken, (req, res) => {
    res.status(200).json({ 
        mensaje: `¡Acceso concedido! Hola, el sistema reconoce que tienes el rol de: ${req.user.nombre_rol}` 
    });
});

router.get('/panel-control-sensible', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador', 'Supervisor']), (req, res) => {
    res.status(200).json({ 
        mensaje: '🔓 Acceso Autorizado a información confidencial del sistema.' 
    });
});

module.exports = router;

