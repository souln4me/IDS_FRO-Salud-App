/**
 * Componente: C_API_REST
 * Casos de uso: CU14, CU15, CU17, CU18, CU19, CU20, CU21, CU22, CU38, CU39, CU41, CU42, CU43, CU55, CU76.
 *
 * Rutas de la agenda: búsqueda y bloqueo de horas, estados de la cita,
 * confirmación, lista de espera, marcas temporales y evidencia de la sesión.
 */
const express = require('express');
const router  = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const citaController     = require('../controllers/citaController');
const evidenciaController = require('../controllers/evidenciaController');
const marcasTemporalesController = require('../controllers/marcasTemporalesController');
const confirmacionController = require('../controllers/confirmacionController');
const listaEsperaController = require('../controllers/listaEsperaController');
const evaluacionController = require('../controllers/evaluacionController');

// CU38 - Marcas temporales de la prestacion
router.get('/marcas-temporales',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  marcasTemporalesController.listarCitasProfesional);

// CU41 Exc.2 (D11): bandeja de sesiones derivadas a revisión.
router.get('/sesiones-suspendidas',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Administrador']),
  evidenciaController.sesionesSuspendidas);

// Alimenta la barra de "atencion en curso" que sigue al profesional por la app.
// CU38 — Registrando marcas temporales de la prestación
router.get('/atencion-en-curso',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  marcasTemporalesController.atencionEnCurso);

// CU39: la app del paciente envía sola su ubicación el día de la visita.
router.get('/ubicacion-pendiente',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  evidenciaController.ubicacionPendiente);
router.post('/:id/ubicacion',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  evidenciaController.reportarUbicacion);

// CU38, CU40 — sesiones realizadas que el profesional aún no documenta
router.get('/documentacion-pendiente',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  marcasTemporalesController.documentacionPendiente);

// CU38 — Registrando marcas temporales de la prestación (inicio y fin; al finalizar, CU41 y CU76)
router.post('/marcas-temporales/:cita_id/iniciar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  marcasTemporalesController.iniciarAtencion);

router.post('/marcas-temporales/:cita_id/finalizar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  marcasTemporalesController.finalizarAtencion);

// ─ CU14 — Buscar disponibilidad 
router.get('/especialidades',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  citaController.obtenerEspecialidades);

router.get('/disponibilidad',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  citaController.buscarDisponibilidad);

router.post('/validar-bloque',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  citaController.validarBloque);

// ─ CU15 — Bloquear horario 
router.get('/profesionales',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  citaController.obtenerProfesionales);

router.get('/disponibilidad/:profesional_id',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  citaController.obtenerDisponibilidad);

router.post('/bloquear',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  citaController.bloquearHorario);

// ── CU21 — Confirmación de asistencia distribuida
// El enlace del correo es público a propósito: su autorización es el token,
// que es secreto, de un solo uso y con vencimiento.
router.get('/confirmacion/:token', confirmacionController.responderDesdeCorreo);

router.get('/confirmaciones/pendientes',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  confirmacionController.pendientes);

router.post('/:id/solicitar-confirmacion',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  confirmacionController.reenviar);

// ── CU19 — Lista de espera secuencial
router.get('/mis-listas-espera',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  listaEsperaController.misListas);

// Enlace del correo "Tomar el cupo": público, su autorización es el token
// secreto, que deja de servir apenas se toma, se cede o vence el turno.
router.get('/lista-espera/cupo/:token', listaEsperaController.cupoDesdeCorreo);

router.post('/lista-espera/:lista_espera_id/tomar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  listaEsperaController.tomarCupo);

router.post('/:id/lista-espera',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  listaEsperaController.inscribirse);

router.delete('/:id/lista-espera',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  listaEsperaController.salir);

// ── CU55 — Evaluación de satisfacción post-sesión
// Solo la envía el paciente desde su teléfono: al cerrar la sesión le llega un
// aviso para calificar. El profesional no puede evaluarse a sí mismo.
router.get('/evaluaciones/pendientes',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  evaluacionController.pendientesDeEvaluar);

router.post('/:id/evaluacion',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  evaluacionController.registrarEvaluacion);

// ── CU20 — Listado de citas por rol
router.get('/mis-citas',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
  citaController.obtenerCitasPaciente);

router.get('/mis-citas-profesional',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  citaController.obtenerCitasProfesional);

// ── CU17 — Reprogramación de cita
router.post('/:id/reprogramar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
  citaController.reprogramarCita);

// ── CU22 — Trazabilidad de transiciones de agenda
router.get('/:id/trazabilidad',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
  citaController.trazabilidadCita);

// ── CU39 — Check-in GPS de presencialidad
router.post('/:id/checkin-gps',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
  evidenciaController.checkinGPS);

// ── CU43 — Evidencia técnica de teleconsulta
router.post('/:id/evidencia-teleconsulta',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
  evidenciaController.registrarEvidenciaTeleconsulta);

// ── Resumen de evidencia de la sesión
// CU39, CU41, CU43 — GPS, certificación y evidencia de teleconsulta de la cita
router.get('/:id/evidencia',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
  evidenciaController.resumenEvidencia);

// ── CU41 — Certificación multi-factor de la sesión
router.post('/:id/validar-sesion',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  evidenciaController.validarSesion);

// ── CU42 — Firma manuscrita de conformidad
router.get('/:id/declaracion-conformidad',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  evidenciaController.declaracionConformidad);
router.post('/:id/firma',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  evidenciaController.guardarFirma);

// ── CU20 — Máquina de estados de cita
// También cubre CU18 (cancelar), CU22 (trazabilidad) y CU76 (descuento de sesiones).
// Roles permitidos: Paciente puede cancelar; Profesional gestiona el flujo clínico; Admin tiene acceso total
router.post('/:id/transicionar',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
  citaController.transicionarEstadoCita);

// Re-sincronizar estado tras latencia de red (Excepción 3 del CU20)
router.get('/:id/estado',
  C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
  citaController.obtenerEstadoCita);

module.exports = router;
