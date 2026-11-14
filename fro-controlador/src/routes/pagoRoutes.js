/**
 * Componente: C_API_REST
 * Casos de uso: CU66, CU67, CU71, CU72.
 *
 * Pagos del paciente: bonos, copagos, planes de sesiones, cuadratura y contingencia.
 */
const express = require('express');
const router = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const pagoController = require('../controllers/pagoController');
const contingenciaController = require('../controllers/contingenciaController');

// ── CU67 — Resumen financiero del paciente ──
router.get('/resumen',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  pagoController.resumenPagos);

// ── CU66 — Registro y validación de bonos ──
router.post('/citas/:id/bono',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  pagoController.registrarBono);

// ── CU67 — Liquidación del copago ──
router.post('/citas/:id/pagar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  pagoController.pagarCopago);

// ── CU67 — Adquisición de planes de sesiones ──
router.post('/paquetes',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  pagoController.comprarPaquete);

// ── CU71 — Cuadratura de sesiones bonificables ──
router.get('/cuadratura/:paciente_id',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  pagoController.cuadraturaCoberturas);

// ── CU72 — Interfaz de contingencia de bonos ──
router.get('/contingencia',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
  contingenciaController.obtener);
router.post('/citas/:id/bono-contingencia',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
  contingenciaController.registrar);
router.put('/contingencia/modo',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  contingenciaController.cambiarModo);
router.post('/bonos/:id/regularizar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  contingenciaController.regularizar);

module.exports = router;
