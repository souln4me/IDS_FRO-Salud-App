/**
 * Componente: C_API_REST
 * Casos de uso: CU14, CU15, CU17, CU18, CU20, CU22, CU76.
 * También toca de paso CU16, CU19, CU21, CU44, CU52, CU55, CU73 y CU74.
 *
 * Endpoints de la agenda: buscar y reservar horas, cambiar el estado de la
 * cita, reprogramarla, consultar su historial y listar las citas por rol.
 */
const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');
const C_Motor_Agendamiento = require('../componentes/C_Motor_Agendamiento');
const C_Despachador_Notificaciones = require('../componentes/C_Despachador_Notificaciones');
const C_Motor_Clinico = require('../componentes/C_Motor_Clinico');
const C_Control_Acceso_Clinico = require('../componentes/C_Control_Acceso_Clinico');
const { devolverPorCancelacion } = require('./finanzasController');

// ─────────────────────────────────────────────────────────────────────────────
//   CU14 — Buscar disponibilidad
// ─────────────────────────────────────────────────────────────────────────────

// CU14 — especialidades para el filtro de búsqueda
exports.obtenerEspecialidades = async (req, res) => {
  try {
    const [especialidades] = await C_Capa_de_Acceso_a_Datos.query(
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
 * Apoyo común: usado por CU14 y CU15.
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

// CU14 — Buscando y seleccionando cita en el motor de agendamiento
exports.buscarDisponibilidad = async (req, res) => {
  const { especialidad_id, tipo_sede, fecha } = req.query;
  // Búsqueda por nombre del profesional: opcional, se suma a los filtros de
  // siempre en vez de reemplazarlos.
  const nombreBuscado = String(req.query?.nombre || '').trim();

  if (!especialidad_id || !tipo_sede || !fecha) {
    return res.status(400).json({ error: 'Debe indicar especialidad, modalidad y fecha.' });
  }

  try {
    const fechaObj  = new Date(`${fecha}T00:00:00`);
    const diaSemana = fechaObj.getDay() === 0 ? 7 : fechaObj.getDay();

    // CU14: la atención a domicilio depende de dónde vive el paciente. Se toma
    // la comuna de su cuenta; una teleconsulta no depende del lugar, así que
    // ese filtro solo se aplica a los bloques a domicilio.
    let comunaPaciente = null;
    const [[fichaPaciente]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT pa.paciente_id, pa.comuna_id, c.nombre
         FROM Paciente pa
         LEFT JOIN Comuna c ON c.comuna_id = pa.comuna_id
        WHERE pa.usuario_id = ? LIMIT 1`,
      [req.user?.usuario_id ?? null]
    );
    if (fichaPaciente?.comuna_id) {
      comunaPaciente = { comuna_id: fichaPaciente.comuna_id, nombre: fichaPaciente.nombre };
    }

    const condicionNombre = nombreBuscado
      ? `AND CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno) LIKE ?`
      : '';

    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT
          p.profesional_id,
          u.nombres, u.apellido_paterno, u.apellido_materno,
          e.nombre AS especialidad,
          s.sede_id, s.nombre AS sede_nombre,
          pd.hora_inicio, pd.hora_fin, pd.modalidad,
          -- CU10: catálogo público del profesional
          p.foto_url, p.reseña_curricular AS resena_curricular, p.areas_experticia,
          -- CU58: promedio y cantidad de evaluaciones, para las estrellas.
          p.calificacion_promedio,
          (SELECT COUNT(es.puntuacion) FROM Evaluacion_Satisfaccion es
            WHERE es.profesional_id = p.profesional_id AND es.puntuacion IS NOT NULL) AS total_evaluaciones,
          -- CU14: comunas declaradas y si cubren la del paciente. Sin comunas
          -- declaradas se entiende que atiende en cualquiera.
          (SELECT GROUP_CONCAT(c2.nombre ORDER BY c2.nombre SEPARATOR ', ')
             FROM Profesional_Comuna pc2
             JOIN Comuna c2 ON c2.comuna_id = pc2.comuna_id
            WHERE pc2.profesional_id = p.profesional_id) AS comunas_atencion,
          (SELECT COUNT(*) FROM Profesional_Comuna pc3
            WHERE pc3.profesional_id = p.profesional_id) AS total_comunas,
          (SELECT COUNT(*) FROM Profesional_Comuna pc4
            WHERE pc4.profesional_id = p.profesional_id AND pc4.comuna_id = ?) AS cubre_comuna
       FROM Profesional_Disponibilidad pd
       JOIN Profesional p  ON pd.profesional_id  = p.profesional_id
       JOIN Usuario     u  ON p.usuario_id        = u.usuario_id
       JOIN Especialidad e ON p.especialidad_id   = e.especialidad_id
       JOIN Sede         s ON s.estado_sede        = 1
       WHERE p.especialidad_id = ?
         AND pd.dia_semana     = ?
         AND u.cuenta_activo   = TRUE
         ${condicionNombre}`,
      nombreBuscado
        ? [comunaPaciente?.comuna_id ?? 0, especialidad_id, diaSemana, `%${nombreBuscado}%`]
        : [comunaPaciente?.comuna_id ?? 0, especialidad_id, diaSemana]
    );

    const disponibilidad = [];
    // Los bloques de hoy cuya hora ya pasó no se ofrecen. El proceso corre en
    // hora de Chile (server.js), igual que las fechas de la base, así que el
    // texto "AAAA-MM-DD HH:MM:SS" se puede comparar directamente.
    const ahoraTexto = aTextoSQL(new Date());
    // Para poder explicar en pantalla por qué no salió nadie.
    let descartadosPorComuna = 0;

    // CU19: para marcar los bloques ocupados hace falta saber quién pregunta
    // (para no ofrecerle esperar su propia hora) y cuál es el tope de la lista.
    const pacienteQueBusca = fichaPaciente?.paciente_id || 0;
    const maximoListaEspera = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'MAX_PACIENTES_LISTA_ESPERA', 5);

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

      // El profesional que declaró comunas solo aparece para las suyas, y solo
      // cuando la hora implica ir al domicilio del paciente.
      const implicaDomicilio = modalidad === 'DOMICILIO' || modalidad === 'AMBOS';
      if (
        implicaDomicilio &&
        Number(fila.total_comunas) > 0 &&
        comunaPaciente &&
        Number(fila.cubre_comuna) === 0
      ) {
        descartadosPorComuna++;
        continue;
      }

      const horaInicio  = String(fila.hora_inicio).slice(0, 5);
      const horaFin     = String(fila.hora_fin).slice(0, 5);
      let   horaActual  = Number(horaInicio.split(':')[0]);
      const horaLimite  = Number(horaFin.split(':')[0]);

      while (horaActual < horaLimite) {
        const bloqueInicio    = `${String(horaActual).padStart(2, '0')}:00:00`;
        const bloqueFin       = `${String(horaActual + 1).padStart(2, '0')}:00:00`;
        const fechaHoraInicio = `${fecha} ${bloqueInicio}`;
        const fechaHoraFin    = `${fecha} ${bloqueFin}`;

        if (fechaHoraInicio <= ahoraTexto) {
          horaActual++;
          continue;
        }

        // 1. Validar choque con citas existentes
        const [ocupadas] = await C_Capa_de_Acceso_a_Datos.query(
          `SELECT cita_id, paciente_id FROM Cita
           WHERE profesional_id = ?
             AND estado NOT LIKE 'CANCELADA%'
             AND fecha_hora_inicio < ?
             AND fecha_hora_fin    > ?`,
          [fila.profesional_id, fechaHoraFin, fechaHoraInicio]
        );

        // 2. NUEVA VALIDACIÓN: Choque con bloqueos de agenda (CU16)
        const [bloqueos] = await C_Capa_de_Acceso_a_Datos.query(
          `SELECT bloqueo_id FROM Bloqueo_Agenda
           WHERE profesional_id = ?
             AND fecha_inicio <= ?
             AND fecha_fin >= ?`,
          [fila.profesional_id, fechaHoraFin, fechaHoraInicio]
        );

        // 3a. CU19: un bloque tomado por otra cita puede tener lista de espera.
        //     Los bloqueos de agenda no: ese horario no existe para nadie.
        if (ocupadas.length > 0 && bloqueos.length === 0) {
          const ocupada = ocupadas[0];
          const [[espera]] = await C_Capa_de_Acceso_a_Datos.query(
            `SELECT
                COUNT(*) AS en_espera,
                MAX(CASE WHEN paciente_id = ? THEN posicion END) AS mi_posicion
               FROM Lista_Espera
              WHERE cita_id = ? AND estado IN ('ESPERANDO', 'NOTIFICADO')`,
            [pacienteQueBusca, ocupada.cita_id]
          );

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
            comunas_atencion: fila.comunas_atencion || null,
            // CU58: calificación y cantidad de evaluaciones del profesional.
            calificacion: Number(fila.calificacion_promedio) || 0,
            total_evaluaciones: Number(fila.total_evaluaciones) || 0,
            fecha,
            hora_inicio:     bloqueInicio,
            hora_fin:        bloqueFin,
            // Marcas propias del bloque ocupado:
            ocupado:         true,
            cita_id:         ocupada.cita_id,
            es_mi_cita:      Number(ocupada.paciente_id) === Number(pacienteQueBusca),
            en_espera:       Number(espera.en_espera),
            mi_posicion:     espera.mi_posicion ? Number(espera.mi_posicion) : null,
            lista_llena:     Number(espera.en_espera) >= maximoListaEspera,
          });
          horaActual++;
          continue;
        }

        // 3b. Solo agregar como disponible si NO hay citas NI bloqueos.
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
            comunas_atencion: fila.comunas_atencion || null,
            // CU58: calificación y cantidad de evaluaciones del profesional.
            calificacion: Number(fila.calificacion_promedio) || 0,
            total_evaluaciones: Number(fila.total_evaluaciones) || 0,
            fecha,
            hora_inicio:     bloqueInicio,
            hora_fin:        bloqueFin,
          });
        }
        horaActual++;
      }
    }

    return res.status(200).json({
      data: disponibilidad,
      filtro: {
        comuna_paciente: comunaPaciente?.nombre || null,
        nombre: nombreBuscado || null,
        descartados_por_comuna: descartadosPorComuna,
      },
    });
  } catch (error) {
    console.error('[buscarDisponibilidad]', error);
    return res.status(500).json({ error: 'Error interno al buscar disponibilidad.' });
  }
};

