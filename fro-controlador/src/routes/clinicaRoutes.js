/**
 * Componente: C_API_REST
 * Casos de uso: CU16, CU23, CU24, CU25, CU26, CU27, CU28, CU29, CU30, CU31, CU32,
 * CU33, CU34, CU35, CU36, CU37, CU40, CU44, CU45, CU46, CU47, CU48, CU49, CU50,
 * CU51, CU53, CU55, CU57, CU65, CU77, CU78.
 *
 * Rutas clínicas: ficha y episodio, objetivos, alta, derivaciones, intervención,
 * triaje, seguimiento, chat, pautas, repositorio de documentos y versiones.
 */
const express = require('express');
const router = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const episodioController = require('../controllers/clinico/episodioController');
const altaController = require('../controllers/clinico/altaController');
const derivacionController = require('../controllers/clinico/derivacionController');
const evaluacionController = require('../controllers/evaluacionController');
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
const seguimientoController = require('../controllers/clinico/seguimientoController');
const chatController = require('../controllers/clinico/chatController');

// ─────────────────────────────────────────────────────────────────────────────
// CU29 — Anamnesis / Ficha Clínica
// ─────────────────────────────────────────────────────────────────────────────
// El paciente descarga su propia ficha clínica en PDF (va antes de /ficha/:paciente_id).
// CU28 — Consolidando historial en ficha clínica electrónica
router.get('/mi-ficha/pdf',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    fichaClinicaController.miFichaPdf
);
// CU28, CU29 — leer la ficha y guardar la anamnesis
router.get('/ficha/:paciente_id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    fichaClinicaController.obtenerFicha
);
router.post('/ficha',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    fichaClinicaController.guardarAnamnesis
);
// CU78 — Agrupando registros bajo entidad episodio clínico (cerrar el episodio: CU37)
router.get('/episodio/:episodio_id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    episodioController.obtenerEpisodio
);
router.post('/episodio',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    episodioController.crearEpisodio
);
router.put('/episodio/:episodio_id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    episodioController.actualizarEpisodio
);

// ─────────────────────────────────────────────────────────────────────────────
// CU32 — Objetivos terapéuticos y avance
// ─────────────────────────────────────────────────────────────────────────────
router.get('/episodio/:episodio_id/objetivos',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    objetivoController.obtenerObjetivos
);
router.post('/episodio/:episodio_id/objetivos',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    objetivoController.crearObjetivo
);

// El avance: el controlador ya audita internamente (valor anterior/nuevo),
// por eso no se le añade auditarAccesoClinico (evita auditoría duplicada).
// CU32, CU51 — avance del objetivo; puede habilitar la preparación para el alta
router.put('/episodio/:episodio_id/avance',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    evolucionController.actualizarAvance
);

// ─────────────────────────────────────────────────────────────────────────────
// CU51 / CU37 — Preparación para el alta e informe de alta
// ─────────────────────────────────────────────────────────────────────────────
// CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
router.get('/mi-alta',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    altaController.miAlta
);
// CU37 — Emitiendo informe de alta y cierre de episodio
router.get('/episodio/:episodio_id/informe-alta',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    altaController.resumenInformeAlta
);
router.post('/episodio/:episodio_id/informe-alta',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    altaController.emitirInformeAlta
);

// ─────────────────────────────────────────────────────────────────────────────
// CU55 (correcciones Inc 4) — Calificación general al terminar el tratamiento
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tratamientos/por-evaluar',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    evaluacionController.tratamientosPorEvaluar
);
router.post('/episodio/:episodio_id/evaluacion',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    evaluacionController.registrarEvaluacionTratamiento
);

// ─────────────────────────────────────────────────────────────────────────────
// CU65 — Derivaciones internas entre especialidades
// ─────────────────────────────────────────────────────────────────────────────
router.get('/episodio/:episodio_id/derivaciones/opciones',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    derivacionController.opciones
);
router.get('/episodio/:episodio_id/derivaciones',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    derivacionController.delEpisodio
);
router.post('/episodio/:episodio_id/derivaciones',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    derivacionController.crear
);
router.get('/derivaciones/recibidas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    derivacionController.recibidas
);
router.post('/derivaciones/:id/respuesta',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    derivacionController.responder
);
router.post('/derivaciones/:id/cierre',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    derivacionController.cerrar
);

