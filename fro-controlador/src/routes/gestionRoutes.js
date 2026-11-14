/**
 * Componente: C_API_REST
 * Casos de uso: CU62, CU63, CU64.
 *
 * Panel de gestión del Administrador: indicadores, informes y eventos críticos.
 */
const express = require('express');
const router = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const gestionController = require('../controllers/gestionController');

// CU64 — Panel de indicadores. Excepción 3: el middleware de rol es el que
// impide que alguien sin permisos consulte la matriz de datos.
router.get('/kpis',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  gestionController.kpis);

// CU63 — Informes operativos exportables.
router.get('/informes',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  gestionController.tiposDeInforme);

router.get('/informes/:tipo',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  gestionController.auditarDescarga,
  gestionController.exportarInforme);

// CU62 — Eventos críticos escalados a supervisión (el Administrador, D1 del Inc 4).
router.get('/eventos-criticos',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  gestionController.listarEventosCriticos);

router.post('/eventos-criticos/:id/acuse',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  gestionController.acusarEventoCritico);

module.exports = router;
