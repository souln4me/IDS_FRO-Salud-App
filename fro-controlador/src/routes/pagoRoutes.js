const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const pagoController = require('../controllers/pagoController');

// ── CU67 — Resumen financiero del paciente ──
router.get('/resumen',
  verifyToken, authorizeRoles(['Paciente']),
  pagoController.resumenPagos);

// ── CU66 — Registro y validación de bonos ──
router.post('/citas/:id/bono',
  verifyToken, authorizeRoles(['Paciente']),
  pagoController.registrarBono);

// ── CU67 — Liquidación del copago ──
router.post('/citas/:id/pagar',
  verifyToken, authorizeRoles(['Paciente']),
  pagoController.pagarCopago);

// ── CU67 — Adquisición de planes de sesiones ──
router.post('/paquetes',
  verifyToken, authorizeRoles(['Paciente']),
  pagoController.comprarPaquete);

// ── CU71 — Cuadratura de sesiones bonificables ──
router.get('/cuadratura/:paciente_id',
  verifyToken, authorizeRoles(['Profesional']),
  pagoController.cuadraturaCoberturas);

module.exports = router;
