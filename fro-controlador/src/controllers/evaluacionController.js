/**
 * Componente: C_API_REST
 * Casos de uso: CU55, CU56, CU58, CU57, CU62, CU52, CU13.
 *
 * CU55 — Evaluación de satisfacción post-sesión.
 * CU56 — Moderación de testimonios públicos.
 * CU58 — Cálculo y visualización de la calificación del profesional.
 *
 * Una distinción que atraviesa los tres: la NOTA y el TEXTO son cosas
 * distintas. La nota entra siempre en el promedio del profesional apenas se
 * registra; lo que pasa por moderación es la reseña escrita, que es lo único
 * que se publica hacia afuera.
 *
 * Correcciones Inc 4: hay dos momentos de evaluación.
 *   - SESION: después de cada cita solo se pregunta si el paciente quedó
 *     satisfecho con la atención (sí/no) y se ofrece un comentario.
 *   - TRATAMIENTO: la calificación general del profesional (1 a 5 estrellas
 *     y reseña) se pide una sola vez, al cerrarse el episodio.
 * El promedio del profesional sale de las notas en estrellas (las de
 * tratamiento y las de sesión anteriores a este cambio, que se conservan).
 */

const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');
const C_Filtro_Contenido = require('../componentes/C_Filtro_Contenido');
const C_Escalador_Eventos_Criticos = require('../componentes/C_Escalador_Eventos_Criticos');
const C_Despachador_Notificaciones = require('../componentes/C_Despachador_Notificaciones');

const ESTADOS = { PENDIENTE: 'PENDIENTE', APROBADA: 'APROBADA', RECHAZADA: 'RECHAZADA' };

/**
 * CU56 — Moderando testimonios públicos
 * Quita caracteres de control y espacios raros que rompen el renderizado.
 * Excepción 2 del CU56: el texto con codificación no estándar se sanea antes
 * de mostrarse, en vez de ensuciar la consola del moderador.
 */
