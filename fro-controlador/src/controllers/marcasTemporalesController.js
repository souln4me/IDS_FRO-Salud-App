const pool = require('../config/database');
const { descontarSesionPaquete } = require('../services/agenda/agendaService');

function obtenerIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    'IP_DESCONOCIDA'
  );
}

function normalizarEstado(estado) {
  return String(estado || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function fechaValida(valor) {
  if (!valor) return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

async function obtenerCitaProfesional(connection, citaId, usuarioId, bloquear = false) {
  const [filas] = await connection.execute(
    `SELECT
        c.cita_id,
        c.fecha_hora_inicio,
        c.fecha_hora_fin,
        c.checkin_profesional,
        c.estado,
        c.paciente_id,
        c.profesional_id,
        c.episodio_clinico_id,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno)), ''),
          CONCAT('Paciente #', c.paciente_id)
        ) AS paciente
     FROM Cita c
     JOIN Profesional p ON p.profesional_id = c.profesional_id
     LEFT JOIN Paciente pa ON pa.paciente_id = c.paciente_id
     LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
     WHERE c.cita_id = ?
       AND p.usuario_id = ?
     LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
    [citaId, usuarioId]
  );

  return filas[0] || null;
}

async function registrarAuditoria(connection, req, accion, datos) {
  await connection.execute(
    `INSERT INTO Bitacora_Auditoria
      (accion, entidad_afectada, ip_origen, usuario_id, datos_adicionales)
     VALUES (?, 'Cita', ?, ?, ?)`,
    [
      accion,
      obtenerIP(req),
      req.user.usuario_id,
      JSON.stringify(datos)
    ]
  );
}

exports.listarCitasProfesional = async (req, res) => {
  try {
    const [citas] = await pool.execute(
      `SELECT
          c.cita_id,
          c.fecha_hora_inicio,
          c.fecha_hora_fin,
          c.checkin_profesional,
          c.estado,
          -- Necesario para abrir la ficha del paciente desde la jornada.
          c.paciente_id,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno)), ''),
            CONCAT('Paciente #', c.paciente_id)
          ) AS paciente,
          CASE
            WHEN c.checkin_profesional IS NOT NULL
             AND UPPER(REPLACE(TRIM(c.estado), ' ', '_')) = 'REALIZADA'
            THEN TIMESTAMPDIFF(MINUTE, c.checkin_profesional, c.fecha_hora_fin)
            ELSE NULL
          END AS duracion_minutos
       FROM Cita c
       JOIN Profesional p ON p.profesional_id = c.profesional_id
       LEFT JOIN Paciente pa ON pa.paciente_id = c.paciente_id
       LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
       WHERE p.usuario_id = ?
         AND UPPER(REPLACE(TRIM(c.estado), ' ', '_'))
             IN ('CONFIRMADA', 'EN_CURSO', 'REALIZADA')
       ORDER BY
         CASE UPPER(REPLACE(TRIM(c.estado), ' ', '_'))
           WHEN 'EN_CURSO' THEN 1
           WHEN 'CONFIRMADA' THEN 2
           ELSE 3
         END,
         c.fecha_hora_inicio DESC`,
      [req.user.usuario_id]
    );

    return res.status(200).json({ citas });
  } catch (error) {
    console.error('[listarCitasProfesional CU38]', error);
    return res.status(500).json({
      error: 'ERROR_LISTAR_CITAS',
      mensaje: 'No fue posible recuperar las citas del profesional.'
    });
  }
};

exports.iniciarAtencion = async (req, res) => {
  const { cita_id } = req.params;
  const {
    confirmar_inicio_anticipado = false,
    marca_manual,
    justificacion_manual
  } = req.body;

  const marcaManual = fechaValida(marca_manual);
  if (marca_manual && !marcaManual) {
    return res.status(400).json({
      error: 'MARCA_MANUAL_INVALIDA',
      mensaje: 'La hora manual indicada no es valida.'
    });
  }

  if (marcaManual && !String(justificacion_manual || '').trim()) {
    return res.status(400).json({
      error: 'JUSTIFICACION_REQUERIDA',
      mensaje: 'La marca manual requiere una justificacion de trazabilidad.'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const cita = await obtenerCitaProfesional(
      connection,
      cita_id,
      req.user.usuario_id,
      true
    );

    if (!cita) {
      await connection.rollback();
      return res.status(404).json({
        error: 'CITA_NO_ENCONTRADA',
        mensaje: 'La cita no existe o no pertenece al profesional autenticado.'
      });
    }

    if (normalizarEstado(cita.estado) !== 'CONFIRMADA') {
      await connection.rollback();
      return res.status(409).json({
        error: 'CITA_NO_HABILITADA',
        mensaje: 'Solo una cita CONFIRMADA puede iniciar la atencion.'
      });
    }

    const marcaInicio = marcaManual || new Date();
    const inicioAgendado = new Date(cita.fecha_hora_inicio);
    const inicioAnticipado = marcaInicio.getTime() < inicioAgendado.getTime();

    if (inicioAnticipado && !confirmar_inicio_anticipado) {
      await connection.rollback();
      return res.status(409).json({
        error: 'INICIO_ANTICIPADO',
        mensaje: 'La atencion comenzara antes del bloque agendado.',
        requiere_confirmacion: true,
        fecha_hora_inicio: cita.fecha_hora_inicio
      });
    }

    // Vínculo cita ↔ episodio (opción C). Hasta ahora la cita no sabía qué
    // trabajo clínico generaba, y el sistema tenía que adivinarlo buscando
    // una cita en curso del mismo paciente y profesional: con dos episodios
    // abiertos, ambos apuntaban a la misma cita.
    //
    // Se ata al episodio abierto más reciente del paciente con este
    // profesional. Si no hay ninguno NO se crea uno automáticamente: un
    // episodio sin motivo real ensucia la ficha, así que la app guía al
    // profesional a crearlo.
    let episodioVinculado = cita.episodio_clinico_id || null;
    if (!episodioVinculado) {
      // D12: solo un episodio abierto puede recibir la atención.
      const [episodios] = await connection.execute(
        `SELECT episodio_clinico_id
           FROM Episodio_Clinico
          WHERE paciente_id = ? AND profesional_id = ?
            AND (estado IS NULL OR UPPER(estado) <> 'CERRADO')
          ORDER BY episodio_clinico_id DESC
          LIMIT 1`,
        [cita.paciente_id, cita.profesional_id]
      );
      episodioVinculado = episodios[0]?.episodio_clinico_id || null;
    }

    await connection.execute(
      `UPDATE Cita
       SET checkin_profesional = ?,
           estado = 'EN_CURSO',
           episodio_clinico_id = COALESCE(episodio_clinico_id, ?)
       WHERE cita_id = ?`,
      [marcaInicio, episodioVinculado, cita_id]
    );

    await registrarAuditoria(connection, req, 'INICIAR_ATENCION_CU38', {
      cita_id: Number(cita_id),
      marca_inicio: marcaInicio.toISOString(),
      inicio_agendado: cita.fecha_hora_inicio,
      termino_agendado_original: cita.fecha_hora_fin,
      inicio_anticipado: inicioAnticipado,
      origen_marca: marcaManual ? 'MANUAL_JUSTIFICADA' : 'SERVIDOR',
      justificacion_manual: marcaManual
        ? String(justificacion_manual).trim()
        : null
    });

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Atencion iniciada correctamente.',
      cita_id: Number(cita_id),
      estado: 'EN_CURSO',
      marca_inicio: marcaInicio,
      inicio_anticipado: inicioAnticipado,
      // Para que la app lleve directo al registro de la sesión. En null
      // significa que el paciente no tiene episodios y hay que crear uno.
      episodio_clinico_id: episodioVinculado
    });
  } catch (error) {
    await connection.rollback();
    console.error('[iniciarAtencion CU38]', error);
    return res.status(500).json({
      error: 'ERROR_INICIAR_ATENCION',
      mensaje: 'No fue posible registrar el inicio de la atencion.'
    });
  } finally {
    connection.release();
  }
};

exports.finalizarAtencion = async (req, res) => {
  const { cita_id } = req.params;
  const { marca_manual, justificacion_manual } = req.body;

  const marcaManual = fechaValida(marca_manual);
  if (marca_manual && !marcaManual) {
    return res.status(400).json({
      error: 'MARCA_MANUAL_INVALIDA',
      mensaje: 'La hora manual indicada no es valida.'
    });
  }

  if (marcaManual && !String(justificacion_manual || '').trim()) {
    return res.status(400).json({
      error: 'JUSTIFICACION_REQUERIDA',
      mensaje: 'La marca manual requiere una justificacion de trazabilidad.'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const cita = await obtenerCitaProfesional(
      connection,
      cita_id,
      req.user.usuario_id,
      true
    );

    if (!cita) {
      await connection.rollback();
      return res.status(404).json({
        error: 'CITA_NO_ENCONTRADA',
        mensaje: 'La cita no existe o no pertenece al profesional autenticado.'
      });
    }

    if (normalizarEstado(cita.estado) !== 'EN_CURSO') {
      await connection.rollback();
      return res.status(409).json({
        error: 'CITA_NO_EN_CURSO',
        mensaje: 'Solo una cita EN_CURSO puede finalizar la atencion.'
      });
    }

    const marcaInicio = cita.checkin_profesional
      ? new Date(cita.checkin_profesional)
      : new Date(cita.fecha_hora_inicio);
    const marcaTermino = marcaManual || new Date();
    const duracionMs = marcaTermino.getTime() - marcaInicio.getTime();

    if (duracionMs < 0) {
      await registrarAuditoria(
        connection,
        req,
        'BLOQUEO_DURACION_NEGATIVA_CU38',
        {
          cita_id: Number(cita_id),
          marca_inicio: marcaInicio.toISOString(),
          marca_termino_rechazada: marcaTermino.toISOString()
        }
      );
      await connection.commit();

      return res.status(409).json({
        error: 'DURACION_NEGATIVA',
        mensaje: 'La hora de termino es anterior al inicio. La persistencia fue bloqueada.'
      });
    }

    const duracionMinutos = Math.floor(duracionMs / 60000);

    await connection.execute(
      `UPDATE Cita
       SET fecha_hora_fin = ?,
           estado = 'REALIZADA'
       WHERE cita_id = ?`,
      [marcaTermino, cita_id]
    );

    // CU76 — Al concretarse la sesión, se descuenta del paquete del paciente
    // (mismo efecto que finalizar por la máquina de estados).
    const inventario = await descontarSesionPaquete(
      connection,
      cita.paciente_id,
      'SESION_REALIZADA'
    );

    await registrarAuditoria(connection, req, 'FINALIZAR_ATENCION_CU38', {
      cita_id: Number(cita_id),
      marca_inicio: marcaInicio.toISOString(),
      marca_termino: marcaTermino.toISOString(),
      duracion_minutos: duracionMinutos,
      inicio_recuperado: !cita.checkin_profesional,
      origen_marca: marcaManual ? 'MANUAL_JUSTIFICADA' : 'SERVIDOR',
      justificacion_manual: marcaManual
        ? String(justificacion_manual).trim()
        : null,
      inventario
    });

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Atencion finalizada correctamente.',
      cita_id: Number(cita_id),
      estado: 'REALIZADA',
      marca_inicio: marcaInicio,
      marca_termino: marcaTermino,
      duracion_minutos: duracionMinutos,
      inventario
    });
  } catch (error) {
    await connection.rollback();
    console.error('[finalizarAtencion CU38]', error);
    return res.status(500).json({
      error: 'ERROR_FINALIZAR_ATENCION',
      mensaje: 'No fue posible registrar el termino de la atencion.'
    });
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Atención en curso del profesional (opción C)
// ─────────────────────────────────────────────────────────────────────────────
// Alimenta la barra que sigue al profesional por la app mientras está
// atendiendo. Devuelve null cuando no hay ninguna, para que la barra
// simplemente no se muestre.
exports.atencionEnCurso = async (req, res) => {
  try {
    const [filas] = await pool.execute(
      `SELECT
          c.cita_id,
          c.fecha_hora_inicio,
          c.checkin_profesional,
          c.paciente_id,
          c.episodio_clinico_id,
          COALESCE(
            CONCAT(u.nombres, ' ', u.apellido_paterno),
            CONCAT('Paciente #', c.paciente_id)
          ) AS paciente
       FROM Cita c
       JOIN Profesional p ON p.profesional_id = c.profesional_id
       LEFT JOIN Paciente pa ON pa.paciente_id = c.paciente_id
       LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
       WHERE p.usuario_id = ?
         AND UPPER(REPLACE(TRIM(c.estado), ' ', '_')) = 'EN_CURSO'
       ORDER BY c.checkin_profesional DESC, c.fecha_hora_inicio DESC
       LIMIT 1`,
      [req.user?.usuario_id]
    );

    return res.status(200).json({ atencion: filas[0] || null });
  } catch (error) {
    console.error('[atencionEnCurso]', error);
    return res.status(500).json({ error: 'No se pudo consultar la atencion en curso.' });
  }
};
