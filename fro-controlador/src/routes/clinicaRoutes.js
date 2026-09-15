const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { auditarAccesoClinico } = require('../middlewares/auditarAcceso');
const episodioController = require('../controllers/clinico/episodioController');
const fichaClinicaController = require('../controllers/clinico/fichaClinicaController');
//  CU32: Objetivos terapéuticos y avance 
const objetivoController = require('../controllers/clinico/objetivoController');
const evolucionController = require('../controllers/clinico/evolucionController');
const intervencionController = require('../controllers/clinico/intervencionController');

// CU16
const disponibilidadController = require('../controllers/disponibilidadController');

// CU46-CU49: biblioteca y pautas de ejercicio
const pautaController = require('../controllers/clinico/pautaController');

// CU23/CU24/CU27/CU77: triaje automatizado y plantillas de evaluación
const triajeController = require('../controllers/clinico/triajeController');

// ─────────────────────────────────────────────────────────────────────────────
// CU29 — Anamnesis / Ficha Clínica
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ficha/:paciente_id',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']), auditarAccesoClinico,
    fichaClinicaController.obtenerFicha
);
router.post('/ficha',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']), auditarAccesoClinico,
    fichaClinicaController.guardarAnamnesis
);
router.get('/episodio/:episodio_id',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']), auditarAccesoClinico,
    episodioController.obtenerEpisodio
);
router.post('/episodio',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']), auditarAccesoClinico,
    episodioController.crearEpisodio
);
router.put('/episodio/:episodio_id',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']), auditarAccesoClinico,
    episodioController.actualizarEpisodio
);

// ─────────────────────────────────────────────────────────────────────────────
// CU32 — Objetivos terapéuticos y avance
// ─────────────────────────────────────────────────────────────────────────────
router.get('/episodio/:episodio_id/objetivos',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']), auditarAccesoClinico,
    objetivoController.obtenerObjetivos
);
router.post('/episodio/:episodio_id/objetivos',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']), auditarAccesoClinico,
    objetivoController.crearObjetivo
);

// El avance: el controlador ya audita internamente (valor anterior/nuevo),
// por eso no se le añade auditarAccesoClinico (evita auditoría duplicada).
router.put('/episodio/:episodio_id/avance',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']),
    evolucionController.actualizarAvance
);

// ─────────────────────────────────────────────────────────────────────────────
// CU36, CU32 — Inalterabilidad de la Ficha Clínica
// ─────────────────────────────────────────────────────────────────────────────

router.post('/episodio/:episodio_id/evolucion',
    verifyToken, authorizeRoles(['Profesional']),
    evolucionController.crearEvolucionEnBlanco
);

// CU40 - Documentar intervención y respuesta fisiológica
router.get('/intervenciones/sesiones',
    verifyToken, authorizeRoles(['Profesional']),
    intervencionController.listarSesiones
);
router.get('/intervenciones/:episodio_id',
    verifyToken, authorizeRoles(['Profesional']),
    intervencionController.obtenerIntervencion
);
router.put('/intervenciones/:episodio_id',
    verifyToken, authorizeRoles(['Profesional']),
    intervencionController.guardarIntervencion
);

// CU16
router.post('/disponibilidad/restringir',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']),
    disponibilidadController.restringirDisponibilidad
);

// ─────────────────────────────────────────────────────────────────────────────
// CU46 — Biblioteca centralizada de material terapéutico
// ─────────────────────────────────────────────────────────────────────────────
router.get('/materiales',
    verifyToken, authorizeRoles(['Profesional']),
    pautaController.buscarMateriales
);

// ─────────────────────────────────────────────────────────────────────────────
// CU47 — Prescripción de pautas de ejercicio
// ─────────────────────────────────────────────────────────────────────────────
router.post('/pautas',
    verifyToken, authorizeRoles(['Profesional']),
    pautaController.crearPauta
);
router.get('/pautas/paciente/:paciente_id',
    verifyToken, authorizeRoles(['Profesional']), auditarAccesoClinico,
    pautaController.pautasDePaciente
);

