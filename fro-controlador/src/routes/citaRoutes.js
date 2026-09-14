const express = require('express');
const router  = express.Router();

const { verifyToken }    = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const citaController     = require('../controllers/citaController');
const evidenciaController = require('../controllers/evidenciaController');
const marcasTemporalesController = require('../controllers/marcasTemporalesController');

// CU38 - Marcas temporales de la prestacion
router.get('/marcas-temporales',
  verifyToken, authorizeRoles(['Profesional']),
  marcasTemporalesController.listarCitasProfesional);

// Alimenta la barra de "atencion en curso" que sigue al profesional por la app.
// CU41 Exc.2 (D11): bandeja de sesiones derivadas a revisión.
router.get('/sesiones-suspendidas',
  verifyToken, authorizeRoles(['Administrador']),
  evidenciaController.sesionesSuspendidas);

router.get('/atencion-en-curso',
  verifyToken, authorizeRoles(['Profesional']),
  marcasTemporalesController.atencionEnCurso);

router.post('/marcas-temporales/:cita_id/iniciar',
  verifyToken, authorizeRoles(['Profesional']),
  marcasTemporalesController.iniciarAtencion);

router.post('/marcas-temporales/:cita_id/finalizar',
  verifyToken, authorizeRoles(['Profesional']),
  marcasTemporalesController.finalizarAtencion);

// ─ CU14 — Buscar disponibilidad 
router.get('/especialidades',
  verifyToken, authorizeRoles(['Paciente']),
  citaController.obtenerEspecialidades);

router.get('/disponibilidad',
  verifyToken, authorizeRoles(['Paciente']),
  citaController.buscarDisponibilidad);

router.post('/validar-bloque',
  verifyToken, authorizeRoles(['Paciente']),
  citaController.validarBloque);

// ─ CU15 — Bloquear horario 
router.get('/profesionales',
  verifyToken, authorizeRoles(['Paciente']),
  citaController.obtenerProfesionales);

router.get('/disponibilidad/:profesional_id',
  verifyToken, authorizeRoles(['Paciente']),
  citaController.obtenerDisponibilidad);

router.post('/bloquear',
  verifyToken, authorizeRoles(['Paciente']),
  citaController.bloquearHorario);

// ── CU20 — Listado de citas por rol
router.get('/mis-citas',
  verifyToken, authorizeRoles(['Paciente']),
  citaController.obtenerCitasPaciente);

router.get('/mis-citas-profesional',
  verifyToken, authorizeRoles(['Profesional']),
  citaController.obtenerCitasProfesional);

// ── CU17 — Reprogramación de cita
router.post('/:id/reprogramar',
  verifyToken, authorizeRoles(['Paciente', 'Profesional']),
  citaController.reprogramarCita);

// ── CU22 — Trazabilidad de transiciones de agenda
router.get('/:id/trazabilidad',
  verifyToken, authorizeRoles(['Profesional', 'Administrador']),
  citaController.trazabilidadCita);

// ── CU39 — Check-in GPS de presencialidad
router.post('/:id/checkin-gps',
  verifyToken, authorizeRoles(['Paciente', 'Profesional']),
  evidenciaController.checkinGPS);

// ── CU43 — Evidencia técnica de teleconsulta
router.post('/:id/evidencia-teleconsulta',
  verifyToken, authorizeRoles(['Paciente', 'Profesional']),
  evidenciaController.registrarEvidenciaTeleconsulta);

// ── Resumen de evidencia de la sesión
router.get('/:id/evidencia',
  verifyToken, authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
  evidenciaController.resumenEvidencia);

// ── CU41 — Certificación multi-factor de la sesión
router.post('/:id/validar-sesion',
  verifyToken, authorizeRoles(['Profesional']),
  evidenciaController.validarSesion);

// ── CU42 — Firma manuscrita de conformidad
router.get('/:id/declaracion-conformidad',
  verifyToken, authorizeRoles(['Profesional']),
  evidenciaController.declaracionConformidad);
router.post('/:id/firma',
  verifyToken, authorizeRoles(['Profesional']),
  evidenciaController.guardarFirma);

// ── CU20 — Máquina de estados de cita
// Roles permitidos: Paciente puede cancelar; Profesional gestiona el flujo clínico; Admin tiene acceso total
router.post('/:id/transicionar',
  verifyToken, authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
  citaController.transicionarEstadoCita);

// Re-sincronizar estado tras latencia de red (Excepción 3 del CU20)
router.get('/:id/estado',
  verifyToken, authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
  citaController.obtenerEstadoCita);

module.exports = router;
