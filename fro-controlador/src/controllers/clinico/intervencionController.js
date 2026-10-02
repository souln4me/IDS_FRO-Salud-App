const pool = require('../../config/database');
const { rechazarSiCerrado, estaCerrado, porcentajeObjetivosEpisodio } = require('../../services/clinico/episodioService');

const PATRON_ALERTA_PRIORITARIA =
  /\b(dolor\s+(intenso|severo|insoportable)|dificultad\s+respiratoria|p[eé]rdida\s+de\s+conciencia|desmayo|convulsi[oó]n|deterioro\s+(grave|severo)|signos?\s+vitales?\s+inestables?)\b/i;

function obtenerIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    'IP_DESCONOCIDA'
  );
}

function estadoEnCurso(estado) {
  return String(estado || '').trim().toUpperCase().replace(/\s+/g, '_') === 'EN_CURSO';
}

async function obtenerContexto(connection, episodioId, usuarioId, bloquear = false, soloDelProfesional = true) {
  const [filas] = await connection.execute(
    `SELECT
        ec.episodio_clinico_id,
        ec.motivo_consulta,
        ec.estado AS estado_episodio,
        ec.paciente_id,
        ec.profesional_id,
        p.usuario_id AS profesional_usuario_id,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', pu.nombres, pu.apellido_paterno, pu.apellido_materno)), ''),
          CONCAT('Profesional #', ec.profesional_id)
        ) AS profesional_responsable,
        COALESCE(e.nombre, 'General') AS especialidad,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno)), ''),
          CONCAT('Paciente #', ec.paciente_id)
        ) AS paciente,
        c.cita_id,
        c.estado AS estado_cita,
        c.fecha_hora_inicio,
        c.fecha_hora_fin
     FROM Episodio_Clinico ec
     JOIN Profesional p ON p.profesional_id = ec.profesional_id
     LEFT JOIN Usuario pu ON pu.usuario_id = p.usuario_id
     LEFT JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
     JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
     LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
     LEFT JOIN Cita c
       ON c.paciente_id = ec.paciente_id
      AND c.profesional_id = ec.profesional_id
      AND UPPER(REPLACE(TRIM(c.estado), ' ', '_')) = 'EN_CURSO'
      -- El vinculo real manda; la coincidencia por paciente y profesional
      -- queda solo para las citas anteriores a que existiera la columna.
      AND (c.episodio_clinico_id = ec.episodio_clinico_id OR c.episodio_clinico_id IS NULL)
     WHERE ec.episodio_clinico_id = ?
       ${soloDelProfesional ? 'AND p.usuario_id = ?' : ''}
     ORDER BY c.fecha_hora_inicio DESC
     LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
    soloDelProfesional ? [episodioId, usuarioId] : [episodioId]
  );

  return filas[0] || null;
}

/**
 * CU28: el profesional vinculado al paciente ve su trayectoria completa. El
 * vínculo es el mismo de la nómina (CU11): un episodio propio o una cita con él.
 */
async function profesionalVinculadoAlPaciente(connection, pacienteId, usuarioId) {
  const [filas] = await connection.execute(
    `SELECT 1 AS vinculado
       FROM Episodio_Clinico ec
       JOIN Profesional p ON p.profesional_id = ec.profesional_id
      WHERE ec.paciente_id = ? AND p.usuario_id = ?
      UNION
     SELECT 1 AS vinculado
       FROM Cita c
       JOIN Profesional p ON p.profesional_id = c.profesional_id
      WHERE c.paciente_id = ? AND p.usuario_id = ?
      LIMIT 1`,
    [pacienteId, usuarioId, pacienteId, usuarioId]
  );
  return filas.length > 0;
}

/**
 * La atención EN CURSO de este profesional con el paciente, sin importar a qué
 * episodio esté atada. Al iniciar la atención (CU38) la cita se amarra al
 * episodio abierto más reciente; si el paciente llega por un motivo nuevo hay
 * que poder pasarla al episodio nuevo, o la sesión queda sin dónde registrarse.
 */
async function atencionEnCursoDelPaciente(connection, pacienteId, profesionalId) {
  const [filas] = await connection.execute(
    `SELECT
        c.cita_id,
        c.episodio_clinico_id,
        c.fecha_hora_inicio,
        ec.motivo_consulta AS motivo_episodio
       FROM Cita c
       LEFT JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = c.episodio_clinico_id
      WHERE c.paciente_id = ?
        AND c.profesional_id = ?
        AND UPPER(REPLACE(TRIM(c.estado), ' ', '_')) = 'EN_CURSO'
      ORDER BY c.fecha_hora_inicio DESC
      LIMIT 1`,
    [pacienteId, profesionalId]
  );
  return filas[0] || null;
}

exports.listarSesiones = async (req, res) => {
  try {
    const [sesiones] = await pool.execute(
      `SELECT
          ec.episodio_clinico_id,
          ec.motivo_consulta,
          ec.paciente_id,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno)), ''),
            CONCAT('Paciente #', ec.paciente_id)
          ) AS paciente,
          COALESCE(e.nombre, 'General') AS especialidad,
          c.cita_id,
          c.estado AS estado_cita,
          c.fecha_hora_inicio,
          c.fecha_hora_fin
       FROM Episodio_Clinico ec
       JOIN Profesional p ON p.profesional_id = ec.profesional_id
       LEFT JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
       JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
       LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
       LEFT JOIN Cita c
         ON c.paciente_id = ec.paciente_id
        AND c.profesional_id = ec.profesional_id
        AND UPPER(REPLACE(TRIM(c.estado), ' ', '_')) = 'EN_CURSO'
       WHERE p.usuario_id = ?
       ORDER BY (c.cita_id IS NOT NULL) DESC, c.fecha_hora_inicio DESC, ec.fecha_inicio DESC`,
      [req.user.usuario_id]
    );

    return res.status(200).json({ sesiones });
  } catch (error) {
    console.error('[listarSesiones CU40]', error);
    return res.status(500).json({
      error: 'ERROR_LISTAR_SESIONES',
      mensaje: 'No fue posible recuperar las sesiones clínicas.'
    });
  }
};

exports.obtenerIntervencion = async (req, res) => {
  const { episodio_id } = req.params;

  try {
    let contexto = await obtenerContexto(
      pool,
      episodio_id,
      req.user.usuario_id
    );
    let deOtroProfesional = false;

    // CU28: la ficha muestra la trayectoria completa del paciente, con lo de
    // otros profesionales en modo bloqueado. Antes esto respondía 403 y la app
    // lo mostraba como una falla del servicio.
    if (!contexto) {
      const ajeno = await obtenerContexto(pool, episodio_id, req.user.usuario_id, false, false);
      if (!ajeno) {
        return res.status(404).json({
          error: 'EPISODIO_NO_ENCONTRADO',
          mensaje: 'El episodio clínico no existe.'
        });
      }
      if (!(await profesionalVinculadoAlPaciente(pool, ajeno.paciente_id, req.user.usuario_id))) {
        return res.status(403).json({
          error: 'EPISODIO_NO_ASIGNADO',
          mensaje: 'No estás vinculado a este paciente.'
        });
      }
      contexto = ajeno;
      deOtroProfesional = true;
    }

    const [evoluciones] = await pool.execute(
      `SELECT
          evolucion_clinica_id,
          respuesta_fisiologica,
          tecnicas_aplicadas,
          inalterable
       FROM Evolucion_Clinica
       WHERE episodio_clinico_id = ?
         AND profesional_id = ?
       ORDER BY evolucion_clinica_id DESC
       LIMIT 1`,
      [episodio_id, contexto.profesional_id]
    );

    const editable =
      !deOtroProfesional && Boolean(contexto.cita_id) && estadoEnCurso(contexto.estado_cita);
    const ultimaEvolucion = evoluciones[0] || null;

    // Si la atención en curso está registrada en OTRO episodio del mismo
    // profesional, la app lo dice y ofrece trasladarla: antes el episodio nuevo
    // simplemente no dejaba escribir y no había ninguna explicación.
    let atencionOtroEpisodio = null;
    if (!editable && !deOtroProfesional) {
      const atencion = await atencionEnCursoDelPaciente(
        pool,
        contexto.paciente_id,
        contexto.profesional_id
      );
      if (atencion && String(atencion.episodio_clinico_id) !== String(episodio_id)) {
        atencionOtroEpisodio = atencion;
      }
    }

    return res.status(200).json({
      contexto: {
        ...contexto,
        editable,
        de_otro_profesional: deOtroProfesional,
        atencion_otro_episodio: atencionOtroEpisodio,
        mensaje_estado: deOtroProfesional
          ? `Este episodio lo lleva ${contexto.profesional_responsable}. Puedes consultarlo, pero solo su profesional registra en él.`
          : editable
            ? 'Sesión clínica en curso.'
            : 'La sesión no está EN CURSO. Los campos se muestran en modo de solo lectura.'
      },
      evolucion:
        editable && ultimaEvolucion?.inalterable === 1
          ? null
          : ultimaEvolucion
    });
  } catch (error) {
    console.error('[obtenerIntervencion CU40]', error);
    return res.status(500).json({
      error: 'ERROR_OBTENER_INTERVENCION',
      mensaje: 'No fue posible recuperar la intervención clínica.'
    });
  }
};

exports.guardarIntervencion = async (req, res) => {
  const { episodio_id } = req.params;
  const tecnicasAplicadas = String(req.body.tecnicas_aplicadas || '').trim();
  const respuestaFisiologica = String(req.body.respuesta_fisiologica || '').trim();

  if (!tecnicasAplicadas || !respuestaFisiologica) {
    return res.status(400).json({
      error: 'CAMPOS_OBLIGATORIOS',
      mensaje: 'Las técnicas aplicadas y la respuesta fisiológica son obligatorias.'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const contexto = await obtenerContexto(
      connection,
      episodio_id,
      req.user.usuario_id,
      true
    );

    if (!contexto) {
      await connection.rollback();
      return res.status(403).json({
        error: 'EPISODIO_NO_ASIGNADO',
        mensaje: 'El episodio no pertenece al profesional autenticado.'
      });
    }

    if (!contexto.cita_id || !estadoEnCurso(contexto.estado_cita)) {
      await connection.rollback();
      return res.status(409).json({
        error: 'SESION_NO_EN_CURSO',
        mensaje: 'La intervención solo puede modificarse mientras la cita está EN CURSO.'
      });
    }

    // CU78 Exc.3 (D12): el episodio cerrado no recibe más intervenciones.
    if (estaCerrado(contexto.estado_episodio)) {
      await connection.rollback();
      return res.status(409).json({
        error: 'EPISODIO_CERRADO',
        mensaje: 'Este episodio clínico está cerrado. Registra la sesión en un episodio abierto.'
      });
    }

    const [existentes] = await connection.execute(
      `SELECT evolucion_clinica_id, inalterable
       FROM Evolucion_Clinica
       WHERE episodio_clinico_id = ?
         AND profesional_id = ?
       ORDER BY evolucion_clinica_id DESC
       LIMIT 1
       FOR UPDATE`,
      [episodio_id, contexto.profesional_id]
    );

    let evolucionId;

    // El avance de las metas del episodio viaja con la evolución: son la misma
    // sesión. Sin esto el historial mostraba "Porcentaje objetivo: No informado%"
    // aunque las metas estuvieran medidas.
    const porcentajeObjetivo = await porcentajeObjetivosEpisodio(connection, episodio_id);

    if (existentes.length > 0 && existentes[0].inalterable !== 1) {
      evolucionId = existentes[0].evolucion_clinica_id;
      await connection.execute(
        `UPDATE Evolucion_Clinica
         SET tecnicas_aplicadas = ?,
             respuesta_fisiologica = ?,
             porcentaje_objetivo = COALESCE(?, porcentaje_objetivo)
         WHERE evolucion_clinica_id = ?`,
        [tecnicasAplicadas, respuestaFisiologica, porcentajeObjetivo, evolucionId]
      );
    } else {
      const [resultado] = await connection.execute(
        `INSERT INTO Evolucion_Clinica
          (tecnicas_aplicadas, respuesta_fisiologica, porcentaje_objetivo, episodio_clinico_id, profesional_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          tecnicasAplicadas,
          respuestaFisiologica,
          porcentajeObjetivo,
          episodio_id,
          contexto.profesional_id
        ]
      );
      evolucionId = resultado.insertId;
    }

    const alertaPrioritaria = PATRON_ALERTA_PRIORITARIA.test(
      `${tecnicasAplicadas} ${respuestaFisiologica}`
    );

    await connection.execute(
      `INSERT INTO Bitacora_Auditoria
        (accion, entidad_afectada, ip_origen, usuario_id, datos_adicionales)
       VALUES (?, ?, ?, ?, ?)`,
      [
        'DOCUMENTAR_INTERVENCION_FISIOLOGICA',
        'Evolucion_Clinica',
        obtenerIP(req),
        req.user.usuario_id,
        JSON.stringify({
          evolucion_clinica_id: evolucionId,
          episodio_clinico_id: Number(episodio_id),
          cita_id: contexto.cita_id,
          alerta_prioritaria: alertaPrioritaria
        })
      ]
    );

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Intervención y respuesta fisiológica guardadas correctamente.',
      evolucion_clinica_id: evolucionId,
      alerta_prioritaria: alertaPrioritaria
    });
  } catch (error) {
    await connection.rollback();
    console.error('[guardarIntervencion CU40]', error);
    return res.status(500).json({
      error: 'ERROR_GUARDAR_INTERVENCION',
      mensaje: 'No fue posible guardar la intervención clínica.'
    });
  } finally {
    connection.release();
  }
};

