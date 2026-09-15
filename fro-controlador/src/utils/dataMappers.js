// ─────────────────────────────────────────────────────────────────────────────
// CU68: Transformadores (Data Mappers).
// Funciones PURAS: traducen entre el estándar interno de FRO Salud y el formato
// de cada proveedor. Sin efectos secundarios.
// ─────────────────────────────────────────────────────────────────────────────

// ── OPENAI (triaje con IA) ──
function aSalidaOpenAI(interno) {
  return {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Eres un asistente de triaje preclínico.' },
      { role: 'user', content: interno.sintomas }
    ]
  };
}
function aInternoOpenAI(externo) {
  return { reportePreclinico: externo?.choices?.[0]?.message?.content ?? '' };
}

// ── IMED (validación de bonos) ──
function aSalidaImed(interno)   { return { rut_paciente: interno.rut, codigo_bono: interno.bono }; }
function aInternoImed(externo)  { return { estadoBono: externo.estado, monto: Number(externo.monto_bono) }; }

// ── FINANCIADOR (validación de bonos de cobertura, CU66) ──
function aSalidaFinanciador(interno) {
  return {
    folio: interno.folio,
    rut_institucion: interno.rut_institucion,
    monto_prestacion: interno.monto_prestacion
  };
}
function aInternoFinanciador(externo) {
  return {
    estado: externo.estado,
    montoCobertura: Number(externo.monto_cobertura),
    copago: Number(externo.copago)
  };
}

// ── PASARELA DE PAGO ──
function aSalidaPago(interno)   { return { monto: interno.monto, token_tarjeta: interno.token }; }
function aInternoPago(externo)  { return { transaccionId: externo.transaccion_id, aprobado: Boolean(externo.aprobado) }; }

// Registro para obtener el par de mappers por proveedor.
const MAPPERS = {
  OPENAI:        { salida: aSalidaOpenAI,       entrada: aInternoOpenAI },
  IMED:          { salida: aSalidaImed,         entrada: aInternoImed },
  FINANCIADOR:   { salida: aSalidaFinanciador,  entrada: aInternoFinanciador },
  PASARELA_PAGO: { salida: aSalidaPago,         entrada: aInternoPago }
};

module.exports = {
  MAPPERS,
  aSalidaOpenAI, aInternoOpenAI,
  aSalidaImed,   aInternoImed,
  aSalidaPago,   aInternoPago
};