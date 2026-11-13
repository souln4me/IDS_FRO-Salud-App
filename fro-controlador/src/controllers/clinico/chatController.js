/**
 * Componente: C_API_REST
 * Casos de uso: CU53, CU57, CU52, CU33, CU35.
 *
 * CU53 — Mensajería clínica cifrada entre paciente y profesional.
 * CU57 — Filtro de contenido restringido aplicado a cada envío.
 *
 * El chat es UNO por pareja paciente–profesional (antes había uno por
 * episodio). El vínculo que autoriza a los dos participantes es haber tenido
 * un episodio o una cita entre ellos; se puede escribir mientras exista un
 * episodio abierto o una cita vigente, y si no, la conversación queda como
 * historial de solo lectura (Excepción 3). El administrador no entra acá: la
 * poscondición del CU53 es que el intercambio quede ilegible para terceros.
 *
 * Cada mensaje puede llevar un adjunto: una imagen o archivo subido desde el
 * teléfono (se guarda en Cloudinary, como el repositorio de la ficha) o un
 * documento que ya está en la ficha del paciente (se referencia, no se copia).
 *
 * En vez de WebSockets, la app vuelve a preguntar cada pocos segundos por los
 * mensajes posteriores al último que ya tiene. Se decidió así con el equipo: el
 * servicio duerme en el plan gratuito de Render y una conexión permanente se
 * cae constantemente, mientras que la consulta incremental es liviana y se
 * recupera sola.
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Cifrado_Mensajeria = require('../../componentes/C_Cifrado_Mensajeria');
const C_Filtro_Contenido = require('../../componentes/C_Filtro_Contenido');
const C_Despachador_Notificaciones = require('../../componentes/C_Despachador_Notificaciones');
const C_API_Adapter = require('../../componentes/C_API_Adapter');
const {
  EXTENSIONES_PERMITIDAS, prepararVisor, puedeAccederAPaciente,
} = require('./documentoController');

const LIMITE_MENSAJE = 1000;
const EXTENSIONES_IMAGEN = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'];
const EXTENSIONES_VIDEO = ['mp4', 'mov'];

// Apoyo común: identificador de la pareja paciente–profesional, para agrupar sus avisos
const claveConversacion = (pacienteId, profesionalId) => `${Number(pacienteId)}-${Number(profesionalId)}`;

// CU53: clasifica el adjunto por su formato (imagen, video o documento)
function tipoAdjunto(formato) {
  if (EXTENSIONES_IMAGEN.includes(formato)) return 'IMAGEN';
  if (EXTENSIONES_VIDEO.includes(formato)) return 'VIDEO';
  return 'DOCUMENTO';
}

/**
 * CU53 — Comunicando mediante mensajería clínica cifrada
 * La pareja y el papel de quien pregunta. Devuelve null si el usuario no es
 * parte de la conversación o si nunca hubo un vínculo clínico entre ambos.
 */
