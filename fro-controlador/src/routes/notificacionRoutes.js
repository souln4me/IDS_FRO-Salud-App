/**
 * Componente: C_API_REST
 * Casos de uso: CU52, CU54.
 *
 * Centro de notificaciones, preferencias de canal y registro del teléfono para push.
 */
const express = require('express');
const router = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const notificacionController = require('../controllers/notificacionController');

// CU52 — Emitiendo notificaciones multicanal (centro de notificaciones, común a los tres roles)
router.get('/', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.listar);
router.get('/resumen', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.resumen);
router.post('/leer-todas', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.marcarTodasLeidas);
router.post('/:id/leer', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.marcarLeida);

// CU52, CU54 — canales preferidos y si acepta mensajes de refuerzo
router.get('/preferencias', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.obtenerPreferencias);
router.put('/preferencias', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.guardarPreferencias);

// Registro del token de push del teléfono (listo para la build propia).
// CU52 — Emitiendo notificaciones multicanal
router.post('/dispositivo', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.registrarDispositivo);
router.delete('/dispositivo', C_Seguridad_JWT_BCrypt.verifyToken, notificacionController.olvidarDispositivo);

module.exports = router;
