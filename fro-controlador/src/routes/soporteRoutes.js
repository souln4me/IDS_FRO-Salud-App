const express = require('express');
const router = express.Router();
const multer = require('multer');

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const soporteController = require('../controllers/soporteController');

// El adjunto viaja en memoria y de ahí a Cloudinary. El tope duro de multer es
// mayor que el parámetro de negocio: así el controlador alcanza a responder el
// mensaje de "imagen muy pesada" en vez de cortar la conexión en seco.
const cargaAdjunto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

// ── CU60 — El paciente y el profesional levantan y siguen sus solicitudes
router.get('/categorias', verifyToken, soporteController.categorias);
router.get('/mis-tickets', verifyToken, soporteController.misTickets);
router.post('/tickets',
  verifyToken,
  cargaAdjunto.single('adjunto'),
  soporteController.crearTicket);

// ── CU61 — Bandeja del operador y áreas que cubre
router.get('/bandeja',
  verifyToken, authorizeRoles(['Administrador']),
  soporteController.bandeja);
router.put('/tickets/:id',
  verifyToken, authorizeRoles(['Administrador']),
  soporteController.actualizarTicket);
router.get('/areas',
  verifyToken, authorizeRoles(['Administrador']),
  soporteController.misAreas);
router.put('/areas',
  verifyToken, authorizeRoles(['Administrador']),
  soporteController.guardarAreas);

module.exports = router;
