/**
 * Componente: C_API_Adapter (puerta de entrada: src/componentes/C_API_Adapter.js)
 * Casos de uso: CU69, CU70.
 *
 * Bitácora de las transacciones con proveedores externos: guarda cada intento,
 * su latencia y sus fallos. Lo usan providerAdapter y externalHttpClient.
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');

const UMBRAL_LATENCIA_MS = parseInt(process.env.LATENCIA_UMBRAL_MS || '5000', 10);
const ACCION = 'INTEGRACION_EXTERNA';

// Apoyo común: convierte el payload a texto para la bitácora
function serializar(payload) {
  if (payload == null) return null;
  if (typeof payload === 'string') return payload;
  try { return JSON.stringify(payload); } catch { return String(payload); }
}

// CU69 — Registrando en Bitácora de Transacciones Externas
function atributosFaltantes({ proveedor, operacion }) {
  const faltantes = [];
  if (!proveedor) faltantes.push('proveedor');
  if (!operacion) faltantes.push('operacion');
  return faltantes;
}

// CU69 — Registrando en Bitácora de Transacciones Externas
// Escribe UNA fila de evento en Bitacora_Auditoria.
async function escribirEvento({ proveedor, operacion, usuarioId, estado, datos }) {
  try {
    await C_Capa_de_Acceso_a_Datos.TransactionAuditModel.registrar({
      accion: ACCION,
      entidad_afectada: proveedor || 'DESCONOCIDO',
      usuario_id: usuarioId || null,
      datos: { operacion, estado, ...datos }
    });
  } catch (e) {
    console.error('[transactionAudit] No se pudo escribir en la bitácora:', e.message);
  }
}

// CU69 — Registrando en Bitácora de Transacciones Externas
// ─ Excepción 1 (standalone): payload sin atributos obligatorios.
async function registrarFalloSintaxis({ proveedor, operacion, usuarioId = null, faltantes = [], payloadEnviado = null, error = null }) {
  await escribirEvento({
    proveedor, operacion, usuarioId,
    estado: 'FALLO_SINTAXIS',
    datos: {
      error_detalle: error?.message
        || (faltantes.length ? `Atributos obligatorios ausentes: ${faltantes.join(', ')}` : 'Fallo de sintaxis en el payload de salida.'),
      payload_enviado: serializar(payloadEnviado)
    }
  });
}

// CU69 — Registrando en Bitácora de Transacciones Externas
// ─ Excepción 4 (standalone): respuesta con esquema divergente; aísla el paquete crudo.
async function registrarEsquemaDivergente({ proveedor, operacion, usuarioId = null, payloadRecibido = null, error = null }) {
  await escribirEvento({
    proveedor, operacion, usuarioId,
    estado: 'ESQUEMA_INVALIDO',
    datos: {
      payload_recibido: serializar(payloadRecibido),
      error_detalle: error?.message || String(error || 'Esquema de respuesta divergente.')
    }
  });
}

// CU69, CU70 — bitácora del rechazo por formato
// ─ CU70 Excepción 1: rechazo del proveedor por formato incompatible (HTTP 400). 
async function registrarRechazoFormato(ctx, { codigoRespuesta = 400, payloadRecibido = null, error = null } = {}) {
  const latencia = ctx?.inicio ? Date.now() - ctx.inicio : null;
  await escribirEvento({
    ...ctx, estado: 'RECHAZO_FORMATO',
    datos: {
      codigo_respuesta: codigoRespuesta,
      latencia_ms: latencia,
      payload_recibido: serializar(payloadRecibido),
      error_detalle: error?.message || 'El proveedor rechazó la petición por formato incompatible.',
      payload_enviado: serializar(ctx?.payloadEnviado)
    }
  });
}

// CU69, CU70 — bitácora del límite de reintentos
// ─ CU70 Excepción 3: el proveedor persiste en error tras el límite máximo de intentos. 
async function registrarEventoCritico(ctx, { error = null, codigoRespuesta = null, intentos = null } = {}) {
  const latencia = ctx?.inicio ? Date.now() - ctx.inicio : null;
  await escribirEvento({
    ...ctx, estado: 'LIMITE_REINTENTOS',
    datos: {
      critico: true,
      codigo_respuesta: codigoRespuesta,
      latencia_ms: latencia,
      intentos,
      error_detalle: error?.message || `Proveedor inalcanzable tras ${intentos} intentos (caída persistente).`,
      payload_enviado: serializar(ctx?.payloadEnviado)
    }
  });
}

// CU69, CU70 — bitácora de la consolidación fallida
// ─ CU70 Excepción 4: la consolidación post-éxito falló (limpieza de recursos). 
async function registrarInconsistenciaConsolidacion(ctx, { error = null, intentos = null } = {}) {
  await escribirEvento({
    ...ctx, estado: 'INCONSISTENCIA_CONSOLIDACION',
    datos: {
      nivel: 'warning',
      alerta_admin: true,
      intentos,
      error_detalle: error?.message || 'Fallo al consolidar/limpiar el ciclo tras una transacción exitosa.'
    }
  });
}

// CU69 — Registrando en Bitácora de Transacciones Externas
// ─ Inicia la transacción (lifecycle de red). Valida proveedor/operacion (Excepción 1).
async function iniciarTransaccion({ proveedor, operacion, payloadEnviado = null, usuarioId = null }) {
  const faltantes = atributosFaltantes({ proveedor, operacion });
  if (faltantes.length > 0) {
    await registrarFalloSintaxis({ proveedor, operacion, usuarioId, faltantes, payloadEnviado });
    const err = new Error(`Transmisión abortada: faltan atributos obligatorios (${faltantes.join(', ')}).`);
    err.code = 'FALLO_SINTAXIS';
    throw err;
  }
  return { proveedor, operacion, usuarioId, payloadEnviado, inicio: Date.now() };
}

// CU69 — Registrando en Bitácora de Transacciones Externas
// ─ Éxito: mide latencia y la marca crítica si excede el umbral. 
async function registrarExito(ctx, { codigoRespuesta = 200, payloadRecibido = null } = {}) {
  const latencia = Date.now() - ctx.inicio;
  const estado = latencia > UMBRAL_LATENCIA_MS ? 'LATENCIA_CRITICA' : 'EXITOSA';
  await escribirEvento({
    ...ctx, estado,
    datos: {
      codigo_respuesta: codigoRespuesta,
      latencia_ms: latencia,
      payload_enviado: serializar(ctx.payloadEnviado),
      payload_recibido: serializar(payloadRecibido)
    }
  });
  return { estado, latencia };
}

// CU69 — Registrando en Bitácora de Transacciones Externas
// ─ Excepción 3 (timeout): latencia crítica explícita.
async function registrarLatenciaCritica(ctx, { codigoRespuesta = null } = {}) {
  const latencia = ctx?.inicio ? Date.now() - ctx.inicio : null;
  await escribirEvento({
    ...ctx, estado: 'LATENCIA_CRITICA',
    datos: {
      codigo_respuesta: codigoRespuesta,
      latencia_ms: latencia,
      error_detalle: `Tiempo de respuesta (${latencia} ms) excede el umbral (${UMBRAL_LATENCIA_MS} ms).`,
      payload_enviado: serializar(ctx?.payloadEnviado)
    }
  });
  return { latencia };
}

module.exports = {
  iniciarTransaccion,
  registrarExito,
  registrarLatenciaCritica,
  registrarFalloSintaxis,
  registrarEsquemaDivergente,
  registrarRechazoFormato,
  registrarEventoCritico,
  registrarInconsistenciaConsolidacion,
  UMBRAL_LATENCIA_MS
};