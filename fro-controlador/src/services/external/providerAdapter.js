const { enviarPeticion } = require('../../utils/externalHttpClient');
const { MAPPERS } = require('../../utils/dataMappers');
const { ESQUEMAS, validarPayloadSalida, validarPayloadEntrada } = require('../../validators/externalSchemas');
const audit = require('../audit/transactionAuditService');

// ─────────────────────────────────────────────────────────────────────────────
// CU68 - Paso 6: Adaptador del Proveedor Externo (núcleo del caso de uso).
// Servicio genérico especializado por proveedor mediante el registro PROVIDERS.
// El núcleo solo invoca ejecutarTransaccion() y queda agnóstico del formato externo.
// ─────────────────────────────────────────────────────────────────────────────

// Especialización por proveedor: endpoint + autenticación.
// URLs y credenciales reales se inyectan por entorno al conectar cada servicio.
const PROVIDERS = {
  OPENAI: {
    baseUrl: process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    buildHeaders: () => ({ Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}` })
  },
  IMED: {
    baseUrl: process.env.IMED_URL || '',
    method: 'POST',
    buildHeaders: () => ({ 'X-Api-Key': process.env.IMED_API_KEY || '' })
  },
  // Financiador de bonos (CU66). Por defecto apunta al simulador interno del
  // propio servidor; con FINANCIADOR_URL se conecta un financiador real sin
  // tocar código.
  FINANCIADOR: {
    baseUrl:
      process.env.FINANCIADOR_URL ||
      `http://127.0.0.1:${process.env.PORT || 3000}/api/financiador-simulado/validar-bono`,
    method: 'POST',
    buildHeaders: () => ({ 'X-Api-Key': process.env.FINANCIADOR_API_KEY || 'demo-financiador' })
  },
  PASARELA_PAGO: {
    baseUrl: process.env.PAGO_URL || '',
    method: 'POST',
    buildHeaders: () => ({ Authorization: `Bearer ${process.env.PAGO_API_KEY || ''}` })
  }
};

async function ejecutarTransaccion({
  proveedor,
  operacion,
  datosInternos,
  usuarioId = null,
  urlOverride = null,   // permite apuntar a un endpoint específico de la operación
  headersExtra = {}
}) {
  const config  = PROVIDERS[proveedor];
  const mapper  = MAPPERS[proveedor];
  const esquema = ESQUEMAS[proveedor];

  if (!config || !mapper || !esquema) {
    const err = new Error(`Proveedor no soportado por la capa adaptadora: ${proveedor}`);
    err.code = 'PROVEEDOR_NO_SOPORTADO';
    throw err;
  }

  // 1. Transformar interno → formato del proveedor
  const payloadSalida = mapper.salida(datosInternos);

  // 2. Excepción 1: validar sintaxis de salida ANTES de transmitir
  const vSalida = validarPayloadSalida(payloadSalida, esquema.salida);
  if (!vSalida.valido) {
    await audit.registrarFalloSintaxis({
      proveedor, operacion, usuarioId,
      faltantes: vSalida.faltantes,
      payloadEnviado: payloadSalida
    });
    const err = new Error(`Payload de salida inválido para ${proveedor}. Faltan: [${vSalida.faltantes.join(', ')}].`);
    err.code = 'FALLO_SINTAXIS';
    err.detalle = vSalida;
    throw err;
  }

  // 3. Transmitir — el http client maneja Excepciones 2 y 3 y audita el round-trip
  const respuesta = await enviarPeticion({
    proveedor,
    operacion,
    url: urlOverride || config.baseUrl,
    method: config.method,
    headers: { ...config.buildHeaders(), ...headersExtra },
    body: payloadSalida,
    usuarioId
  });

  // 4. Excepción 4: validar estructura entrante
  const vEntrada = validarPayloadEntrada(respuesta.data, esquema.entrada);
  if (!vEntrada.valido) {
    await audit.registrarEsquemaDivergente({
      proveedor, operacion, usuarioId,
      payloadRecibido: respuesta.raw, // se aísla la respuesta cruda incompatible
      error: new Error(`Faltan: [${vEntrada.faltantes.join(', ')}] / Tipos inválidos: ${JSON.stringify(vEntrada.tiposInvalidos)}`)
    });
    const err = new Error(`Respuesta de ${proveedor} con esquema divergente.`);
    err.code = 'ESQUEMA_INVALIDO';
    err.detalle = vEntrada;
    throw err;
  }

  // 5. Transformar al modelo interno y retornar el éxito al núcleo
  return {
    datos: mapper.entrada(respuesta.data),
    meta: {
      status: respuesta.status,
      latencia_ms: respuesta.latencia,
      intentos: respuesta.intentos,
      consolidacion: respuesta.consolidacion // 'ok' | 'inconsistente' (Exc 4, Paso 5)
    }
  };
}

module.exports = { ejecutarTransaccion, PROVIDERS };