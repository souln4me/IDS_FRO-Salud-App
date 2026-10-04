const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const finanzasController = require('../controllers/finanzasController');

// ── CU73 — Cobro anticipado de la prestación
router.get('/citas/:id/opciones',
  verifyToken, authorizeRoles(['Paciente']),
  finanzasController.opcionesDeCompra);

router.post('/citas/:id/comprar',
  verifyToken, authorizeRoles(['Paciente']),
  finanzasController.comprarPrestacion);

// ── CU74 — Actualización de sesión unitaria a plan
router.post('/citas/:id/actualizar-a-paquete',
  verifyToken, authorizeRoles(['Paciente']),
  finanzasController.actualizarAPaquete);

// ── CU75 — Liquidación de ganancias
router.get('/liquidaciones',
  verifyToken, authorizeRoles(['Administrador']),
  finanzasController.liquidacionesDelMes);

router.post('/liquidaciones',
  verifyToken, authorizeRoles(['Administrador']),
  finanzasController.emitirLiquidacion);

// El profesional solo lee las suyas: el historial es inalterable.
router.get('/mis-liquidaciones',
  verifyToken, authorizeRoles(['Profesional']),
  finanzasController.misLiquidaciones);

module.exports = router;