async function contextoConversacion(pacienteId, profesionalId, usuarioId) {
  const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT pa.paciente_id, pr.profesional_id,
            pac_u.usuario_id AS usuario_paciente,
            pro_u.usuario_id AS usuario_profesional,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pac_u.nombres, pac_u.apellido_paterno)), ''),
                     CONCAT('Paciente #', pa.paciente_id)) AS paciente,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pro_u.nombres, pro_u.apellido_paterno)), ''),
                     CONCAT('Profesional #', pr.profesional_id)) AS profesional,
            pa.foto_url AS foto_paciente, pr.foto_url AS foto_profesional,
            EXISTS(SELECT 1 FROM Episodio_Clinico e
                    WHERE e.paciente_id = pa.paciente_id AND e.profesional_id = pr.profesional_id) AS hubo_episodio,
            EXISTS(SELECT 1 FROM Cita c
                    WHERE c.paciente_id = pa.paciente_id AND c.profesional_id = pr.profesional_id
                      AND c.estado NOT LIKE 'CANCELADA%') AS hubo_cita,
            EXISTS(SELECT 1 FROM Mensaje_Chat m
                    WHERE m.paciente_id = pa.paciente_id AND m.profesional_id = pr.profesional_id) AS hubo_mensajes,
            EXISTS(SELECT 1 FROM Episodio_Clinico e
                    WHERE e.paciente_id = pa.paciente_id AND e.profesional_id = pr.profesional_id
                      AND COALESCE(e.estado, 'ABIERTO') <> 'CERRADO') AS episodio_abierto,
            EXISTS(SELECT 1 FROM Cita c
                    WHERE c.paciente_id = pa.paciente_id AND c.profesional_id = pr.profesional_id
                      AND (c.estado = 'EN_CURSO'
                           OR (c.estado IN ('AGENDADA', 'CONFIRMADA') AND c.fecha_hora_fin >= NOW()))) AS cita_vigente,
            (SELECT e.episodio_clinico_id FROM Episodio_Clinico e
              WHERE e.paciente_id = pa.paciente_id AND e.profesional_id = pr.profesional_id
                AND COALESCE(e.estado, 'ABIERTO') <> 'CERRADO'
              ORDER BY e.fecha_inicio DESC LIMIT 1) AS episodio_abierto_id
       FROM Paciente pa
       LEFT JOIN Usuario pac_u ON pac_u.usuario_id = pa.usuario_id
       JOIN Profesional pr ON pr.profesional_id = ?
       LEFT JOIN Usuario pro_u ON pro_u.usuario_id = pr.usuario_id
      WHERE pa.paciente_id = ? LIMIT 1`,
    [profesionalId, pacienteId]
  );
  if (!fila) return null;

  let papel = null;
  if (Number(fila.usuario_paciente) === Number(usuarioId)) papel = 'PACIENTE';
  else if (Number(fila.usuario_profesional) === Number(usuarioId)) papel = 'PROFESIONAL';
  if (!papel) return null;

  const hayVinculo = Boolean(Number(fila.hubo_episodio) || Number(fila.hubo_cita) || Number(fila.hubo_mensajes));
  if (!hayVinculo) return null;

  return {
    ...fila,
    papel,
    puede_escribir: Boolean(Number(fila.episodio_abierto) || Number(fila.cita_vigente)),
  };
}

// CU53: respuestas de rechazo (conversación ajena o de solo lectura)
function rechazarAjena(res) {
  return res.status(403).json({
    error: 'CONVERSACION_AJENA',
    mensaje: 'Esta conversación es entre un paciente y un profesional que lo atiende.',
  });
}

function rechazarSoloLectura(res) {
  return res.status(409).json({
    error: 'CONVERSACION_SOLO_LECTURA',
    mensaje: 'No hay un episodio abierto ni una cita vigente entre ustedes: la conversación quedó como historial de solo lectura. Se reabre al agendar una nueva hora.',
  });
}

/** CU53 — Convierte una fila cifrada en algo mostrable. */
function aMensaje(fila, usuarioId) {
  const { ok, texto } = C_Cifrado_Mensajeria.descifrar(fila.contenido_cifrado);
  let adjunto = null;
  if (fila.documento_id) {
    adjunto = {
      origen: 'FICHA',
      documento_id: fila.documento_id,
      nombre: fila.doc_nombre || 'Documento de la ficha',
      formato: fila.doc_formato,
      tipo: tipoAdjunto(fila.doc_formato),
      // La miniatura solo se entrega para imágenes.
      url: tipoAdjunto(fila.doc_formato) === 'IMAGEN' ? fila.doc_url : null,
    };
  } else if (fila.adjunto_url) {
    adjunto = {
      origen: 'CHAT',
      nombre: fila.adjunto_nombre,
      formato: fila.adjunto_formato,
      tipo: tipoAdjunto(fila.adjunto_formato),
      url: tipoAdjunto(fila.adjunto_formato) === 'IMAGEN' ? fila.adjunto_url : null,
      bytes: fila.adjunto_bytes,
    };
  }
  return {
    mensaje_id: fila.mensaje_id,
    momento_envio: fila.momento_envio,
    mio: Number(fila.remitente_usuario_id) === Number(usuarioId),
    remitente: fila.remitente,
    leido: Boolean(fila.leido),
    // Excepción 4 del CU53: si no se puede descifrar, se dice claramente en vez
    // de mostrar un bloque de caracteres sin sentido.
    ilegible: !ok,
    contenido: ok
      ? texto
      : 'No se pudo leer este mensaje: la clave de cifrado del servidor cambió. Pide al administrador que la restablezca.',
    adjunto,
  };
}

/**
 * CU52 — Emitiendo notificaciones multicanal (aviso de mensaje nuevo del CU53)
 * Un solo aviso por conversación: si el destinatario ya tiene uno sin leer de
 * este chat, se actualiza con la cantidad de mensajes pendientes y sube al
 * principio, en vez de sumar un aviso (y un push) por cada mensaje.
 */
async function avisarMensajeNuevo({ destinatario, quien, contexto }) {
  const clave = claveConversacion(contexto.paciente_id, contexto.profesional_id);

  const [[previo]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT notificacion_id FROM Notificacion
      WHERE usuario_id = ? AND tipo = 'MENSAJE_CLINICO' AND leida = FALSE
        AND JSON_UNQUOTE(JSON_EXTRACT(datos, '$.conversacion')) = ?
      ORDER BY notificacion_id DESC LIMIT 1`,
    [destinatario, clave]
  );

  if (previo) {
    const [[pendientes]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT COUNT(*) AS total FROM Mensaje_Chat
        WHERE paciente_id = ? AND profesional_id = ? AND remitente_usuario_id <> ?
          AND leido = FALSE AND bloqueado = FALSE`,
      [contexto.paciente_id, contexto.profesional_id, destinatario]
    );
    const total = Math.max(2, Number(pendientes.total) || 0);
    await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Notificacion
          SET titulo = ?, contenido = ?, momento_envio = CURRENT_TIMESTAMP
        WHERE notificacion_id = ?`,
      [`${total} mensajes nuevos`, `${quien} te escribió ${total} mensajes.`, previo.notificacion_id]
    );
    return;
  }

  await C_Despachador_Notificaciones.notificarUsuario(C_Capa_de_Acceso_a_Datos, destinatario, 'MENSAJE_CLINICO', `${quien} te escribió un mensaje.`, {
    datos: {
      pantalla: 'ChatClinico',
      conversacion: clave,
      pacienteId: contexto.paciente_id,
      profesionalId: contexto.profesional_id,
      nombreOtro: quien,
    },
  });
}

