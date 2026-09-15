// ─────────────────────────────────────────────────────────────────────────────
// CU68 - Paso 4: Validación manual de esquemas para proveedores externos.
// Sin dependencias externas. CommonJS, requerible desde mappers y capa adaptadora.
// ─────────────────────────────────────────────────────────────────────────────

function tipoCorrecto(valor, tipo) {
  switch (tipo) {
    case 'string':  return typeof valor === 'string';
    case 'number':  return typeof valor === 'number' && !Number.isNaN(valor);
    case 'boolean': return typeof valor === 'boolean';
    case 'object':  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    case 'array':   return Array.isArray(valor);
    case 'any':     return valor !== undefined && valor !== null;
    default:        return false;
  }
}

/**
 * Valida un payload contra un esquema declarativo.
 * esquema: { campo: { tipo: 'string'|'number'|'boolean'|'object'|'array'|'any', requerido: bool } }
 * @returns { valido, faltantes:[], tiposInvalidos:[{campo,esperado}] }
 */
function validarContraEsquema(payload, esquema) {
  if (payload === null || typeof payload !== 'object') {
    const requeridos = Object.keys(esquema).filter((k) => esquema[k].requerido);
    return { valido: false, faltantes: requeridos, tiposInvalidos: [], mensaje: 'El payload no es un objeto válido.' };
  }

  const faltantes = [];
  const tiposInvalidos = [];

  for (const campo of Object.keys(esquema)) {
    const regla = esquema[campo];
    const valor = payload[campo];
    const ausente = valor === undefined || valor === null || valor === '';

    if (regla.requerido && ausente) {
      faltantes.push(campo);
      continue;
    }
    if (!ausente && regla.tipo && !tipoCorrecto(valor, regla.tipo)) {
      tiposInvalidos.push({ campo, esperado: regla.tipo });
    }
  }

  return { valido: faltantes.length === 0 && tiposInvalidos.length === 0, faltantes, tiposInvalidos };
}

// Excepción 1 (salida): atributos obligatorios del payload a enviar.
function validarPayloadSalida(payload, esquema) {
  return validarContraEsquema(payload, esquema);
}

// Excepción 4 (entrada): la respuesta del proveedor cumple el esquema documentado.
function validarPayloadEntrada(payload, esquema) {
  return validarContraEsquema(payload, esquema);
}

// ── Esquemas PLANTILLA (ajústalos al contrato real de cada proveedor) ─────────
const ESQUEMAS = {
  OPENAI: {
    salida:  { model: { tipo: 'string', requerido: true }, messages: { tipo: 'array', requerido: true } },
    entrada: { choices: { tipo: 'array', requerido: true } }
  },
  IMED: {
    salida:  { rut_paciente: { tipo: 'string', requerido: true }, codigo_bono: { tipo: 'string', requerido: true } },
    entrada: { estado: { tipo: 'string', requerido: true }, monto_bono: { tipo: 'number', requerido: true } }
  },
  FINANCIADOR: {
    salida: {
      folio: { tipo: 'string', requerido: true },
      rut_institucion: { tipo: 'string', requerido: true },
      monto_prestacion: { tipo: 'number', requerido: true }
    },
    entrada: {
      estado: { tipo: 'string', requerido: true },
      monto_cobertura: { tipo: 'number', requerido: true },
      copago: { tipo: 'number', requerido: true }
    }
  },
  PASARELA_PAGO: {
    salida:  { monto: { tipo: 'number', requerido: true }, token_tarjeta: { tipo: 'string', requerido: true } },
    entrada: { transaccion_id: { tipo: 'string', requerido: true }, aprobado: { tipo: 'boolean', requerido: true } }
  }
};

module.exports = { validarContraEsquema, validarPayloadSalida, validarPayloadEntrada, ESQUEMAS };