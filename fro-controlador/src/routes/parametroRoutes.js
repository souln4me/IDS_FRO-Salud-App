/**
 * Componente: C_API_REST
 * Casos de uso: CU59, CU57.
 *
 * Parámetros globales del sistema y diccionario de palabras restringidas.
 */
const express = require('express');
const router = express.Router();

// Importe del controlador
const parametroController = require('../controllers/parametroController');

// Importamos a los "guardias" (Middlewares)
const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');


// BLINDAJE RBAC (Manejo automático de la Excepción 1)
// CU59 — Gestionando Parámetros Globales del Sistema

// GET / -> Lectura del panel (Solo Administradores)
router.get('/', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']), parametroController.obtenerParametros);

// PUT /update -> Mutación arancelaria (Solo Administradores)
router.put('/update', C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']), parametroController.actualizarParametro);

// CU57 — Diccionario de términos restringidos (precondición del filtro)
router.get('/palabras-restringidas',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']), parametroController.listarPalabras);
router.post('/palabras-restringidas',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']), parametroController.agregarPalabra);
router.put('/palabras-restringidas/:id',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']), parametroController.alternarPalabra);
router.delete('/palabras-restringidas/:id',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']), parametroController.eliminarPalabra);

module.exports = router;