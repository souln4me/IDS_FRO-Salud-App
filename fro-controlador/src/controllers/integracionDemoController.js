/**
 * Componente: C_API_REST
 * Casos de uso: CU68, CU70.
 *
 * Endpoint de demostración de la capa adaptadora con proveedores externos.
 */
const C_API_Adapter = require('../componentes/C_API_Adapter');

//  ─────────────────────────────────────────────────────────────────────────
// CU68/CU70 - ENDPOINT DE REFERENCIA
//
// Este controlador NO es una funcionalidad de negocio. Existe ÚNICAMENTE para
// DEMOSTRAR y dejar EVIDENCIA de que la capa adaptadora funciona de punta a punta
// y mapea las excepciones estandarizadas a códigos HTTP coherentes.
//
// SE DEBE: reemplazar por la integración real cuando exista un proveedor concreto.
// ─────────────────────────────────────────────────────────────────────────────

// CU68, CU70 — traducir el error del adaptador a código HTTP
// Map del err.code estandarizado del adaptador → código HTTP.
function estadoHttpDeError(code) {
  switch (code) {
    case 'FALLO_SINTAXIS':         return 422; // CU68 Exc 1: payload de salida inválido
    case 'RECHAZO_FORMATO':        return 422; // CU70 Exc 1: proveedor rechazó por formato (HTTP 400)
    case 'LATENCIA_CRITICA':       return 504; // timeout / umbral de latencia excedido
    case 'LIMITE_REINTENTOS':      return 503; // CU70 Exc 3: proveedor inalcanzable tras reintentos
    case 'ESQUEMA_INVALIDO':       return 502; // CU68 Exc 4: respuesta divergente
    case 'PROVEEDOR_NO_SOPORTADO': return 400; // proveedor no registrado en PROVIDERS
    default:                       return 500;
  }
}

// CU68 — Intercambiando Datos con Proveedor Externo
// POST /api/integracion-demo/ejecutar
exports.ejecutar = async (req, res) => {
  const { proveedor, operacion, datosInternos, usuarioId = null, urlOverride = null } = req.body;

  try {
    const resultado = await C_API_Adapter.ejecutarTransaccion({ proveedor, operacion, datosInternos, usuarioId, urlOverride });
    return res.status(200).json({ ok: true, ...resultado });
  } catch (error) {
    // Toda ruta de error devuelve una respuesta HTTP → no quedan hilos bloqueados (poscondición CU70).
    const status = estadoHttpDeError(error.code);
    return res.status(status).json({
      ok: false,
      code: error.code || 'ERROR_DESCONOCIDO',
      mensaje: error.message,
      detalle: error.detalle || null
    });
  }
};