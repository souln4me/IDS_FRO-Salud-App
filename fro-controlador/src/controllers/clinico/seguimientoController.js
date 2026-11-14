/**
 * Componente: C_API_REST
 * Casos de uso: CU25, CU26, CU50, CU44, CU45, CU62.
 *
 * Bloque de triaje inteligente y seguimiento del Incremento 3.
 *
 *   CU25 — el profesional lee el reporte pre-clínico antes de la sesión.
 *   CU26 — el paciente ve a qué especialidad lo deriva su triaje.
 *   CU50 — el paciente reporta su evolución y el sistema levanta banderas
 *          rojas cuando detecta deterioro.
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Control_Acceso_Clinico = require('../../componentes/C_Control_Acceso_Clinico');
const C_Escalador_Eventos_Criticos = require('../../componentes/C_Escalador_Eventos_Criticos');
const C_Motor_Clinico = require('../../componentes/C_Motor_Clinico');

// ─────────────────────────────────────────────────────────────────────────────
//  Ayudas comunes
// ─────────────────────────────────────────────────────────────────────────────

// Apoyo común: paciente asociado a la cuenta en sesión
async function pacienteDeUsuario(usuarioId) {
  const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
    [usuarioId]
  );
  return fila?.paciente_id || null;
}

/** Criterio único de acceso clínico (incluye derivaciones internas, CU65). */
async function profesionalTratante(usuarioId, pacienteId) {
  return C_Control_Acceso_Clinico.profesionalTratante(C_Capa_de_Acceso_a_Datos, usuarioId, pacienteId);
}

// Apoyo común: registro en la bitácora de auditoría
async function auditar(req, accion, entidad, datos) {
  try {
    await C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [accion, entidad, req.ip || null, JSON.stringify(datos), req.user?.usuario_id ?? null]
    );
  } catch (error) {
    console.error('[seguimiento.auditar]', error.message);
  }
}

