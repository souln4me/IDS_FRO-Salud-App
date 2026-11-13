/**
 * C_API_REST
 *
 * Componente "API REST" del Diagrama de Componentes (Incremento 1). Recibe
 * todas las peticiones HTTP/JSON del Cliente Móvil y las reparte a los
 * controladores. Cada controlador atiende sus casos de uso y llama a los
 * demás componentes por su nombre (C_Motor_Agendamiento, C_Motor_Clinico...).
 *
 * Forman este componente:
 *   - este archivo, que publica cada grupo de rutas bajo /api;
 *   - src/routes/*.js, que definen cada ruta y su control de acceso;
 *   - src/controllers/**, que atienden cada petición.
 */

const express = require('express');

const router = express.Router();

// CU01 a CU09, CU12: registro, inicio de sesión, OTP, contraseña, sesiones y perfil del paciente
router.use('/auth', require('../routes/authRoutes'));
// CU02, CU10, CU11, CU58: profesionales, su perfil público y su panel
router.use('/profesionales', require('../routes/profesionalRoutes'));
// CU16, CU23 a CU37, CU40, CU44 a CU54, CU62, CU65, CU77, CU78: todo lo clínico
router.use('/clinica', require('../routes/clinicaRoutes'));
// CU14 a CU22, CU38, CU39, CU41 a CU43, CU55, CU76: agenda, citas y evidencia de la sesión
router.use('/citas', require('../routes/citaRoutes'));
// CU30 — Asegurando inalterabilidad de registros clínicos
router.use('/inalterabilidad', require('../routes/inalterabilidadRoutes'));
// CU57, CU59: parámetros globales y diccionario de términos restringidos
router.use('/parametros', require('../routes/parametroRoutes'));
// CU68 a CU70: demostración del intercambio con un proveedor externo
router.use('/integracion-demo', require('../routes/integracionDemoRoutes'));
// CU66, CU67, CU71, CU72: bonos, pagos y contingencia
router.use('/pagos', require('../routes/pagoRoutes'));
// CU52 — Emitiendo notificaciones multicanal
router.use('/notificaciones', require('../routes/notificacionRoutes'));
// CU55, CU56, CU58: evaluaciones y reseñas
router.use('/evaluaciones', require('../routes/evaluacionRoutes'));
// CU60, CU61, CU62: soporte y eventos críticos
router.use('/soporte', require('../routes/soporteRoutes'));
// CU62, CU63, CU64: panel de gestión, informes y bandeja de eventos críticos
router.use('/gestion', require('../routes/gestionRoutes'));
// CU73, CU74, CU75: cobro anticipado, devoluciones y liquidaciones
router.use('/finanzas', require('../routes/finanzasRoutes'));

module.exports = router;
