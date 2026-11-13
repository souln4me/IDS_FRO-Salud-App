/**
 * Componente: C_API_REST
 * Casos de uso: CU60, CU61.
 *
 * Mesa de ayuda: crear y seguir solicitudes, y la bandeja del operador.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const soporteController = require('../controllers/soporteController');

// El adjunto viaja en memoria y de ahí a Cloudinary. El tope duro de multer es
// mayor que el parámetro de negocio: así el controlador alcanza a responder el
// mensaje de "imagen muy pesada" en vez de cortar la conexión en seco.
const cargaAdjunto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

// ── CU60 — El paciente y el profesional levantan y siguen sus solicitudes
router.get('/categorias', C_Seguridad_JWT_BCrypt.verifyToken, soporteController.categorias);
router.get('/mis-tickets', C_Seguridad_JWT_BCrypt.verifyToken, soporteController.misTickets);
router.post('/tickets',
  C_Seguridad_JWT_BCrypt.verifyToken,
  cargaAdjunto.single('adjunto'),
  soporteController.crearTicket);

// ── CU61 — Bandeja del operador y áreas que cubre
router.get('/bandeja',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  soporteController.bandeja);
router.put('/tickets/:id',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  soporteController.actualizarTicket);
router.get('/areas',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  soporteController.misAreas);
router.put('/areas',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  soporteController.guardarAreas);

module.exports = router;
