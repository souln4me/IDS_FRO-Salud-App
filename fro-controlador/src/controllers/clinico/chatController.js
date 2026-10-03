/**
 * CU53 — Mensajería clínica cifrada entre paciente y profesional.
 * CU57 — Filtro de contenido restringido aplicado a cada envío.
 *
 * El chat cuelga del episodio clínico: ese es el vínculo que autoriza a los dos
 * participantes y nada más. El administrador no entra acá — la poscondición del
 * CU53 es que el intercambio quede ilegible para terceros.
 *
 * En vez de WebSockets, la app vuelve a preguntar cada pocos segundos por los
 * mensajes posteriores al último que ya tiene. Se decidió así con el equipo: el
 * servicio duerme en el plan gratuito de Render y una conexión permanente se
 * cae constantemente, mientras que la consulta incremental es liviana y se
 * recupera sola.
 */

const pool = require('../../config/database');
const { cifrar, descifrar } = require('../../services/clinico/cifradoService');
const { revisar } = require('../../services/clinico/filtroContenidoService');
const { notificarUsuario } = require('../../services/agenda/agendaService');
const { estaCerrado } = require('../../services/clinico/episodioService');

const LIMITE_MENSAJE = 1000;

/**
 * Datos del episodio y del papel que juega quien pregunta.
 * Devuelve null si el usuario no es parte de esa conversación.
 */
async function contextoConversacion(episodioId, usuarioId) {
  const [[fila]] = await pool.query(
    `SELECT ec.episodio_clinico_id, ec.motivo_consulta, ec.estado,
            ec.paciente_id, ec.profesional_id,
            pac_u.usuario_id AS usuario_paciente,
            pro_u.usuario_id AS usuario_profesional,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', pac_u.nombres, pac_u.apellido_paterno)), ''),
              CONCAT('Paciente #', ec.paciente_id)
            ) AS paciente,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', pro_u.nombres, pro_u.apellido_paterno)), ''),
              CONCAT('Profesional #', ec.profesional_id)
            ) AS profesional
       FROM Episodio_Clinico ec
       JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
       LEFT JOIN Usuario pac_u ON pac_u.usuario_id = pa.usuario_id
       JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
       LEFT JOIN Usuario pro_u ON pro_u.usuario_id = pr.usuario_id
      WHERE ec.episodio_clinico_id = ? LIMIT 1`,
    [episodioId]
  );

  if (!fila) return null;

  if (fila.usuario_paciente === usuarioId) return { ...fila, papel: 'PACIENTE' };
  if (fila.usuario_profesional === usuarioId) return { ...fila, papel: 'PROFESIONAL' };
  return null;
}

/** Convierte una fila cifrada en algo mostrable. */
function aMensaje(fila, usuarioId) {
  const { ok, texto } = descifrar(fila.contenido_cifrado);
  return {
    mensaje_id: fila.mensaje_id,
    momento_envio: fila.momento_envio,
    mio: fila.remitente_usuario_id === usuarioId,
    remitente: fila.remitente,
    leido: Boolean(fila.leido),
    // Excepción 4 del CU53: si no se puede descifrar, se dice claramente en vez
    // de mostrar un bloque de caracteres sin sentido.
    ilegible: !ok,
    contenido: ok
      ? texto
      : 'No se pudo leer este mensaje: la clave de cifrado del servidor cambió. Pide al administrador que la restablezca.',
  };
}

/**
 * GET /api/clinica/episodio/:episodio_id/mensajes?desde_id=0
 *
 * Con desde_id devuelve solo lo nuevo: es lo que consulta la app cada pocos
 * segundos mientras la conversación está abierta.
 */
/**
 * Un solo aviso por conversación: si el destinatario ya tiene uno sin leer de
 * este chat, se actualiza con la cantidad de mensajes pendientes y sube al
 * principio, en vez de sumar un aviso (y un push) por cada mensaje.
 */
async function avisarMensajeNuevo({ destinatario, quien, episodioId, motivo }) {
  const conversacion = `la conversación de "${motivo || 'tu tratamiento'}"`;

  const [[previo]] = await pool.query(
    `SELECT notificacion_id FROM Notificacion
      WHERE usuario_id = ? AND tipo = 'MENSAJE_CLINICO' AND leida = FALSE
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(datos, '$.episodioId')) AS UNSIGNED) = ?
      ORDER BY notificacion_id DESC LIMIT 1`,
    [destinatario, episodioId]
  );

  if (previo) {
    const [[pendientes]] = await pool.query(
      `SELECT COUNT(*) AS total FROM Mensaje_Chat
        WHERE episodio_clinico_id = ? AND remitente_usuario_id <> ?
          AND leido = FALSE AND bloqueado = FALSE`,
      [episodioId, destinatario]
    );
    const total = Math.max(2, Number(pendientes.total) || 0);
    await pool.query(
      `UPDATE Notificacion
          SET titulo = ?, contenido = ?, momento_envio = CURRENT_TIMESTAMP
        WHERE notificacion_id = ?`,
      [
        `${total} mensajes nuevos`,
        `${quien} te escribió ${total} mensajes en ${conversacion}.`,
        previo.notificacion_id,
      ]
    );
    return;
  }

  await notificarUsuario(
    pool,
    destinatario,
    'MENSAJE_CLINICO',
    `${quien} te escribió en ${conversacion}.`,
    { datos: { pantalla: 'ChatClinico', episodioId, nombreOtro: quien } }
  );
}