// CU14, CU15 — revisar que el bloque siga libre antes de reservarlo
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

    const [ocupadas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT cita_id FROM Cita
       WHERE profesional_id = ?
         AND estado NOT LIKE 'CANCELADA%'
         AND fecha_hora_inicio < ?
         AND fecha_hora_fin    > ?`,
      [profesional_id, fechaHoraFin, fecha_hora_inicio]
    );

    // CU16: un periodo bloqueado por el profesional tampoco está disponible.
    const bloqueada = await C_Motor_Agendamiento.agendaBloqueada(
      C_Capa_de_Acceso_a_Datos, profesional_id, fecha_hora_inicio, fechaHoraFin
    );

    return res.status(200).json({ disponible: ocupadas.length === 0 && !bloqueada });
  } catch (error) {
    console.error('[validarBloque]', error);
    return res.status(500).json({ error: 'Error interno al validar el bloque.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//   CU15 — Bloquear horario
// ─────────────────────────────────────────────────────────────────────────────

// CU14, CU15 — profesionales activos para elegir a quién reservar
exports.obtenerProfesionales = async (req, res) => {
  try {
    const [profesionales] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU14, CU15 — jornada semanal de un profesional
exports.obtenerDisponibilidad = async (req, res) => {
  const { profesional_id } = req.params;

  try {
    const [bloques] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU15 — Controlando concurrencia de bloqueo de agendamiento
exports.bloquearHorario = async (req, res) => {
  const { profesional_id, sede_id, fecha_hora_inicio, fecha_hora_fin } = req.body;

  if (!profesional_id || !sede_id || !fecha_hora_inicio || !fecha_hora_fin) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }

  // Una hora que ya pasó no se puede reservar (p. ej. si la pantalla de
  // búsqueda quedó abierta desde antes). Hora de Chile, igual que la base.
  const inicioTexto = String(fecha_hora_inicio).replace('T', ' ').slice(0, 19);
  if (inicioTexto <= aTextoSQL(new Date())) {
    return res.status(409).json({
      error: 'HORA_PASADA',
      mensaje: 'Ese horario ya pasó. Vuelve a buscar para ver las horas disponibles.',
    });
  }

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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

    // CU16: el profesional bloqueó ese periodo (vacaciones, licencia).
    if (await C_Motor_Agendamiento.agendaBloqueada(connection, profesional_id, fecha_hora_inicio, fecha_hora_fin)) {
      await connection.rollback();
      return res.status(409).json({
        error:   'AGENDA_BLOQUEADA',
        mensaje: 'El profesional no atiende en la fecha elegida. Elige otro bloque.',
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

// CU20 — Transicionando máquina de estados de cita
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
 * CU20 — Transicionando máquina de estados de cita
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

  // Iniciar y finalizar la atención pasan por las marcas temporales (CU38),
  // que registran la hora, el GPS (CU39) y la certificación (CU41). Por aquí
  // se saltaban todo eso.
  if (evento === 'INICIAR' || evento === 'FINALIZAR') {
    return res.status(409).json({
      error: 'USAR_MARCAS_TEMPORALES',
      mensaje: 'Inicia y finaliza la atención con los botones "Iniciar" y "Finalizar atención" del historial del paciente.',
    });
  }
  // El paciente solo confirma o cancela su cita; el resto lo hace su profesional.
  if (rolActor === 'Paciente' && !['CONFIRMAR', 'CANCELAR'].includes(evento)) {
    return res.status(403).json({
      error: 'EVENTO_NO_PERMITIDO',
      mensaje: 'Desde tu cuenta solo puedes confirmar o cancelar tus citas.',
    });
  }

  // CU22 — Excepción 3: una cancelación sin justificación no se guarda.
  if (evento === 'CANCELAR' && !motivo) {
    return res.status(400).json({
      error: 'MOTIVO_REQUERIDO',
      mensaje: 'Debes indicar el motivo de la cancelación.',
    });
  }

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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

    // CU12: solo el profesional o el paciente de la cita pueden moverla de estado.
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

    // CU73 (RF73) — una cita solo pasa a CONFIRMADA con el pago íntegro, la confirme
    // el profesional desde la ficha o el paciente desde la solicitud del CU21.
    if (evento === 'CONFIRMAR') {
      const [[pago]] = await connection.execute(
        `SELECT transaccion_id FROM Transaccion
          WHERE cita_id = ? AND estado = 'PAGADA' AND tipo <> 'DEVOLUCION' LIMIT 1`,
        [id]
      );
      if (!pago) {
        await connection.rollback();
        return res.status(409).json({
          error: 'CITA_SIN_PAGO',
          mensaje:
            'Esta hora todavía no está pagada. Podrás confirmarla cuando el paciente complete el pago desde Mis Citas.',
        });
      }
    }

    // CU18 — Excepción 1: el paciente solo puede cancelar dentro del plazo
    // reglamentario (parámetro editable por el administrador).
    if (evento === 'CANCELAR' && rolActor === 'Paciente') {
      const horasMinimas = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(
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
      inventario = await C_Motor_Agendamiento.descontarSesionPaquete(
        connection,
        cita.paciente_id,
        nuevo_estado === 'INASISTENCIA' ? 'PENALIZACION_INASISTENCIA' : 'SESION_REALIZADA'
      );
    }

    // 5. CU22 — Trazabilidad con responsable y motivo (dentro de la
    //    transacción: si el log no se puede guardar, la operación se anula,
    //    porque la agenda de un sistema clínico no puede cambiar sin rastro).
    await C_Motor_Agendamiento.registrarTrazabilidadAgenda(connection, req, {
      accion: 'TRANSICION_CITA',
      cita_id: id,
      estado_anterior,
      nuevo_estado,
      evento,
      motivo: motivo || null,
      rol_actor: rolActor || null,
      inventario,
    });

    // 6. CU52 — Avisos (tolerantes a fallo: no revierten la transición)
    const contactos = await C_Motor_Agendamiento.obtenerContactosCita(connection, id);
    let cupos_notificados = 0;

    if (contactos) {
      const texto =
        evento === 'CANCELAR'
          ? `Tu cita fue cancelada. Motivo: ${motivo}`
          : `El estado de tu cita cambió a: ${nuevo_estado}`;
      await C_Despachador_Notificaciones.notificarUsuario(connection, contactos.usuario_paciente, 'CAMBIO_ESTADO_CITA', texto);
      // El profesional tiene su propia pantalla: el aviso lo lleva a su jornada.
      await C_Despachador_Notificaciones.notificarUsuario(connection, contactos.usuario_profesional, 'CAMBIO_ESTADO_CITA', texto, {
        datos: { pantalla: 'MiJornada' },
      });
    }

    // CU21 — si la cita tenía una solicitud de confirmación abierta, responder
    // desde la app la cierra: el enlace del correo deja de servir.
    if (evento === 'CONFIRMAR' || evento === 'CANCELAR') {
      await C_Motor_Agendamiento.cerrarSolicitudPorApp(
        connection, id, evento === 'CONFIRMAR' ? 'CONFIRMADA' : 'CANCELADA'
      );
    }

    // CU55 — sesión cerrada por la máquina de estados: se pide la calificación.
    if (nuevo_estado === 'REALIZADA') {
      await C_Motor_Agendamiento.pedirEvaluacion(connection, id);
    }

    // CU74 (RF74) — la cancelación con la anticipación mínima da derecho a devolución
    // total. Va dentro de la transacción: o se cancela y se devuelve, o nada.
    let devolucion = null;
    if (esCancelada(nuevo_estado)) {
      devolucion = await devolverPorCancelacion(
        connection, id, cita.fecha_hora_inicio, req
      );
    }

    // CU18 + CU19 — al liberarse el bloque, el cupo se ofrece al PRIMERO de la
    // lista de espera, con plazo. Si no responde, el programador lo cede al
    // siguiente.
    if (esCancelada(nuevo_estado)) {
      cupos_notificados = await C_Motor_Agendamiento.ofrecerCupoListaEspera(connection, id);
    }

    await connection.commit();

    // CU44: el cierre de una sesión es uno de los eventos que actualizan los
    // indicadores del paciente. Va fuera de la transacción y sin esperar: el
    // cambio de estado no puede depender de un cálculo de métricas.
    if (nuevo_estado === 'REALIZADA' || nuevo_estado === 'INASISTENCIA') {
      C_Motor_Clinico.actualizarIndicador(C_Capa_de_Acceso_a_Datos, cita.paciente_id).catch(() => {});
    }

    return res.status(200).json({
      mensaje: 'Estado de cita actualizado correctamente.',
      cita_id: id,
      estado_anterior,
      nuevo_estado,
      inventario,
      cupos_notificados,
      devolucion,
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

// CU12 — ¿Quien pide es parte de la cita? El paciente y el profesional de la
// cita siempre lo son. Con `lectura`, además el administrador y el profesional
// con acceso clínico al paciente (por ejemplo, por una derivación, CU65).
async function puedeVerOGestionarCita(conexion, cita, req, { lectura = false } = {}) {
  const rol = req.user?.nombre_rol || '';
  const usuarioId = req.user?.usuario_id;
  if (rol === 'Administrador') return lectura;
  if (rol === 'Paciente') {
    const [[fila]] = await conexion.execute(
      `SELECT 1 AS ok FROM Paciente WHERE paciente_id = ? AND usuario_id = ? LIMIT 1`,
      [cita.paciente_id, usuarioId]
    );
    return Boolean(fila);
  }
  if (rol === 'Profesional') {
    const [[fila]] = await conexion.execute(
      `SELECT 1 AS ok FROM Profesional WHERE profesional_id = ? AND usuario_id = ? LIMIT 1`,
      [cita.profesional_id, usuarioId]
    );
    if (fila) return true;
    return lectura && C_Control_Acceso_Clinico.profesionalTratante(conexion, usuarioId, cita.paciente_id);
  }
  return false;
}

/**
 * CU17 — Gestionando reprogramación de cita
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

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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

    // CU12: solo el paciente o el profesional de la cita pueden reprogramarla.
    if (!(await puedeVerOGestionarCita(connection, cita, req))) {
      await connection.rollback();
      return res.status(403).json({ error: 'CITA_AJENA', mensaje: 'Solo puedes reprogramar tus propias citas.' });
    }

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
      const horasMinimas = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(
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

    // CU16: el nuevo bloque tampoco puede caer en un periodo bloqueado (vacaciones).
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
    await C_Motor_Agendamiento.registrarTrazabilidadAgenda(connection, req, {
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
    // CU52: aviso al paciente y al profesional.
    const contactos = await C_Motor_Agendamiento.obtenerContactosCita(connection, id);
    if (contactos) {
      const texto = `Tu cita fue reprogramada para ${fecha_hora_inicio}. Motivo: ${motivo}`;
      await C_Despachador_Notificaciones.notificarUsuario(connection, contactos.usuario_paciente, 'CITA_REPROGRAMADA', texto);
      await C_Despachador_Notificaciones.notificarUsuario(connection, contactos.usuario_profesional, 'CITA_REPROGRAMADA', texto);
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
 * CU22 — Registrando trazabilidad de transiciones de agenda
 * GET /citas/:id/trazabilidad
 */
exports.trazabilidadCita = async (req, res) => {
  const { id } = req.params;
  try {
    // CU12: la trazabilidad la ve quien tiene acceso a la cita o el administrador.
    const [[cita]] = await C_Capa_de_Acceso_a_Datos.execute(
      `SELECT cita_id, paciente_id, profesional_id FROM Cita WHERE cita_id = ? LIMIT 1`,
      [id]
    );
    if (!cita) return res.status(404).json({ error: `Cita con id "${id}" no encontrada.` });
    if (!(await puedeVerOGestionarCita(C_Capa_de_Acceso_a_Datos, cita, req, { lectura: true }))) {
      return res.status(403).json({ error: 'CITA_AJENA', mensaje: 'No tienes acceso a esta cita.' });
    }
    const eventos = await C_Motor_Agendamiento.obtenerTrazabilidadCita(C_Capa_de_Acceso_a_Datos, id);
    return res.status(200).json({ cita_id: Number(id), eventos });
  } catch (error) {
    console.error('[trazabilidadCita]', error);
    return res.status(500).json({ error: 'Error interno al consultar la trazabilidad.' });
  }
};

/**
 * CU20 — re-sincronizar el estado de la cita tras latencia de red (Excepción 3)
 * GET /citas/:id/estado
 */
exports.obtenerEstadoCita = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT cita_id, estado, paciente_id, profesional_id FROM Cita WHERE cita_id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: `Cita con id "${id}" no encontrada.` });
    }
    // CU12: el estado solo se informa a quien tiene acceso a la cita.
    if (!(await puedeVerOGestionarCita(C_Capa_de_Acceso_a_Datos, rows[0], req, { lectura: true }))) {
      return res.status(403).json({ error: 'CITA_AJENA', mensaje: 'No tienes acceso a esta cita.' });
    }
    return res.status(200).json({ cita_id: rows[0].cita_id, estado: rows[0].estado });
  } catch (error) {
    console.error('[obtenerEstadoCita]', error);
    return res.status(500).json({ error: 'Error interno al consultar el estado.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//   CU20 — Listar citas por Rol (Paciente / Profesional)
// ─────────────────────────────────────────────────────────────────────────────

// CU20 — citas del paciente con su estado
exports.obtenerCitasPaciente = async (req, res) => {
  const usuario_id = req.user?.usuario_id;

  try {
    const [citas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT 
          c.cita_id, 
          c.fecha_hora_inicio, 
          c.fecha_hora_fin, 
          c.estado,
          COALESCE(c.modalidad, NULLIF(prof.tipo_sede, 'AMBOS')) AS modalidad,
          CONCAT(u_pac.nombres, ' ', u_pac.apellido_paterno) AS nombre_paciente,
          CONCAT(u_prof.nombres, ' ', u_prof.apellido_paterno) AS nombre_profesional,
          -- CU73: cómo quedó pagada la hora (PRESTACION, PAQUETE, SESION_PLAN,
          -- ACTUALIZACION) o NULL si todavía no se paga.
          (SELECT t.tipo FROM Transaccion t
             WHERE t.cita_id = c.cita_id AND t.estado = 'PAGADA' AND t.tipo <> 'DEVOLUCION'
             ORDER BY t.transaccion_id DESC LIMIT 1) AS pago_tipo
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

// CU20 — citas del profesional con su estado
exports.obtenerCitasProfesional = async (req, res) => {
  const usuario_id = req.user?.usuario_id;

  try {
    const [citas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT 
          c.cita_id, 
          c.fecha_hora_inicio, 
          c.fecha_hora_fin, 
          c.estado,
          COALESCE(c.modalidad, NULLIF(prof.tipo_sede, 'AMBOS')) AS modalidad,
          CONCAT(u_pac.nombres, ' ', u_pac.apellido_paterno) AS nombre_paciente,
          CONCAT(u_prof.nombres, ' ', u_prof.apellido_paterno) AS nombre_profesional,
          -- CU73: cómo quedó pagada la hora (PRESTACION, PAQUETE, SESION_PLAN,
          -- ACTUALIZACION) o NULL si todavía no se paga.
          (SELECT t.tipo FROM Transaccion t
             WHERE t.cita_id = c.cita_id AND t.estado = 'PAGADA' AND t.tipo <> 'DEVOLUCION'
             ORDER BY t.transaccion_id DESC LIMIT 1) AS pago_tipo
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