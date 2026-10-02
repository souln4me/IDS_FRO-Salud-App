const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const notificacionController = require('../controllers/notificacionController');

// CU52 — El centro de notificaciones es común a los tres roles.
router.get('/', verifyToken, notificacionController.listar);
router.get('/resumen', verifyToken, notificacionController.resumen);
router.post('/leer-todas', verifyToken, notificacionController.marcarTodasLeidas);
router.post('/:id/leer', verifyToken, notificacionController.marcarLeida);

router.get('/preferencias', verifyToken, notificacionController.obtenerPreferencias);
router.put('/preferencias', verifyToken, notificacionController.guardarPreferencias);

// Registro del token de push del teléfono (listo para la build propia).
router.post('/dispositivo', verifyToken, notificacionController.registrarDispositivo);
router.delete('/dispositivo', verifyToken, notificacionController.olvidarDispositivo);

module.exports = router;
