/**
 * Componente: C_API_REST
 * Casos de uso: CU65, CU52.
 *
 * CU65 — Registrando y siguiendo derivaciones internas (Incremento 4).
 *
 * Desde la ficha, el profesional a cargo de un episodio ABIERTO lo deriva a
 * otra especialidad y a un profesional concreto (D6), con una justificación
 * obligatoria. Derivar es TRASPASAR el episodio:
 *
 *   - PENDIENTE: el receptor puede leer la ficha para decidir.
 *   - ACEPTADA: el episodio pasa a ser del receptor (Episodio_Clinico.
 *     profesional_id), que trabaja en él con normalidad; quien derivó lo
 *     conserva en solo lectura (ver accesoClinicoService).
 *   - RECHAZADA: el episodio sigue con quien lo derivó.
 *   - CERRADA: se canceló estando pendiente o se cerró el episodio.
 *
 * Un episodio admite una sola derivación pendiente a la vez.
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Despachador_Notificaciones = require('../../componentes/C_Despachador_Notificaciones');
const C_Motor_Clinico = require('../../componentes/C_Motor_Clinico');
const C_Control_Acceso_Clinico = require('../../componentes/C_Control_Acceso_Clinico');

const LARGO_MINIMO_JUSTIFICACION = 10;
const LARGO_MAXIMO_JUSTIFICACION = 255;

// Apoyo común: IP de origen para la bitácora
function obtenerIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
}

// CU65: traza de cada paso de la derivación en la bitácora de auditoría
async function auditar(conexion, req, accion, datos) {
  await conexion.query(
    `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
     VALUES (?, 'Derivacion_Interna', ?, ?, ?)`,
    [accion, obtenerIP(req), JSON.stringify(datos), req.user?.usuario_id || null]
  );
}

// Apoyo común: profesional asociado a la cuenta en sesión
async function profesionalDelUsuario(conexion, usuarioId) {
  const [[fila]] = await conexion.query(
    `SELECT pr.profesional_id, pr.especialidad_id,
            CONCAT(u.nombres, ' ', u.apellido_paterno) AS nombre
       FROM Profesional pr JOIN Usuario u ON u.usuario_id = pr.usuario_id
      WHERE pr.usuario_id = ? LIMIT 1`,
    [usuarioId]
  );
  return fila || null;
}

/**
 * CU65 — Registrando y Siguiendo Derivaciones Internas
 * Comprueba que quien deriva sea el profesional a cargo y que el episodio
 * siga abierto. Responde y devuelve null si no corresponde.
 */
