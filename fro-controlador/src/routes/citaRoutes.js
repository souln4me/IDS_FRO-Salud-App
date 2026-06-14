const express = require('express');
const router = express.Router();

const citaController = require('../controllers/citaController');

router.get('/especialidades', citaController.obtenerEspecialidades);
router.get('/disponibilidad', citaController.obtenerDisponibilidad);
router.post('/validar-bloque', citaController.validarBloque);

module.exports = router;