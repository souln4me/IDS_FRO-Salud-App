/**
 * Triaje clínico automatizado (Incremento 2, bloque 4).
 * CU27: aceptación del disclaimer legal, un ciclo por entrevista.
 * CU23: entrevista con árbol de decisión, reanudable.
 * CU24: estructuración e integración automática a la Anamnesis.
 * CU77: plantilla de evaluación según la especialidad del profesional.
 */

const pool = require('../../config/database');
const {
  DISCLAIMER,
  ARBOL_TRIAJE,
  estructurarTriaje,
  plantillaParaEspecialidad,
} = require('../../services/clinico/triajeService');

/** Paciente del usuario autenticado (Excepción 1 del CU24 si no existe). */
async function pacienteDeUsuario(usuarioId) {
  const [filas] = await pool.query(
    `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
    [usuarioId]
  );
  return filas[0]?.paciente_id || null;
}

/**
 * CU27: el disclaimer vale para UN ciclo de entrevista. Está aceptado si hay
 * una aceptación de la versión vigente posterior al último triaje completado.
 */
async function disclaimerAceptadoParaCiclo(pacienteId) {
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS aceptaciones
       FROM Disclaimer d
      WHERE d.paciente_id = ?
        AND d.version_disclaimer = ?
        AND d.momento_aceptacion > COALESCE(
              (SELECT MAX(t.momento_completado) FROM Triaje t
                WHERE t.paciente_id = ? AND t.estado = 'COMPLETADO'),
              '1970-01-01'
            )`,
    [pacienteId, DISCLAIMER.version, pacienteId]
  );
  return filas[0].aceptaciones > 0;
}