function sanear(texto) {
  let limpio = String(texto ?? '');
  // Texto UTF-8 leído como Latin-1 ("Ã³" en vez de "ó"): se repara.
  if (/Ã[\u0080-\u00BF]/.test(limpio)) {
    const reparado = Buffer.from(limpio, 'latin1').toString('utf8');
    if (!reparado.includes('\uFFFD')) limpio = reparado;
  }
  // Algunos teclados mandan la tilde como un signo aparte de la letra y se
  // dibuja desplazada: se compone en un solo carácter (NFC).
  return limpio
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

/**
 * CU58 — Calculando y visualizando calificación profesional
 * Recalcula y persiste el promedio del profesional.
 */
async function recalcularPromedio(conexion, profesionalId) {
  // Excepción 4 del CU55: dos evaluaciones simultáneas del mismo profesional
  // entrarían a la vez en el promedio. La fila se bloquea, el cálculo se
  // serializa y ninguna se pierde.
  await conexion.execute(
    `SELECT profesional_id FROM Profesional WHERE profesional_id = ? FOR UPDATE`,
    [profesionalId]
  );

  const [[resumen]] = await conexion.execute(
    `SELECT COUNT(e.puntuacion) AS total, COALESCE(AVG(e.puntuacion), 0) AS promedio
       FROM Evaluacion_Satisfaccion e
      WHERE e.profesional_id = ? AND e.puntuacion IS NOT NULL`,
    [profesionalId]
  );

  const promedio = Number(resumen.promedio || 0);
  await conexion.execute(
    `UPDATE Profesional SET calificacion_promedio = ? WHERE profesional_id = ?`,
    [promedio.toFixed(2), profesionalId]
  );

  return { promedio: Number(promedio.toFixed(2)), total: Number(resumen.total) };
}

/**
 * CU55 — Evaluando satisfacción post-sesión
 * POST /api/citas/:id/evaluacion   { satisfecho: true|false, resena? }
 *
 * Evaluación de cada sesión: solo si el paciente quedó satisfecho con la
 * atención, más un comentario opcional. Sin estrellas: la calificación
 * general se pide al cerrar el tratamiento.
 */
exports.registrarEvaluacion = async (req, res) => {
  const { id } = req.params;
  const satisfecho = req.body?.satisfecho;
  const resenaCruda = sanear(req.body?.resena);

  if (typeof satisfecho !== 'boolean') {
    return res.status(400).json({
      error: 'RESPUESTA_INVALIDA',
      mensaje: 'Indica si quedaste satisfecho con la atención.',
    });
  }

  const conexion = await C_Capa_de_Acceso_a_Datos.getConnection();

  try {
    const [[cita]] = await conexion.execute(
      `SELECT c.cita_id, c.estado, c.profesional_id, c.paciente_id,
              pac_u.usuario_id AS usuario_paciente,
              pro_u.usuario_id AS usuario_profesional
         FROM Cita c
         JOIN Paciente pa ON pa.paciente_id = c.paciente_id
         LEFT JOIN Usuario pac_u ON pac_u.usuario_id = pa.usuario_id
         JOIN Profesional pr ON pr.profesional_id = c.profesional_id
         LEFT JOIN Usuario pro_u ON pro_u.usuario_id = pr.usuario_id
        WHERE c.cita_id = ? LIMIT 1`,
      [id]
    );

    if (!cita) {
      return res.status(404).json({ error: 'CITA_NO_ENCONTRADA' });
    }

    const esPaciente = cita.usuario_paciente === req.user.usuario_id;
    const esProfesional = cita.usuario_profesional === req.user.usuario_id;
    if (!esPaciente && !esProfesional) {
      return res.status(403).json({
        error: 'CITA_AJENA',
        mensaje: 'Solo quienes participaron en esta atención pueden evaluarla.',
      });
    }

    // Precondición del CU55: la atención tiene que estar cerrada. Antes de eso
    // no hay nada que evaluar.
    if (cita.estado !== 'REALIZADA') {
      return res.status(409).json({
        error: 'SESION_NO_CERRADA',
        mensaje:
          'La evaluación se habilita cuando la atención queda finalizada. ' +
          'Si la sesión ya terminó, ciérrala primero desde el historial.',
      });
    }

    const [[yaExiste]] = await conexion.execute(
      `SELECT evaluacion_satisfaccion_id FROM Evaluacion_Satisfaccion WHERE cita_id = ? LIMIT 1`,
      [id]
    );
    if (yaExiste) {
      return res.status(409).json({
        error: 'YA_EVALUADA',
        mensaje: 'Esta atención ya fue evaluada. Gracias por tu respuesta.',
      });
    }

    // CU57: la reseña pasa por el mismo diccionario que el chat. Excepción 3
    // del CU55: sin texto se procesa solo la nota, que es lo que importa.
    let resena = resenaCruda;
    let resenaBloqueada = false;
    if (resena) {
      const revision = await C_Filtro_Contenido.revisar(resena);
      if (!revision.permitido) {
        resena = null;
        resenaBloqueada = true;
      }
    }

    await conexion.beginTransaction();

    const [evaluacionCreada] = await conexion.execute(
      `INSERT INTO Evaluacion_Satisfaccion
         (tipo, satisfecho, puntuacion, resena, estado_moderacion, cita_id, profesional_id)
       VALUES ('SESION', ?, NULL, ?, ?, ?, ?)`,
      [satisfecho, resena || null, resena ? ESTADOS.PENDIENTE : ESTADOS.APROBADA, id, cita.profesional_id]
    );

    // CU13: queda en la bitácora de auditoría
    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('EVALUACION_SATISFACCION', 'Evaluacion_Satisfaccion', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({
          cita_id: Number(id),
          tipo: 'SESION',
          satisfecho,
          con_resena: Boolean(resena),
          resena_bloqueada: resenaBloqueada,
          registrada_por: esPaciente ? 'PACIENTE' : 'PROFESIONAL',
        }),
        req.user.usuario_id,
      ]
    );

    await conexion.commit();

    // CU62: una reseña con términos críticos se escala al administrador.
    if (resena) {
      C_Escalador_Eventos_Criticos.escalar(C_Capa_de_Acceso_a_Datos, {
        texto: resena, origen: 'RESENA', entidad: 'Evaluacion_Satisfaccion', entidadId: evaluacionCreada.insertId,
        usuarioOrigenId: req.user.usuario_id,
      }).catch(() => {});
    }

    return res.status(201).json({
      mensaje: resenaBloqueada
        ? 'Tu respuesta quedó registrada, pero no el comentario porque incluye términos no permitidos.'
        : resena
          ? 'Gracias. Tu respuesta quedó registrada y tu comentario pasará por revisión antes de publicarse.'
          : 'Gracias. Tu respuesta quedó registrada.',
      satisfecho,
      resena_bloqueada: resenaBloqueada,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[registrarEvaluacion CU55]', error);
    return res.status(500).json({
      error: 'NO_SE_PUDO_EVALUAR',
      mensaje: 'No pudimos registrar tu evaluación. Vuelve a intentarlo.',
    });
  } finally {
    conexion.release();
  }
};

/**
 * CU55, CU58 — calificación general del tratamiento y promedio del profesional
 * POST /api/clinica/episodio/:episodio_id/evaluacion   { puntuacion, resena? }  (Paciente)
 *
 * Calificación general del profesional, una sola vez por tratamiento, cuando
 * el episodio ya está cerrado. Esta nota entra al promedio público (CU58).
 */
exports.registrarEvaluacionTratamiento = async (req, res) => {
  const { episodio_id } = req.params;
  const puntuacion = Number(req.body?.puntuacion);
  const resenaCruda = sanear(req.body?.resena);

  if (!Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
    return res.status(400).json({ error: 'PUNTUACION_INVALIDA', mensaje: 'La calificación va de 1 a 5 estrellas.' });
  }

  const conexion = await C_Capa_de_Acceso_a_Datos.getConnection();
  try {
    const [[episodio]] = await conexion.execute(
      `SELECT ec.episodio_clinico_id, ec.estado, ec.profesional_id, pa.usuario_id AS usuario_paciente
         FROM Episodio_Clinico ec JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
        WHERE ec.episodio_clinico_id = ? LIMIT 1`,
      [episodio_id]
    );
    if (!episodio || Number(episodio.usuario_paciente) !== Number(req.user.usuario_id)) {
      return res.status(404).json({ error: 'EPISODIO_NO_ENCONTRADO', mensaje: 'Ese tratamiento no existe o no es tuyo.' });
    }
    if (String(episodio.estado || '').toUpperCase() !== 'CERRADO') {
      return res.status(409).json({
        error: 'TRATAMIENTO_EN_CURSO',
        mensaje: 'La calificación general se habilita cuando tu profesional cierra el tratamiento.',
      });
    }
    const [[yaExiste]] = await conexion.execute(
      `SELECT 1 AS si FROM Evaluacion_Satisfaccion WHERE episodio_clinico_id = ? LIMIT 1`,
      [episodio_id]
    );
    if (yaExiste) {
      return res.status(409).json({ error: 'YA_EVALUADA', mensaje: 'Ya calificaste este tratamiento. Gracias por tu respuesta.' });
    }

    // CU57: la reseña pasa por el filtro de contenido
    let resena = resenaCruda;
    let resenaBloqueada = false;
    if (resena) {
      const revision = await C_Filtro_Contenido.revisar(resena);
      if (!revision.permitido) {
        resena = null;
        resenaBloqueada = true;
      }
    }

    await conexion.beginTransaction();
    const [creada] = await conexion.execute(
      `INSERT INTO Evaluacion_Satisfaccion
         (tipo, puntuacion, resena, estado_moderacion, episodio_clinico_id, profesional_id)
       VALUES ('TRATAMIENTO', ?, ?, ?, ?, ?)`,
      [puntuacion, resena || null, resena ? ESTADOS.PENDIENTE : ESTADOS.APROBADA, episodio_id, episodio.profesional_id]
    );
    // CU58: la nota entra al promedio del profesional
    const promedio = await recalcularPromedio(conexion, episodio.profesional_id);
    // CU13: queda en la bitácora de auditoría
    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('EVALUACION_TRATAMIENTO', 'Evaluacion_Satisfaccion', ?, ?, ?)`,
      [req.ip || null, JSON.stringify({ episodio_clinico_id: Number(episodio_id), puntuacion, con_resena: Boolean(resena), resena_bloqueada: resenaBloqueada }), req.user.usuario_id]
    );
    await conexion.commit();

    // CU62: una reseña con términos críticos se escala al administrador
    if (resena) {
      C_Escalador_Eventos_Criticos.escalar(C_Capa_de_Acceso_a_Datos, {
        texto: resena, origen: 'RESENA', entidad: 'Evaluacion_Satisfaccion', entidadId: creada.insertId,
        usuarioOrigenId: req.user.usuario_id,
      }).catch(() => {});
    }

    return res.status(201).json({
      mensaje: resenaBloqueada
        ? 'Tu calificación quedó registrada, pero no el comentario porque incluye términos no permitidos.'
        : resena
          ? 'Gracias. Tu calificación quedó registrada y tu reseña pasará por revisión antes de publicarse.'
          : 'Gracias. Tu calificación quedó registrada.',
      puntuacion,
      resena_bloqueada: resenaBloqueada,
      promedio_profesional: promedio.promedio,
      total_evaluaciones: promedio.total,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[registrarEvaluacionTratamiento CU55]', error);
    return res.status(500).json({ error: 'NO_SE_PUDO_EVALUAR', mensaje: 'No pudimos registrar tu calificación. Vuelve a intentarlo.' });
  } finally {
    conexion.release();
  }
};

/**
 * CU55 — Evaluando satisfacción post-sesión
 * GET /api/clinica/tratamientos/por-evaluar   (Paciente)
 * Tratamientos cerrados que el paciente todavía no califica.
 */
exports.tratamientosPorEvaluar = async (req, res) => {
  try {
    const [tratamientos] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT ec.episodio_clinico_id, ec.motivo_consulta, ec.fecha_inicio, ec.fecha_terminado,
              ec.profesional_id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
                       CONCAT('Profesional #', ec.profesional_id)) AS profesional,
              es.nombre AS especialidad
         FROM Episodio_Clinico ec
         JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
         JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
         LEFT JOIN Usuario u ON u.usuario_id = pr.usuario_id
         LEFT JOIN Especialidad es ON es.especialidad_id = pr.especialidad_id
         LEFT JOIN Evaluacion_Satisfaccion e ON e.episodio_clinico_id = ec.episodio_clinico_id
        WHERE pa.usuario_id = ? AND UPPER(COALESCE(ec.estado, '')) = 'CERRADO'
          AND e.evaluacion_satisfaccion_id IS NULL
        ORDER BY ec.fecha_terminado DESC
        LIMIT 10`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ tratamientos });
  } catch (error) {
    console.error('[tratamientosPorEvaluar CU55]', error);
    return res.status(200).json({ tratamientos: [] });
  }
};

