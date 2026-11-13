/**
 * Componente: C_API_REST
 * Casos de uso: CU73, CU74, CU75.
 *
 * Compra de prestaciones, cambio a paquete y liquidaciones de los profesionales.
 */
const express = require('express');
const router = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const finanzasController = require('../controllers/finanzasController');

// ── CU73 — Cobro anticipado de la prestación
router.get('/citas/:id/opciones',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  finanzasController.opcionesDeCompra);

router.post('/citas/:id/comprar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  finanzasController.comprarPrestacion);

// ── CU74 — Actualización de sesión unitaria a plan
router.post('/citas/:id/actualizar-a-paquete',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  finanzasController.actualizarAPaquete);

// ── CU75 — Liquidación de ganancias
router.get('/liquidaciones',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  finanzasController.liquidacionesDelMes);

router.post('/liquidaciones',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  finanzasController.emitirLiquidacion);

// El profesional solo lee las suyas: el historial es inalterable.
// CU75 — Liquidando ganancias en panel financiero
router.get('/mis-liquidaciones',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  finanzasController.misLiquidaciones);

module.exports = router;