// ─────────────────────────────────────────────────────────────────────────────
// CU48/CU49 — Cumplimiento diario y vigencia (lado paciente)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pautas/mis-pautas',
    verifyToken, authorizeRoles(['Paciente']),
    pautaController.misPautas
);
router.post('/pautas/ejercicios/:id/cumplimiento',
    verifyToken, authorizeRoles(['Paciente']),
    pautaController.marcarCumplimiento
);
router.delete('/pautas/ejercicios/:id/cumplimiento',
    verifyToken, authorizeRoles(['Paciente']),
    pautaController.desmarcarCumplimiento
);

// ─────────────────────────────────────────────────────────────────────────────
// CU27 — Disclaimer legal + CU23 — Triaje + CU24 — Integración a ficha
// ─────────────────────────────────────────────────────────────────────────────
router.get('/triaje/estado',
    verifyToken, authorizeRoles(['Paciente']),
    triajeController.estadoTriaje
);
router.get('/triaje/disclaimer',
    verifyToken, authorizeRoles(['Paciente']),
    triajeController.obtenerDisclaimer
);
router.post('/triaje/disclaimer/aceptar',
    verifyToken, authorizeRoles(['Paciente']),
    triajeController.aceptarDisclaimer
);
router.get('/triaje/arbol',
    verifyToken, authorizeRoles(['Paciente']),
    triajeController.obtenerArbol
);
router.put('/triaje/respuestas',
    verifyToken, authorizeRoles(['Paciente']),
    triajeController.guardarRespuestasParciales
);
router.post('/triaje/completar',
    verifyToken, authorizeRoles(['Paciente']),
    triajeController.completarTriaje
);

// ─────────────────────────────────────────────────────────────────────────────
// CU77 — Plantilla de evaluación según la especialidad del profesional
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plantilla-evaluacion',
    verifyToken, authorizeRoles(['Profesional']),
    triajeController.plantillaEvaluacion
);

// ─────────────────────────────────────────────────────────────────────────────
// CU33/CU34/CU35 — Repositorio multimedia de la ficha clínica
// (auditan internamente en Bitacora_Auditoria, igual que objetivos/avance)
// ─────────────────────────────────────────────────────────────────────────────
const multer = require('multer');
const documentoController = require('../controllers/clinico/documentoController');

// El archivo viaja en memoria hacia Cloudinary; tope duro de 20 MB como red de
// seguridad (el límite real es MAX_TAMANO_ARCHIVO_MB y se valida en el controlador).
const cargaArchivo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// Traduce los errores propios de multer (ej. archivo sobre el tope duro) a JSON.
function manejarErrorCarga(err, req, res, next) {
    if (err) {
        const esTamano = err.code === 'LIMIT_FILE_SIZE';
        return res.status(esTamano ? 413 : 400).json({
            error: esTamano ? 'ARCHIVO_MUY_GRANDE' : 'CARGA_INVALIDA',
            mensaje: esTamano
                ? 'El archivo supera el tope absoluto de 20 MB. Comprime el documento.'
                : 'No fue posible recibir el archivo. Intenta nuevamente.',
        });
    }
    next();
}

router.get('/documentos/categorias',
    verifyToken, authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
    documentoController.listarCategorias
);
router.post('/pacientes/:pacienteId/documentos',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']),
    cargaArchivo.single('archivo'), manejarErrorCarga,
    documentoController.subirDocumento
);
router.get('/pacientes/:pacienteId/documentos',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']),
    documentoController.listarDocumentos
);
router.get('/mis-documentos',
    verifyToken, authorizeRoles(['Paciente']),
    documentoController.misDocumentos
);
router.put('/documentos/:id/categoria',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']),
    documentoController.cambiarCategoria
);
router.get('/documentos/:id/ver',
    verifyToken, authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
    documentoController.verDocumento
);

// ─────────────────────────────────────────────────────────────────────────────
// CU31 — Versionado de correcciones sobre evoluciones cerradas
// ─────────────────────────────────────────────────────────────────────────────
const versionController = require('../controllers/clinico/versionController');

router.get('/evolucion/:evolucionId/versiones',
    verifyToken, authorizeRoles(['Profesional', 'Administrador']),
    versionController.listarVersiones
);
router.post('/evolucion/:evolucionId/versiones',
    verifyToken, authorizeRoles(['Profesional']),
    versionController.crearVersion
);

module.exports = router;