async function episodioDerivable(req, res) {
  const episodio = await C_Motor_Clinico.obtenerEpisodio(C_Capa_de_Acceso_a_Datos, req.params.episodio_id);
  if (!episodio) {
    res.status(404).json({ error: 'EPISODIO_NO_ENCONTRADO', mensaje: 'El episodio clínico no existe.' });
    return null;
  }
  const propio = await profesionalDelUsuario(C_Capa_de_Acceso_a_Datos, req.user.usuario_id);
  if (!propio || Number(propio.profesional_id) !== Number(episodio.profesional_id)) {
    res.status(403).json({
      error: 'EPISODIO_AJENO',
      mensaje: 'Solo el profesional a cargo del episodio puede derivarlo.',
    });
    return null;
  }
  // Excepción 1: un episodio cerrado es inalterable; la derivación va en uno nuevo.
  if (C_Motor_Clinico.estaCerrado(episodio.estado)) {
    res.status(409).json({
      error: 'EPISODIO_INALTERABLE',
      mensaje: 'Este episodio está cerrado y es inalterable. Para derivar al paciente, abre un episodio clínico nuevo.',
    });
    return null;
  }
  return { episodio, propio };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/episodio/:episodio_id/derivaciones/opciones
// Matriz de especialidades con los profesionales que pueden recibir.
// ─────────────────────────────────────────────────────────────────────────────
// CU65 — Registrando y Siguiendo Derivaciones Internas
exports.opciones = async (req, res) => {
  try {
    const contexto = await episodioDerivable(req, res);
    if (!contexto) return;

    const [especialidades] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT especialidad_id, nombre FROM Especialidad ORDER BY nombre`
    );
    const [profesionales] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT pr.profesional_id, pr.especialidad_id, pr.foto_url,
              CONCAT(u.nombres, ' ', u.apellido_paterno) AS nombre
         FROM Profesional pr JOIN Usuario u ON u.usuario_id = pr.usuario_id
        WHERE u.cuenta_activo = TRUE AND pr.profesional_id <> ?
        ORDER BY u.nombres, u.apellido_paterno`,
      [contexto.propio.profesional_id]
    );

    const matriz = especialidades.map((e) => ({
      ...e,
      profesionales: profesionales.filter((p) => p.especialidad_id === e.especialidad_id),
    }));

    // Excepción 2: no hay ninguna especialidad con quién recibir la derivación.
    if (!matriz.some((e) => e.profesionales.length > 0)) {
      return res.status(409).json({
        error: 'SIN_ESPECIALIDADES_DISPONIBLES',
        mensaje: 'No hay especialidades con profesionales disponibles para recibir derivaciones. Solicita su alta al administrador con un ticket de soporte.',
      });
    }

    return res.status(200).json({ especialidades: matriz });
  } catch (error) {
    console.error('[derivaciones.opciones]', error);
    return res.status(500).json({ error: 'No se pudieron cargar las especialidades disponibles.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/episodio/:episodio_id/derivaciones — las del episodio
// ─────────────────────────────────────────────────────────────────────────────
// CU65 — Registrando y Siguiendo Derivaciones Internas
exports.delEpisodio = async (req, res) => {
  try {
    // El profesional solo ve las derivaciones de pacientes a los que tiene
    // acceso; el Administrador ve todas.
    if (req.user?.nombre_rol !== 'Administrador') {
      const episodio = await C_Motor_Clinico.obtenerEpisodio(C_Capa_de_Acceso_a_Datos, req.params.episodio_id);
      if (!episodio || !(await C_Control_Acceso_Clinico.profesionalTratante(C_Capa_de_Acceso_a_Datos, req.user.usuario_id, episodio.paciente_id))) {
        return res.status(404).json({ error: 'EPISODIO_NO_ENCONTRADO', mensaje: 'El episodio clínico no existe o no tienes acceso a él.' });
      }
    }
    const [derivaciones] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT di.derivacion_interna_id, di.estado, di.justificacion, di.momento_creacion,
              di.momento_respuesta, di.comentario_respuesta, di.momento_cierre,
              CONCAT(ud.nombres, ' ', ud.apellido_paterno) AS profesional_destino,
              es.nombre AS especialidad_destino,
              CONCAT(uo.nombres, ' ', uo.apellido_paterno) AS profesional_origen
         FROM Derivacion_Interna di
         JOIN Profesional pd ON pd.profesional_id = di.profesional_destino_id
         JOIN Usuario ud ON ud.usuario_id = pd.usuario_id
         JOIN Especialidad es ON es.especialidad_id = pd.especialidad_id
         JOIN Profesional po ON po.profesional_id = di.profesional_origen_id
         JOIN Usuario uo ON uo.usuario_id = po.usuario_id
        WHERE di.episodio_clinico_id = ?
        ORDER BY di.derivacion_interna_id DESC`,
      [req.params.episodio_id]
    );
    return res.status(200).json({ derivaciones });
  } catch (error) {
    console.error('[derivaciones.delEpisodio]', error);
    return res.status(500).json({ error: 'No se pudieron cargar las derivaciones del episodio.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/episodio/:episodio_id/derivaciones
// { profesional_destino_id, justificacion }
// ─────────────────────────────────────────────────────────────────────────────
// CU65 — Registrando y Siguiendo Derivaciones Internas
exports.crear = async (req, res) => {
  const destinoId = Number(req.body?.profesional_destino_id);
  const justificacion = String(req.body?.justificacion || '').trim();

  // Excepción 3: sin motivo no hay derivación.
  if (justificacion.length < LARGO_MINIMO_JUSTIFICACION) {
    return res.status(400).json({
      error: 'JUSTIFICACION_REQUERIDA',
      campo: 'justificacion',
      mensaje: `Escribe el motivo clínico de la derivación (al menos ${LARGO_MINIMO_JUSTIFICACION} caracteres).`,
    });
  }
  if (justificacion.length > LARGO_MAXIMO_JUSTIFICACION) {
    return res.status(400).json({
      error: 'JUSTIFICACION_MUY_LARGA',
      campo: 'justificacion',
      mensaje: `La justificación admite hasta ${LARGO_MAXIMO_JUSTIFICACION} caracteres.`,
    });
  }
  if (!Number.isInteger(destinoId) || destinoId <= 0) {
    return res.status(400).json({
      error: 'DESTINO_REQUERIDO',
      campo: 'profesional_destino_id',
      mensaje: 'Elige la especialidad y el profesional que recibirá la derivación.',
    });
  }

  let conexion;
  try {
    const contexto = await episodioDerivable(req, res);
    if (!contexto) return;
    const { episodio, propio } = contexto;

    if (destinoId === propio.profesional_id) {
      return res.status(400).json({ error: 'DESTINO_INVALIDO', mensaje: 'No puedes derivarte un episodio a ti mismo.' });
    }
    const [[destino]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT pr.profesional_id, u.usuario_id, es.nombre AS especialidad,
              CONCAT(u.nombres, ' ', u.apellido_paterno) AS nombre
         FROM Profesional pr
         JOIN Usuario u ON u.usuario_id = pr.usuario_id
         JOIN Especialidad es ON es.especialidad_id = pr.especialidad_id
        WHERE pr.profesional_id = ? AND u.cuenta_activo = TRUE LIMIT 1`,
      [destinoId]
    );
    if (!destino) {
      return res.status(404).json({ error: 'DESTINO_NO_DISPONIBLE', mensaje: 'Ese profesional ya no está disponible para recibir derivaciones.' });
    }
    // Una sola derivación pendiente por episodio: si dos receptores aceptaran,
    // el episodio no puede ser de los dos.
    const [[pendiente]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT CONCAT(u.nombres, ' ', u.apellido_paterno) AS nombre
         FROM Derivacion_Interna di
         JOIN Profesional pr ON pr.profesional_id = di.profesional_destino_id
         JOIN Usuario u ON u.usuario_id = pr.usuario_id
        WHERE di.episodio_clinico_id = ? AND di.estado = 'PENDIENTE'
        LIMIT 1`,
      [episodio.episodio_clinico_id]
    );
    if (pendiente) {
      return res.status(409).json({
        error: 'DERIVACION_DUPLICADA',
        mensaje: `Este episodio ya tiene una derivación pendiente a ${pendiente.nombre}. Espera su respuesta o cancélala antes de derivarlo a otra persona.`,
      });
    }

    // Excepción 4: el enlace y su traza se escriben juntos o no se escribe nada.
    conexion = await C_Capa_de_Acceso_a_Datos.getConnection();
    await conexion.beginTransaction();
    const [creada] = await conexion.query(
      `INSERT INTO Derivacion_Interna
         (estado, justificacion, episodio_clinico_id, profesional_origen_id, profesional_destino_id)
       VALUES ('PENDIENTE', ?, ?, ?, ?)`,
      [justificacion, episodio.episodio_clinico_id, propio.profesional_id, destinoId]
    );
    await auditar(conexion, req, 'DERIVACION_INTERNA_REGISTRADA', {
      derivacion_interna_id: creada.insertId,
      episodio_clinico_id: episodio.episodio_clinico_id,
      paciente_id: episodio.paciente_id,
      profesional_origen_id: propio.profesional_id,
      profesional_destino_id: destinoId,
      acceso: 'LECTURA_FICHA_HASTA_RESPONDER',
    });
    await conexion.commit();

    const [[paciente]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT CONCAT(u.nombres, ' ', u.apellido_paterno) AS nombre
         FROM Paciente p JOIN Usuario u ON u.usuario_id = p.usuario_id
        WHERE p.paciente_id = ? LIMIT 1`,
      [episodio.paciente_id]
    );
    // CU52: aviso al profesional que recibe
    await C_Despachador_Notificaciones.notificarUsuario(
      C_Capa_de_Acceso_a_Datos,
      destino.usuario_id,
      'DERIVACION_RECIBIDA',
      `${propio.nombre} te derivó a ${paciente?.nombre || 'un paciente'}: "${justificacion}". Revisa su ficha y acepta para quedar a cargo del episodio.`,
      { datos: { pantalla: 'DerivacionesRecibidas', derivacion_interna_id: creada.insertId } }
    );

    return res.status(201).json({
      mensaje: `Derivación enviada a ${destino.nombre} (${destino.especialidad}). Cuando la acepte, el episodio pasará a estar a su cargo y tú lo conservarás en solo lectura.`,
      derivacion_interna_id: creada.insertId,
    });
  } catch (error) {
    if (conexion) await conexion.rollback().catch(() => {});
    console.error('[derivaciones.crear]', error);
    return res.status(500).json({
      error: 'DERIVACION_REVERTIDA',
      mensaje: 'No se pudo registrar la derivación y no quedó ningún acceso a medias. Repite la solicitud.',
    });
  } finally {
    if (conexion) conexion.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/derivaciones/recibidas — bandeja del profesional derivado
// ─────────────────────────────────────────────────────────────────────────────
// CU65 — Registrando y Siguiendo Derivaciones Internas
exports.recibidas = async (req, res) => {
  try {
    const [derivaciones] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT di.derivacion_interna_id, di.estado, di.justificacion, di.momento_creacion,
              di.momento_respuesta, di.comentario_respuesta,
              ec.episodio_clinico_id, ec.motivo_consulta, ec.estado AS estado_episodio,
              ec.paciente_id,
              CONCAT(up.nombres, ' ', up.apellido_paterno) AS paciente,
              CONCAT(uo.nombres, ' ', uo.apellido_paterno) AS profesional_origen,
              eo.nombre AS especialidad_origen
         FROM Derivacion_Interna di
         JOIN Profesional pd ON pd.profesional_id = di.profesional_destino_id
         JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = di.episodio_clinico_id
         JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
         JOIN Usuario up ON up.usuario_id = pa.usuario_id
         JOIN Profesional po ON po.profesional_id = di.profesional_origen_id
         JOIN Usuario uo ON uo.usuario_id = po.usuario_id
         JOIN Especialidad eo ON eo.especialidad_id = po.especialidad_id
        WHERE pd.usuario_id = ?
        ORDER BY FIELD(di.estado, 'PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'CERRADA'), di.derivacion_interna_id DESC
        LIMIT 100`,
      [req.user.usuario_id]
    );
    return res.status(200).json({
      derivaciones,
      pendientes: derivaciones.filter((d) => d.estado === 'PENDIENTE').length,
    });
  } catch (error) {
    console.error('[derivaciones.recibidas]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus derivaciones.' });
  }
};

/** CU65 — Derivación con sus participantes (para responder o cerrar). */
async function derivacionCompleta(id) {
  const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT di.*, ud.usuario_id AS usuario_destino, uo.usuario_id AS usuario_origen,
            CONCAT(ud.nombres, ' ', ud.apellido_paterno) AS nombre_destino,
            CONCAT(up.nombres, ' ', up.apellido_paterno) AS paciente, ec.paciente_id
       FROM Derivacion_Interna di
       JOIN Profesional pd ON pd.profesional_id = di.profesional_destino_id
       JOIN Usuario ud ON ud.usuario_id = pd.usuario_id
       JOIN Profesional po ON po.profesional_id = di.profesional_origen_id
       JOIN Usuario uo ON uo.usuario_id = po.usuario_id
       JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = di.episodio_clinico_id
       JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
       JOIN Usuario up ON up.usuario_id = pa.usuario_id
      WHERE di.derivacion_interna_id = ? LIMIT 1`,
    [id]
  );
  return fila || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/derivaciones/:id/respuesta { accion: ACEPTAR|RECHAZAR, comentario? }
// ─────────────────────────────────────────────────────────────────────────────
// CU65 — Registrando y Siguiendo Derivaciones Internas
exports.responder = async (req, res) => {
  const accion = String(req.body?.accion || '').toUpperCase();
  const comentario = String(req.body?.comentario || '').trim().slice(0, 255) || null;
  if (!['ACEPTAR', 'RECHAZAR'].includes(accion)) {
    return res.status(400).json({ error: 'ACCION_INVALIDA', mensaje: 'La respuesta debe ser ACEPTAR o RECHAZAR.' });
  }
  if (accion === 'RECHAZAR' && !comentario) {
    return res.status(400).json({
      error: 'MOTIVO_REQUERIDO',
      campo: 'comentario',
      mensaje: 'Indica por qué rechazas la derivación, para que el profesional pueda buscar otra alternativa.',
    });
  }

  let conexion;
  try {
    const derivacion = await derivacionCompleta(req.params.id);
    if (!derivacion || Number(derivacion.usuario_destino) !== Number(req.user.usuario_id)) {
      return res.status(404).json({ error: 'DERIVACION_NO_ENCONTRADA', mensaje: 'La derivación no existe o no está dirigida a ti.' });
    }
    if (derivacion.estado !== 'PENDIENTE') {
      return res.status(409).json({ error: 'DERIVACION_YA_RESPONDIDA', mensaje: `Esta derivación ya está ${derivacion.estado.toLowerCase()}.` });
    }
    const nuevoEstado = accion === 'ACEPTAR' ? 'ACEPTADA' : 'RECHAZADA';
    let citasDesvinculadas = 0;
    conexion = await C_Capa_de_Acceso_a_Datos.getConnection();
    await conexion.beginTransaction();
    const [resultado] = await conexion.query(
      `UPDATE Derivacion_Interna
          SET estado = ?, momento_respuesta = NOW(), comentario_respuesta = ?
        WHERE derivacion_interna_id = ? AND estado = 'PENDIENTE'`,
      [nuevoEstado, comentario, derivacion.derivacion_interna_id]
    );
    if (resultado.affectedRows === 0) {
      await conexion.rollback();
      return res.status(409).json({ error: 'DERIVACION_YA_RESPONDIDA', mensaje: 'Esta derivación acaba de cambiar de estado. Recarga la lista.' });
    }

    if (nuevoEstado === 'ACEPTADA') {
      // Traspaso real: el episodio pasa a estar a cargo del receptor. Solo si
      // sigue abierto y sigue siendo de quien lo derivó.
      const [traspaso] = await conexion.query(
        `UPDATE Episodio_Clinico SET profesional_id = ?
          WHERE episodio_clinico_id = ? AND profesional_id = ? AND COALESCE(estado, 'ABIERTO') <> 'CERRADO'`,
        [derivacion.profesional_destino_id, derivacion.episodio_clinico_id, derivacion.profesional_origen_id]
      );
      if (traspaso.affectedRows === 0) {
        await conexion.rollback();
        return res.status(409).json({
          error: 'EPISODIO_NO_TRASPASABLE',
          mensaje: 'El episodio ya se cerró o cambió de responsable, así que no se puede traspasar. Pide al profesional que lo derive de nuevo si corresponde.',
        });
      }
      // Las citas futuras de quien derivó quedan en su agenda, pero dejan de
      // colgar del episodio traspasado: al iniciarlas se vinculan a un episodio suyo.
      const [desvinculadas] = await conexion.query(
        `UPDATE Cita SET episodio_clinico_id = NULL
          WHERE episodio_clinico_id = ? AND profesional_id = ?
            AND estado IN ('AGENDADA', 'CONFIRMADA') AND fecha_hora_inicio > NOW()`,
        [derivacion.episodio_clinico_id, derivacion.profesional_origen_id]
      );
      citasDesvinculadas = desvinculadas.affectedRows || 0;
    }

    await auditar(conexion, req, nuevoEstado === 'ACEPTADA' ? 'EPISODIO_TRASPASADO' : 'DERIVACION_INTERNA_RECHAZADA', {
      derivacion_interna_id: derivacion.derivacion_interna_id,
      episodio_clinico_id: derivacion.episodio_clinico_id,
      profesional_origen_id: derivacion.profesional_origen_id,
      profesional_destino_id: derivacion.profesional_destino_id,
      citas_futuras_desvinculadas: citasDesvinculadas,
      acceso_origen: nuevoEstado === 'ACEPTADA' ? 'SOLO_LECTURA' : 'RESPONSABLE',
    });
    await conexion.commit();

    // CU52: aviso a quien derivó
    await C_Despachador_Notificaciones.notificarUsuario(
      C_Capa_de_Acceso_a_Datos,
      derivacion.usuario_origen,
      'DERIVACION_RESPONDIDA',
      nuevoEstado === 'ACEPTADA'
        ? `${derivacion.nombre_destino} aceptó la derivación de ${derivacion.paciente}: el episodio ahora está a su cargo y tú lo conservas en solo lectura.` +
          (citasDesvinculadas ? ` Tus ${citasDesvinculadas} cita(s) futura(s) con el paciente siguen en tu agenda.` : '')
        : `${derivacion.nombre_destino} rechazó la derivación de ${derivacion.paciente}: "${comentario}". El episodio sigue a tu cargo.`,
      { datos: { pantalla: 'FichaClinica', pacienteId: derivacion.paciente_id, nombrePaciente: derivacion.paciente } }
    );

    return res.status(200).json({
      estado: nuevoEstado,
      mensaje: nuevoEstado === 'ACEPTADA'
        ? 'Aceptaste la derivación: el episodio ahora está a tu cargo y puedes registrar sesiones, metas y pautas en él.'
        : 'Rechazaste la derivación y se le avisó al profesional que la envió.',
    });
  } catch (error) {
    if (conexion) await conexion.rollback().catch(() => {});
    console.error('[derivaciones.responder]', error);
    return res.status(500).json({ error: 'No se pudo registrar tu respuesta y no se traspasó nada. Intenta nuevamente.' });
  } finally {
    if (conexion) conexion.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/derivaciones/:id/cierre — quien derivó la cancela mientras está
// pendiente. Una derivación aceptada ya traspasó el episodio: no se deshace.
// ─────────────────────────────────────────────────────────────────────────────
// CU65 — Registrando y Siguiendo Derivaciones Internas
exports.cerrar = async (req, res) => {
  try {
    const derivacion = await derivacionCompleta(req.params.id);
    if (!derivacion || Number(derivacion.usuario_origen) !== Number(req.user.usuario_id)) {
      return res.status(404).json({ error: 'DERIVACION_NO_ENCONTRADA', mensaje: 'La derivación no existe o no la enviaste tú.' });
    }
    if (derivacion.estado !== 'PENDIENTE') {
      return res.status(409).json({
        error: 'DERIVACION_NO_VIGENTE',
        mensaje: derivacion.estado === 'ACEPTADA'
          ? 'Esta derivación ya fue aceptada: el episodio está a cargo del otro profesional.'
          : `Esta derivación ya está ${derivacion.estado.toLowerCase()}.`,
      });
    }
    await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Derivacion_Interna SET estado = 'CERRADA', momento_cierre = NOW() WHERE derivacion_interna_id = ?`,
      [derivacion.derivacion_interna_id]
    );
    await auditar(C_Capa_de_Acceso_a_Datos, req, 'DERIVACION_INTERNA_CERRADA', {
      derivacion_interna_id: derivacion.derivacion_interna_id,
      episodio_clinico_id: derivacion.episodio_clinico_id,
      acceso: 'REVOCADO',
    }).catch(() => {});
    return res.status(200).json({ estado: 'CERRADA', mensaje: 'Derivación cancelada. El episodio sigue a tu cargo y el otro profesional ya no ve la ficha.' });
  } catch (error) {
    console.error('[derivaciones.cerrar]', error);
    return res.status(500).json({ error: 'No se pudo cerrar la derivación. Intenta nuevamente.' });
  }
};