/**
 * PUT /api/clinica/intervenciones/:episodio_id/atencion
 *
 * Pasa la atención EN CURSO a este episodio. Es el caso del paciente que llega
 * por un motivo nuevo: el profesional crea el episodio y traslada la sesión que
 * está atendiendo, en vez de quedar bloqueado en el episodio anterior. Queda en
 * la bitácora con el episodio de origen y el de destino.
 */
exports.trasladarAtencion = async (req, res) => {
  const { episodio_id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const contexto = await obtenerContexto(
      connection,
      episodio_id,
      req.user.usuario_id,
      true
    );

    if (!contexto) {
      await connection.rollback();
      return res.status(403).json({
        error: 'EPISODIO_NO_ASIGNADO',
        mensaje: 'Solo el profesional a cargo del episodio puede atender en él.'
      });
    }

    if (estaCerrado(contexto.estado_episodio)) {
      await connection.rollback();
      return res.status(409).json({
        error: 'EPISODIO_CERRADO',
        mensaje: 'Este episodio está cerrado. Crea uno nuevo para atender este motivo.'
      });
    }

    const atencion = await atencionEnCursoDelPaciente(
      connection,
      contexto.paciente_id,
      contexto.profesional_id
    );

    if (!atencion) {
      await connection.rollback();
      return res.status(409).json({
        error: 'SIN_ATENCION_EN_CURSO',
        mensaje: 'No tienes una atención en curso con este paciente. Inicia la atención desde la cita del historial.'
      });
    }

    if (String(atencion.episodio_clinico_id) === String(episodio_id)) {
      await connection.rollback();
      return res.status(200).json({
        mensaje: 'La atención ya está registrada en este episodio.',
        cita_id: atencion.cita_id
      });
    }

    await connection.execute(
      `UPDATE Cita SET episodio_clinico_id = ? WHERE cita_id = ?`,
      [episodio_id, atencion.cita_id]
    );

    await connection.execute(
      `INSERT INTO Bitacora_Auditoria
        (accion, entidad_afectada, ip_origen, usuario_id, datos_adicionales)
       VALUES (?, 'Cita', ?, ?, ?)`,
      [
        'TRASLADAR_ATENCION_A_EPISODIO',
        obtenerIP(req),
        req.user.usuario_id,
        JSON.stringify({
          cita_id: atencion.cita_id,
          episodio_origen: atencion.episodio_clinico_id,
          episodio_destino: Number(episodio_id)
        })
      ]
    );

    await connection.commit();

    return res.status(200).json({
      mensaje: 'La atención en curso quedó registrada en este episodio.',
      cita_id: atencion.cita_id,
      episodio_clinico_id: Number(episodio_id)
    });
  } catch (error) {
    await connection.rollback();
    console.error('[trasladarAtencion CU40]', error);
    return res.status(500).json({
      error: 'ERROR_TRASLADAR_ATENCION',
      mensaje: 'No fue posible mover la atención a este episodio.'
    });
  } finally {
    connection.release();
  }
};