function parsearRespuestas(valor) {
  if (valor === null || valor === undefined) return {};
  if (typeof valor === 'object') return valor;
  try { return JSON.parse(valor); } catch { return {}; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /clinica/triaje/estado
// ─────────────────────────────────────────────────────────────────────────────

exports.estadoTriaje = async (req, res) => {
  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    const [triajes] = await pool.query(
      `SELECT triaje_id, estado, respuestas, momento_completado
         FROM Triaje
        WHERE paciente_id = ?
        ORDER BY triaje_id DESC
        LIMIT 1`,
      [pacienteId]
    );

    const ultimo = triajes[0] || null;

    return res.status(200).json({
      disclaimer_aceptado: await disclaimerAceptadoParaCiclo(pacienteId),
      version_disclaimer: DISCLAIMER.version,
      triaje: ultimo
        ? {
            triaje_id: ultimo.triaje_id,
            estado: ultimo.estado,
            respuestas: parsearRespuestas(ultimo.respuestas),
            momento_completado: ultimo.momento_completado,
          }
        : null,
    });
  } catch (error) {
    console.error('[estadoTriaje]', error);
    return res.status(500).json({ error: 'No se pudo consultar el estado del triaje.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU27 — Disclaimer
// ─────────────────────────────────────────────────────────────────────────────

exports.obtenerDisclaimer = (_req, res) => {
  // Excepción 1: si el texto no se puede servir, la app bloquea el avance.
  return res.status(200).json(DISCLAIMER);
};

exports.aceptarDisclaimer = async (req, res) => {
  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    // Excepción 3: si el registro con marca temporal falla, el triaje NO se
    // habilita (por eso este insert no es tolerante a fallo).
    await pool.query(
      `INSERT INTO Disclaimer (version_disclaimer, paciente_id) VALUES (?, ?)`,
      [DISCLAIMER.version, pacienteId]
    );

    try {
      await pool.query(
        `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
         VALUES ('ACEPTACION_DISCLAIMER', 'Disclaimer', ?, ?)`,
        [JSON.stringify({ version: DISCLAIMER.version }), req.user.usuario_id]
      );
    } catch (errorBitacora) {
      console.error('[aceptarDisclaimer] Sin registro en bitácora:', errorBitacora.message);
    }

    return res.status(201).json({
      mensaje: 'Consentimiento registrado. Ya puedes iniciar tu entrevista.',
      version: DISCLAIMER.version,
    });
  } catch (error) {
    console.error('[aceptarDisclaimer]', error);
    return res.status(500).json({
      error: 'TIMESTAMP_FALLIDO',
      mensaje: 'No se pudo registrar tu consentimiento. El triaje queda deshabilitado; intenta nuevamente.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU23 — Árbol y respuestas
// ─────────────────────────────────────────────────────────────────────────────

exports.obtenerArbol = async (req, res) => {
  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    // Precondición del CU23: disclaimer aceptado para este ciclo.
    if (!(await disclaimerAceptadoParaCiclo(pacienteId))) {
      return res.status(403).json({
        error: 'DISCLAIMER_PENDIENTE',
        mensaje: 'Debes aceptar el descargo de responsabilidad antes de iniciar la entrevista.',
      });
    }

    // Excepción 2 del CU23: si las reglas no cargan, la app lo informa.
    return res.status(200).json(ARBOL_TRIAJE);
  } catch (error) {
    console.error('[obtenerArbol]', error);
    return res.status(500).json({
      error: 'FALLA_REGLAS',
      mensaje: 'No se pudieron cargar las reglas de la entrevista. Intenta más tarde.',
    });
  }
};

/** PUT /clinica/triaje/respuestas — guarda avance parcial (Exc.3 del CU23). */
exports.guardarRespuestasParciales = async (req, res) => {
  const respuestas = req.body?.respuestas;

  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) {
    return res.status(400).json({ error: 'Formato de respuestas inválido.' });
  }

  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    const [abiertos] = await pool.query(
      `SELECT triaje_id FROM Triaje
        WHERE paciente_id = ? AND estado = 'EN_PROGRESO'
        ORDER BY triaje_id DESC LIMIT 1`,
      [pacienteId]
    );

    if (abiertos.length > 0) {
      await pool.query(
        `UPDATE Triaje SET respuestas = ? WHERE triaje_id = ?`,
        [JSON.stringify(respuestas), abiertos[0].triaje_id]
      );
      return res.status(200).json({ triaje_id: abiertos[0].triaje_id, guardado: true });
    }

    const [resultado] = await pool.query(
      `INSERT INTO Triaje (paciente_id, respuestas) VALUES (?, ?)`,
      [pacienteId, JSON.stringify(respuestas)]
    );
    return res.status(201).json({ triaje_id: resultado.insertId, guardado: true });
  } catch (error) {
    console.error('[guardarRespuestasParciales]', error);
    // Excepción 4 del CU23: la información no se pudo persistir.
    return res.status(500).json({
      error: 'PERSISTENCIA_FALLIDA',
      mensaje: 'Tu avance no se pudo guardar. Revisa tu conexión.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU24 — Completar y estructurar hacia la Anamnesis
//  POST /clinica/triaje/completar
// ─────────────────────────────────────────────────────────────────────────────

exports.completarTriaje = async (req, res) => {
  const respuestas = req.body?.respuestas;

  const connection = await pool.getConnection();

  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      // Excepción 1 del CU24: registro no localizado.
      connection.release();
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    // Excepción 2 del CU24: formato incompatible aborta el proceso.
    let estructura;
    try {
      estructura = estructurarTriaje(respuestas);
    } catch (errorFormato) {
      connection.release();
      return res.status(400).json({
        error: 'FALLA_INTEGRIDAD',
        mensaje: errorFormato.message,
      });
    }

    await connection.beginTransaction();

    // Cerrar (o crear) el triaje del ciclo.
    const [abiertos] = await connection.execute(
      `SELECT triaje_id FROM Triaje
        WHERE paciente_id = ? AND estado = 'EN_PROGRESO'
        ORDER BY triaje_id DESC LIMIT 1 FOR UPDATE`,
      [pacienteId]
    );

    let triajeId;
    if (abiertos.length > 0) {
      triajeId = abiertos[0].triaje_id;
      await connection.execute(
        `UPDATE Triaje
            SET respuestas = ?, estado = 'COMPLETADO',
                momento_completado = NOW(), integrado = TRUE
          WHERE triaje_id = ?`,
        [JSON.stringify(respuestas), triajeId]
      );
    } else {
      const [resultado] = await connection.execute(
        `INSERT INTO Triaje (paciente_id, respuestas, estado, momento_completado, integrado)
         VALUES (?, ?, 'COMPLETADO', NOW(), TRUE)`,
        [pacienteId, JSON.stringify(respuestas)]
      );
      triajeId = resultado.insertId;
    }

    // Integración a la ficha: si no existe se crea; si existe, el bloque del
    // triaje se AGREGA al final de la anamnesis (nunca pisa lo escrito por el
    // profesional).
    const [fichas] = await connection.execute(
      `SELECT ficha_clinica_id, anamnesis FROM Ficha_Clinica
        WHERE paciente_id = ? LIMIT 1 FOR UPDATE`,
      [pacienteId]
    );

    let fichaId;
    if (fichas.length === 0) {
      const [resultado] = await connection.execute(
        `INSERT INTO Ficha_Clinica (anamnesis, plantilla_especialidad, paciente_id)
         VALUES (?, 'General', ?)`,
        [estructura.texto.slice(0, 2000), pacienteId]
      );
      fichaId = resultado.insertId;
    } else {
      fichaId = fichas[0].ficha_clinica_id;
      const anamnesisActual = fichas[0].anamnesis || '';
      const combinada = `${anamnesisActual.trim()}\n\n${estructura.texto}`.trim().slice(0, 2000);
      await connection.execute(
        `UPDATE Ficha_Clinica SET anamnesis = ? WHERE ficha_clinica_id = ?`,
        [combinada, fichaId]
      );
    }

    // Alergias y antecedentes categorizados (sin duplicar los existentes).
    for (const alergia of estructura.alergias) {
      await connection.execute(
        `INSERT IGNORE INTO Ficha_Alergia (ficha_clinica_id, alergia) VALUES (?, ?)`,
        [fichaId, alergia]
      );
    }
    for (const antecedente of estructura.antecedentes) {
      await connection.execute(
        `INSERT IGNORE INTO Ficha_Antecedente_Patologico (ficha_clinica_id, antecedente) VALUES (?, ?)`,
        [fichaId, antecedente]
      );
    }
    for (const cirugia of estructura.quirurgicos || []) {
      await connection.execute(
        `INSERT IGNORE INTO Ficha_Antecedente_Quirurgico (ficha_clinica_id, antecedente) VALUES (?, ?)`,
        [fichaId, cirugia]
      );
    }

    try {
      await connection.execute(
        `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
         VALUES ('TRIAJE_INTEGRADO', 'Ficha_Clinica', ?, ?)`,
        [
          JSON.stringify({ triaje_id: triajeId, ficha_clinica_id: fichaId, sin_clasificar: estructura.sinClasificar.length }),
          req.user.usuario_id,
        ]
      );
    } catch (errorBitacora) {
      console.error('[completarTriaje] Sin registro en bitácora:', errorBitacora.message);
    }

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Entrevista completada. Tus respuestas quedaron integradas a tu ficha clínica.',
      triaje_id: triajeId,
      vista_previa: estructura.texto,
      alergias_registradas: estructura.alergias,
      cirugias_registradas: estructura.quirurgicos || [],
      sin_clasificar: estructura.sinClasificar,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[completarTriaje]', error);
    // Excepción 6 del CU24: la persistencia falló; el avance parcial que ya
    // estaba guardado permite reintentar sin perder las respuestas.
    return res.status(500).json({
      error: 'PERSISTENCIA_FALLIDA',
      mensaje: 'No se pudo integrar la información. Tus respuestas siguen guardadas: reintenta en unos minutos.',
    });
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU77 — Plantilla de evaluación según especialidad
//  GET /clinica/plantilla-evaluacion
// ─────────────────────────────────────────────────────────────────────────────

exports.plantillaEvaluacion = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT e.nombre AS especialidad
         FROM Profesional p
         LEFT JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
        WHERE p.usuario_id = ?
        LIMIT 1`,
      [req.user.usuario_id]
    );

    if (filas.length === 0) {
      return res.status(404).json({ error: 'No se encontró tu perfil profesional.' });
    }

    // Excepción 2 del CU77: sin especialidad acreditada no hay plantilla.
    if (!filas[0].especialidad) {
      return res.status(409).json({
        error: 'SIN_ESPECIALIDAD',
        mensaje: 'Tu cuenta no tiene una especialidad acreditada. Completa tu configuración profesional.',
      });
    }

    return res.status(200).json(plantillaParaEspecialidad(filas[0].especialidad));
  } catch (error) {
    console.error('[plantillaEvaluacion]', error);
    return res.status(500).json({ error: 'No se pudo cargar la plantilla de evaluación.' });
  }
};
