const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const gestionController = require('../controllers/gestionController');

// CU64 — Panel de indicadores. Excepción 3: el middleware de rol es el que
// impide que alguien sin permisos consulte la matriz de datos.
router.get('/kpis',
  verifyToken, authorizeRoles(['Administrador']),
  gestionController.kpis);

// CU63 — Informes operativos exportables.
router.get('/informes',
  verifyToken, authorizeRoles(['Administrador']),
  gestionController.tiposDeInforme);

router.get('/informes/:tipo',
  verifyToken, authorizeRoles(['Administrador']),
  gestionController.auditarDescarga,
  gestionController.exportarInforme);

module.exports = router;
