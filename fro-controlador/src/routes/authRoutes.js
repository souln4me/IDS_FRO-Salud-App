const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const comunaController = require('../controllers/comunaController');

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// ── Rutas existentes (Públicas) ──────────────────────────────────────────────
router.post('/registrar', authController.registrarPaciente);
router.post('/verificar-unicidad', authController.verificarUnicidad);
router.post('/registrar-profesional', authController.registrarProfesional);

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
router.post('/cambio-contrasena/solicitar', verifyToken, authController.solicitarCambioContrasena);
router.post('/cambio-contrasena/verificar', verifyToken, authController.verificarCodigoCambioContrasena);
router.post('/cambio-contrasena/confirmar', verifyToken, authController.confirmarCambioContrasena);

// ── CU08 — Sesiones activas por dispositivo ──
router.get('/sesiones', verifyToken, authController.listarSesiones);
router.post('/sesiones/:id/cerrar', verifyToken, authController.cerrarSesion);
router.post('/logout', verifyToken, authController.cerrarSesionActual);

// ── CU09 — Privacidad de datos de contacto (solo Paciente) ──
router.get('/privacidad', verifyToken, authorizeRoles(['Paciente']), authController.obtenerPrivacidad);
router.put('/privacidad', verifyToken, authorizeRoles(['Paciente']), authController.actualizarPrivacidad);

router.get('/mi-perfil', verifyToken, (req, res) => {
    res.status(200).json({ 
        mensaje: `¡Acceso concedido! Hola, el sistema reconoce que tienes el rol de: ${req.user.nombre_rol}` 
    });
});

router.get('/panel-control-sensible', verifyToken, authorizeRoles(['Administrador', 'Supervisor']), (req, res) => {
    res.status(200).json({ 
        mensaje: '🔓 Acceso Autorizado a información confidencial del sistema.' 
    });
});

module.exports = router;