/**
 * CU55, CU52 — avisar al paciente que califique el tratamiento cerrado
 * Al cerrarse un episodio se le pide al paciente la calificación general del
 * tratamiento. Nunca lanza: el cierre no puede depender del aviso.
 */
exports.pedirEvaluacionTratamiento = async (conexion, episodioId) => {
  try {
    const [[fila]] = await conexion.query(
      `SELECT pa.usuario_id, ec.motivo_consulta,
              TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)) AS profesional
         FROM Episodio_Clinico ec
         JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
         JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
         JOIN Usuario u ON u.usuario_id = pr.usuario_id
        WHERE ec.episodio_clinico_id = ? LIMIT 1`,
      [episodioId]
    );
    if (!fila) return false;
    return C_Despachador_Notificaciones.notificarUsuario(
      conexion,
      fila.usuario_id,
      'EVALUAR_TRATAMIENTO',
      `Terminó tu tratamiento con ${fila.profesional || 'tu profesional'}. ¿Cómo lo calificarías? Tu opinión ayuda a otros pacientes a elegir.`,
      { datos: { pantalla: 'MisCitas', evaluar_episodio_id: Number(episodioId) } }
    );
  } catch (error) {
    console.error('[pedirEvaluacionTratamiento]', error.message);
    return false;
  }
};

