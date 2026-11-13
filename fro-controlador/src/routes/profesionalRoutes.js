/**
 * Componente: C_API_REST
 * Casos de uso: CU10, CU11, CU14, CU28, CU58.
 *
 * Rutas del profesional: su perfil, foto y horario, su nómina de pacientes,
 * el historial del paciente y el perfil público que ve el paciente.
 */
const express = require('express');
const router = express.Router();

const profesionalController = require('../controllers/profesionalController');
const evaluacionController = require('../controllers/evaluacionController');
const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');

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

// CU10 — Administrando catálogo de perfil profesional (perfil, horario y foto)
router.get('/mi-perfil',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  profesionalController.obtenerMiPerfil);
router.put('/mi-perfil',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  profesionalController.actualizarMiPerfil);
// Jornada semanal: el profesional gestiona sus bloques horarios.
router.get('/mi-horario',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  profesionalController.obtenerMiHorario);
router.put('/mi-horario',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  profesionalController.guardarMiHorario);
router.post('/mi-perfil/foto',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  cargaFoto.single('foto'), manejarErrorFoto,
  profesionalController.subirFotoPerfil);

// CU11 — Visualizando panel interno de gestión profesional (nómina de pacientes)
router.get(
  '/usuario/:usuarioId/pacientes',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
  profesionalController.listarPacientesPorUsuarioProfesional
);

router.get(
  '/:profesionalId/pacientes',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
  profesionalController.listarPacientesAsignados
);

// CU28 — Consolidando historial en ficha clínica electrónica
router.get(
  '/pacientes/:pacienteId/historial',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
  profesionalController.obtenerHistorialPaciente
);

// CU10/CU14 — Perfil público de un profesional, de solo lectura.
router.get('/:profesional_id/perfil-publico',
  C_Seguridad_JWT_BCrypt.verifyToken,
  profesionalController.obtenerPerfilPublico);

// CU58 — Calificación y testimonios publicados de un profesional.
router.get('/:profesional_id/resenas',
  C_Seguridad_JWT_BCrypt.verifyToken,
  evaluacionController.resenasPublicas);

module.exports = router;