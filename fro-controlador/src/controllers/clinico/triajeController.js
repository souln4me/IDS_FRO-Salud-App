/**
 * Componente: C_API_REST
 * Casos de uso: CU27, CU23, CU24, CU25, CU26, CU77.
 *
 * Triaje clínico automatizado (Incremento 2, bloque 4).
 * CU27: aceptación del disclaimer legal, un ciclo por entrevista.
 * CU23: entrevista con árbol de decisión, reanudable.
 * CU24: estructuración e integración automática a la Anamnesis.
 * CU77: plantilla de evaluación según la especialidad del profesional.
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Motor_Clinico = require('../../componentes/C_Motor_Clinico');

/** Apoyo común: paciente del usuario autenticado (Excepción 1 del CU24 si no existe). */
async function pacienteDeUsuario(usuarioId) {
  const [filas] = await C_Capa_de_Acceso_a_Datos.query(
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
  const [filas] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT COUNT(*) AS aceptaciones
       FROM Disclaimer d
      WHERE d.paciente_id = ?
        AND d.version_disclaimer = ?
        AND d.momento_aceptacion > COALESCE(
              (SELECT MAX(t.momento_completado) FROM Triaje t
                WHERE t.paciente_id = ? AND t.estado = 'COMPLETADO'),
              '1970-01-01'
            )`,
    [pacienteId, C_Motor_Clinico.DISCLAIMER.version, pacienteId]
  );
  return filas[0].aceptaciones > 0;
}

// Apoyo común: respuestas guardadas como JSON a objeto
function parsearRespuestas(valor) {
  if (valor === null || valor === undefined) return {};
  if (typeof valor === 'object') return valor;
  try { return JSON.parse(valor); } catch { return {}; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /clinica/triaje/estado
// ─────────────────────────────────────────────────────────────────────────────

// CU23, CU27 — estado de la entrevista y del disclaimer del ciclo
exports.estadoTriaje = async (req, res) => {
  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    const [triajes] = await C_Capa_de_Acceso_a_Datos.query(
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
      version_disclaimer: C_Motor_Clinico.DISCLAIMER.version,
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

// CU27 — Registrando aceptación de disclaimer legal
exports.obtenerDisclaimer = (_req, res) => {
  // Excepción 1: si el texto no se puede servir, la app bloquea el avance.
  return res.status(200).json(C_Motor_Clinico.DISCLAIMER);
};

// CU27 — Registrando aceptación de disclaimer legal
exports.aceptarDisclaimer = async (req, res) => {
  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    // Excepción 3: si el registro con marca temporal falla, el triaje NO se
    // habilita (por eso este insert no es tolerante a fallo).
    await C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Disclaimer (version_disclaimer, paciente_id) VALUES (?, ?)`,
      [C_Motor_Clinico.DISCLAIMER.version, pacienteId]
    );

    try {
      await C_Capa_de_Acceso_a_Datos.query(
        `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
         VALUES ('ACEPTACION_DISCLAIMER', 'Disclaimer', ?, ?)`,
        [JSON.stringify({ version: C_Motor_Clinico.DISCLAIMER.version }), req.user.usuario_id]
      );
    } catch (errorBitacora) {
      console.error('[aceptarDisclaimer] Sin registro en bitácora:', errorBitacora.message);
    }

    return res.status(201).json({
      mensaje: 'Consentimiento registrado. Ya puedes iniciar tu entrevista.',
      version: C_Motor_Clinico.DISCLAIMER.version,
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

// CU23 — Ejecutando entrevista clínica automatizada de triaje
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
    return res.status(200).json(C_Motor_Clinico.ARBOL_TRIAJE);
  } catch (error) {
    console.error('[obtenerArbol]', error);
    return res.status(500).json({
      error: 'FALLA_REGLAS',
      mensaje: 'No se pudieron cargar las reglas de la entrevista. Intenta más tarde.',
    });
  }
};

// CU27 — precondición del CU23 y CU24: sin el descargo aceptado para este
// ciclo no se guardan ni se completan respuestas (antes solo se exigía para
// ver las preguntas).
function rechazarSinDisclaimer(res) {
  return res.status(403).json({
    error: 'DISCLAIMER_PENDIENTE',
    mensaje: 'Debes aceptar el descargo de responsabilidad antes de responder la entrevista.',
  });
}

/** CU23 — PUT /clinica/triaje/respuestas — guarda avance parcial (Exc.3 del CU23). */
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
    if (!(await disclaimerAceptadoParaCiclo(pacienteId))) return rechazarSinDisclaimer(res);

    const [abiertos] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT triaje_id FROM Triaje
        WHERE paciente_id = ? AND estado = 'EN_PROGRESO'
        ORDER BY triaje_id DESC LIMIT 1`,
      [pacienteId]
    );

    if (abiertos.length > 0) {
      await C_Capa_de_Acceso_a_Datos.query(
        `UPDATE Triaje SET respuestas = ? WHERE triaje_id = ?`,
        [JSON.stringify(respuestas), abiertos[0].triaje_id]
      );
      return res.status(200).json({ triaje_id: abiertos[0].triaje_id, guardado: true });
    }

    const [resultado] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU24 — Estructurando datos de sintomatología a Ficha Clínica
exports.completarTriaje = async (req, res) => {
  const respuestas = req.body?.respuestas;

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

  try {
    // Las salidas tempranas no liberan la conexión: lo hace el finally (antes
    // se liberaba dos veces).
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      // Excepción 1 del CU24: registro no localizado.
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }
    if (!(await disclaimerAceptadoParaCiclo(pacienteId))) {
      return rechazarSinDisclaimer(res);
    }

    // Excepción 2 del CU24: formato incompatible aborta el proceso.
    let estructura;
    try {
      estructura = C_Motor_Clinico.estructurarTriaje(respuestas);
    } catch (errorFormato) {
      return res.status(400).json({
        error: 'FALLA_INTEGRIDAD',
        mensaje: errorFormato.message,
      });
    }

    await connection.beginTransaction();

    // CU23: cierre de la entrevista.
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

    // CU25/CU26: con la entrevista cerrada se sintetiza el reporte pre-clínico
    // (banderas rojas para el profesional) y la especialidad sugerida para el
    // paciente. Si falla, el triaje igual queda completado: el reporte se
    // genera solo la primera vez que alguien lo abre.
    const sintesis = await C_Motor_Clinico.generarReporte(connection, {
      pacienteId,
      triajeId,
      respuestas,
    });

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Entrevista completada. Tus respuestas quedaron integradas a tu ficha clínica.',
      triaje_id: triajeId,
      // CU26: sugerencia de derivación para mostrarla al cerrar la entrevista.
      derivacion: sintesis?.derivacion || null,
      banderas: sintesis?.analisis?.banderas || [],
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

// CU77 — Renderizando plantillas dinámicas de evaluación
exports.plantillaEvaluacion = async (req, res) => {
  try {
    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
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

    return res.status(200).json(C_Motor_Clinico.plantillaParaEspecialidad(filas[0].especialidad));
  } catch (error) {
    console.error('[plantillaEvaluacion]', error);
    return res.status(500).json({ error: 'No se pudo cargar la plantilla de evaluación.' });
  }
};
