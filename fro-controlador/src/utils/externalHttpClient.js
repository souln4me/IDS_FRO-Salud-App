const audit = require('../services/audit/transactionAuditService');
const retryState = require('./retryState');

const TIMEOUT_MS      = parseInt(process.env.EXTERNAL_TIMEOUT_MS      || '5000', 10);
// RF70: como máximo 4 intentos ante fallos de conectividad (D3).
const MAX_INTENTOS    = parseInt(process.env.EXTERNAL_MAX_INTENTOS    || '4', 10);
const BACKOFF_BASE_MS = parseInt(process.env.EXTERNAL_BACKOFF_BASE_MS || '300', 10);
const BACKOFF_MAX_MS  = parseInt(process.env.EXTERNAL_BACKOFF_MAX_MS  || '10000', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function calcularRetraso(intento) {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, intento - 1), BACKOFF_MAX_MS);
}

function parsearCuerpo(texto) {
  if (!texto) return null;
  try { return JSON.parse(texto); } catch { return texto; }
}

function sanearHeaders(headers = {}) {
  const copia = { ...headers };
  for (const k of Object.keys(copia)) {
    if (/authorization|api[-_]?key|token|secret/i.test(k)) copia[k] = '***';
  }
  return copia;
}

// ─────────────────────────────────────────────────────────────────────────────
// CU68/CU70 - Cliente HTTP para proveedores externos.
// Reintentos con contador por petición (retryState) + retraso exponencial.
// Timeout = LATENCIA_CRITICA. HTTP 400 = RECHAZO_FORMATO (aborta). Máx. intentos =
// LIMITE_REINTENTOS + evento crítico. Tras éxito, consolida y resetea (Exc 4).
// ─────────────────────────────────────────────────────────────────────────────
async function enviarPeticion({
  proveedor,
  operacion,
  url,
  method = 'GET',
  headers = {},
  body = null,
  usuarioId = null,
  timeoutMs = TIMEOUT_MS,
  maxIntentos = MAX_INTENTOS
}) {
  if (!url) {
    const err = new Error('externalHttpClient: falta la URL de destino.');
    err.code = 'FALLO_SINTAXIS';
    throw err;
  }

  const payloadEnviado = { url, method, headers: sanearHeaders(headers), body };
  const ctx = await audit.iniciarTransaccion({ proveedor, operacion, payloadEnviado, usuarioId });

  const idPeticion = retryState.crearId();

  try {
    while (true) {
      const { intentos } = retryState.incrementar(idPeticion);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body != null && method !== 'GET'
            ? (typeof body === 'string' ? body : JSON.stringify(body))
            : undefined,
          signal: controller.signal
        });
        clearTimeout(timer);

        const textoCrudo = await res.text();
        const data = parsearCuerpo(textoCrudo);

        // ─ Excepción 1: HTTP 400 = formato incompatible → abortar + auditar (sin reintentar) 
        if (res.status === 400) {
          await audit.registrarRechazoFormato(ctx, { codigoRespuesta: res.status, payloadRecibido: textoCrudo });
          const err = new Error(`El proveedor ${proveedor} rechazó la petición por formato incompatible (HTTP 400).`);
          err.code = 'RECHAZO_FORMATO';
          err.status = 400;
          throw err;
        }

        // ─ 5xx → reintentable; al agotar el máximo = evento crítico (Exc 3) 
        if (res.status >= 500) {
          if (intentos >= maxIntentos) {
            await audit.registrarEventoCritico(ctx, { error: new Error(`HTTP ${res.status}`), codigoRespuesta: res.status, intentos });
            const err = new Error(`Proveedor ${proveedor} inalcanzable tras ${intentos} intentos (HTTP ${res.status}).`);
            err.code = 'LIMITE_REINTENTOS';
            err.status = res.status;
            throw err;
          }
          await sleep(calcularRetraso(intentos));
          continue;
        }

        // ─ Éxito (2xx y otros 4xx ≠ 400) → auditar éxito 
        const { estado, latencia } = await audit.registrarExito(ctx, { codigoRespuesta: res.status, payloadRecibido: textoCrudo });

        // ─ Paso 5: consolidación del ciclo (resetear el contador). 
        let consolidacion = 'ok';
        try {
          retryState.reiniciar(idPeticion);
        } catch (errLimpieza) {
          // Excepción 4: la limpieza falló tras una transacción exitosa.
          retryState.estabilizar(idPeticion);
          await audit.registrarInconsistenciaConsolidacion(ctx, { error: errLimpieza, intentos });
          consolidacion = 'inconsistente';
        }

        return { status: res.status, data, raw: textoCrudo, latencia, estado, intentos, consolidacion };

      } catch (error) {
        clearTimeout(timer);

        if (error.code === 'LIMITE_REINTENTOS' || error.code === 'RECHAZO_FORMATO') throw error;

        // ─ Timeout → LATENCIA_CRITICA, sin reintentar (decisión #8) 
        if (error.name === 'AbortError') {
          await audit.registrarLatenciaCritica(ctx, {});
          const err = new Error(`Tiempo de espera agotado (${timeoutMs} ms) con el proveedor ${proveedor}.`);
          err.code = 'LATENCIA_CRITICA';
          throw err;
        }

        // ─ Error de red → reintentable; al agotar el máximo = evento crítico (Exc 3) 
        if (intentos >= maxIntentos) {
          await audit.registrarEventoCritico(ctx, { error, intentos });
          const err = new Error(`No se pudo conectar con el proveedor ${proveedor} tras ${intentos} intentos.`);
          err.code = 'LIMITE_REINTENTOS';
          throw err;
        }
        await sleep(calcularRetraso(intentos));
        continue;
      }
    }
  } finally {
    // #3: libera el contador en CUALQUIER salida (éxito o error terminal).
    // estabilizar() es idempotente, así que es seguro aunque ya se haya limpiado en éxito.
    retryState.estabilizar(idPeticion);
  }
}

module.exports = { enviarPeticion };