/**
 * CU55 — Evaluando satisfacción post-sesión
 * GET /api/citas/evaluaciones/pendientes   (Paciente)
 *
 * Atenciones realizadas que todavía no se evalúan. Alimenta el acceso directo
 * de la Excepción 2 del CU55: si el modal no alcanzó a mostrarse, la
 * evaluación queda accesible igual desde Mis Citas.
 */
exports.pendientesDeEvaluar = async (req, res) => {
  try {
    const [citas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT c.cita_id, c.fecha_hora_inicio,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
                CONCAT('Profesional #', c.profesional_id)
              ) AS profesional
         FROM Cita c
         JOIN Paciente pa ON pa.paciente_id = c.paciente_id
         JOIN Profesional pr ON pr.profesional_id = c.profesional_id
         LEFT JOIN Usuario u ON u.usuario_id = pr.usuario_id
         LEFT JOIN Evaluacion_Satisfaccion e ON e.cita_id = c.cita_id
        WHERE pa.usuario_id = ?
          AND c.estado = 'REALIZADA'
          AND e.evaluacion_satisfaccion_id IS NULL
        ORDER BY c.fecha_hora_inicio DESC
        LIMIT 10`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ pendientes: citas });
  } catch (error) {
    console.error('[pendientesDeEvaluar CU55]', error);
    return res.status(200).json({ pendientes: [] });
  }
};

/**
 * CU58 — Calculando y visualizando calificación profesional
 * GET /api/profesionales/:profesional_id/resenas
 *
 * CU58: promedio, cantidad y los testimonios APROBADOS. Lo que está pendiente
 * o rechazado no sale de la moderación.
 */
exports.resenasPublicas = async (req, res) => {
  const { profesional_id } = req.params;
  try {
    const [[resumen]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT COUNT(e.puntuacion) AS total, COALESCE(AVG(e.puntuacion), 0) AS promedio
         FROM Evaluacion_Satisfaccion e
        WHERE e.profesional_id = ? AND e.puntuacion IS NOT NULL`,
      [profesional_id]
    );

    const [resenas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT e.evaluacion_satisfaccion_id, e.tipo, e.satisfecho, e.puntuacion, e.resena, e.momento_creacion,
              -- Nombre y la inicial del apellido, salvo que el paciente haya
              -- pedido aparecer como anónimo (Seguridad y privacidad).
              CASE WHEN pa.resena_anonima THEN 'Anónimo'
                   ELSE COALESCE(
                     NULLIF(TRIM(CONCAT(SUBSTRING_INDEX(TRIM(u.nombres), ' ', 1), ' ',
                                        COALESCE(CONCAT(LEFT(TRIM(u.apellido_paterno), 1), '.'), ''))), ''),
                     'Paciente')
              END AS autor
         FROM Evaluacion_Satisfaccion e
         LEFT JOIN Cita c ON c.cita_id = e.cita_id
         LEFT JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = e.episodio_clinico_id
         JOIN Paciente pa ON pa.paciente_id = COALESCE(c.paciente_id, ec.paciente_id)
         LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
        WHERE e.profesional_id = ?
          AND e.estado_moderacion = 'APROBADA'
          AND e.resena IS NOT NULL
        ORDER BY e.momento_creacion DESC
        LIMIT 30`,
      [profesional_id]
    );

    const total = Number(resumen.total || 0);
    return res.status(200).json({
      // Excepción 2 del CU58: sin evaluaciones no se inventa un promedio; se
      // devuelve cero y se marca el perfil como incipiente.
      promedio: total > 0 ? Number(Number(resumen.promedio).toFixed(2)) : 0,
      total_evaluaciones: total,
      perfil_incipiente: total === 0,
      resenas: resenas.map((r) => ({ ...r, resena: sanear(r.resena) })),
    });
  } catch (error) {
    console.error('[resenasPublicas CU58]', error);
    return res.status(500).json({ error: 'No se pudieron cargar las evaluaciones.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU56 — Moderación (Administrador)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CU56 — Moderando testimonios públicos
 * GET /api/evaluaciones/moderacion?estado=PENDIENTE
 */
exports.bandejaModeracion = async (req, res) => {
  const estado = String(req.query?.estado || ESTADOS.PENDIENTE).toUpperCase();
  if (!Object.values(ESTADOS).includes(estado)) {
    return res.status(400).json({ error: 'ESTADO_INVALIDO' });
  }

  try {
    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT e.evaluacion_satisfaccion_id, e.tipo, e.satisfecho, e.puntuacion, e.resena, e.estado_moderacion,
              e.motivo_rechazo, e.momento_creacion, e.momento_moderacion,
              c.cita_id, COALESCE(c.fecha_hora_inicio, ec.fecha_terminado) AS fecha_hora_inicio,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', pu.nombres, pu.apellido_paterno)), ''),
                CONCAT('Profesional #', e.profesional_id)
              ) AS profesional,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', au.nombres, au.apellido_paterno)), ''),
                'Paciente'
              ) AS paciente
         FROM Evaluacion_Satisfaccion e
         LEFT JOIN Cita c ON c.cita_id = e.cita_id
         LEFT JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = e.episodio_clinico_id
         JOIN Profesional pr ON pr.profesional_id = e.profesional_id
         LEFT JOIN Usuario pu ON pu.usuario_id = pr.usuario_id
         JOIN Paciente pa ON pa.paciente_id = COALESCE(c.paciente_id, ec.paciente_id)
         LEFT JOIN Usuario au ON au.usuario_id = pa.usuario_id
        WHERE e.estado_moderacion = ?
          AND e.resena IS NOT NULL
        ORDER BY e.momento_creacion ASC
        LIMIT 50`,
      [estado]
    );

    return res.status(200).json({
      // Excepción 2 del CU56: el texto se sanea antes de mostrarlo.
      evaluaciones: filas.map((f) => ({ ...f, resena: sanear(f.resena) })),
      estado,
    });
  } catch (error) {
    console.error('[bandejaModeracion CU56]', error);
    return res.status(500).json({ error: 'No se pudo cargar la bandeja de moderación.' });
  }
};

