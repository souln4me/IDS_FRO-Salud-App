/**
 * Componente: C_API_REST
 * Casos de uso: CU38, CU39, CU41, CU20, CU76, CU78, CU55, CU44, CU40.
 *
 * Marcas de inicio y término de la atención del profesional y su jornada.
 */
const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');
const C_Motor_Clinico = require('../componentes/C_Motor_Clinico');
const C_Motor_Agendamiento = require('../componentes/C_Motor_Agendamiento');
const C_Validador_Presencialidad = require('../componentes/C_Validador_Presencialidad');
// CU39/CU41: al comenzar y finalizar se registran solas las ubicaciones de
// ambos y, al final, se intenta certificar la sesión sin pasos extra.
const { certificarAlFinalizar } = require('./evidenciaController');

// Apoyo común: IP de origen para la bitácora
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

// CU38: la cita debe ser del profesional autenticado
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
        c.modalidad,
        c.evidencia_presencial,
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

// CU22 — Registrando trazabilidad de transiciones de agenda
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

// Valida AAAA-MM-DD y descarta cualquier otra cosa: la fecha entra en la
// consulta y no puede venir con sorpresas.
function fechaSimple(valor) {
  const texto = String(valor || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

// CU38 — Registrando marcas temporales de la prestación
exports.listarCitasProfesional = async (req, res) => {
  try {
    // La jornada por día pide un rango (una semana); sin rango se devuelve todo,
    // como antes, para no romper a ningún cliente.
    const desde = fechaSimple(req.query?.desde);
    const hasta = fechaSimple(req.query?.hasta);
    const rango = desde && hasta;

    const [citas] = await C_Capa_de_Acceso_a_Datos.execute(
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
         -- La jornada incluye lo que todavía hay que confirmar y las
         -- inasistencias del día: son parte de lo que pasó en esa hora. Las
         -- canceladas no, porque el bloque quedó libre.
         AND UPPER(REPLACE(TRIM(c.estado), ' ', '_'))
             IN ('AGENDADA', 'CONFIRMADA', 'EN_CURSO', 'REALIZADA', 'INASISTENCIA')
         ${rango ? 'AND DATE(c.fecha_hora_inicio) BETWEEN ? AND ?' : ''}
       ORDER BY c.fecha_hora_inicio ASC`,
      rango ? [req.user.usuario_id, desde, hasta] : [req.user.usuario_id]
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

// CU38 — Registrando marcas temporales de la prestación
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

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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

    // CU78: la cita queda atada a su episodio clínico
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

    // CU20: la cita pasa a EN_CURSO
    // Corrección Inc 4: el inicio lo dispara solo el profesional. La marca de
    // presencia del paciente queda automática en el mismo instante.
    await connection.execute(
      `UPDATE Cita
       SET checkin_profesional = ?,
           checkin_paciente = COALESCE(checkin_paciente, ?),
           estado = 'EN_CURSO',
           episodio_clinico_id = COALESCE(episodio_clinico_id, ?)
       WHERE cita_id = ?`,
      [marcaInicio, marcaInicio, episodioVinculado, cita_id]
    );

    // CU39: en domicilio, GPS del profesional y ubicación del paciente.
    const presencialidad = await C_Validador_Presencialidad.registrarMarcaPresencial(connection, cita, 'INICIO', req.body);

    await registrarAuditoria(connection, req, 'INICIAR_ATENCION_CU38', {
      cita_id: Number(cita_id),
      marca_inicio: marcaInicio.toISOString(),
      inicio_agendado: cita.fecha_hora_inicio,
      termino_agendado_original: cita.fecha_hora_fin,
      inicio_anticipado: inicioAnticipado,
      origen_marca: marcaManual ? 'MANUAL_JUSTIFICADA' : 'SERVIDOR',
      justificacion_manual: marcaManual
        ? String(justificacion_manual).trim()
        : null,
      presencialidad
    });

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Atencion iniciada correctamente.',
      presencialidad,
      aviso_presencialidad: C_Validador_Presencialidad.resumenMarca(presencialidad),
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

// CU38 — Registrando marcas temporales de la prestación
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

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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

    // CU39: ubicación de ambos al término (domicilio).
    const presencialidad = await C_Validador_Presencialidad.registrarMarcaPresencial(connection, cita, 'TERMINO', req.body);

    // CU20: la cita pasa a REALIZADA
    await connection.execute(
      `UPDATE Cita
       SET fecha_hora_fin = ?,
           estado = 'REALIZADA'
       WHERE cita_id = ?`,
      [marcaTermino, cita_id]
    );

    // CU76 — Al concretarse la sesión, se descuenta del paquete del paciente
    // (mismo efecto que finalizar por la máquina de estados).
    const inventario = await C_Motor_Agendamiento.descontarSesionPaquete(
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
      inventario,
      presencialidad
    });

    // CU40: la sesión queda pendiente de documentar si no está firmada
    // Corrección Inc 4 (punto 7): si la sesión todavía no tiene su registro
    // clínico firmado, queda pendiente de documentar. El profesional elige
    // hacerlo ahora o al final de la jornada; mientras tanto la sesión
    // clínica sigue editable aunque la cita ya esté REALIZADA.
    const [[documentada]] = await connection.execute(
      `SELECT 1 AS si FROM Evolucion_Clinica
        WHERE episodio_clinico_id = ? AND profesional_id = ? AND inalterable = 1
          AND hora_firma_digital >= ?
        LIMIT 1`,
      [cita.episodio_clinico_id || 0, cita.profesional_id, marcaInicio]
    );
    const documentacionPendiente = Boolean(cita.episodio_clinico_id) && !documentada;
    if (documentacionPendiente) {
      await connection.execute(`UPDATE Cita SET documentacion_pendiente = TRUE WHERE cita_id = ?`, [cita_id]);
    }

    // CU55: el paciente recibe el aviso para calificar la sesión.
    await C_Motor_Agendamiento.pedirEvaluacion(connection, cita_id);

    await connection.commit();

    // CU44: cerrar la atención es uno de los eventos que refrescan los
    // indicadores del paciente. Fuera de la transacción y sin esperar.
    C_Motor_Clinico.actualizarIndicador(C_Capa_de_Acceso_a_Datos, cita.paciente_id).catch(() => {});

    // CU41: certificación automática (o pedido de cierre justificado).
    let certificacion = null;
    try {
      certificacion = await certificarAlFinalizar(req, cita_id);
    } catch (errorCertificacion) {
      console.error('[finalizarAtencion] certificación pendiente:', errorCertificacion.message);
    }

    return res.status(200).json({
      mensaje: 'Atencion finalizada correctamente.',
      cita_id: Number(cita_id),
      estado: 'REALIZADA',
      marca_inicio: marcaInicio,
      marca_termino: marcaTermino,
      duracion_minutos: duracionMinutos,
      inventario,
      presencialidad,
      certificacion,
      documentacion_pendiente: documentacionPendiente,
      episodio_clinico_id: cita.episodio_clinico_id || null,
      paciente_id: cita.paciente_id,
      paciente: cita.paciente
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
// CU38 — Registrando marcas temporales de la prestación
exports.atencionEnCurso = async (req, res) => {
  try {
    const [filas] = await C_Capa_de_Acceso_a_Datos.execute(
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

// ─────────────────────────────────────────────────────────────────────────────
//  Corrección Inc 4 (punto 7) — Sesiones realizadas pendientes de documentar
//  GET /citas/documentacion-pendiente
//  Las que el profesional dejó para el final de la jornada (o que finalizó sin
//  firmar el registro clínico). Se muestran en Mi Jornada.
// ─────────────────────────────────────────────────────────────────────────────
// CU38, CU40 — sesiones realizadas que el profesional aún no documenta
exports.documentacionPendiente = async (req, res) => {
  try {
    const [citas] = await C_Capa_de_Acceso_a_Datos.execute(
      `SELECT c.cita_id, c.fecha_hora_inicio, c.fecha_hora_fin, c.paciente_id, c.episodio_clinico_id,
              ec.motivo_consulta,
              COALESCE(CONCAT(u.nombres, ' ', u.apellido_paterno), CONCAT('Paciente #', c.paciente_id)) AS paciente
         FROM Cita c
         JOIN Profesional p ON p.profesional_id = c.profesional_id
         LEFT JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = c.episodio_clinico_id
         LEFT JOIN Paciente pa ON pa.paciente_id = c.paciente_id
         LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
        WHERE p.usuario_id = ? AND c.estado = 'REALIZADA' AND c.documentacion_pendiente = TRUE
        ORDER BY c.fecha_hora_fin ASC
        LIMIT 50`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ citas });
  } catch (error) {
    console.error('[documentacionPendiente]', error);
    return res.status(500).json({ error: 'No se pudieron consultar las sesiones pendientes de documentar.' });
  }
};
