const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const inalterabilidadController = require('../controllers/inalterabilidadController');

router.post(
  '/finalizar/:evolucionId',
  verifyToken,
  authorizeRoles(['Profesional']),
  inalterabilidadController.finalizarEvolucion
);

router.put(
  '/editar/:evolucionId',
  verifyToken,
  authorizeRoles(['Profesional']),
  inalterabilidadController.editarEvolucion
);

router.delete(
  '/eliminar/:evolucionId',
  verifyToken,
  authorizeRoles(['Profesional']),
  inalterabilidadController.eliminarEvolucion
);

module.exports = router;