/**
 * CU56 — Moderando testimonios públicos
 * POST /api/evaluaciones/:id/moderar   { decision, motivo }
 *
 * Aprobar publica el testimonio; rechazar aplica el borrado lógico: la fila se
 * conserva con su causal, pero deja de estar disponible para lectura pública.
 */
exports.moderarResena = async (req, res) => {
  const decision = String(req.body?.decision || '').trim().toUpperCase();
  const motivo = sanear(req.body?.motivo).slice(0, 255);

  if (!['APROBAR', 'RECHAZAR'].includes(decision)) {
    return res.status(400).json({
      error: 'DECISION_INVALIDA',
      mensaje: 'Indica si apruebas o rechazas el testimonio.',
    });
  }

  // Excepción 3 del CU56: sin causal, el rechazo no se propaga al servidor.
  if (decision === 'RECHAZAR' && motivo.length < 4) {
    return res.status(400).json({
      error: 'MOTIVO_REQUERIDO',
      mensaje: 'Indica la causal del rechazo: queda registrada junto a la decisión.',
    });
  }

  const conexion = await C_Capa_de_Acceso_a_Datos.getConnection();

  try {
    await conexion.beginTransaction();

    const [[evaluacion]] = await conexion.execute(
      `SELECT e.evaluacion_satisfaccion_id, e.estado_moderacion, e.profesional_id
         FROM Evaluacion_Satisfaccion e
        WHERE e.evaluacion_satisfaccion_id = ? LIMIT 1 FOR UPDATE`,
      [req.params.id]
    );

    if (!evaluacion) {
      await conexion.rollback();
      return res.status(404).json({ error: 'EVALUACION_NO_ENCONTRADA' });
    }

    const nuevoEstado = decision === 'APROBAR' ? ESTADOS.APROBADA : ESTADOS.RECHAZADA;

    // Excepción 4 del CU56: si algo falla en la escritura, la transacción se
    // revierte y el testimonio se queda como estaba, pendiente.
    const [resultado] = await conexion.execute(
      `UPDATE Evaluacion_Satisfaccion
          SET estado_moderacion = ?,
              motivo_rechazo = ?,
              moderador_id = ?,
              momento_moderacion = NOW()
        WHERE evaluacion_satisfaccion_id = ?`,
      [nuevoEstado, decision === 'RECHAZAR' ? motivo : null, req.user.usuario_id, req.params.id]
    );

    if (resultado.affectedRows === 0) {
      await conexion.rollback();
      return res.status(500).json({
        error: 'NO_SE_GUARDO',
        mensaje: 'La decisión no se pudo guardar. El testimonio sigue pendiente.',
      });
    }

    // CU13: queda en la bitácora de auditoría
    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('MODERACION_TESTIMONIO', 'Evaluacion_Satisfaccion', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({
          evaluacion_satisfaccion_id: Number(req.params.id),
          decision: nuevoEstado,
          motivo: decision === 'RECHAZAR' ? motivo : null,
        }),
        req.user.usuario_id,
      ]
    );

    await conexion.commit();

    // CU52: aviso al profesional
    // Al profesional le interesa saber que tiene un testimonio publicado.
    if (nuevoEstado === ESTADOS.APROBADA) {
      C_Capa_de_Acceso_a_Datos
        .query(
          `SELECT u.usuario_id FROM Profesional p
             JOIN Usuario u ON u.usuario_id = p.usuario_id
            WHERE p.profesional_id = ? LIMIT 1`,
          [evaluacion.profesional_id]
        )
        .then(([filas]) => {
          if (filas[0]) {
            C_Despachador_Notificaciones.notificarUsuario(
              C_Capa_de_Acceso_a_Datos,
              filas[0].usuario_id,
              'TESTIMONIO_PUBLICADO',
              'Un paciente dejó un comentario sobre tu atención y ya está publicado en tu perfil.'
            ).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return res.status(200).json({
      mensaje:
        nuevoEstado === ESTADOS.APROBADA
          ? 'Testimonio publicado.'
          : 'Testimonio rechazado: deja de estar visible y queda con su causal.',
      estado: nuevoEstado,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[moderarResena CU56]', error);
    return res.status(500).json({
      error: 'ERROR_MODERACION',
      mensaje: 'No se pudo aplicar la decisión. El testimonio sigue pendiente.',
    });
  } finally {
    conexion.release();
  }
};