exports.listarMensajes = async (req, res) => {
  const { episodio_id } = req.params;
  const desdeId = Number.parseInt(req.query?.desde_id, 10) || 0;

  try {
    const contexto = await contextoConversacion(episodio_id, req.user.usuario_id);
    if (!contexto) {
      return res.status(403).json({
        error: 'CONVERSACION_AJENA',
        mensaje: 'Esta conversación es entre el paciente y su profesional tratante.',
      });
    }

    const [filas] = await pool.query(
      `SELECT m.mensaje_id, m.contenido_cifrado, m.momento_envio, m.remitente_usuario_id, m.leido,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
                'Usuario'
              ) AS remitente
         FROM Mensaje_Chat m
         LEFT JOIN Usuario u ON u.usuario_id = m.remitente_usuario_id
        WHERE m.episodio_clinico_id = ?
          AND m.mensaje_id > ?
          AND m.bloqueado = FALSE
        ORDER BY m.mensaje_id ASC
        LIMIT 200`,
      [episodio_id, desdeId]
    );

    // Lo que llega del otro queda marcado como leído al abrirlo.
    if (filas.some((f) => f.remitente_usuario_id !== req.user.usuario_id && !f.leido)) {
      pool
        .query(
          `UPDATE Mensaje_Chat SET leido = TRUE
            WHERE episodio_clinico_id = ? AND remitente_usuario_id <> ? AND leido = FALSE`,
          [episodio_id, req.user.usuario_id]
        )
        .catch(() => {});
    }

    // Abrir la conversación equivale a ver su aviso: se marca leído para que
    // el próximo mensaje genere uno nuevo en vez de sumarse a uno ya visto.
    pool
      .query(
        `UPDATE Notificacion SET leida = TRUE
          WHERE usuario_id = ? AND tipo = 'MENSAJE_CLINICO' AND leida = FALSE
            AND CAST(JSON_UNQUOTE(JSON_EXTRACT(datos, '$.episodioId')) AS UNSIGNED) = ?`,
        [req.user.usuario_id, Number(episodio_id)]
      )
      .catch(() => {});

    // Excepción 3 del CU53: sobre un episodio cerrado se lee, no se escribe.
    const cerrado = estaCerrado(contexto.estado);

    return res.status(200).json({
      mensajes: filas.map((f) => aMensaje(f, req.user.usuario_id)),
      conversacion: {
        episodio_clinico_id: contexto.episodio_clinico_id,
        motivo_consulta: contexto.motivo_consulta,
        con: contexto.papel === 'PACIENTE' ? contexto.profesional : contexto.paciente,
        papel: contexto.papel,
        // Desde el chat, el profesional salta a la ficha clínica del paciente
        // y el paciente al perfil público del profesional.
        paciente_id: contexto.papel === 'PACIENTE' ? undefined : contexto.paciente_id,
        profesional_id: contexto.papel === 'PACIENTE' ? contexto.profesional_id : undefined,
      },
      puede_escribir: !cerrado,
      motivo_bloqueo: cerrado
        ? 'Este episodio está cerrado: puedes leer el historial, pero ya no se envían mensajes nuevos.'
        : null,
    });
  } catch (error) {
    console.error('[listarMensajes CU53]', error);
    return res.status(500).json({
      error: 'ERROR_MENSAJES',
      mensaje: 'No se pudieron cargar los mensajes.',
    });
  }
};

/**
 * POST /api/clinica/episodio/:episodio_id/mensajes   { contenido }
 *
 * Filtra (CU57), cifra y guarda. Si el filtro bloquea, el texto no toca la
 * base: se responde 422 y el autor lo reescribe.
 */
