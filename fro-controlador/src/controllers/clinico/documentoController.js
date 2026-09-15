// Ruta: fro-controlador/src/controllers/clinico/documentoController.js
//
// Repositorio multimedia de la ficha clínica:
// - CU33: carga de archivos externos con validación de formato y tamaño.
// - CU34: categorización mediante metadatos taxonómicos.
// - CU35: visor embebido con control de permisos (RBAC) y log de seguridad.
//
// El binario del archivo vive en Cloudinary; la base guarda URL y metadatos.

const pool = require('../../config/database');
const { cloudinary, cloudinaryConfigurado, subirBuffer } = require('../../config/cloudinary');
const { leerParametroEntero } = require('../../services/agenda/agendaService');
const { rechazarSiCerrado } = require('../../services/clinico/episodioService');

// ── Taxonomía de categorías (CU34) ───────────────────────────────────────────
const CATEGORIAS = [
  { clave: 'EXAMEN_IMAGENOLOGICO', nombre: 'Examen imagenológico' },
  { clave: 'EXAMEN_LABORATORIO', nombre: 'Examen de laboratorio' },
  { clave: 'INFORME_MEDICO', nombre: 'Informe médico externo' },
  { clave: 'RECETA', nombre: 'Receta o indicación' },
  { clave: 'CONSENTIMIENTO', nombre: 'Consentimiento firmado' },
  { clave: 'OTRO', nombre: 'Otro documento clínico' },
  { clave: 'SIN_CLASIFICAR', nombre: 'Sin clasificar' },
];

// ── Formatos (CU33 Excepción 2) ──────────────────────────────────────────────
// Solo formatos clínicamente útiles; todo lo ejecutable queda fuera.
// RF33 (D5): se aceptan también documentos Word (DOCX).
const EXTENSIONES_PERMITIDAS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'pdf', 'docx', 'mp4', 'mov'];

function obtenerIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    'IP_DESCONOCIDA'
  );
}

