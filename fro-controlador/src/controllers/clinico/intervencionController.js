const pool = require('../../config/database');
const { rechazarSiCerrado, estaCerrado } = require('../../services/clinico/episodioService');

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

async function obtenerContexto(connection, episodioId, usuarioId, bloquear = false) {
  const [filas] = await connection.execute(
    `SELECT
        ec.episodio_clinico_id,
        ec.motivo_consulta,
        ec.estado AS estado_episodio,
        ec.paciente_id,
        ec.profesional_id,
        p.usuario_id AS profesional_usuario_id,
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
       AND p.usuario_id = ?
     ORDER BY c.fecha_hora_inicio DESC
     LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
    [episodioId, usuarioId]
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
    const contexto = await obtenerContexto(
      pool,
      episodio_id,
      req.user.usuario_id
    );

    if (!contexto) {
      return res.status(403).json({
        error: 'EPISODIO_NO_ASIGNADO',
        mensaje: 'El episodio no pertenece al profesional autenticado.'
      });
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

    const editable = Boolean(contexto.cita_id) && estadoEnCurso(contexto.estado_cita);
    const ultimaEvolucion = evoluciones[0] || null;

    return res.status(200).json({
      contexto: {
        ...contexto,
        editable,
        mensaje_estado: editable
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

    if (existentes.length > 0 && existentes[0].inalterable !== 1) {
      evolucionId = existentes[0].evolucion_clinica_id;
      await connection.execute(
        `UPDATE Evolucion_Clinica
         SET tecnicas_aplicadas = ?,
             respuesta_fisiologica = ?
         WHERE evolucion_clinica_id = ?`,
        [tecnicasAplicadas, respuestaFisiologica, evolucionId]
      );
    } else {
      const [resultado] = await connection.execute(
        `INSERT INTO Evolucion_Clinica
          (tecnicas_aplicadas, respuesta_fisiologica, episodio_clinico_id, profesional_id)
         VALUES (?, ?, ?, ?)`,
        [
          tecnicasAplicadas,
          respuestaFisiologica,
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
