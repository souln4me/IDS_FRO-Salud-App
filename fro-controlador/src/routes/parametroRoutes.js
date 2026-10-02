const express = require('express');
const router = express.Router();

// Importe del controlador
const parametroController = require('../controllers/parametroController');

// Importamos a los "guardias" (Middlewares)
const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');


// BLINDAJE RBAC (Manejo automático de la Excepción 1)

// GET / -> Lectura del panel (Solo Administradores)
router.get('/', verifyToken, authorizeRoles(['Administrador']), parametroController.obtenerParametros);

// PUT /update -> Mutación arancelaria (Solo Administradores)
router.put('/update', verifyToken, authorizeRoles(['Administrador']), parametroController.actualizarParametro);

// CU57 — Diccionario de términos restringidos (precondición del filtro)
router.get('/palabras-restringidas',
  verifyToken, authorizeRoles(['Administrador']), parametroController.listarPalabras);
router.post('/palabras-restringidas',
  verifyToken, authorizeRoles(['Administrador']), parametroController.agregarPalabra);
router.put('/palabras-restringidas/:id',
  verifyToken, authorizeRoles(['Administrador']), parametroController.alternarPalabra);
router.delete('/palabras-restringidas/:id',
  verifyToken, authorizeRoles(['Administrador']), parametroController.eliminarPalabra);

module.exports = router;