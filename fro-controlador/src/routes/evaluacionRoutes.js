const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const evaluacionController = require('../controllers/evaluacionController');

// CU56 — Moderación de testimonios públicos. Solo el Administrador decide qué
// se publica; el profesional evaluado no interviene en su propia moderación.
router.get('/moderacion',
  verifyToken, authorizeRoles(['Administrador']),
  evaluacionController.bandejaModeracion);

router.post('/:id/moderar',
  verifyToken, authorizeRoles(['Administrador']),
  evaluacionController.moderarResena);

module.exports = router;
