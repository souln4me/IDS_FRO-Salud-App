/**
 * CU25 — Reporte de hallazgos pre-clínicos.
 * CU26 — Sugerencia de derivación por especialidad.
 *
 * Los dos casos de uso leen lo mismo: las respuestas del triaje que el paciente
 * ya completó (CU23/CU24). Por eso el análisis se hace UNA vez, al terminar la
 * entrevista, y queda guardado: el profesional lee el reporte antes de la
 * sesión y el paciente ve su sugerencia de especialidad, sin recalcular nada.
 *
 * El análisis no diagnostica: ordena lo que el paciente declaró y marca lo que
 * un profesional querría mirar primero.
 */

const { leerParametroEntero } = require('../agenda/agendaService');

// Mismo patrón que usa el registro de la sesión clínica (CU40) para detectar
// relatos que piden revisión inmediata. Se mantiene igual a propósito: un
// texto que allá levanta alerta, aquí también.
const PATRON_RELATO_CRITICO =
  /\b(dolor\s+(intenso|severo|insoportable)|dificultad\s+respiratoria|p[eé]rdida\s+de\s+conciencia|desmayo|convulsi[oó]n|deterioro\s+(grave|severo)|signos?\s+vitales?\s+inestables?)\b/i;

// Antecedentes que cambian el manejo de una rehabilitación y que conviene que
// el profesional vea destacados, no perdidos dentro del texto de la anamnesis.
const ANTECEDENTES_SENSIBLES = [
  { patron: /\b(diabet|insulino)/i, texto: 'Diabetes declarada' },
  { patron: /\b(hipertens|presi[oó]n alta)/i, texto: 'Hipertensión declarada' },
  { patron: /\b(card[ií]a|coraz[oó]n|infarto|marcapaso)/i, texto: 'Antecedente cardíaco' },
  { patron: /\b(c[aá]ncer|oncol|tumor)/i, texto: 'Antecedente oncológico' },
  { patron: /\b(epoc|asma|respirator)/i, texto: 'Antecedente respiratorio' },
  { patron: /\b(anticoagul|tromb)/i, texto: 'Riesgo de sangrado o trombosis' },
  { patron: /\b(embaraz|gestaci)/i, texto: 'Embarazo declarado' },
  { patron: /\b(osteoporos|fractura)/i, texto: 'Fragilidad ósea declarada' },
];

// Motivo del triaje → especialidad que corresponde. Los nombres son los de la
// tabla Especialidad: si se agrega una nueva, basta sumarla aquí.
const DERIVACION = {
  RESPIRATORIO: 'Kinesiología Respiratoria',
  NUTRICION: 'Nutricionista',
  DOLOR: 'Kinesiología',
  LESION: 'Kinesiología',
};

const NEGACIONES = /^(no|ninguna|ninguno|nada|n\/a|sin)\b/i;

function tieneContenido(valor) {
  const texto = String(valor ?? '').trim();
  return texto.length > 0 && !NEGACIONES.test(texto);
}

/**
 * Lee las respuestas del triaje y devuelve el análisis completo: banderas
 * rojas, etiquetas clínicas, resumen legible y la especialidad sugerida.
 *
 * @param {object} respuestas  respuestas guardadas en Triaje.respuestas
 * @param {number} minimoRespuestas  bajo esto el reporte es "insuficiente"
 */