// Bitácora tolerante a fallos: un problema de auditoría no bota la operación.
async function auditar(req, accion, datos = {}) {
  try {
    await pool.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES (?, 'Documento_Clinico', ?, ?, ?)`,
      [accion, obtenerIP(req), JSON.stringify(datos), req.user?.usuario_id || null]
    );
  } catch (error) {
    console.error('[auditar documento]', error.message);
  }
}

// ── RBAC (CU35 Excepción 2) ──────────────────────────────────────────────────
// Un profesional accede solo a pacientes asignados (episodio o cita vigente);
// un paciente, solo a sus propios documentos; un administrador, a todos.
async function puedeAccederAPaciente(req, pacienteId) {
  const usuarioId = req.user?.usuario_id;
  const rol = req.user?.nombre_rol;

  if (rol === 'Administrador') return true;

  if (rol === 'Paciente') {
    const [filas] = await pool.query(
      `SELECT 1 FROM Paciente WHERE paciente_id = ? AND usuario_id = ? LIMIT 1`,
      [pacienteId, usuarioId]
    );
    return filas.length > 0;
  }

  if (rol === 'Profesional') {
    const [filas] = await pool.query(
      `SELECT 1 FROM Paciente p
        WHERE p.paciente_id = ? AND (
          p.paciente_id IN (
            SELECT ec.paciente_id FROM Episodio_Clinico ec
             INNER JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
             WHERE pr.usuario_id = ?
          )
          OR p.paciente_id IN (
            SELECT c.paciente_id FROM Cita c
             INNER JOIN Profesional pr ON pr.profesional_id = c.profesional_id
             WHERE pr.usuario_id = ? AND c.estado NOT LIKE 'CANCELADA%'
          )
        )
        LIMIT 1`,
      [pacienteId, usuarioId, usuarioId]
    );
    return filas.length > 0;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/documentos/categorias — taxonomía para el menú (CU34)
// ─────────────────────────────────────────────────────────────────────────────
exports.listarCategorias = (req, res) => {
  res.json({ ok: true, categorias: CATEGORIAS });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/pacientes/:pacienteId/documentos — carga multimedia (CU33)
// multer deja el archivo en req.file (buffer en memoria).
// ─────────────────────────────────────────────────────────────────────────────
exports.subirDocumento = async (req, res) => {
  try {
    const { pacienteId } = req.params;

    if (!cloudinaryConfigurado()) {
      return res.status(503).json({
        error: 'REPOSITORIO_NO_CONFIGURADO',
        mensaje: 'El repositorio multimedia no está configurado en el servidor. Avisa al administrador.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'ARCHIVO_FALTANTE',
        mensaje: 'No se recibió ningún archivo.',
      });
    }

    // RBAC de escritura: solo profesional asignado (o administrador).
    if (!(await puedeAccederAPaciente(req, pacienteId))) {
      await auditar(req, 'CARGA_DOCUMENTO_DENEGADA', { paciente_id: pacienteId });
      return res.status(403).json({
        error: 'ACCESO_DENEGADO',
        mensaje: 'No tienes permisos de escritura sobre la ficha de este paciente.',
      });
    }

    const nombreOriginal = req.file.originalname || 'archivo';
    const extension = (nombreOriginal.split('.').pop() || '').toLowerCase();

    // Excepción 2: extensión no soportada (ejecutables y similares).
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      await auditar(req, 'CARGA_DOCUMENTO_BLOQUEADA', {
        paciente_id: pacienteId, archivo: nombreOriginal, motivo: 'FORMATO_NO_PERMITIDO',
      });
      return res.status(400).json({
        error: 'FORMATO_NO_PERMITIDO',
        mensaje: `El formato .${extension || '?'} no está permitido por seguridad. Formatos aceptados: ${EXTENSIONES_PERMITIDAS.join(', ')}.`,
      });
    }

    // Excepción 1: tamaño sobre el límite parametrizado (Parametro_Global).
    const maxMB = await leerParametroEntero(pool, 'MAX_TAMANO_ARCHIVO_MB', 10);
    if (req.file.size > maxMB * 1024 * 1024) {
      return res.status(413).json({
        error: 'ARCHIVO_MUY_GRANDE',
        mensaje: `El archivo pesa ${(req.file.size / 1024 / 1024).toFixed(1)} MB y el máximo permitido es ${maxMB} MB. Comprime el documento e intenta de nuevo.`,
      });
    }

    // Categoría inicial: si no viene, queda SIN_CLASIFICAR (CU34 Excepción 2).
    const categoria = CATEGORIAS.some((c) => c.clave === req.body?.categoria)
      ? req.body.categoria
      : 'SIN_CLASIFICAR';

    const episodioId = req.body?.episodio_clinico_id || null;

    // CU78 Exc.3 (D12): no se adjunta a un episodio cerrado.
    if (await rechazarSiCerrado(pool, episodioId, res)) return;

    const [profesionales] = await pool.query(
      `SELECT profesional_id FROM Profesional WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (profesionales.length === 0) {
      return res.status(403).json({
        error: 'SOLO_PROFESIONALES',
        mensaje: 'Solo un profesional puede cargar documentos a la ficha.',
      });
    }

    // Excepción 4: si la transferencia a Cloudinary falla, no se persiste nada
    // y el profesional puede reiniciar la carga.
    let subida;
    try {
      subida = await subirBuffer(req.file.buffer, {
        folder: `fro-salud/paciente-${pacienteId}`,
        use_filename: true,
        filename_override: nombreOriginal,
        // Un DOCX no es imagen ni video: Cloudinary lo guarda tal cual ('raw').
        // Con 'auto' a veces lo clasificaba mal y la URL no servía.
        ...(extension === 'docx' ? { resource_type: 'raw' } : {}),
      });
    } catch (errorNube) {
      console.error('[subirDocumento] fallo Cloudinary:', errorNube.message);
      return res.status(502).json({
        error: 'CARGA_INTERRUMPIDA',
        mensaje: 'Se perdió la conexión con el repositorio durante la transferencia. Reinicia el proceso de carga.',
      });
    }

    const [resultado] = await pool.query(
      `INSERT INTO Documento_Clinico
         (nombre_original, categoria, formato, tamano_bytes, tipo_recurso,
          url_publica, public_id_cloud, paginas, paciente_id, episodio_clinico_id, profesional_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombreOriginal, categoria, extension, req.file.size,
        subida.resource_type, subida.secure_url, subida.public_id,
        subida.pages || null,
        pacienteId, episodioId, profesionales[0].profesional_id,
      ]
    );

    await auditar(req, 'CARGA_DOCUMENTO', {
      documento_id: resultado.insertId, paciente_id: pacienteId,
      archivo: nombreOriginal, categoria,
    });

    res.status(201).json({
      ok: true,
      documento_id: resultado.insertId,
      categoria,
      mensaje: 'Archivo cargado y asociado a la ficha clínica del paciente.',
    });
  } catch (error) {
    console.error('[subirDocumento]', error);
    res.status(500).json({ error: 'Error interno al cargar el documento.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/pacientes/:pacienteId/documentos?categoria=X — listado (CU34/35)
// ─────────────────────────────────────────────────────────────────────────────
exports.listarDocumentos = async (req, res) => {
  try {
    const { pacienteId } = req.params;
    const { categoria } = req.query;

    if (!(await puedeAccederAPaciente(req, pacienteId))) {
      // CU35 Excepción 2: intento sin autorización → log de seguridad.
      await auditar(req, 'ACCESO_DOCUMENTOS_DENEGADO', { paciente_id: pacienteId });
      return res.status(403).json({
        error: 'ACCESO_DENEGADO',
        mensaje: 'No tienes autorización para ver los documentos de este paciente.',
      });
    }

    const filtros = [pacienteId];
    let sqlCategoria = '';
    if (categoria) {
      sqlCategoria = 'AND d.categoria = ?';
      filtros.push(categoria);
    }

    const [documentos] = await pool.query(
      `SELECT d.documento_id, d.nombre_original, d.categoria, d.formato,
              d.tamano_bytes, d.tipo_recurso, d.fecha_carga, d.episodio_clinico_id,
              CONCAT(COALESCE(u.nombres, ''), ' ', COALESCE(u.apellido_paterno, '')) AS cargado_por
         FROM Documento_Clinico d
         LEFT JOIN Profesional pr ON pr.profesional_id = d.profesional_id
         LEFT JOIN Usuario u ON u.usuario_id = pr.usuario_id
        WHERE d.paciente_id = ? ${sqlCategoria}
        ORDER BY d.fecha_carga DESC`,
      filtros
    );

    res.json({ ok: true, documentos, categorias: CATEGORIAS });
  } catch (error) {
    console.error('[listarDocumentos]', error);
    res.status(500).json({ error: 'Error interno al listar documentos.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/mis-documentos — el paciente ve su propio repositorio (CU35)
// ─────────────────────────────────────────────────────────────────────────────
exports.misDocumentos = async (req, res) => {
  try {
    const [pacientes] = await pool.query(
      `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (pacientes.length === 0) {
      return res.status(404).json({
        error: 'PACIENTE_NO_ENCONTRADO',
        mensaje: 'Tu cuenta no tiene una ficha de paciente asociada.',
      });
    }
    req.params.pacienteId = pacientes[0].paciente_id;
    return exports.listarDocumentos(req, res);
  } catch (error) {
    console.error('[misDocumentos]', error);
    res.status(500).json({ error: 'Error interno al listar tus documentos.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /clinica/documentos/:id/categoria — reclasificación (CU34)
// ─────────────────────────────────────────────────────────────────────────────
exports.cambiarCategoria = async (req, res) => {
  try {
    const { id } = req.params;

    // Omisión de categoría → metadato por defecto (CU34 Excepción 2).
    const categoria = CATEGORIAS.some((c) => c.clave === req.body?.categoria)
      ? req.body.categoria
      : 'SIN_CLASIFICAR';

    const [[documento]] = await pool.query(
      `SELECT paciente_id, categoria FROM Documento_Clinico WHERE documento_id = ? LIMIT 1`,
      [id]
    );
    if (!documento) {
      return res.status(404).json({ error: 'DOCUMENTO_NO_ENCONTRADO' });
    }
    if (!(await puedeAccederAPaciente(req, documento.paciente_id))) {
      await auditar(req, 'RECLASIFICACION_DENEGADA', { documento_id: id });
      return res.status(403).json({ error: 'ACCESO_DENEGADO' });
    }

    await pool.query(
      `UPDATE Documento_Clinico SET categoria = ? WHERE documento_id = ?`,
      [categoria, id]
    );

    await auditar(req, 'RECLASIFICACION_DOCUMENTO', {
      documento_id: id, categoria_anterior: documento.categoria, categoria_nueva: categoria,
    });

    res.json({ ok: true, categoria, mensaje: 'Documento reclasificado e indexado.' });
  } catch (error) {
    console.error('[cambiarCategoria]', error);
    res.status(500).json({ error: 'Error interno al reclasificar el documento.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/documentos/:id/ver — datos para el visor embebido (CU35)
// ─────────────────────────────────────────────────────────────────────────────
exports.verDocumento = async (req, res) => {
  try {
    const { id } = req.params;

    const [[documento]] = await pool.query(
      `SELECT documento_id, nombre_original, categoria, formato, tipo_recurso,
              url_publica, public_id_cloud, paginas, tamano_bytes, fecha_carga, paciente_id
         FROM Documento_Clinico WHERE documento_id = ? LIMIT 1`,
      [id]
    );
    if (!documento) {
      return res.status(404).json({ error: 'DOCUMENTO_NO_ENCONTRADO' });
    }

    // CU35 Excepción 2: acceso sin autorización → deniega y registra en el log.
    if (!(await puedeAccederAPaciente(req, documento.paciente_id))) {
      await auditar(req, 'VISUALIZACION_DENEGADA', { documento_id: id });
      return res.status(403).json({
        error: 'ACCESO_DENEGADO',
        mensaje: 'No tienes autorización para visualizar este documento. El intento quedó registrado.',
      });
    }

    // El tipo de visor le dice a la app cómo renderizar sin descargar:
    // imagen → componente Image; video → visor web embebido; pdf → cada
    // página convertida a imagen por Cloudinary. Esto último reemplaza al
    // visor de Google, que mostraba "no hay vista previa": las cuentas nuevas
    // de Cloudinary bloquean la entrega del PDF original, pero sí entregan sus
    // páginas como JPG, así que la vista previa funciona igual.
    let visor = 'imagen';
    if (documento.formato === 'pdf') visor = 'pdf';
    else if (['mp4', 'mov'].includes(documento.formato)) visor = 'video';
    // DOCX (D5): el teléfono no lo renderiza solo; se muestra con el visor de
    // documentos de Google incrustado, que lee la URL pública del archivo.
    else if (documento.formato === 'docx') visor = 'documento';

    const urlVisor =
      visor === 'documento'
        ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(documento.url_publica)}`
        : documento.url_publica;

    let paginasUrls = [];
    if (visor === 'pdf') {
      let paginas = documento.paginas;
      // Documentos cargados antes de guardar el número de páginas: se consulta
      // una vez a Cloudinary y se persiste para no volver a preguntar.
      if (!paginas) {
        try {
          const recurso = await cloudinary.api.resource(documento.public_id_cloud, {
            resource_type: documento.tipo_recurso || 'image', pages: true,
          });
          paginas = recurso.pages || 1;
          await pool.query(`UPDATE Documento_Clinico SET paginas = ? WHERE documento_id = ?`, [paginas, id]);
        } catch (errorNube) {
          console.error('[verDocumento] sin conteo de páginas:', errorNube.message);
          paginas = 1;
        }
      }
      for (let n = 1; n <= Math.min(paginas, 60); n++) {
        paginasUrls.push(
          cloudinary.url(documento.public_id_cloud, {
            resource_type: 'image', page: n, format: 'jpg',
            width: 1200, crop: 'limit', quality: 'auto', secure: true,
          })
        );
      }
      documento.paginas = paginas;
    }

    // Enlace para abrir/descargar el archivo original en el navegador del
    // teléfono. Para PDF requiere habilitar en Cloudinary (Settings → Security)
    // "Allow delivery of PDF and ZIP files"; imágenes y videos salen siempre.
    const urlDescarga = cloudinary.url(documento.public_id_cloud, {
      resource_type: documento.tipo_recurso || 'image', flags: 'attachment', secure: true,
    });

    await auditar(req, 'VISUALIZACION_DOCUMENTO', { documento_id: id });

    const { public_id_cloud, ...publico } = documento;
    res.json({ ok: true, documento: { ...publico, visor, url_visor: urlVisor, paginas_urls: paginasUrls, url_descarga: urlDescarga } });
  } catch (error) {
    console.error('[verDocumento]', error);
    res.status(500).json({ error: 'Error interno al preparar el visor.' });
  }
};

exports.CATEGORIAS = CATEGORIAS;