exports.enviarMensaje = async (req, res) => {
  const { episodio_id } = req.params;
  const contenido = String(req.body?.contenido ?? '');

  try {
    const contexto = await contextoConversacion(episodio_id, req.user.usuario_id);
    if (!contexto) {
      return res.status(403).json({
        error: 'CONVERSACION_AJENA',
        mensaje: 'Esta conversación es entre el paciente y su profesional tratante.',
      });
    }

    // Excepción 3: el episodio cerrado suprime la caja de entrada.
    if (estaCerrado(contexto.estado)) {
      return res.status(409).json({
        error: 'EPISODIO_CERRADO',
        mensaje: 'Este episodio está cerrado: su conversación quedó como historial de solo lectura.',
      });
    }

    if (contenido.length > LIMITE_MENSAJE) {
      return res.status(400).json({
        error: 'MENSAJE_MUY_LARGO',
        mensaje: `El mensaje admite hasta ${LIMITE_MENSAJE} caracteres.`,
      });
    }

    // CU57 — el texto se contrasta con el diccionario ANTES de escribirse.
    const revision = await revisar(contenido);
    if (!revision.permitido) {
      // El intento queda en la bitácora (sin el texto: la poscondición del
      // CU57 es que el contenido restringido no se almacene).
      pool
        .query(
          `INSERT INTO Bitacora_Auditoria
              (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
           VALUES ('BLOQUEO_CONTENIDO_RESTRINGIDO', 'Mensaje_Chat', ?, ?, ?)`,
          [
            req.ip || null,
            JSON.stringify({
              episodio_clinico_id: Number(episodio_id),
              motivo: revision.motivo,
              terminos: revision.coincidencias,
            }),
            req.user.usuario_id,
          ]
        )
        .catch(() => {});

      return res.status(revision.motivo === 'VACIO' ? 400 : 422).json({
        error: revision.motivo,
        mensaje: revision.mensaje,
        terminos: revision.coincidencias,
      });
    }

    const [resultado] = await pool.query(
      `INSERT INTO Mensaje_Chat
          (contenido_cifrado, remitente_usuario_id, episodio_clinico_id)
       VALUES (?, ?, ?)`,
      [cifrar(contenido.trim()), req.user.usuario_id, episodio_id]
    );

    // Aviso a la otra parte por los canales del CU52.
    const destinatario =
      contexto.papel === 'PACIENTE' ? contexto.usuario_profesional : contexto.usuario_paciente;
    const quien = contexto.papel === 'PACIENTE' ? contexto.paciente : contexto.profesional;

    avisarMensajeNuevo({
      destinatario,
      quien,
      episodioId: Number(episodio_id),
      motivo: contexto.motivo_consulta,
    }).catch(() => {});

    return res.status(201).json({
      mensaje_id: resultado.insertId,
      mensaje: 'Mensaje enviado.',
    });
  } catch (error) {
    console.error('[enviarMensaje CU53]', error);
    // Excepción 2: la app conserva el mensaje y lo reintenta.
    return res.status(503).json({
      error: 'ENVIO_RETENIDO',
      mensaje: 'No pudimos enviar tu mensaje. Queda guardado y se reintenta solo.',
    });
  }
};

/**
 * GET /api/clinica/mis-conversaciones
 *
 * Los episodios en los que el usuario participa, con el último mensaje y los
 * no leídos. Es la bandeja desde la que se entra al chat.
 */
exports.misConversaciones = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT ec.episodio_clinico_id, ec.motivo_consulta, ec.estado,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', pac_u.nombres, pac_u.apellido_paterno)), ''),
                CONCAT('Paciente #', ec.paciente_id)
              ) AS paciente,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', pro_u.nombres, pro_u.apellido_paterno)), ''),
                CONCAT('Profesional #', ec.profesional_id)
              ) AS profesional,
              (pac_u.usuario_id = ?) AS soy_paciente,
              pr.foto_url AS foto_profesional,
              (SELECT COUNT(*) FROM Mensaje_Chat m
                WHERE m.episodio_clinico_id = ec.episodio_clinico_id
                  AND m.remitente_usuario_id <> ? AND m.leido = FALSE
                  AND m.bloqueado = FALSE)                       AS sin_leer,
              (SELECT MAX(m.momento_envio) FROM Mensaje_Chat m
                WHERE m.episodio_clinico_id = ec.episodio_clinico_id) AS ultimo_momento
         FROM Episodio_Clinico ec
         JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
         LEFT JOIN Usuario pac_u ON pac_u.usuario_id = pa.usuario_id
         JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
         LEFT JOIN Usuario pro_u ON pro_u.usuario_id = pr.usuario_id
        WHERE pac_u.usuario_id = ? OR pro_u.usuario_id = ?
        ORDER BY (ec.estado <> 'CERRADO') DESC,
                 COALESCE(ultimo_momento, ec.fecha_inicio) DESC
        LIMIT 50`,
      [req.user.usuario_id, req.user.usuario_id, req.user.usuario_id, req.user.usuario_id]
    );

    return res.status(200).json({
      conversaciones: filas.map((f) => ({
        episodio_clinico_id: f.episodio_clinico_id,
        motivo_consulta: f.motivo_consulta,
        estado: f.estado,
        con: Number(f.soy_paciente) === 1 ? f.profesional : f.paciente,
        // Foto del profesional (la ve el paciente). 'default.jpg' es el
        // marcador del registro, no una imagen real.
        foto:
          Number(f.soy_paciente) === 1 && f.foto_profesional && f.foto_profesional !== 'default.jpg'
            ? f.foto_profesional
            : null,
        sin_leer: Number(f.sin_leer) || 0,
        ultimo_momento: f.ultimo_momento,
      })),
    });
  } catch (error) {
    console.error('[misConversaciones CU53]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus conversaciones.' });
  }
};