function analizarTriaje(respuestas, minimoRespuestas = 4) {
  const datos = respuestas && typeof respuestas === 'object' ? respuestas : {};
  const banderas = [];
  const etiquetas = [];
  const lineas = [];

  const contestadas = Object.values(datos).filter((v) => String(v ?? '').trim() !== '').length;

  const motivo = String(datos.motivo || '').toUpperCase();
  if (motivo) {
    etiquetas.push(`MOTIVO_${motivo}`);
  }

  // ── Intensidad del dolor ──────────────────────────────────────────────
  const intensidad = Number(datos.intensidad);
  if (Number.isFinite(intensidad)) {
    lineas.push(`Dolor declarado: ${intensidad}/10.`);
    etiquetas.push(`DOLOR_${intensidad >= 7 ? 'ALTO' : intensidad >= 4 ? 'MODERADO' : 'LEVE'}`);
    if (intensidad >= 8) {
      banderas.push({
        codigo: 'DOLOR_INTENSO',
        texto: `El paciente declara dolor ${intensidad}/10 antes de la primera sesión.`,
        severidad: 'CRITICA',
      });
    }
  }

  // ── Zona y tiempo de evolución ────────────────────────────────────────
  if (datos.zona_dolor) {
    etiquetas.push(`ZONA_${String(datos.zona_dolor).toUpperCase()}`);
  }
  if (datos.tiempo_evolucion) {
    etiquetas.push(`EVOLUCION_${String(datos.tiempo_evolucion).toUpperCase()}`);
    if (String(datos.tiempo_evolucion).toUpperCase() === 'MAS_6_MESES') {
      banderas.push({
        codigo: 'CUADRO_CRONICO',
        texto: 'Cuadro de más de 6 meses de evolución: conviene descartar causas de fondo.',
        severidad: 'ALTA',
      });
    }
  }

  // ── Síntoma respiratorio ──────────────────────────────────────────────
  if (datos.sintoma_respiratorio) {
    const sintoma = String(datos.sintoma_respiratorio).toUpperCase();
    etiquetas.push(`RESPIRATORIO_${sintoma}`);
    if (sintoma === 'FALTA_AIRE_ESFUERZO') {
      banderas.push({
        codigo: 'DISNEA_ESFUERZO',
        texto: 'Refiere falta de aire al esfuerzo: evaluar tolerancia antes de cargar la sesión.',
        severidad: 'CRITICA',
      });
    }
  }

  // ── Antecedentes patológicos declarados ───────────────────────────────
  const antecedentes = [datos.antecedentes_patologicos, datos.antecedentes_relevantes]
    .filter(tieneContenido)
    .join(', ');
  if (antecedentes) {
    lineas.push(`Antecedentes declarados: ${antecedentes}.`);
    for (const { patron, texto } of ANTECEDENTES_SENSIBLES) {
      if (patron.test(antecedentes)) {
        banderas.push({ codigo: 'ANTECEDENTE_SENSIBLE', texto, severidad: 'ALTA' });
        etiquetas.push('ANTECEDENTE_SENSIBLE');
      }
    }
  } else {
    lineas.push('Sin antecedentes patológicos declarados.');
  }

  if (tieneContenido(datos.alergias)) {
    lineas.push(`Alergias: ${String(datos.alergias).trim()}.`);
    banderas.push({
      codigo: 'ALERGIAS',
      texto: `Alergias declaradas: ${String(datos.alergias).trim()}.`,
      severidad: 'ALTA',
    });
  }

  if (tieneContenido(datos.antecedentes_quirurgicos)) {
    lineas.push(`Cirugías previas: ${String(datos.antecedentes_quirurgicos).trim()}.`);
  }

  // ── Relato libre del paciente ─────────────────────────────────────────
  const relato = String(datos.descripcion_libre || '').trim();
  if (relato) {
    lineas.push(`Relato: ${relato}`);
    if (PATRON_RELATO_CRITICO.test(relato)) {
      banderas.push({
        codigo: 'RELATO_CRITICO',
        texto: 'El relato del paciente menciona signos de alarma. Revisar antes de iniciar.',
        severidad: 'CRITICA',
      });
    }
  }

  if (tieneContenido(datos.objetivo_nutricional)) {
    lineas.push(`Objetivo nutricional: ${String(datos.objetivo_nutricional).trim()}.`);
  }

  // Excepción 1 del CU25: sin datos suficientes no se inventa un análisis.
  const suficiente = contestadas >= minimoRespuestas;

  const resumen = suficiente
    ? lineas.join('\n')
    : 'Información insuficiente: la entrevista previa quedó con muy pocas respuestas ' +
      'para sintetizar hallazgos. Realiza el triaje manualmente durante la sesión.';

  return {
    suficiente,
    respuestas_contestadas: contestadas,
    banderas,
    etiquetas: [...new Set(etiquetas)],
    resumen,
    motivo,
    especialidad_sugerida: DERIVACION[motivo] || null,
  };
}

/**
 * CU26 — Resuelve la especialidad sugerida contra el cuerpo profesional real y
 * contra la comuna del paciente.
 *
 * @returns {Promise<{especialidad_id, nombre, disponible_en_comuna, comuna, alternativas}>}
 */
