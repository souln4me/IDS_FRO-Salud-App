/**
 * Componente: C_API_REST
 * Casos de uso: CU30, CU36.
 *
 * Firma y cierre de evoluciones clínicas; una evolución firmada ya no se edita ni se borra.
 */
const express = require('express');
const router = express.Router();

const C_Seguridad_JWT_BCrypt = require('../componentes/C_Seguridad_JWT_BCrypt');
const inalterabilidadController = require('../controllers/inalterabilidadController');

// CU36 — Firmando digitalmente documentos clínicos (la evolución queda inalterable, CU30)
router.post(
  '/finalizar/:evolucionId',
  C_Seguridad_JWT_BCrypt.verifyToken,
  C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  inalterabilidadController.finalizarEvolucion
);

// CU30 — Asegurando inalterabilidad de registros clínicos (rechaza editar o borrar lo firmado)
router.put(
  '/editar/:evolucionId',
  C_Seguridad_JWT_BCrypt.verifyToken,
  C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  inalterabilidadController.editarEvolucion
);

router.delete(
  '/eliminar/:evolucionId',
  C_Seguridad_JWT_BCrypt.verifyToken,
  C_Seguridad_JWT_BCrypt.authorizeRoles(['Profesional']),
  inalterabilidadController.eliminarEvolucion
);

module.exports = router;