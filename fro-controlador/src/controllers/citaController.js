const pool = require('../config/database');
const {
  leerParametroEntero,
  registrarTrazabilidadAgenda,
  obtenerTrazabilidadCita,
  notificarUsuario,
  obtenerContactosCita,
  descontarSesionPaquete,
  notificarListaEspera,
} = require('../services/agenda/agendaService');

// ─────────────────────────────────────────────────────────────────────────────
//   CU14 — Buscar disponibilidad
// ─────────────────────────────────────────────────────────────────────────────

exports.obtenerEspecialidades = async (req, res) => {
  try {
    const [especialidades] = await pool.query(
      `SELECT especialidad_id, nombre, descripcion
       FROM Especialidad
       ORDER BY nombre ASC`
    );
    return res.status(200).json({ data: especialidades });
  } catch (error) {
    console.error('[obtenerEspecialidades]', error);
    return res.status(500).json({ error: 'Error interno al obtener especialidades.' });
  }
};

/**
 * Formatea una fecha como texto DATETIME de MySQL usando la hora local del
 * proceso (hora de pared chilena). No usar toISOString(): convierte a UTC y
 * desplaza la hora.
 */
function aTextoSQL(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())} ` +
    `${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}`
  );
}

exports.buscarDisponibilidad = async (req, res) => {
  const { especialidad_id, tipo_sede, fecha } = req.query;

  if (!especialidad_id || !tipo_sede || !fecha) {
    return res.status(400).json({ error: 'Debe indicar especialidad, modalidad y fecha.' });
  }

  try {
    const fechaObj  = new Date(`${fecha}T00:00:00`);
    const diaSemana = fechaObj.getDay() === 0 ? 7 : fechaObj.getDay();

    const [filas] = await pool.query(
      `SELECT
          p.profesional_id,
          u.nombres, u.apellido_paterno, u.apellido_materno,
          e.nombre AS especialidad,
          s.sede_id, s.nombre AS sede_nombre,
          pd.hora_inicio, pd.hora_fin, pd.modalidad,
          -- CU10: catálogo público del profesional
          p.foto_url, p.reseña_curricular AS resena_curricular, p.areas_experticia
       FROM Profesional_Disponibilidad pd
       JOIN Profesional p  ON pd.profesional_id  = p.profesional_id
       JOIN Usuario     u  ON p.usuario_id        = u.usuario_id
       JOIN Especialidad e ON p.especialidad_id   = e.especialidad_id
       JOIN Sede         s ON s.estado_sede        = 1
       WHERE p.especialidad_id = ?
         AND pd.dia_semana     = ?
         AND u.cuenta_activo   = TRUE`,
      [especialidad_id, diaSemana]
    );

    const disponibilidad = [];

    for (const fila of filas) {
      // La modalidad la define cada bloque horario del profesional.
      // Un bloque 'AMBOS' sirve tanto para búsquedas online como a domicilio.
      const modalidadBloque = fila.modalidad || 'DOMICILIO';

      if (
        tipo_sede !== 'AMBOS' &&
        modalidadBloque !== 'AMBOS' &&
        modalidadBloque !== tipo_sede
      ) continue;

      // Lo que se informa al paciente: si el bloque acepta ambas modalidades
      // y él buscó una específica, la cita queda en la que él pidió.
      const modalidad =
        modalidadBloque === 'AMBOS' && tipo_sede !== 'AMBOS' ? tipo_sede : modalidadBloque;

      const horaInicio  = String(fila.hora_inicio).slice(0, 5);
      const horaFin     = String(fila.hora_fin).slice(0, 5);
      let   horaActual  = Number(horaInicio.split(':')[0]);
      const horaLimite  = Number(horaFin.split(':')[0]);

      while (horaActual < horaLimite) {
        const bloqueInicio    = `${String(horaActual).padStart(2, '0')}:00:00`;
        const bloqueFin       = `${String(horaActual + 1).padStart(2, '0')}:00:00`;
        const fechaHoraInicio = `${fecha} ${bloqueInicio}`;
        const fechaHoraFin    = `${fecha} ${bloqueFin}`;

        // 1. Validar choque con citas existentes
        const [ocupadas] = await pool.query(
          `SELECT cita_id FROM Cita
           WHERE profesional_id = ?
             AND estado NOT LIKE 'CANCELADA%'
             AND fecha_hora_inicio < ?
             AND fecha_hora_fin    > ?`,
          [fila.profesional_id, fechaHoraFin, fechaHoraInicio]
        );

        // 2. NUEVA VALIDACIÓN: Choque con bloqueos de agenda (CU16)
        const [bloqueos] = await pool.query(
          `SELECT bloqueo_id FROM Bloqueo_Agenda
           WHERE profesional_id = ?
             AND fecha_inicio <= ?
             AND fecha_fin >= ?`,
          [fila.profesional_id, fechaHoraFin, fechaHoraInicio]
        );

        // 3. Solo agregar si NO hay citas NI bloqueos en ese horario
        if (ocupadas.length === 0 && bloqueos.length === 0) {
          disponibilidad.push({
            profesional_id:  fila.profesional_id,
            sede_id:         fila.sede_id,
            nombres:         fila.nombres,
            apellido_paterno: fila.apellido_paterno,
            apellido_materno: fila.apellido_materno,
            especialidad:    fila.especialidad,
            tipo_sede:       modalidad,
            foto_url:        fila.foto_url && fila.foto_url !== 'default.jpg' ? fila.foto_url : null,
            resena_curricular: fila.resena_curricular || null,
            areas_experticia: fila.areas_experticia || null,
            fecha,
            hora_inicio:     bloqueInicio,
            hora_fin:        bloqueFin,
          });
        }
        horaActual++;
      }
    }

    return res.status(200).json({ data: disponibilidad });
  } catch (error) {
    console.error('[buscarDisponibilidad]', error);
    return res.status(500).json({ error: 'Error interno al buscar disponibilidad.' });
  }
};

exports.validarBloque = async (req, res) => {
  const { profesional_id, fecha_hora_inicio } = req.body;

  if (!profesional_id || !fecha_hora_inicio) {
    return res.status(400).json({ error: 'Debe indicar profesional y fecha/hora de inicio.' });
  }

  try {
    const inicio       = new Date(fecha_hora_inicio);
    const fin          = new Date(inicio.getTime() + 60 * 60 * 1000);
    // Hora de pared, no UTC: toISOString() desplazaba el término de la cita
    // según el huso del servidor y hacía fallar la comparación contra la base.
    const fechaHoraFin = aTextoSQL(fin);

    const [ocupadas] = await pool.query(
      `SELECT cita_id FROM Cita
       WHERE profesional_id = ?
         AND estado NOT LIKE 'CANCELADA%'
         AND fecha_hora_inicio < ?
         AND fecha_hora_fin    > ?`,
      [profesional_id, fechaHoraFin, fecha_hora_inicio]
    );

    return res.status(200).json({ disponible: ocupadas.length === 0 });
  } catch (error) {
    console.error('[validarBloque]', error);
    return res.status(500).json({ error: 'Error interno al validar el bloque.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//   CU15 — Bloquear horario
// ─────────────────────────────────────────────────────────────────────────────

exports.obtenerProfesionales = async (req, res) => {
  try {
    const [profesionales] = await pool.query(
      `SELECT p.profesional_id, u.nombres, u.apellido_paterno,
              e.nombre AS especialidad, p.calificacion_promedio
       FROM Profesional p
       JOIN Usuario     u  ON p.usuario_id       = u.usuario_id
       JOIN Especialidad e ON p.especialidad_id  = e.especialidad_id
       WHERE u.cuenta_activo = TRUE`
    );
    return res.status(200).json(profesionales);
  } catch (error) {
    console.error('[obtenerProfesionales]', error);
    return res.status(500).json({ error: 'Error interno al obtener profesionales.' });
  }
};

exports.obtenerDisponibilidad = async (req, res) => {
  const { profesional_id } = req.params;

  try {
    const [bloques] = await pool.query(
      `SELECT pd.dia_semana, pd.hora_inicio, pd.hora_fin,
              p.profesional_id,
              u.nombres, u.apellido_paterno,
              e.nombre AS especialidad
       FROM Profesional_Disponibilidad pd
       JOIN Profesional  p ON pd.profesional_id = p.profesional_id
       JOIN Usuario      u ON p.usuario_id       = u.usuario_id
       JOIN Especialidad e ON p.especialidad_id  = e.especialidad_id
       WHERE pd.profesional_id = ?`,
      [profesional_id]
    );

    if (bloques.length === 0) {
      return res.status(404).json({ error: 'No se encontró disponibilidad para este profesional.' });
    }

    return res.status(200).json(bloques);
  } catch (error) {
    console.error('[obtenerDisponibilidad]', error);
    return res.status(500).json({ error: 'Error interno al obtener disponibilidad.' });
  }
};

exports.bloquearHorario = async (req, res) => {
  const { profesional_id, sede_id, fecha_hora_inicio, fecha_hora_fin } = req.body;

  if (!profesional_id || !sede_id || !fecha_hora_inicio || !fecha_hora_fin) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [pacienteRows] = await connection.execute(
      `SELECT paciente_id FROM Paciente WHERE usuario_id = ?`,
      [req.user.usuario_id]
    );

    if (pacienteRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'No se encontró el perfil de paciente.' });
    }

    const paciente_id_real = pacienteRows[0].paciente_id;

    const [citasExistentes] = await connection.execute(
      `SELECT cita_id, estado FROM Cita
       WHERE profesional_id = ?
         AND estado NOT LIKE 'CANCELADA%'
         AND (
           (fecha_hora_inicio < ? AND fecha_hora_fin  > ?)
           OR
           (fecha_hora_inicio >= ? AND fecha_hora_inicio < ?)
         )
       FOR UPDATE`,
      [profesional_id, fecha_hora_fin, fecha_hora_inicio, fecha_hora_inicio, fecha_hora_fin]
    );

    if (citasExistentes.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        error:   'BLOQUE_OCUPADO',
        mensaje: 'Este horario acaba de ser reservado por otro paciente. Por favor selecciona un bloque alternativo.',
      });
    }

    // CU39/CU43: la modalidad efectiva de la cita se persiste para saber qué
    // evidencia corresponde (GPS domiciliario o metadatos de teleconsulta).
    const modalidadCita = ['DOMICILIO', 'ONLINE'].includes(req.body?.modalidad)
      ? req.body.modalidad
      : null;

    const [result] = await connection.execute(
      `INSERT INTO Cita
         (fecha_hora_inicio, fecha_hora_fin, estado, modalidad, paciente_id, profesional_id, sede_id)
       VALUES (?, ?, 'AGENDADA', ?, ?, ?, ?)`,
      [fecha_hora_inicio, fecha_hora_fin, modalidadCita, paciente_id_real, profesional_id, sede_id]
    );

    await connection.commit();

    return res.status(201).json({
      mensaje:  'Bloque horario reservado exitosamente.',
      cita_id:  result.insertId,
      estado:   'AGENDADA',
    });
  } catch (error) {
    await connection.rollback();

    // Excepción 3 CP15-03: pérdida de conexión durante la transacción
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      return res.status(503).json({
        error: 'CONEXION_PERDIDA',
        mensaje: 'Se perdió la conexión durante el proceso. La operación fue abortada y revertida.'
      });
    }

    console.error('[bloquearHorario]', error);
    return res.status(500).json({ error: 'Error interno al bloquear el horario.' });

  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//   CU20 — Transicionando máquina de estados de cita
// ─────────────────────────────────────────────────────────────────────────────

// RF20 / D2: siete estados. La cancelación distingue quién la ejecutó; el
// evento CANCELAR se resuelve al estado según el rol del actor.
const TRANSICIONES = {
  AGENDADA:   { CONFIRMAR: 'CONFIRMADA', CANCELAR: 'CANCELAR' },
  CONFIRMADA: { INICIAR: 'EN_CURSO',    CANCELAR: 'CANCELAR', REGISTRAR_INASISTENCIA: 'INASISTENCIA' },
  EN_CURSO:   { FINALIZAR: 'REALIZADA' },
};

// 'CANCELADA' a secas quedó de citas anteriores a la separación; sigue
// siendo terminal para que nada la reabra.
const ESTADOS_TERMINALES = new Set([
  'REALIZADA', 'INASISTENCIA', 'CANCELADA_PACIENTE', 'CANCELADA_PROFESIONAL', 'CANCELADA',
]);

const esCancelada = (estado) => String(estado || '').startsWith('CANCELADA');

function estadoCancelacion(rolActor) {
  return rolActor === 'Paciente' ? 'CANCELADA_PACIENTE' : 'CANCELADA_PROFESIONAL';
}

function evaluarMaquinaEstados(estadoActual, evento, rolActor) {
  if (ESTADOS_TERMINALES.has(estadoActual)) {
    const err = new Error(
      `Acción no permitida: la cita ya se encuentra en estado terminal "${estadoActual}".`
    );
    err.code = 'ESTADO_TERMINAL';
    throw err;
  }

  const siguiente = TRANSICIONES[estadoActual]?.[evento];
  if (!siguiente) {
    const err = new Error(
      `Transición inválida: el evento "${evento}" no está permitido desde el estado "${estadoActual}".`
    );
    err.code = 'TRANSICION_INVALIDA';
    throw err;
  }

  return siguiente === 'CANCELAR' ? estadoCancelacion(rolActor) : siguiente;
}

/**
 * POST /citas/:id/transicionar
 *
 * CU20 (máquina de estados) ampliado por el Incremento 2:
 * - CU22: toda transición queda en la bitácora con responsable y motivo;
 *         cancelar exige motivo.
 * - CU18: al cancelar, el bloque se libera y se avisa a la lista de espera.
 * - CU76: al finalizar se descuenta una sesión del paquete del paciente;
 *         la inasistencia aplica la misma penalización.
 */
exports.transicionarEstadoCita = async (req, res) => {
  const { id } = req.params;
  const { evento } = req.body;
  const motivo = String(req.body?.motivo || '').trim();
  const rolActor = req.user?.nombre_rol || '';

  if (!evento) {
    return res.status(400).json({ error: 'El campo "evento" es requerido.' });
  }

  // CU22 — Excepción 3: una cancelación sin justificación no se guarda.
  if (evento === 'CANCELAR' && !motivo) {
    return res.status(400).json({
      error: 'MOTIVO_REQUERIDO',
      mensaje: 'Debes indicar el motivo de la cancelación.',
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Leer la cita completa (bloqueada para evitar carreras)
    const [rows] = await connection.execute(
      `SELECT cita_id, estado, fecha_hora_inicio, paciente_id, profesional_id
         FROM Cita WHERE cita_id = ? LIMIT 1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Cita con id "${id}" no encontrada.` });
    }

    const cita = rows[0];
    const estado_anterior = cita.estado;

    // Solo el profesional o el paciente de la cita pueden moverla de estado.
    // Antes bastaba con conocer el id: otro profesional podia confirmar,
    // iniciar o cancelar citas ajenas desde la ficha del paciente.
    if (rolActor === 'Profesional') {
      const [[dueno]] = await connection.execute(
        `SELECT 1 AS ok FROM Profesional WHERE profesional_id = ? AND usuario_id = ? LIMIT 1`,
        [cita.profesional_id, req.user.usuario_id]
      );
      if (!dueno) {
        await connection.rollback();
        return res.status(403).json({
          error: 'CITA_AJENA',
          mensaje: 'Esta cita pertenece a otro profesional. Solo puedes gestionar tus propias citas.',
        });
      }
    } else if (rolActor === 'Paciente') {
      const [[dueno]] = await connection.execute(
        `SELECT 1 AS ok FROM Paciente WHERE paciente_id = ? AND usuario_id = ? LIMIT 1`,
        [cita.paciente_id, req.user.usuario_id]
      );
      if (!dueno) {
        await connection.rollback();
        return res.status(403).json({
          error: 'CITA_AJENA',
          mensaje: 'Esta cita no es tuya.',
        });
      }
    }

    // 2. Evaluar máquina de estados
    const nuevo_estado = evaluarMaquinaEstados(estado_anterior, evento, rolActor);

    // CU18 — Excepción 1: el paciente solo puede cancelar dentro del plazo
    // reglamentario (parámetro editable por el administrador).
    if (evento === 'CANCELAR' && rolActor === 'Paciente') {
      const horasMinimas = await leerParametroEntero(
        connection, 'ANTICIPACION_MINIMA_CANCELACION_HORAS', 2
      );
      const horasRestantes =
        (new Date(cita.fecha_hora_inicio).getTime() - Date.now()) / 3600000;

      if (horasRestantes < horasMinimas) {
        await connection.rollback();
        return res.status(409).json({
          error: 'FUERA_DE_PLAZO',
          mensaje: `Las citas solo pueden cancelarse con al menos ${horasMinimas} horas de anticipación. Contacta directamente al centro.`,
        });
      }
    }

    // 3. Persistir nuevo estado (y el motivo cuando corresponde)
    const [updateResult] = await connection.execute(
      evento === 'CANCELAR'
        ? `UPDATE Cita SET estado = ?, motivo_cancelacion = ? WHERE cita_id = ?`
        : `UPDATE Cita SET estado = ? WHERE cita_id = ?`,
      evento === 'CANCELAR' ? [nuevo_estado, motivo, id] : [nuevo_estado, id]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      const err = new Error('Fallo de persistencia: no se actualizaron filas.');
      err.code = 'PERSIST_FAIL';
      throw err;
    }

    // 4. CU76 — Descuento del inventario de sesiones. La inasistencia
    //    consume la sesión igual (penalización, Excepción 3 del CU76).
    let inventario = null;
    if (nuevo_estado === 'REALIZADA' || nuevo_estado === 'INASISTENCIA') {
      inventario = await descontarSesionPaquete(
        connection,
        cita.paciente_id,
        nuevo_estado === 'INASISTENCIA' ? 'PENALIZACION_INASISTENCIA' : 'SESION_REALIZADA'
      );
    }

    // 5. CU22 — Trazabilidad con responsable y motivo (dentro de la
    //    transacción: si el log no se puede guardar, la operación se anula,
    //    porque la agenda de un sistema clínico no puede cambiar sin rastro).
    await registrarTrazabilidadAgenda(connection, req, {
      accion: 'TRANSICION_CITA',
      cita_id: id,
      estado_anterior,
      nuevo_estado,
      evento,
      motivo: motivo || null,
      rol_actor: rolActor || null,
      inventario,
    });

    // 6. Avisos (tolerantes a fallo: no revierten la transición)
    const contactos = await obtenerContactosCita(connection, id);
    let cupos_notificados = 0;

    if (contactos) {
      const texto =
        evento === 'CANCELAR'
          ? `Tu cita fue cancelada. Motivo: ${motivo}`
          : `El estado de tu cita cambió a: ${nuevo_estado}`;
      await notificarUsuario(connection, contactos.usuario_paciente, 'CAMBIO_ESTADO_CITA', texto);
      await notificarUsuario(connection, contactos.usuario_profesional, 'CAMBIO_ESTADO_CITA', texto);
    }

    // CU18 — al liberarse el bloque, avisar a la lista de espera.
    if (esCancelada(nuevo_estado)) {
      cupos_notificados = await notificarListaEspera(connection, id);
    }

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Estado de cita actualizado correctamente.',
      cita_id: id,
      estado_anterior,
      nuevo_estado,
      inventario,
      cupos_notificados,
    });

  } catch (err) {
    await connection.rollback();

    if (err.code === 'ESTADO_TERMINAL') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    if (err.code === 'TRANSICION_INVALIDA') {
      return res.status(422).json({ error: err.message, code: err.code });
    }

    console.error('[transicionarEstadoCita]', err);
    return res.status(500).json({
      error: 'Error crítico detectado en la base de datos.',
      code: 'PERSIST_FAIL',
    });

  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//   CU17 — Reprogramación de cita
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /citas/:id/reprogramar   { fecha_hora_inicio, fecha_hora_fin, motivo }
 */
exports.reprogramarCita = async (req, res) => {
  const { id } = req.params;
  const { fecha_hora_inicio, fecha_hora_fin } = req.body;
  const motivo = String(req.body?.motivo || '').trim();
  const rolActor = req.user?.nombre_rol || '';

  if (!fecha_hora_inicio || !fecha_hora_fin) {
    return res.status(400).json({ error: 'Debes indicar el nuevo bloque horario.' });
  }
  // CU22 — Excepción 3: sin justificación no hay cambio.
  if (!motivo) {
    return res.status(400).json({
      error: 'MOTIVO_REQUERIDO',
      mensaje: 'Debes indicar el motivo de la reprogramación.',
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT c.cita_id, c.estado, c.fecha_hora_inicio, c.fecha_hora_fin,
              c.paciente_id, c.profesional_id
         FROM Cita c WHERE c.cita_id = ? LIMIT 1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Cita con id "${id}" no encontrada.` });
    }

    const cita = rows[0];

    // Excepción 1 (CU17): una cita terminal no se puede modificar.
    if (ESTADOS_TERMINALES.has(cita.estado)) {
      await connection.rollback();
      return res.status(409).json({
        error: 'ESTADO_TERMINAL',
        mensaje: `La cita ya está ${cita.estado.toLowerCase()} y no puede modificarse.`,
      });
    }
    if (cita.estado === 'EN_CURSO') {
      await connection.rollback();
      return res.status(409).json({
        error: 'CITA_EN_CURSO',
        mensaje: 'Una atención en curso no puede reprogramarse.',
      });
    }

    // Excepción 2 (CU17): plazo mínimo de anticipación, parametrizado.
    // Aplica al paciente; el profesional gestiona su propia agenda.
    if (rolActor === 'Paciente') {
      const horasMinimas = await leerParametroEntero(
        connection, 'ANTICIPACION_MINIMA_REPROGRAMACION_HORAS', 24
      );
      const horasRestantes =
        (new Date(cita.fecha_hora_inicio).getTime() - Date.now()) / 3600000;

      if (horasRestantes < horasMinimas) {
        await connection.rollback();
        return res.status(409).json({
          error: 'FUERA_DE_PLAZO',
          mensaje: `Las citas solo pueden reprogramarse con al menos ${horasMinimas} horas de anticipación. Contacta directamente al centro.`,
        });
      }
    }

    // Excepción 3 (CU17): el nuevo bloque puede haber sido tomado por otro
    // proceso; se verifica dentro de la transacción para detectar la colisión.
    const [ocupadas] = await connection.execute(
      `SELECT cita_id FROM Cita
        WHERE profesional_id = ?
          AND cita_id <> ?
          AND estado NOT LIKE 'CANCELADA%'
          AND fecha_hora_inicio < ?
          AND fecha_hora_fin    > ?
        FOR UPDATE`,
      [cita.profesional_id, id, fecha_hora_fin, fecha_hora_inicio]
    );

    if (ocupadas.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        error: 'BLOQUE_OCUPADO',
        mensaje: 'El horario elegido acaba de ser tomado por otra persona. Elige otro bloque.',
      });
    }

    // El nuevo bloque tampoco puede caer en un periodo bloqueado (vacaciones).
    const [bloqueos] = await connection.execute(
      `SELECT bloqueo_id FROM Bloqueo_Agenda
        WHERE profesional_id = ?
          AND fecha_inicio <= ?
          AND fecha_fin    >= ?`,
      [cita.profesional_id, fecha_hora_fin, fecha_hora_inicio]
    );

    if (bloqueos.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        error: 'AGENDA_BLOQUEADA',
        mensaje: 'El profesional no atiende en la fecha elegida. Elige otro bloque.',
      });
    }

    const bloqueAnterior = {
      fecha_hora_inicio: cita.fecha_hora_inicio,
      fecha_hora_fin: cita.fecha_hora_fin,
    };

    // La cita reprogramada vuelve a AGENDADA: el nuevo horario
    // debe confirmarse otra vez.
    await connection.execute(
      `UPDATE Cita
          SET fecha_hora_inicio = ?, fecha_hora_fin = ?, estado = 'AGENDADA'
        WHERE cita_id = ?`,
      [fecha_hora_inicio, fecha_hora_fin, id]
    );

    // CU22 — la reprogramación queda trazada con ambos bloques y el motivo.
    await registrarTrazabilidadAgenda(connection, req, {
      accion: 'REPROGRAMACION_CITA',
      cita_id: id,
      estado_anterior: cita.estado,
      nuevo_estado: 'AGENDADA',
      motivo,
      rol_actor: rolActor || null,
      bloque_anterior: bloqueAnterior,
      bloque_nuevo: { fecha_hora_inicio, fecha_hora_fin },
    });

    // Excepción 4 (CU17): si el aviso falla, el cambio se mantiene igual.
    const contactos = await obtenerContactosCita(connection, id);
    if (contactos) {
      const texto = `Tu cita fue reprogramada para ${fecha_hora_inicio}. Motivo: ${motivo}`;
      await notificarUsuario(connection, contactos.usuario_paciente, 'CITA_REPROGRAMADA', texto);
      await notificarUsuario(connection, contactos.usuario_profesional, 'CITA_REPROGRAMADA', texto);
    }

    await connection.commit();

    return res.status(200).json({
      mensaje: 'Cita reprogramada correctamente. El nuevo horario queda pendiente de confirmación.',
      cita_id: Number(id),
      bloque_anterior: bloqueAnterior,
      bloque_nuevo: { fecha_hora_inicio, fecha_hora_fin },
      nuevo_estado: 'AGENDADA',
    });

  } catch (error) {
    await connection.rollback();
    console.error('[reprogramarCita]', error);
    return res.status(500).json({ error: 'Error interno al reprogramar la cita.' });
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//   CU22 — Consulta del historial de una cita
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /citas/:id/trazabilidad
 */
exports.trazabilidadCita = async (req, res) => {
  const { id } = req.params;
  try {
    const eventos = await obtenerTrazabilidadCita(pool, id);
    return res.status(200).json({ cita_id: Number(id), eventos });
  } catch (error) {
    console.error('[trazabilidadCita]', error);
    return res.status(500).json({ error: 'Error interno al consultar la trazabilidad.' });
  }
};

/**
 * GET /citas/:id/estado
 */
exports.obtenerEstadoCita = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT cita_id, estado FROM Cita WHERE cita_id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: `Cita con id "${id}" no encontrada.` });
    }
    return res.status(200).json(rows[0]);
  } catch (error) {
    console.error('[obtenerEstadoCita]', error);
    return res.status(500).json({ error: 'Error interno al consultar el estado.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//   CU20 — Listar citas por Rol (Paciente / Profesional)
// ─────────────────────────────────────────────────────────────────────────────

exports.obtenerCitasPaciente = async (req, res) => {
  const usuario_id = req.user?.usuario_id;

  try {
    const [citas] = await pool.query(
      `SELECT 
          c.cita_id, 
          c.fecha_hora_inicio, 
          c.fecha_hora_fin, 
          c.estado,
          COALESCE(c.modalidad, NULLIF(prof.tipo_sede, 'AMBOS')) AS modalidad,
          CONCAT(u_pac.nombres, ' ', u_pac.apellido_paterno) AS nombre_paciente,
          CONCAT(u_prof.nombres, ' ', u_prof.apellido_paterno) AS nombre_profesional
       FROM Cita c
       JOIN Paciente pac      ON c.paciente_id = pac.paciente_id
       JOIN Usuario u_pac     ON pac.usuario_id = u_pac.usuario_id
       JOIN Profesional prof  ON c.profesional_id = prof.profesional_id
       JOIN Usuario u_prof    ON prof.usuario_id = u_prof.usuario_id
       WHERE pac.usuario_id = ?
       ORDER BY c.fecha_hora_inicio ASC`,
      [usuario_id]
    );

    return res.status(200).json(citas);
  } catch (error) {
    console.error('[obtenerCitasPaciente]', error);
    return res.status(500).json({ error: 'Error interno al obtener las citas del paciente.' });
  }
};

exports.obtenerCitasProfesional = async (req, res) => {
  const usuario_id = req.user?.usuario_id;

  try {
    const [citas] = await pool.query(
      `SELECT 
          c.cita_id, 
          c.fecha_hora_inicio, 
          c.fecha_hora_fin, 
          c.estado,
          COALESCE(c.modalidad, NULLIF(prof.tipo_sede, 'AMBOS')) AS modalidad,
          CONCAT(u_pac.nombres, ' ', u_pac.apellido_paterno) AS nombre_paciente,
          CONCAT(u_prof.nombres, ' ', u_prof.apellido_paterno) AS nombre_profesional
       FROM Cita c
       JOIN Paciente pac      ON c.paciente_id = pac.paciente_id
       JOIN Usuario u_pac     ON pac.usuario_id = u_pac.usuario_id
       JOIN Profesional prof  ON c.profesional_id = prof.profesional_id
       JOIN Usuario u_prof    ON prof.usuario_id = u_prof.usuario_id
       WHERE prof.usuario_id = ?
       ORDER BY c.fecha_hora_inicio ASC`,
      [usuario_id]
    );

    return res.status(200).json(citas);
  } catch (error) {
    console.error('[obtenerCitasProfesional]', error);
    return res.status(500).json({ error: 'Error interno al obtener las citas asignadas al profesional.' });
  }
};