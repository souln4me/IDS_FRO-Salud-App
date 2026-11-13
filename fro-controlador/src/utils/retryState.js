/**
 * Componente: C_API_Adapter (puerta de entrada: src/componentes/C_API_Adapter.js)
 * Casos de uso: CU70.
 *
 * Contador de reintentos por petición hacia el proveedor externo.
 */
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// CU70 - Gestor de estado del contador de reintentos por petición.
// Contador en "caché" SIMULADA (Map). Si la caché falla (Exc 2), se continúa en
// memoria local. estabilizar() libera recursos pase lo que pase (Exc 4).
// ─────────────────────────────────────────────────────────────────────────────

const _cache = new Map();
const _memoriaLocal = new Map();

// Simula caída de la CACHÉ → afecta el conteo (Exc 2). Por código o por entorno.
let _forzarFalloCache = process.env.RETRY_CACHE_FORZAR_FALLO === 'true';
function simularFalloCache(activo) { _forzarFalloCache = !!activo; }

// Simula fallo SOLO en la limpieza post-éxito → Exc 4 AISLADA, sin afectar el conteo.
let _forzarFalloLimpieza = process.env.RETRY_FORZAR_FALLO_LIMPIEZA === 'true';
function simularFalloLimpieza(activo) { _forzarFalloLimpieza = !!activo; }

const cache = {
  get(id) { if (_forzarFalloCache) throw new Error('Servicio de caché no disponible'); return _cache.get(id); },
  set(id, v) { if (_forzarFalloCache) throw new Error('Servicio de caché no disponible'); _cache.set(id, v); },
  del(id) { if (_forzarFalloCache) throw new Error('Servicio de caché no disponible'); _cache.delete(id); }
};

function crearId() {
  return crypto.randomUUID();
}

// Incrementa y devuelve el contador. Exc 2: si la caché falla, sigue en memoria local.
function incrementar(idPeticion) {
  try {
    const actual = cache.get(idPeticion) || 0;
    const nuevo = actual + 1;
    cache.set(idPeticion, nuevo);
    return { intentos: nuevo, origen: 'cache' };
  } catch (errCache) {
    console.warn(`[retryState] Falla de caché, se inicializa memoria local: ${errCache.message}`);
    const actual = _memoriaLocal.get(idPeticion) || 0;
    const nuevo = actual + 1;
    _memoriaLocal.set(idPeticion, nuevo);
    return { intentos: nuevo, origen: 'memoria_local' };
  }
}

function obtener(idPeticion) {
  try {
    return cache.get(idPeticion) || 0;
  } catch {
    return _memoriaLocal.get(idPeticion) || 0;
  }
}

// Reinicia el contador al consolidar tras éxito. Lanza si la caché o la limpieza
// fallan (el Paso 5 lo captura para la Exc 4). La memoria local se limpia igual.
function reiniciar(idPeticion) {
  try {
    if (_forzarFalloLimpieza) throw new Error('Fallo simulado al consolidar/limpiar recursos');
    cache.del(idPeticion);
  } finally {
    _memoriaLocal.delete(idPeticion);
  }
}

// Rutina de estabilización (nunca lanza): libera el contador en ambos almacenes
// accediendo a la memoria subyacente directamente, sin depender de la "caché".
function estabilizar(idPeticion) {
  try { _cache.delete(idPeticion); } catch { /* ignorar */ }
  try { _memoriaLocal.delete(idPeticion); } catch { /* ignorar */ }
}

module.exports = { crearId, incrementar, obtener, reiniciar, estabilizar, simularFalloCache, simularFalloLimpieza };