async function resolverDerivacion(conexion, analisis, pacienteId) {
  const [[paciente]] = await conexion.query(
    `SELECT pa.comuna_id, c.nombre AS comuna
       FROM Paciente pa
       LEFT JOIN Comuna c ON c.comuna_id = pa.comuna_id
      WHERE pa.paciente_id = ? LIMIT 1`,
    [pacienteId]
  );

  let especialidad = null;
  if (analisis.especialidad_sugerida) {
    const [[fila]] = await conexion.query(
      `SELECT especialidad_id, nombre FROM Especialidad WHERE nombre = ? LIMIT 1`,
      [analisis.especialidad_sugerida]
    );
    especialidad = fila || null;
  }

  // Excepción 1 del CU26: ningún motivo calza con una especialidad registrada,
  // o la especialidad del mapa no existe en esta instalación.
  if (!especialidad) {
    return {
      especialidad_id: null,
      nombre: null,
      general: true,
      comuna: paciente?.comuna || null,
      disponible_en_comuna: false,
      alternativas: [],
    };
  }

  // ¿Hay profesionales de esa especialidad que lleguen a la comuna del
  // paciente, o que atiendan online (donde la comuna no importa)?
  const [[cobertura]] = await conexion.query(
    `SELECT
        SUM(CASE WHEN p.tipo_sede IN ('ONLINE', 'AMBOS') THEN 1 ELSE 0 END) AS online,
        SUM(CASE WHEN p.tipo_sede IN ('DOMICILIO', 'AMBOS')
                  AND (
                    NOT EXISTS (SELECT 1 FROM Profesional_Comuna pc
                                 WHERE pc.profesional_id = p.profesional_id)
                    OR EXISTS (SELECT 1 FROM Profesional_Comuna pc
                                WHERE pc.profesional_id = p.profesional_id
                                  AND pc.comuna_id = ?)
                  )
             THEN 1 ELSE 0 END) AS domicilio
       FROM Profesional p
       JOIN Usuario u ON u.usuario_id = p.usuario_id
      WHERE p.especialidad_id = ? AND u.cuenta_activo = TRUE`,
    [paciente?.comuna_id || 0, especialidad.especialidad_id]
  );

  const enDomicilio = Number(cobertura?.domicilio || 0);
  const enLinea = Number(cobertura?.online || 0);

  // Excepción 2: la especialidad no llega a su comuna. Se ofrecen las que sí.
  let alternativas = [];
  if (enDomicilio === 0 && enLinea === 0) {
    const [otras] = await conexion.query(
      `SELECT DISTINCT e.especialidad_id, e.nombre
         FROM Profesional p
         JOIN Usuario u ON u.usuario_id = p.usuario_id
         JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
        WHERE u.cuenta_activo = TRUE
          AND p.especialidad_id <> ?
        ORDER BY e.nombre`,
      [especialidad.especialidad_id]
    );
    alternativas = otras;
  }

  return {
    especialidad_id: especialidad.especialidad_id,
    nombre: especialidad.nombre,
    general: false,
    comuna: paciente?.comuna || null,
    disponible_en_comuna: enDomicilio > 0,
    disponible_online: enLinea > 0,
    alternativas,
  };
}

/**
 * Genera y guarda el reporte pre-clínico de un triaje recién completado.
 * Nunca lanza: si falla, el triaje igual queda completado (el reporte se puede
 * regenerar después, al abrirlo).
 */
async function generarReporte(conexion, { pacienteId, triajeId, respuestas }) {
  try {
    const minimo = await leerParametroEntero(conexion, 'MINIMO_RESPUESTAS_PRECLINICO', 4);
    const analisis = analizarTriaje(respuestas, minimo);
    const derivacion = await resolverDerivacion(conexion, analisis, pacienteId);

    await conexion.execute(
      `INSERT INTO Reporte_Preclinico
          (resumen, banderas, etiquetas, suficiente, especialidad_sugerida_id, triaje_id, paciente_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          resumen = VALUES(resumen),
          banderas = VALUES(banderas),
          etiquetas = VALUES(etiquetas),
          suficiente = VALUES(suficiente),
          especialidad_sugerida_id = VALUES(especialidad_sugerida_id),
          momento_creacion = CURRENT_TIMESTAMP`,
      [
        analisis.resumen,
        JSON.stringify(analisis.banderas),
        JSON.stringify(analisis.etiquetas),
        analisis.suficiente,
        derivacion.especialidad_id,
        triajeId,
        pacienteId,
      ]
    );

    return { analisis, derivacion };
  } catch (error) {
    console.error('[generarReporte CU25]', error.message);
    return null;
  }
}

module.exports = {
  analizarTriaje,
  resolverDerivacion,
  generarReporte,
  DERIVACION,
};
