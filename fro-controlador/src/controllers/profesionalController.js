const db = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR PACIENTES ASIGNADOS (Por Profesional ID)
// ─────────────────────────────────────────────────────────────────────────────
exports.listarPacientesAsignados = async (req, res) => {
  try {
    const { profesionalId } = req.params;
    const { buscar = '' } = req.query;
    const busqueda = `%${buscar}%`;

    const [pacientes] = await db.query(
      `
      SELECT
        p.paciente_id,
        u.usuario_id,
        u.rut,
        CONCAT(COALESCE(u.nombres, ''), ' ', COALESCE(u.apellido_paterno, ''), ' ', COALESCE(u.apellido_materno, '')) AS nombre_completo,
        p.sexo_clinico,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.calle END AS calle,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.numero_calle END AS numero_calle,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.departamento END AS departamento,
        p.comuna_id,
        COUNT(DISTINCT ec.episodio_clinico_id) AS total_atenciones,
        MAX(ec.fecha_inicio) AS ultima_atencion
      FROM Paciente p
      LEFT JOIN Usuario u ON u.usuario_id = p.usuario_id
      LEFT JOIN Episodio_Clinico ec ON ec.paciente_id = p.paciente_id AND ec.profesional_id = ?
      WHERE (
          ec.paciente_id IS NOT NULL 
          OR p.paciente_id IN (SELECT paciente_id FROM Cita WHERE profesional_id = ? AND estado NOT LIKE 'CANCELADA%')
        )
        AND (
          u.nombres LIKE ?
          OR u.apellido_paterno LIKE ?
          OR u.apellido_materno LIKE ?
          OR u.rut LIKE ?
          OR CONCAT(COALESCE(u.nombres, ''), ' ', COALESCE(u.apellido_paterno, ''), ' ', COALESCE(u.apellido_materno, '')) LIKE ?
          OR p.paciente_id LIKE ?
        )
      GROUP BY
        p.paciente_id,
        u.usuario_id,
        u.rut,
        u.nombres,
        u.apellido_paterno,
        u.apellido_materno,
        p.privacidad_contacto,
        p.sexo_clinico,
        p.calle,
        p.numero_calle,
        p.departamento,
        p.comuna_id
      ORDER BY ultima_atencion DESC
      `,
      [profesionalId, profesionalId, busqueda, busqueda, busqueda, busqueda, busqueda, busqueda]
    );

    res.json({ ok: true, pacientes });
  } catch (error) {
    console.error('Error al listar pacientes asignados:', error);
    res.status(500).json({
      ok: false,
      message: 'Error de conexión con la base de datos',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OBTENER HISTORIAL CONSOLIDADO
// ─────────────────────────────────────────────────────────────────────────────
exports.obtenerHistorialPaciente = async (req, res) => {
  try {
    const { pacienteId } = req.params;
    // El token manda: el parámetro de la URL solo sirve de respaldo para
    // clientes antiguos, y nunca puede suplantar a la sesión.
    const usuarioId = req.user?.usuario_id || req.query.usuarioId;

    // Modificado para validar asignación tanto por episodio como por cita vigente
    const [[asignacion]] = await db.query(
      `
      SELECT 1 AS asignado
      FROM Paciente p
      WHERE p.paciente_id = ? AND (
        p.paciente_id IN (
          SELECT ec.paciente_id FROM Episodio_Clinico ec 
          INNER JOIN Profesional pr ON pr.profesional_id = ec.profesional_id WHERE pr.usuario_id = ?
        )
        OR p.paciente_id IN (
          SELECT c.paciente_id FROM Cita c 
          INNER JOIN Profesional pr ON pr.profesional_id = c.profesional_id WHERE pr.usuario_id = ? AND c.estado NOT LIKE 'CANCELADA%'
        )
      )
      LIMIT 1
      `,
      [pacienteId, usuarioId, usuarioId]
    );

    if (!asignacion) {
      return res.status(403).json({
        ok: false,
        message: 'Paciente no asignado al profesional',
      });
    }

    const [[paciente]] = await db.query(
      `
      SELECT
        p.paciente_id,
        u.rut,
        CONCAT(COALESCE(u.nombres, ''), ' ', COALESCE(u.apellido_paterno, ''), ' ', COALESCE(u.apellido_materno, '')) AS nombre_completo,
        p.sexo_clinico,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.calle END AS calle,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.numero_calle END AS numero_calle,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.departamento END AS departamento,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE co.nombre END AS comuna,
        -- CU09: el paciente puede ocultar su dirección. La app necesita saber
        -- si está oculta para explicarlo, en vez de mostrar un espacio vacío.
        COALESCE(JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false, FALSE) AS direccion_oculta,
        p.comuna_id
      FROM Paciente p
      LEFT JOIN Usuario u ON u.usuario_id = p.usuario_id
      LEFT JOIN Comuna co ON co.comuna_id = p.comuna_id
      WHERE p.paciente_id = ?
      LIMIT 1
      `,
      [pacienteId]
    );

    const [historial] = await db.query(
      `
      SELECT
        c.cita_id,
        c.fecha_hora_inicio,
        c.fecha_hora_fin,
        c.estado,
        -- Modalidad real de la cita. Las citas anteriores a que se guardara
        -- la modalidad heredan la del profesional (salvo AMBOS, que no dice nada).
        COALESCE(c.modalidad, NULLIF(pr.tipo_sede, 'AMBOS')) AS modalidad,
        c.sesion_certificada_en,
        c.certificacion_tipo,
        -- CU42: estado de la conformidad para que la app bloquee el boton una
        -- vez firmada (tipo FIRMA) y muestre rechazo o envio por correo.
        JSON_UNQUOTE(JSON_EXTRACT(c.firma_conformidad_datos, '$.tipo')) AS firma_tipo,
        JSON_UNQUOTE(JSON_EXTRACT(c.firma_conformidad_datos, '$.momento')) AS firma_momento,
        COALESCE(CONCAT(u.nombres, ' ', u.apellido_paterno, ' ', u.apellido_materno), 'Profesional no registrado') AS profesional,
        COALESCE(e.nombre, 'Especialidad no registrada') AS especialidad,
        -- Las citas con OTROS profesionales se listan para que la agenda del
        -- paciente se vea completa, pero solo las propias se pueden gestionar:
        -- la app bloquea los botones de las ajenas y el servidor rechaza
        -- cualquier transicion sobre ellas (403 CITA_AJENA).
        (pr.usuario_id = ?) AS es_propia
      FROM Cita c
      LEFT JOIN Profesional pr ON pr.profesional_id = c.profesional_id
      LEFT JOIN Usuario u ON u.usuario_id = pr.usuario_id
      LEFT JOIN Especialidad e ON e.especialidad_id = pr.especialidad_id
      WHERE c.paciente_id = ?
      ORDER BY c.fecha_hora_inicio DESC
      `,
      [usuarioId, pacienteId]
    );

    const [episodios] = await db.query(
      `
      SELECT
        episodio_clinico_id,
        motivo_consulta,
        fecha_inicio,
        fecha_terminado,
        estado,
        paciente_id,
        profesional_id
      FROM Episodio_Clinico
      WHERE paciente_id = ?
      ORDER BY fecha_inicio DESC
      `,
      [pacienteId]
    );

    const [evoluciones] = await db.query(
      `
      SELECT
        ec.evolucion_clinica_id,
        ec.inalterable,
        ec.hora_firma_digital,
        ec.firma_digital,
        ec.porcentaje_objetivo,
        ec.respuesta_fisiologica,
        ec.tecnicas_aplicadas,
        ec.episodio_clinico_id,
        ec.profesional_id,
        ep.motivo_consulta,
        ep.fecha_inicio AS fecha_episodio,
        (SELECT COUNT(*) FROM Evolucion_Version ev
          WHERE ev.evolucion_clinica_id = ec.evolucion_clinica_id) AS total_versiones
      FROM Evolucion_Clinica ec
      INNER JOIN Episodio_Clinico ep ON ep.episodio_clinico_id = ec.episodio_clinico_id
      WHERE ep.paciente_id = ?
      ORDER BY ec.evolucion_clinica_id DESC
      `,
      [pacienteId]
    );

    // CU33/CU35: el repositorio multimedia opera si Cloudinary está configurado.
    const multimediaDisponible = Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );

    const [[conteoDocumentos]] = await db.query(
      `SELECT COUNT(*) AS total FROM Documento_Clinico WHERE paciente_id = ?`,
      [pacienteId]
    );

    res.json({
      ok: true,
      paciente,
      historial,
      episodios,
      evoluciones,
      multimediaDisponible,
      totalDocumentos: conteoDocumentos.total,
      mensajeMultimedia: multimediaDisponible
        ? ''
        : 'Archivos multimedia temporalmente no disponibles. Se muestran únicamente registros clínicos de texto.',
    });
  } catch (error) {
    console.error('Error al obtener historial consolidado:', error);
    res.status(500).json({
      ok: false,
      message: 'Error de conexión con la base de datos',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR PACIENTES POR USUARIO PROFESIONAL (Basado en la Cuenta de Usuario)
// ─────────────────────────────────────────────────────────────────────────────
exports.listarPacientesPorUsuarioProfesional = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { buscar = '' } = req.query;
    const busqueda = `%${buscar}%`;

    const [pacientes] = await db.query(
      `
      SELECT
        p.paciente_id,
        u.usuario_id,
        u.rut,
        CONCAT(COALESCE(u.nombres, ''), ' ', COALESCE(u.apellido_paterno, ''), ' ', COALESCE(u.apellido_materno, '')) AS nombre_completo,
        p.sexo_clinico,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.calle END AS calle,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.numero_calle END AS numero_calle,
        CASE WHEN JSON_EXTRACT(p.privacidad_contacto, '$.mostrar_direccion') = false
             THEN NULL ELSE p.departamento END AS departamento,
        p.comuna_id,
        COUNT(DISTINCT ec.episodio_clinico_id) AS total_atenciones,
        MAX(ec.fecha_inicio) AS ultima_atencion
      FROM Paciente p
      LEFT JOIN Usuario u ON u.usuario_id = p.usuario_id
      LEFT JOIN Episodio_Clinico ec ON ec.paciente_id = p.paciente_id
        AND ec.profesional_id IN (SELECT profesional_id FROM Profesional WHERE usuario_id = ?)
      WHERE (
          ec.paciente_id IS NOT NULL
          OR p.paciente_id IN (
            SELECT c.paciente_id 
            FROM Cita c 
            JOIN Profesional pr ON c.profesional_id = pr.profesional_id 
            WHERE pr.usuario_id = ? AND c.estado NOT LIKE 'CANCELADA%'
          )
        )
        AND (
          u.nombres LIKE ?
          OR u.apellido_paterno LIKE ?
          OR u.apellido_materno LIKE ?
          OR u.rut LIKE ?
          OR CONCAT(COALESCE(u.nombres, ''), ' ', COALESCE(u.apellido_paterno, ''), ' ', COALESCE(u.apellido_materno, '')) LIKE ?
          OR p.paciente_id LIKE ?
        )
      GROUP BY
        p.paciente_id,
        u.usuario_id,
        u.rut,
        u.nombres,
        u.apellido_paterno,
        u.apellido_materno,
        p.privacidad_contacto,
        p.sexo_clinico,
        p.calle,
        p.numero_calle,
        p.departamento,
        p.comuna_id
      ORDER BY ultima_atencion DESC
      `,
      [usuarioId, usuarioId, busqueda, busqueda, busqueda, busqueda, busqueda, busqueda]
    );

    res.json({ ok: true, pacientes });
  } catch (error) {
    console.error('Error al listar pacientes por usuario profesional:', error);
    res.status(500).json({
      ok: false,
      message: 'Error de conexión con la base de datos',
    });
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// CU10 — Catálogo de perfil profesional (D1)
// El profesional gestiona lo que el paciente ve al buscar hora: fotografía,
// reseña curricular, áreas de experticia y modalidad general de atención.
// ─────────────────────────────────────────────────────────────────────────────
const { cloudinaryConfigurado, subirBuffer } = require('../config/cloudinary');

const MODALIDADES = ['DOMICILIO', 'ONLINE', 'AMBOS'];
const LIMITE_RESENA = 1000;
const LIMITE_AREAS = 255;
const EXTENSIONES_FOTO = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

async function perfilDeUsuario(usuarioId) {
  const [[perfil]] = await db.query(
    `SELECT p.profesional_id, p.num_registro_salud, p.reseña_curricular AS resena_curricular,
            p.areas_experticia, p.tipo_sede, p.foto_url, p.calificacion_promedio,
            e.nombre AS especialidad,
            u.nombres, u.apellido_paterno, u.apellido_materno, u.email
       FROM Profesional p
       JOIN Usuario u ON u.usuario_id = p.usuario_id
       LEFT JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
      WHERE p.usuario_id = ? LIMIT 1`,
    [usuarioId]
  );
  if (!perfil) return null;
  // 'default.jpg' es el marcador del registro: no es una URL utilizable.
  if (perfil.foto_url === 'default.jpg') perfil.foto_url = null;
  return perfil;
}

async function auditarPerfil(req, accion, datos) {
  try {
    await db.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES (?, 'Profesional', ?, ?, ?)`,
      [accion, req.ip || null, JSON.stringify(datos), req.user?.usuario_id ?? null]
    );
  } catch (error) {
    console.error('[auditarPerfil]', error.message);
  }
}

/** GET /profesionales/mi-perfil */
exports.obtenerMiPerfil = async (req, res) => {
  try {
    const perfil = await perfilDeUsuario(req.user.usuario_id);
    if (!perfil) {
      return res.status(404).json({ error: 'No se encontró tu perfil profesional.' });
    }
    return res.status(200).json({
      ...perfil,
      modalidades: MODALIDADES,
      limites: { resena: LIMITE_RESENA, areas: LIMITE_AREAS, foto_mb: MAX_FOTO_BYTES / 1024 / 1024 },
    });
  } catch (error) {
    console.error('[obtenerMiPerfil]', error);
    return res.status(500).json({ error: 'No se pudo cargar tu perfil.' });
  }
};

/** PUT /profesionales/mi-perfil  { resena_curricular, areas_experticia, tipo_sede } */
exports.actualizarMiPerfil = async (req, res) => {
  const resena = String(req.body?.resena_curricular ?? '').trim();
  const areas = String(req.body?.areas_experticia ?? '').trim();
  const modalidad = String(req.body?.tipo_sede ?? '').trim().toUpperCase();

  // CU10 Exc.4: la reseña tiene un largo máximo; no se trunca en silencio.
  if (resena.length > LIMITE_RESENA) {
    return res.status(400).json({
      error: 'RESENA_MUY_LARGA',
      mensaje: `La reseña curricular admite hasta ${LIMITE_RESENA} caracteres (tienes ${resena.length}).`,
    });
  }
  if (areas.length > LIMITE_AREAS) {
    return res.status(400).json({
      error: 'AREAS_MUY_LARGAS',
      mensaje: `Las áreas de experticia admiten hasta ${LIMITE_AREAS} caracteres.`,
    });
  }
  // CU10 Exc.5: la modalidad de atención es obligatoria.
  if (!MODALIDADES.includes(modalidad)) {
    return res.status(400).json({
      error: 'MODALIDAD_REQUERIDA',
      mensaje: 'Indica la modalidad de atención: a domicilio, virtual o ambas.',
    });
  }

  try {
    const [resultado] = await db.query(
      `UPDATE Profesional
          SET reseña_curricular = ?, areas_experticia = ?, tipo_sede = ?
        WHERE usuario_id = ?`,
      [resena, areas || null, modalidad, req.user.usuario_id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'No se encontró tu perfil profesional.' });
    }
    await auditarPerfil(req, 'ACTUALIZACION_PERFIL_PROFESIONAL', { modalidad, largo_resena: resena.length });
    return res.status(200).json({ mensaje: 'Perfil actualizado. Los pacientes ya ven la información nueva.' });
  } catch (error) {
    console.error('[actualizarMiPerfil]', error);
    // CU10 Exc.6: fallo de persistencia.
    return res.status(500).json({ error: 'No se pudieron guardar los cambios. Intenta nuevamente.' });
  }
};

/** POST /profesionales/mi-perfil/foto  (multipart, campo "foto") */
exports.subirFotoPerfil = async (req, res) => {
  if (!cloudinaryConfigurado()) {
    return res.status(503).json({
      error: 'REPOSITORIO_NO_CONFIGURADO',
      mensaje: 'El repositorio de imágenes no está configurado en el servidor.',
    });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'ARCHIVO_FALTANTE', mensaje: 'No se recibió ninguna imagen.' });
  }

  // CU10 Exc.3: formato y peso de la fotografía.
  const extension = (req.file.originalname?.split('.').pop() || '').toLowerCase();
  if (!EXTENSIONES_FOTO.includes(extension)) {
    return res.status(400).json({
      error: 'FORMATO_NO_PERMITIDO',
      mensaje: `La fotografía debe ser JPG, PNG, WEBP o HEIC (recibido: .${extension || '?'}).`,
    });
  }
  if (req.file.size > MAX_FOTO_BYTES) {
    return res.status(413).json({
      error: 'FOTO_MUY_PESADA',
      mensaje: `La fotografía pesa ${(req.file.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${MAX_FOTO_BYTES / 1024 / 1024} MB.`,
    });
  }

  try {
    const subida = await subirBuffer(req.file.buffer, {
      folder: `fro-salud/perfiles`,
      public_id: `profesional-${req.user.usuario_id}`,
      overwrite: true,
      resource_type: 'image',
      transformation: [{ width: 600, height: 600, crop: 'fill', gravity: 'face' }],
    });

    const [resultado] = await db.query(
      `UPDATE Profesional SET foto_url = ? WHERE usuario_id = ?`,
      [subida.secure_url, req.user.usuario_id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'No se encontró tu perfil profesional.' });
    }
    await auditarPerfil(req, 'ACTUALIZACION_FOTO_PROFESIONAL', { public_id: subida.public_id });
    return res.status(200).json({ mensaje: 'Fotografía actualizada.', foto_url: subida.secure_url });
  } catch (error) {
    console.error('[subirFotoPerfil]', error);
    return res.status(502).json({
      error: 'CARGA_INTERRUMPIDA',
      mensaje: 'No se pudo subir la fotografía al repositorio. Intenta nuevamente.',
    });
  }
};