function normalizarJSON(valor, respaldo) {
  if (valor === null || valor === undefined) return respaldo;
  if (typeof valor === 'string') {
    try {
      return JSON.parse(valor);
    } catch {
      return respaldo;
    }
  }
  return valor;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU25 — Reporte de hallazgos pre-clínicos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CU25 — Sintetizando reporte de hallazgos pre-clínicos
 * GET /api/clinica/pacientes/:pacienteId/reporte-preclinico   (Profesional)
 *
 * Devuelve el reporte guardado. Si el paciente completó su triaje antes de que
 * existiera esta función, el reporte se genera al vuelo y queda persistido,
 * para que el profesional no se quede sin nada que leer.
 */
exports.reportePreclinico = async (req, res) => {
  const inicio = Date.now();
  const { pacienteId } = req.params;

  try {
    if (
      req.user?.nombre_rol !== 'Administrador' &&
      !(await profesionalTratante(req.user.usuario_id, pacienteId))
    ) {
      await auditar(req, 'BLOQUEO_ACCESO_RBAC', 'Reporte_Preclinico', { paciente_id: Number(pacienteId) });
      return res.status(403).json({
        error: 'PACIENTE_NO_ASIGNADO',
        mensaje: 'No estás vinculado a este paciente.',
      });
    }

    const [[triaje]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT triaje_id, respuestas, momento_completado
         FROM Triaje
        WHERE paciente_id = ? AND estado = 'COMPLETADO'
        ORDER BY momento_completado DESC, triaje_id DESC LIMIT 1`,
      [pacienteId]
    );

    if (!triaje) {
      return res.status(200).json({
        hay_triaje: false,
        mensaje:
          'Este paciente todavía no ha completado la entrevista previa. ' +
          'Realiza el triaje manualmente durante la sesión.',
      });
    }

    let [[reporte]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT r.reporte_preclinico_id, r.resumen, r.banderas, r.etiquetas, r.suficiente,
              r.momento_creacion, e.nombre AS especialidad_sugerida
         FROM Reporte_Preclinico r
         LEFT JOIN Especialidad e ON e.especialidad_id = r.especialidad_sugerida_id
        WHERE r.triaje_id = ? LIMIT 1`,
      [triaje.triaje_id]
    );

    // Triaje anterior a esta funcionalidad: se sintetiza ahora y se guarda.
    if (!reporte) {
      await C_Motor_Clinico.generarReporte(C_Capa_de_Acceso_a_Datos, {
        pacienteId: Number(pacienteId),
        triajeId: triaje.triaje_id,
        respuestas: normalizarJSON(triaje.respuestas, {}),
      });
      [[reporte]] = await C_Capa_de_Acceso_a_Datos.query(
        `SELECT r.reporte_preclinico_id, r.resumen, r.banderas, r.etiquetas, r.suficiente,
                r.momento_creacion, e.nombre AS especialidad_sugerida
           FROM Reporte_Preclinico r
           LEFT JOIN Especialidad e ON e.especialidad_id = r.especialidad_sugerida_id
          WHERE r.triaje_id = ? LIMIT 1`,
        [triaje.triaje_id]
      );
    }

    if (!reporte) {
      return res.status(503).json({
        error: 'REPORTE_NO_DISPONIBLE',
        mensaje: 'No pudimos armar el reporte. Vuelve a cargar la vista.',
      });
    }

    const duracion = Date.now() - inicio;
    // Excepción 2 del CU25: la carga lenta queda anotada en la bitácora.
    const tope = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'LATENCIA_MAXIMA_REPORTE_MS', 2000);
    if (duracion > tope) {
      await auditar(req, 'LATENCIA_REPORTE_PRECLINICO', 'Reporte_Preclinico', {
        paciente_id: Number(pacienteId),
        milisegundos: duracion,
        tope,
      });
    }

    const banderas = normalizarJSON(reporte.banderas, []);

    return res.status(200).json({
      hay_triaje: true,
      reporte: {
        ...reporte,
        banderas,
        etiquetas: normalizarJSON(reporte.etiquetas, []),
        suficiente: Boolean(reporte.suficiente),
        momento_triaje: triaje.momento_completado,
      },
      criticas: banderas.filter((b) => b.severidad === 'CRITICA').length,
      latencia_ms: duracion,
    });
  } catch (error) {
    console.error('[reportePreclinico CU25]', error);
    return res.status(500).json({
      error: 'ERROR_REPORTE',
      mensaje: 'No se pudo cargar el reporte pre-clínico.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU26 — Sugerencia de derivación por especialidad
// ─────────────────────────────────────────────────────────────────────────────

/** CU26 — Sugiriendo derivación por especialidad clínica. GET /api/clinica/mi-derivacion   (Paciente) */
exports.miDerivacion = async (req, res) => {
  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    const [[triaje]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT triaje_id, respuestas FROM Triaje
        WHERE paciente_id = ? AND estado = 'COMPLETADO'
        ORDER BY momento_completado DESC, triaje_id DESC LIMIT 1`,
      [pacienteId]
    );

    if (!triaje) {
      return res.status(200).json({
        hay_triaje: false,
        mensaje: 'Completa la entrevista previa y te sugerimos a qué profesional acudir.',
      });
    }

    const minimo = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'MINIMO_RESPUESTAS_PRECLINICO', 4);
    const analisis = C_Motor_Clinico.analizarTriaje(normalizarJSON(triaje.respuestas, {}), minimo);
    const derivacion = await C_Motor_Clinico.resolverDerivacion(C_Capa_de_Acceso_a_Datos, analisis, pacienteId);

    return res.status(200).json({
      hay_triaje: true,
      derivacion,
      motivo: analisis.motivo || null,
      etiquetas: analisis.etiquetas,
    });
  } catch (error) {
    console.error('[miDerivacion CU26]', error);
    return res.status(500).json({
      error: 'ERROR_DERIVACION',
      mensaje: 'No se pudo calcular la sugerencia de especialidad.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU50 — Reporte de evolución y alertas por deterioro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CU50 — Generando y notificando alerta por deterioro clínico
 * POST /api/clinica/sintomas   (Paciente)
 * { nivel_dolor, limitacion_funcional, comentario, clave_envio }
 */
exports.registrarSintomas = async (req, res) => {
  const dolor = Number(req.body?.nivel_dolor);
  const limitacion = Number(req.body?.limitacion_funcional);
  const comentario = String(req.body?.comentario || '').trim().slice(0, 500);
  const claveEnvio = String(req.body?.clave_envio || '').trim().slice(0, 64);

  // Excepción 1 del CU50: campos métricos nulos u omitidos. Se dice cuáles.
  const faltantes = [];
  if (!Number.isInteger(dolor) || dolor < 0 || dolor > 10) faltantes.push('nivel_dolor');
  if (!Number.isInteger(limitacion) || limitacion < 0 || limitacion > 10) {
    faltantes.push('limitacion_funcional');
  }
  if (faltantes.length > 0) {
    return res.status(400).json({
      error: 'CAMPOS_INCOMPLETOS',
      mensaje: 'Indica ambos valores en la escala de 0 a 10 antes de enviar.',
      campos: faltantes,
    });
  }
  if (!claveEnvio) {
    return res.status(400).json({
      error: 'CLAVE_ENVIO_REQUERIDA',
      mensaje: 'Falta el identificador del envío.',
    });
  }

  const conexion = await C_Capa_de_Acceso_a_Datos.getConnection();

  try {
    const [[paciente]] = await conexion.execute(
      `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (!paciente) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }
    const pacienteId = paciente.paciente_id;

    // Excepción 3 y 4: el teléfono reintenta el mismo envío cuando se cortó la
    // app o la red. La clave del envío evita que se duplique el reporte.
    const [[repetido]] = await conexion.execute(
      `SELECT reporte_sintoma_id, momento_registro FROM Reporte_Sintoma
        WHERE clave_envio = ? LIMIT 1`,
      [claveEnvio]
    );
    if (repetido) {
      // Excepción 3: el envío se cortó antes del acuse; el corte queda en la bitácora.
      await auditar(req, 'REENVIO_REPORTE_SINTOMA', 'Reporte_Sintoma', {
        reporte_sintoma_id: repetido.reporte_sintoma_id,
        clave_envio: claveEnvio,
        registrado_en: repetido.momento_registro,
      });
      return res.status(200).json({
        mensaje: 'Este reporte ya había quedado registrado.',
        reporte_sintoma_id: repetido.reporte_sintoma_id,
        repetido: true,
      });
    }

    await conexion.beginTransaction();

    const [[anterior]] = await conexion.execute(
      `SELECT nivel_dolor, limitacion_funcional, momento_registro
         FROM Reporte_Sintoma
        WHERE paciente_id = ?
        ORDER BY momento_registro DESC, reporte_sintoma_id DESC LIMIT 1`,
      [pacienteId]
    );

    // El reporte se engancha al episodio abierto del paciente, si tiene uno.
    const [[episodio]] = await conexion.execute(
      `SELECT episodio_clinico_id FROM Episodio_Clinico
        WHERE paciente_id = ? AND (estado IS NULL OR UPPER(estado) <> 'CERRADO')
        ORDER BY episodio_clinico_id DESC LIMIT 1`,
      [pacienteId]
    );

    const [creado] = await conexion.execute(
      `INSERT INTO Reporte_Sintoma
          (nivel_dolor, limitacion_funcional, comentario, clave_envio, paciente_id, episodio_clinico_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dolor, limitacion, comentario || null, claveEnvio, pacienteId, episodio?.episodio_clinico_id || null]
    );

    const umbrales = await C_Motor_Clinico.umbralesVigentes(conexion);
    const evaluacion = C_Motor_Clinico.evaluarDeterioro(
      { nivel_dolor: dolor, limitacion_funcional: limitacion },
      anterior || null,
      umbrales
    );

    let alertaId = null;
    if (evaluacion.critico) {
      alertaId = await C_Motor_Clinico.crearAlerta(conexion, {
        pacienteId,
        tipo: 'DETERIORO_SINTOMAS',
        severidad: evaluacion.severidad,
        motivo: evaluacion.motivos.join('; '),
        datos: {
          nivel_dolor: dolor,
          limitacion_funcional: limitacion,
          anterior: anterior
            ? { nivel_dolor: anterior.nivel_dolor, limitacion_funcional: anterior.limitacion_funcional }
            : null,
          umbrales,
        },
        reporteSintomaId: creado.insertId,
      });
    }

    await conexion.commit();

    // CU62: el comentario libre puede traer términos críticos → escalamiento.
    if (comentario) {
      C_Escalador_Eventos_Criticos.escalar(C_Capa_de_Acceso_a_Datos, {
        texto: comentario, origen: 'SINTOMAS', entidad: 'Reporte_Sintoma', entidadId: creado.insertId,
        usuarioOrigenId: req.user.usuario_id, pacienteId,
      }).catch(() => {});
    }

    return res.status(201).json({
      mensaje: evaluacion.critico
        ? 'Registramos tu reporte y avisamos a tu profesional tratante.'
        : 'Registramos tu reporte. Gracias por mantener tu seguimiento al día.',
      reporte_sintoma_id: creado.insertId,
      clasificacion: evaluacion.critico ? 'RIESGO_CRITICO' : 'NORMAL',
      motivos: evaluacion.motivos,
      alerta_id: alertaId,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[registrarSintomas CU50]', error);
    return res.status(500).json({
      error: 'NO_SE_PUDO_REGISTRAR',
      mensaje: 'No pudimos guardar tu reporte. Se reintentará cuando vuelvas a tener señal.',
    });
  } finally {
    conexion.release();
  }
};

/** CU50 — historial de reportes de síntomas del paciente. GET /api/clinica/mis-sintomas   (Paciente) */
exports.misSintomas = async (req, res) => {
  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) return res.status(200).json({ reportes: [] });

    const [reportes] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT reporte_sintoma_id, nivel_dolor, limitacion_funcional, comentario, momento_registro
         FROM Reporte_Sintoma
        WHERE paciente_id = ?
        ORDER BY momento_registro DESC, reporte_sintoma_id DESC
        LIMIT 60`,
      [pacienteId]
    );

    return res.status(200).json({ reportes });
  } catch (error) {
    console.error('[misSintomas CU50]', error);
    return res.status(500).json({ error: 'No se pudo cargar tu seguimiento.' });
  }
};

/** CU50 — reportes y alertas de un paciente, vista del profesional. GET /api/clinica/pacientes/:pacienteId/sintomas   (Profesional) */
exports.sintomasDePaciente = async (req, res) => {
  const { pacienteId } = req.params;
  try {
    if (
      req.user?.nombre_rol !== 'Administrador' &&
      !(await profesionalTratante(req.user.usuario_id, pacienteId))
    ) {
      return res.status(403).json({ error: 'PACIENTE_NO_ASIGNADO' });
    }

    const [reportes] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT reporte_sintoma_id, nivel_dolor, limitacion_funcional, comentario, momento_registro
         FROM Reporte_Sintoma
        WHERE paciente_id = ?
        ORDER BY momento_registro DESC, reporte_sintoma_id DESC
        LIMIT 60`,
      [pacienteId]
    );

    const [alertas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT alerta_clinica_id, tipo, severidad, motivo, estado, momento_creacion
         FROM Alerta_Clinica
        WHERE paciente_id = ?
        ORDER BY momento_creacion DESC LIMIT 20`,
      [pacienteId]
    );

    return res.status(200).json({ reportes, alertas });
  } catch (error) {
    console.error('[sintomasDePaciente CU50]', error);
    return res.status(500).json({ error: 'No se pudo cargar el seguimiento del paciente.' });
  }
};

/** CU50 — GET /api/clinica/alertas   (Profesional) — el panel de banderas rojas. */
exports.alertasAbiertas = async (req, res) => {
  try {
    const [alertas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT a.alerta_clinica_id, a.tipo, a.severidad, a.motivo, a.datos,
              a.estado, a.momento_creacion, a.paciente_id,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno)), ''),
                CONCAT('Paciente #', a.paciente_id)
              ) AS paciente
         FROM Alerta_Clinica a
         JOIN Paciente pa ON pa.paciente_id = a.paciente_id
         LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
        WHERE a.estado = 'ABIERTA'
          AND (
            ? = 'Administrador'
            OR a.paciente_id IN (
                 SELECT ec.paciente_id FROM Episodio_Clinico ec
                  JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
                  WHERE pr.usuario_id = ?
                 UNION
                 SELECT c.paciente_id FROM Cita c
                  JOIN Profesional pr ON pr.profesional_id = c.profesional_id
                  WHERE pr.usuario_id = ? AND c.estado NOT LIKE 'CANCELADA%'
               )
          )
        ORDER BY FIELD(a.severidad, 'CRITICA', 'ALTA'), a.momento_creacion DESC
        LIMIT 30`,
      [req.user?.nombre_rol || '', req.user.usuario_id, req.user.usuario_id]
    );

    return res.status(200).json({
      alertas: alertas.map((a) => ({ ...a, datos: normalizarJSON(a.datos, {}) })),
    });
  } catch (error) {
    console.error('[alertasAbiertas CU50]', error);
    return res.status(200).json({ alertas: [] });
  }
};

/** CU50 — marcar la alerta como revisada. POST /api/clinica/alertas/:id/revisar   (Profesional) */
exports.revisarAlerta = async (req, res) => {
  try {
    const [[alerta]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT alerta_clinica_id, paciente_id, estado FROM Alerta_Clinica
        WHERE alerta_clinica_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!alerta) return res.status(404).json({ error: 'ALERTA_NO_ENCONTRADA' });

    if (
      req.user?.nombre_rol !== 'Administrador' &&
      !(await profesionalTratante(req.user.usuario_id, alerta.paciente_id))
    ) {
      return res.status(403).json({ error: 'PACIENTE_NO_ASIGNADO' });
    }

    const [[profesional]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT profesional_id FROM Profesional WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );

    await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Alerta_Clinica
          SET estado = 'REVISADA', momento_revision = NOW(), profesional_id = ?
        WHERE alerta_clinica_id = ? AND estado = 'ABIERTA'`,
      [profesional?.profesional_id || null, req.params.id]
    );

    await auditar(req, 'REVISION_ALERTA_CLINICA', 'Alerta_Clinica', {
      alerta_clinica_id: Number(req.params.id),
      paciente_id: alerta.paciente_id,
    });

    return res.status(200).json({ mensaje: 'Alerta marcada como revisada.' });
  } catch (error) {
    console.error('[revisarAlerta CU50]', error);
    return res.status(500).json({ error: 'No se pudo marcar la alerta.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU44 / CU45 — Índice de adherencia y panel de progreso
// ─────────────────────────────────────────────────────────────────────────────

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * CU45, CU44 — panel de progreso del paciente (recalcula la adherencia)
 * GET /api/clinica/mi-progreso?desde=&hasta=   (Paciente)
 *
 * Todo lo que alimenta el panel del CU45 en una sola llamada: adherencia,
 * curva de síntomas y recuento de asistencia. De paso recalcula el índice
 * (CU44), que es justo lo que el caso de uso pide al navegar al perfil.
 */
exports.miProgreso = async (req, res) => {
  const desde = PATRON_FECHA.test(String(req.query?.desde || '')) ? req.query.desde : null;
  const hasta = PATRON_FECHA.test(String(req.query?.hasta || '')) ? req.query.hasta : null;

  // Excepción 3 del CU45: un rango al revés no se consulta, se corrige.
  if (desde && hasta && desde > hasta) {
    return res.status(400).json({
      error: 'RANGO_INVALIDO',
      mensaje: 'La fecha de inicio no puede ser posterior a la de término.',
    });
  }

  try {
    const pacienteId = await pacienteDeUsuario(req.user.usuario_id);
    if (!pacienteId) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    // CU44: el índice se recalcula al entrar al panel. Si el teléfono se quedó
    // sin señal antes (Excepción 3 del CU44), el dato quedó en el servidor y
    // aparece ahora.
    const adherencia = await C_Motor_Clinico.actualizarIndicador(C_Capa_de_Acceso_a_Datos, pacienteId);

    const [serie, rango] = await Promise.all([
      C_Motor_Clinico.serieAdherencia(C_Capa_de_Acceso_a_Datos, pacienteId, { desde, hasta }).catch(() => []),
      desde || hasta
        ? C_Motor_Clinico.calcularAdherencia(C_Capa_de_Acceso_a_Datos, pacienteId, { desde, hasta }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const [sintomas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT reporte_sintoma_id, nivel_dolor, limitacion_funcional, comentario, momento_registro
         FROM Reporte_Sintoma
        WHERE paciente_id = ?
          AND (? IS NULL OR DATE(momento_registro) >= ?)
          AND (? IS NULL OR DATE(momento_registro) <= ?)
        ORDER BY momento_registro ASC`,
      [pacienteId, desde, desde, hasta, hasta]
    );

    const [[asistencia]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT
          SUM(CASE WHEN estado = 'REALIZADA' THEN 1 ELSE 0 END)      AS realizadas,
          SUM(CASE WHEN estado = 'INASISTENCIA' THEN 1 ELSE 0 END)   AS inasistencias,
          SUM(CASE WHEN estado LIKE 'CANCELADA%' THEN 1 ELSE 0 END)  AS canceladas,
          SUM(CASE WHEN estado IN ('AGENDADA','CONFIRMADA') AND fecha_hora_inicio > NOW()
                   THEN 1 ELSE 0 END)                                 AS proximas,
          COUNT(*)                                                    AS total
         FROM Cita
        WHERE paciente_id = ?
          AND (? IS NULL OR DATE(fecha_hora_inicio) >= ?)
          AND (? IS NULL OR DATE(fecha_hora_inicio) <= ?)`,
      [pacienteId, desde, desde, hasta, hasta]
    );

    // Excepción 1 del CU45: sin historial se devuelve la vista introductoria.
    const [[historico]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT COUNT(*) AS citas FROM Cita WHERE paciente_id = ?`,
      [pacienteId]
    );

    return res.status(200).json({
      hay_historial: Number(historico.citas) > 0 || sintomas.length > 0,
      adherencia: {
        ...adherencia,
        // Cuando se pidió un rango, el porcentaje de ese tramo va aparte del
        // global: son dos preguntas distintas.
        porcentaje_rango: rango ? rango.porcentaje : null,
      },
      serie_adherencia: serie,
      sintomas,
      asistencia: {
        realizadas: Number(asistencia?.realizadas || 0),
        inasistencias: Number(asistencia?.inasistencias || 0),
        canceladas: Number(asistencia?.canceladas || 0),
        proximas: Number(asistencia?.proximas || 0),
        total: Number(asistencia?.total || 0),
      },
      rango: { desde, hasta },
    });
  } catch (error) {
    console.error('[miProgreso CU45]', error);
    return res.status(500).json({
      error: 'ERROR_PROGRESO',
      mensaje: 'No se pudo cargar tu progreso. Vuelve a intentarlo.',
    });
  }
};

/**
 * CU44 — Actualizando indicadores de adherencia y síntomas
 * GET /api/clinica/pacientes/:pacienteId/adherencia   (Profesional)
 *
 * El mismo indicador, desde la ficha: el profesional necesita ver el
 * compromiso del paciente junto al resto de su seguimiento.
 */
exports.adherenciaDePaciente = async (req, res) => {
  const { pacienteId } = req.params;
  try {
    if (
      req.user?.nombre_rol !== 'Administrador' &&
      !(await profesionalTratante(req.user.usuario_id, pacienteId))
    ) {
      return res.status(403).json({ error: 'PACIENTE_NO_ASIGNADO' });
    }

    const adherencia = await C_Motor_Clinico.actualizarIndicador(C_Capa_de_Acceso_a_Datos, pacienteId);
    const serie = await C_Motor_Clinico.serieAdherencia(C_Capa_de_Acceso_a_Datos, pacienteId, {}).catch(() => []);

    return res.status(200).json({ adherencia, serie_adherencia: serie });
  } catch (error) {
    console.error('[adherenciaDePaciente CU44]', error);
    return res.status(500).json({ error: 'No se pudo calcular la adherencia.' });
  }
};