// ─────────────────────────────────────────────────────────────────────────────
// CU30, CU36 — Inalterabilidad de la Ficha Clínica
// ─────────────────────────────────────────────────────────────────────────────

// CU30, CU36 — abre la evolución en borrador que luego se firma y queda inalterable (CU78 Exc.3)
router.post('/episodio/:episodio_id/evolucion',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    evolucionController.crearEvolucionEnBlanco
);

// CU40 - Documentar intervención y respuesta fisiológica
router.get('/intervenciones/sesiones',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    intervencionController.listarSesiones
);
router.get('/intervenciones/:episodio_id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    intervencionController.obtenerIntervencion
);
router.put('/intervenciones/:episodio_id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    intervencionController.guardarIntervencion
);
// El paciente llega por un motivo nuevo: la atención en curso se traslada al
// episodio nuevo en vez de quedar atada al anterior.
// CU40, CU78 — trasladar la atención en curso a otro episodio
router.put('/intervenciones/:episodio_id/atencion',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    intervencionController.trasladarAtencion
);

// ── CU25 — Reporte de hallazgos pre-clínicos (lo lee el profesional)
router.get('/pacientes/:pacienteId/reporte-preclinico',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    seguimientoController.reportePreclinico
);

// ── CU26 — Sugerencia de derivación por especialidad (la ve el paciente)
router.get('/mi-derivacion',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    seguimientoController.miDerivacion
);

// ── CU50 — Reporte de evolución del paciente y banderas rojas
router.post('/sintomas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    seguimientoController.registrarSintomas
);
router.get('/mis-sintomas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    seguimientoController.misSintomas
);
router.get('/pacientes/:pacienteId/sintomas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    seguimientoController.sintomasDePaciente
);
router.get('/alertas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    seguimientoController.alertasAbiertas
);
router.post('/alertas/:id/revisar',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    seguimientoController.revisarAlerta
);

// ── CU44/CU45 — Indice de adherencia y panel de progreso
router.get('/mi-progreso',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    seguimientoController.miProgreso
);
router.get('/pacientes/:pacienteId/adherencia',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    seguimientoController.adherenciaDePaciente
);

// ── CU53/CU57 — Mensajería clínica cifrada
router.get('/mis-conversaciones',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    chatController.misConversaciones
);
// Una conversación por pareja paciente–profesional.
router.get('/chat/adjuntos/:mensaje_id/ver',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    chatController.verAdjunto
);
router.get('/chat/con/:paciente_id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    chatController.conversacionConPaciente
);
router.get('/chat/:paciente_id/:profesional_id/mensajes',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    chatController.listarMensajes
);
router.post('/chat/:paciente_id/:profesional_id/mensajes',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    chatController.enviarMensaje
);
router.post('/chat/:paciente_id/:profesional_id/documento',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    chatController.compartirDocumento
);
// (la ruta de adjuntos va más abajo, junto al receptor de archivos)
// Compatibilidad con avisos y versiones anteriores, que abrían el chat por episodio.
router.get('/episodio/:episodio_id/mensajes',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    chatController.listarMensajesEpisodio
);
router.post('/episodio/:episodio_id/mensajes',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    chatController.enviarMensajeEpisodio
);

// CU16
router.get('/disponibilidad/bloqueos',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    disponibilidadController.listarBloqueos
);

router.post('/disponibilidad/restringir',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    disponibilidadController.restringirDisponibilidad
);

// ─────────────────────────────────────────────────────────────────────────────
// CU46 — Biblioteca centralizada de material terapéutico
// ─────────────────────────────────────────────────────────────────────────────
router.get('/materiales',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    pautaController.buscarMateriales
);

// ─────────────────────────────────────────────────────────────────────────────
// CU47 — Prescripción de pautas de ejercicio
// ─────────────────────────────────────────────────────────────────────────────
router.post('/pautas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    pautaController.crearPauta
);
router.get('/pautas/paciente/:paciente_id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']), C_Seguridad_JWT_BCrypt.auditarAccesoClinico,
    pautaController.pautasDePaciente
);

