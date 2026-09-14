const express = require('express');
const router = express.Router();

const profesionalController = require('../controllers/profesionalController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Estas rutas exponen datos clínicos: exigen sesión y rol. Antes estaban
// abiertas y la identidad del profesional viajaba en la URL, así que bastaba
// cambiar el número para leer la ficha de otro paciente.
// ── CU10: catálogo de perfil profesional (D1) ──────────────────────────────
const multer = require('multer');
const cargaFoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
function manejarErrorFoto(err, req, res, next) {
  if (err) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'FOTO_MUY_PESADA' : 'CARGA_INVALIDA',
      mensaje: err.code === 'LIMIT_FILE_SIZE'
        ? 'La fotografía supera el tope absoluto de 8 MB.'
        : 'No fue posible recibir la imagen. Intenta nuevamente.',
    });
  }
  next();
}

router.get('/mi-perfil',
  verifyToken, authorizeRoles(['Profesional']),
  profesionalController.obtenerMiPerfil);
router.put('/mi-perfil',
  verifyToken, authorizeRoles(['Profesional']),
  profesionalController.actualizarMiPerfil);
router.post('/mi-perfil/foto',
  verifyToken, authorizeRoles(['Profesional']),
  cargaFoto.single('foto'), manejarErrorFoto,
  profesionalController.subirFotoPerfil);

router.get(
  '/usuario/:usuarioId/pacientes',
  verifyToken, authorizeRoles(['Profesional', 'Administrador']),
  profesionalController.listarPacientesPorUsuarioProfesional
);

router.get(
  '/:profesionalId/pacientes',
  verifyToken, authorizeRoles(['Profesional', 'Administrador']),
  profesionalController.listarPacientesAsignados
);

router.get(
  '/pacientes/:pacienteId/historial',
  verifyToken, authorizeRoles(['Profesional', 'Administrador']),
  profesionalController.obtenerHistorialPaciente
);

module.exports = router;