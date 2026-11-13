/**
 * Componente: C_API_REST
 * Casos de uso: CU56.
 *
 * Bandeja de moderación de reseñas para el Administrador.
 */
const express = require('express');
const router = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const evaluacionController = require('../controllers/evaluacionController');

// CU56 — Moderación de testimonios públicos. Solo el Administrador decide qué
// se publica; el profesional evaluado no interviene en su propia moderación.
router.get('/moderacion',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  evaluacionController.bandejaModeracion);

router.post('/:id/moderar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  evaluacionController.moderarResena);

module.exports = router;