// ─────────────────────────────────────────────────────────────────────────────
// CU48/CU49 — Cumplimiento diario y vigencia (lado paciente)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pautas/mis-pautas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    pautaController.misPautas
);
router.post('/pautas/ejercicios/:id/cumplimiento',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    pautaController.marcarCumplimiento
);
router.delete('/pautas/ejercicios/:id/cumplimiento',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    pautaController.desmarcarCumplimiento
);

// ─────────────────────────────────────────────────────────────────────────────
// CU27 — Disclaimer legal + CU23 — Triaje + CU24 — Integración a ficha
// ─────────────────────────────────────────────────────────────────────────────
// CU23 — Ejecutando entrevista clínica automatizada de triaje (estado y reanudación)
router.get('/triaje/estado',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    triajeController.estadoTriaje
);
// CU27 — Registrando aceptación de disclaimer legal
router.get('/triaje/disclaimer',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    triajeController.obtenerDisclaimer
);
router.post('/triaje/disclaimer/aceptar',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    triajeController.aceptarDisclaimer
);
// CU23 — Ejecutando entrevista clínica automatizada de triaje
router.get('/triaje/arbol',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    triajeController.obtenerArbol
);
router.put('/triaje/respuestas',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    triajeController.guardarRespuestasParciales
);
// CU24 — Estructurando datos de sintomatología a Ficha Clínica
router.post('/triaje/completar',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    triajeController.completarTriaje
);

// ─────────────────────────────────────────────────────────────────────────────
// CU77 — Plantilla de evaluación según la especialidad del profesional
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plantilla-evaluacion',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
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

// CU33 — Almacenando archivos en repositorio multimedia
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

// Punto 8: material de apoyo propio de cada ejercicio de una pauta.
// CU47 — Prescribiendo pautas de ejercicio técnico (el paciente lo ve en CU48)
router.post('/pautas/ejercicios/:id/material',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    cargaArchivo.single('archivo'), manejarErrorCarga,
    pautaController.subirMaterialApoyo
);
router.get('/pautas/material/:id/ver',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    pautaController.verMaterialApoyo
);
router.delete('/pautas/material/:id',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    pautaController.eliminarMaterialApoyo
);

// CU53: imágenes y archivos adjuntos al chat (mismo receptor que la ficha).
router.post('/chat/:paciente_id/:profesional_id/adjuntos',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional']),
    cargaArchivo.single('archivo'), manejarErrorCarga,
    chatController.enviarAdjunto
);

// CU34 — Categorizando documentos mediante metadatos
router.get('/documentos/categorias',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
    documentoController.listarCategorias
);
// CU33 — Almacenando archivos en repositorio multimedia
router.post('/pacientes/:pacienteId/documentos',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    cargaArchivo.single('archivo'), manejarErrorCarga,
    documentoController.subirDocumento
);
// CU34, CU35 — listar el repositorio por categoría
router.get('/pacientes/:pacienteId/documentos',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    documentoController.listarDocumentos
);
// CU35 — Visualizando archivos con visor embebido
router.get('/mis-documentos',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente']),
    documentoController.misDocumentos
);
// CU34 — Categorizando documentos mediante metadatos
router.put('/documentos/:id/categoria',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    documentoController.cambiarCategoria
);
// CU35 — Visualizando archivos con visor embebido
router.get('/documentos/:id/ver',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Paciente', 'Profesional', 'Administrador']),
    documentoController.verDocumento
);

// ─────────────────────────────────────────────────────────────────────────────
// CU31 — Versionado de correcciones sobre evoluciones cerradas
// ─────────────────────────────────────────────────────────────────────────────
const versionController = require('../controllers/clinico/versionController');

router.get('/evolucion/:evolucionId/versiones',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional', 'Administrador']),
    versionController.listarVersiones
);
router.post('/evolucion/:evolucionId/versiones',
    C_Seguridad_JWT_BCrypt.verifyToken, C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
    versionController.crearVersion
);

module.exports = router;