/** CU53 — Guarda un mensaje cifrado (con o sin adjunto) y avisa a la otra parte. */
async function guardarMensaje(req, contexto, { contenido, adjunto = null, documentoId = null }) {
  const [resultado] = await C_Capa_de_Acceso_a_Datos.query(
    `INSERT INTO Mensaje_Chat
        (contenido_cifrado, remitente_usuario_id, paciente_id, profesional_id, episodio_clinico_id,
         adjunto_url, adjunto_public_id, adjunto_nombre, adjunto_formato, adjunto_tipo_recurso,
         adjunto_bytes, documento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      C_Cifrado_Mensajeria.cifrar(contenido), req.user.usuario_id, contexto.paciente_id, contexto.profesional_id,
      contexto.episodio_abierto_id || null,
      adjunto?.url || null, adjunto?.public_id || null, adjunto?.nombre || null,
      adjunto?.formato || null, adjunto?.tipo_recurso || null, adjunto?.bytes || null,
      documentoId,
    ]
  );

  // El chat NO escala eventos críticos (CU62) al administrador: es cifrado y
  // solo lo leen los dos participantes (poscondición del CU53). Decisión de
  // Pablo, 03-11-2026. Síntomas, reseñas y tickets sí escalan.

  // Aviso a la otra parte por los canales del CU52.
  const destinatario = contexto.papel === 'PACIENTE' ? contexto.usuario_profesional : contexto.usuario_paciente;
  const quien = contexto.papel === 'PACIENTE' ? contexto.paciente : contexto.profesional;
  avisarMensajeNuevo({ destinatario, quien, contexto }).catch(() => {});

  return resultado.insertId;
}

/**
 * CU57 — el texto se contrasta con el diccionario ANTES de escribirse.
 * Responde y devuelve false si no pasa; true si se puede guardar.
 */
async function textoPermitido(req, res, contexto, contenido, { opcional = false } = {}) {
  if (contenido.length > LIMITE_MENSAJE) {
    res.status(400).json({ error: 'MENSAJE_MUY_LARGO', mensaje: `El mensaje admite hasta ${LIMITE_MENSAJE} caracteres.` });
    return false;
  }
  if (opcional && !contenido.trim()) return true;

  const revision = await C_Filtro_Contenido.revisar(contenido);
  if (revision.permitido) return true;

  // El intento queda en la bitácora (sin el texto: la poscondición del CU57
  // es que el contenido restringido no se almacene).
  C_Capa_de_Acceso_a_Datos
    .query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('BLOQUEO_CONTENIDO_RESTRINGIDO', 'Mensaje_Chat', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({
          paciente_id: contexto.paciente_id, profesional_id: contexto.profesional_id,
          motivo: revision.motivo, terminos: revision.coincidencias,
        }),
        req.user.usuario_id,
      ]
    )
    .catch(() => {});

  res.status(revision.motivo === 'VACIO' ? 400 : 422).json({
    error: revision.motivo,
    mensaje: revision.mensaje,
    terminos: revision.coincidencias,
  });
  return false;
}

// CU53: valida que quien llama sea parte de la conversación de la ruta
async function contextoDeRuta(req, res) {
  const contexto = await contextoConversacion(req.params.paciente_id, req.params.profesional_id, req.user.usuario_id);
  if (!contexto) {
    rechazarAjena(res);
    return null;
  }
  return contexto;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/chat/:paciente_id/:profesional_id/mensajes?desde_id=0
// Con desde_id devuelve solo lo nuevo: es lo que consulta la app cada pocos
// segundos mientras la conversación está abierta.
// ─────────────────────────────────────────────────────────────────────────────
// CU53 — Comunicando mediante mensajería clínica cifrada
exports.listarMensajes = async (req, res) => {
  const desdeId = Number.parseInt(req.query?.desde_id, 10) || 0;

  try {
    const contexto = await contextoDeRuta(req, res);
    if (!contexto) return;

    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT m.mensaje_id, m.contenido_cifrado, m.momento_envio, m.remitente_usuario_id, m.leido,
              m.adjunto_url, m.adjunto_nombre, m.adjunto_formato, m.adjunto_bytes, m.documento_id,
              d.nombre_original AS doc_nombre, d.formato AS doc_formato, d.url_publica AS doc_url,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''), 'Usuario') AS remitente
         FROM Mensaje_Chat m
         LEFT JOIN Usuario u ON u.usuario_id = m.remitente_usuario_id
         LEFT JOIN Documento_Clinico d ON d.documento_id = m.documento_id
        WHERE m.paciente_id = ? AND m.profesional_id = ?
          AND m.mensaje_id > ?
          AND m.bloqueado = FALSE
        ORDER BY m.mensaje_id ASC
        LIMIT 200`,
      [contexto.paciente_id, contexto.profesional_id, desdeId]
    );

    // Lo que llega del otro queda marcado como leído al abrirlo.
    if (filas.some((f) => Number(f.remitente_usuario_id) !== Number(req.user.usuario_id) && !f.leido)) {
      C_Capa_de_Acceso_a_Datos
        .query(
          `UPDATE Mensaje_Chat SET leido = TRUE
            WHERE paciente_id = ? AND profesional_id = ? AND remitente_usuario_id <> ? AND leido = FALSE`,
          [contexto.paciente_id, contexto.profesional_id, req.user.usuario_id]
        )
        .catch(() => {});
    }

    // Abrir la conversación equivale a ver su aviso: se marca leído para que
    // el próximo mensaje genere uno nuevo en vez de sumarse a uno ya visto.
    C_Capa_de_Acceso_a_Datos
      .query(
        `UPDATE Notificacion SET leida = TRUE
          WHERE usuario_id = ? AND tipo = 'MENSAJE_CLINICO' AND leida = FALSE
            AND JSON_UNQUOTE(JSON_EXTRACT(datos, '$.conversacion')) = ?`,
        [req.user.usuario_id, claveConversacion(contexto.paciente_id, contexto.profesional_id)]
      )
      .catch(() => {});

    const esPaciente = contexto.papel === 'PACIENTE';
    const foto = esPaciente ? contexto.foto_profesional : contexto.foto_paciente;
    return res.status(200).json({
      mensajes: filas.map((f) => aMensaje(f, req.user.usuario_id)),
      conversacion: {
        paciente_id: contexto.paciente_id,
        profesional_id: contexto.profesional_id,
        papel: contexto.papel,
        con: esPaciente ? contexto.profesional : contexto.paciente,
        foto: foto && foto !== 'default.jpg' ? foto : null,
        episodio_abierto_id: contexto.episodio_abierto_id || null,
      },
      puede_escribir: contexto.puede_escribir,
      // Excepción 3 del CU53: sin episodio abierto ni cita vigente se lee, no se escribe.
      motivo_bloqueo: contexto.puede_escribir
        ? null
        : 'No hay un episodio abierto ni una cita vigente entre ustedes: puedes leer el historial, pero ya no se envían mensajes nuevos.',
    });
  } catch (error) {
    console.error('[listarMensajes CU53]', error);
    return res.status(500).json({ error: 'ERROR_MENSAJES', mensaje: 'No se pudieron cargar los mensajes.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/chat/:paciente_id/:profesional_id/mensajes   { contenido }
// Filtra (CU57), cifra y guarda. Si el filtro bloquea, el texto no toca la
// base: se responde 422 y el autor lo reescribe.
// ─────────────────────────────────────────────────────────────────────────────
// CU53, CU57 — filtrar, cifrar y enviar un mensaje de texto
exports.enviarMensaje = async (req, res) => {
  const contenido = String(req.body?.contenido ?? '');

  try {
    const contexto = await contextoDeRuta(req, res);
    if (!contexto) return;
    if (!contexto.puede_escribir) return rechazarSoloLectura(res);
    if (!(await textoPermitido(req, res, contexto, contenido))) return;

    const mensajeId = await guardarMensaje(req, contexto, { contenido: contenido.trim() });
    return res.status(201).json({ mensaje_id: mensajeId, mensaje: 'Mensaje enviado.' });
  } catch (error) {
    console.error('[enviarMensaje CU53]', error);
    // Excepción 2: la app conserva el mensaje y lo reintenta.
    return res.status(503).json({
      error: 'ENVIO_RETENIDO',
      mensaje: 'No pudimos enviar tu mensaje. Queda guardado y se reintenta solo.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/chat/:paciente_id/:profesional_id/adjuntos   (multipart: archivo, contenido?)
// Imagen o archivo desde el teléfono. Mismos formatos y tope que el
// repositorio de la ficha (CU33).
// ─────────────────────────────────────────────────────────────────────────────
// CU53, CU57 — enviar una imagen o archivo por el chat
exports.enviarAdjunto = async (req, res) => {
  const contenido = String(req.body?.contenido ?? '');

  try {
    const contexto = await contextoDeRuta(req, res);
    if (!contexto) return;
    if (!contexto.puede_escribir) return rechazarSoloLectura(res);

    if (!C_API_Adapter.cloudinaryConfigurado()) {
      return res.status(503).json({ error: 'REPOSITORIO_NO_DISPONIBLE', mensaje: 'El almacenamiento de archivos no está configurado en el servidor.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'ARCHIVO_FALTANTE', mensaje: 'No se recibió ningún archivo.' });
    }

    const nombreOriginal = req.file.originalname || 'archivo';
    const formato = (nombreOriginal.split('.').pop() || '').toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(formato)) {
      return res.status(400).json({
        error: 'FORMATO_NO_PERMITIDO',
        mensaje: `El formato .${formato || '?'} no está permitido. Formatos aceptados: ${EXTENSIONES_PERMITIDAS.join(', ')}.`,
      });
    }
    const maxMB = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'MAX_TAMANO_ARCHIVO_MB', 10);
    if (req.file.size > maxMB * 1024 * 1024) {
      return res.status(413).json({
        error: 'ARCHIVO_MUY_GRANDE',
        mensaje: `El archivo pesa ${(req.file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${maxMB} MB.`,
      });
    }
    if (!(await textoPermitido(req, res, contexto, contenido, { opcional: true }))) return;

    // CU33: mismo repositorio en la nube que la ficha
    let subida;
    try {
      subida = await C_API_Adapter.subirBuffer(req.file.buffer, {
        folder: `fro-salud/chat-${contexto.paciente_id}-${contexto.profesional_id}`,
        use_filename: true,
        filename_override: nombreOriginal,
        ...(formato === 'docx' ? { resource_type: 'raw' } : {}),
      });
    } catch (errorNube) {
      console.error('[enviarAdjunto] fallo Cloudinary:', errorNube.message);
      return res.status(502).json({
        error: 'CARGA_INTERRUMPIDA',
        mensaje: 'Se perdió la conexión con el repositorio durante la transferencia. Vuelve a adjuntar el archivo.',
      });
    }

    const mensajeId = await guardarMensaje(req, contexto, {
      contenido: contenido.trim(),
      adjunto: {
        url: subida.secure_url, public_id: subida.public_id, nombre: nombreOriginal,
        formato, tipo_recurso: subida.resource_type, bytes: req.file.size,
      },
    });
    return res.status(201).json({ mensaje_id: mensajeId, mensaje: 'Archivo enviado.' });
  } catch (error) {
    console.error('[enviarAdjunto CU53]', error);
    return res.status(500).json({ error: 'ENVIO_FALLIDO', mensaje: 'No se pudo enviar el archivo. Intenta nuevamente.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/chat/:paciente_id/:profesional_id/documento   { documento_id, contenido? }
// Comparte un documento que ya está en la ficha del paciente (CU35): se
// referencia, no se duplica.
// ─────────────────────────────────────────────────────────────────────────────
// CU53, CU57 — compartir por el chat un documento de la ficha
exports.compartirDocumento = async (req, res) => {
  const documentoId = Number(req.body?.documento_id);
  const contenido = String(req.body?.contenido ?? '');

  try {
    const contexto = await contextoDeRuta(req, res);
    if (!contexto) return;
    if (!contexto.puede_escribir) return rechazarSoloLectura(res);

    const [[documento]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT documento_id, paciente_id, nombre_original FROM Documento_Clinico WHERE documento_id = ? LIMIT 1`,
      [documentoId]
    );
    // Solo documentos del paciente de esta conversación, y que quien envía pueda ver.
    if (!documento || Number(documento.paciente_id) !== Number(contexto.paciente_id)
        || !(await puedeAccederAPaciente(req, documento.paciente_id))) {
      return res.status(404).json({ error: 'DOCUMENTO_NO_DISPONIBLE', mensaje: 'Ese documento no existe o no pertenece a este paciente.' });
    }
    if (!(await textoPermitido(req, res, contexto, contenido, { opcional: true }))) return;

    const mensajeId = await guardarMensaje(req, contexto, { contenido: contenido.trim(), documentoId });
    return res.status(201).json({ mensaje_id: mensajeId, mensaje: `Se envió "${documento.nombre_original}" por el chat.` });
  } catch (error) {
    console.error('[compartirDocumento CU53]', error);
    return res.status(500).json({ error: 'ENVIO_FALLIDO', mensaje: 'No se pudo enviar el documento. Intenta nuevamente.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/chat/adjuntos/:mensaje_id/ver — visor del adjunto (mismo formato que CU35)
// ─────────────────────────────────────────────────────────────────────────────
// CU53, CU35 — ver un adjunto del chat con el visor embebido
exports.verAdjunto = async (req, res) => {
  try {
    const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT mensaje_id, paciente_id, profesional_id, adjunto_url, adjunto_public_id, adjunto_nombre,
              adjunto_formato, adjunto_tipo_recurso, adjunto_bytes, adjunto_paginas, momento_envio
         FROM Mensaje_Chat WHERE mensaje_id = ? AND adjunto_url IS NOT NULL LIMIT 1`,
      [req.params.mensaje_id]
    );
    if (!fila) return res.status(404).json({ error: 'ADJUNTO_NO_ENCONTRADO' });
    const contexto = await contextoConversacion(fila.paciente_id, fila.profesional_id, req.user.usuario_id);
    if (!contexto) return rechazarAjena(res);

    const vista = await prepararVisor(
      {
        formato: fila.adjunto_formato, url_publica: fila.adjunto_url,
        public_id_cloud: fila.adjunto_public_id, tipo_recurso: fila.adjunto_tipo_recurso,
        paginas: fila.adjunto_paginas,
      },
      async (paginas) => C_Capa_de_Acceso_a_Datos.query(`UPDATE Mensaje_Chat SET adjunto_paginas = ? WHERE mensaje_id = ?`, [paginas, fila.mensaje_id])
    );
    return res.json({
      ok: true,
      documento: {
        nombre_original: fila.adjunto_nombre,
        formato: fila.adjunto_formato,
        tamano_bytes: fila.adjunto_bytes,
        fecha_carga: fila.momento_envio,
        categoria: 'ADJUNTO_CHAT',
        paginas: vista.paginas,
        ...vista.campos,
      },
    });
  } catch (error) {
    console.error('[verAdjunto CU53]', error);
    return res.status(500).json({ error: 'Error interno al preparar el visor.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/mis-conversaciones
// Una conversación por cada paciente/profesional con el que hay vínculo, con
// el último movimiento y los no leídos. Es la bandeja desde la que se entra.
// ─────────────────────────────────────────────────────────────────────────────
// CU53 — Comunicando mediante mensajería clínica cifrada
exports.misConversaciones = async (req, res) => {
  try {
    const usuarioId = req.user.usuario_id;
    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT v.paciente_id, v.profesional_id,
              (pac_u.usuario_id = ?) AS soy_paciente,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pac_u.nombres, pac_u.apellido_paterno)), ''),
                       CONCAT('Paciente #', v.paciente_id)) AS paciente,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pro_u.nombres, pro_u.apellido_paterno)), ''),
                       CONCAT('Profesional #', v.profesional_id)) AS profesional,
              pr.foto_url AS foto_profesional, pa.foto_url AS foto_paciente,
              es.nombre AS especialidad,
              (SELECT COUNT(*) FROM Mensaje_Chat m
                WHERE m.paciente_id = v.paciente_id AND m.profesional_id = v.profesional_id
                  AND m.remitente_usuario_id <> ? AND m.leido = FALSE AND m.bloqueado = FALSE) AS sin_leer,
              (SELECT MAX(m.momento_envio) FROM Mensaje_Chat m
                WHERE m.paciente_id = v.paciente_id AND m.profesional_id = v.profesional_id) AS ultimo_momento,
              (SELECT e.motivo_consulta FROM Episodio_Clinico e
                WHERE e.paciente_id = v.paciente_id AND e.profesional_id = v.profesional_id
                ORDER BY (COALESCE(e.estado, 'ABIERTO') <> 'CERRADO') DESC, e.fecha_inicio DESC LIMIT 1) AS motivo_consulta,
              (EXISTS(SELECT 1 FROM Episodio_Clinico e
                       WHERE e.paciente_id = v.paciente_id AND e.profesional_id = v.profesional_id
                         AND COALESCE(e.estado, 'ABIERTO') <> 'CERRADO')
               OR EXISTS(SELECT 1 FROM Cita c
                       WHERE c.paciente_id = v.paciente_id AND c.profesional_id = v.profesional_id
                         AND (c.estado = 'EN_CURSO'
                              OR (c.estado IN ('AGENDADA', 'CONFIRMADA') AND c.fecha_hora_fin >= NOW())))) AS activa
         FROM (
           SELECT paciente_id, profesional_id FROM Episodio_Clinico
           UNION
           SELECT paciente_id, profesional_id FROM Cita WHERE estado NOT LIKE 'CANCELADA%'
           UNION
           SELECT paciente_id, profesional_id FROM Mensaje_Chat WHERE paciente_id IS NOT NULL AND profesional_id IS NOT NULL
         ) v
         JOIN Paciente pa ON pa.paciente_id = v.paciente_id
         LEFT JOIN Usuario pac_u ON pac_u.usuario_id = pa.usuario_id
         JOIN Profesional pr ON pr.profesional_id = v.profesional_id
         LEFT JOIN Usuario pro_u ON pro_u.usuario_id = pr.usuario_id
         LEFT JOIN Especialidad es ON es.especialidad_id = pr.especialidad_id
        WHERE pac_u.usuario_id = ? OR pro_u.usuario_id = ?
        ORDER BY activa DESC, COALESCE(ultimo_momento, '1970-01-01') DESC
        LIMIT 80`,
      [usuarioId, usuarioId, usuarioId, usuarioId]
    );

    return res.status(200).json({
      conversaciones: filas.map((f) => {
        const soyPaciente = Number(f.soy_paciente) === 1;
        const foto = soyPaciente ? f.foto_profesional : f.foto_paciente;
        return {
          paciente_id: f.paciente_id,
          profesional_id: f.profesional_id,
          con: soyPaciente ? f.profesional : f.paciente,
          // El paciente ve la especialidad; el profesional, el motivo del episodio.
          detalle: soyPaciente ? f.especialidad : f.motivo_consulta,
          // 'default.jpg' es el marcador del registro, no una imagen real.
          foto: foto && foto !== 'default.jpg' ? foto : null,
          activa: Boolean(Number(f.activa)),
          sin_leer: Number(f.sin_leer) || 0,
          ultimo_momento: f.ultimo_momento,
        };
      }),
    });
  } catch (error) {
    console.error('[misConversaciones CU53]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus conversaciones.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilidad: avisos y versiones de la app anteriores al chat general
// abrían la conversación por episodio. Se traduce el episodio a su pareja.
// GET/POST /clinica/episodio/:episodio_id/mensajes
// ─────────────────────────────────────────────────────────────────────────────
// CU53 — Comunicando mediante mensajería clínica cifrada (acceso antiguo por episodio)
async function conParejaDelEpisodio(req, res, siguiente) {
  try {
    const [[episodio]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT paciente_id, profesional_id FROM Episodio_Clinico WHERE episodio_clinico_id = ? LIMIT 1`,
      [req.params.episodio_id]
    );
    if (!episodio) return rechazarAjena(res);
    req.params.paciente_id = episodio.paciente_id;
    req.params.profesional_id = episodio.profesional_id;
    return siguiente(req, res);
  } catch (error) {
    console.error('[chat por episodio]', error);
    return res.status(500).json({ error: 'ERROR_MENSAJES', mensaje: 'No se pudieron cargar los mensajes.' });
  }
}
exports.listarMensajesEpisodio = (req, res) => conParejaDelEpisodio(req, res, exports.listarMensajes);
exports.enviarMensajeEpisodio = (req, res) => conParejaDelEpisodio(req, res, exports.enviarMensaje);

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/chat/con/:paciente_id  (Profesional)
// Desde la ficha, el profesional abre SU conversación con ese paciente.
// ─────────────────────────────────────────────────────────────────────────────
// CU53 — Comunicando mediante mensajería clínica cifrada
exports.conversacionConPaciente = async (req, res) => {
  try {
    const [[profesional]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT profesional_id FROM Profesional WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (!profesional) return rechazarAjena(res);
    const contexto = await contextoConversacion(req.params.paciente_id, profesional.profesional_id, req.user.usuario_id);
    if (!contexto) return rechazarAjena(res);
    return res.json({ paciente_id: contexto.paciente_id, profesional_id: contexto.profesional_id, con: contexto.paciente });
  } catch (error) {
    console.error('[conversacionConPaciente]', error);
    return res.status(500).json({ error: 'No se pudo abrir la conversación.' });
  }
};
