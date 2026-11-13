// Componente: C_API_REST
// Casos de uso: CU51, CU37, CU33, CU65, CU52, CU55.
//
// Alta del tratamiento: CU51 (preparación para el alta) y CU37 (informe de
// alta y cierre del episodio).

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_API_Adapter = require('../../componentes/C_API_Adapter');
const C_Despachador_Notificaciones = require('../../componentes/C_Despachador_Notificaciones');
const C_Control_Acceso_Clinico = require('../../componentes/C_Control_Acceso_Clinico');
const C_Motor_Clinico = require('../../componentes/C_Motor_Clinico');
const C_Gestor_Alta_Clinica = require('../../componentes/C_Gestor_Alta_Clinica');

// Apoyo común: IP de origen para la bitácora
function obtenerIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;
}

/**
 * CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
 * GET /api/clinica/mi-alta   (Paciente)
 * Avance hacia el umbral de egreso, los contenidos de prevención cuando ya
 * están habilitados y el informe de alta si el episodio se cerró con uno.
 */
exports.miAlta = async (req, res) => {
  try {
    const [[paciente]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (!paciente) return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });

    // El episodio abierto más reciente; si no hay ninguno, el último cerrado
    // (para seguir viendo los contenidos y el informe después del alta).
    const [[episodio]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT ec.episodio_clinico_id, ec.motivo_consulta, ec.estado, ec.fecha_inicio, ec.fecha_terminado,
              ec.preparacion_alta_en, ec.pautas_continuidad, ec.informe_alta_emitido_en,
              e.nombre AS especialidad,
              d.documento_id, d.nombre_original AS informe_nombre, d.fecha_carga AS informe_fecha
         FROM Episodio_Clinico ec
         LEFT JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
         LEFT JOIN Especialidad e ON e.especialidad_id = pr.especialidad_id
         LEFT JOIN Documento_Clinico d ON d.documento_id = ec.informe_alta_documento_id
        WHERE ec.paciente_id = ?
        ORDER BY (UPPER(COALESCE(ec.estado, 'ABIERTO')) = 'CERRADO') ASC, ec.episodio_clinico_id DESC
        LIMIT 1`,
      [paciente.paciente_id]
    );
    if (!episodio) {
      return res.status(200).json({ hay_episodio: false, umbral: 80, habilitada: false, metas: [], recursos: [] });
    }

    const evaluacion = await C_Gestor_Alta_Clinica.evaluarPreparacionAlta(C_Capa_de_Acceso_a_Datos, episodio.episodio_clinico_id);
    const habilitada = Boolean(evaluacion?.habilitada);
    const recursos = habilitada ? await C_Gestor_Alta_Clinica.recursosPrevencion(C_Capa_de_Acceso_a_Datos, episodio.especialidad) : [];

    return res.status(200).json({
      hay_episodio: true,
      episodio: {
        episodio_clinico_id: episodio.episodio_clinico_id,
        motivo_consulta: episodio.motivo_consulta,
        estado: episodio.estado,
        fecha_inicio: episodio.fecha_inicio,
        fecha_terminado: episodio.fecha_terminado,
        preparacion_alta_en: episodio.preparacion_alta_en,
        pautas_continuidad: episodio.pautas_continuidad,
        informe: episodio.documento_id
          ? { documento_id: episodio.documento_id, nombre: episodio.informe_nombre, fecha: episodio.informe_fecha, emitido_en: episodio.informe_alta_emitido_en }
          : null,
      },
      porcentaje: evaluacion?.porcentaje ?? null,
      umbral: evaluacion?.umbral ?? 80,
      habilitada,
      recien_habilitada: Boolean(evaluacion?.recien_habilitada),
      contradicciones: evaluacion?.contradicciones || [],
      metas: evaluacion?.metas || [],
      recursos,
    });
  } catch (error) {
    console.error('[miAlta CU51]', error);
    return res.status(500).json({ error: 'No se pudo cargar tu preparación para el alta.' });
  }
};

/**
 * CU37 — Emitiendo informe de alta y cierre de episodio
 * GET /api/clinica/episodio/:episodio_id/informe-alta   (Profesional, Administrador)
 * Lo que el profesional revisa antes de emitir: metas, evoluciones, citas futuras.
 */
exports.resumenInformeAlta = async (req, res) => {
  const { episodio_id } = req.params;
  try {
    const resumen = await C_Gestor_Alta_Clinica.resumenCierre(C_Capa_de_Acceso_a_Datos, episodio_id);
    if (!resumen) return res.status(404).json({ error: 'EPISODIO_NO_ENCONTRADO', mensaje: 'El episodio clínico no existe.' });
    if (await C_Motor_Clinico.rechazarSiAjeno(C_Capa_de_Acceso_a_Datos, episodio_id, req, res)) return;

    return res.status(200).json({
      ...resumen,
      impedimento: C_Gestor_Alta_Clinica.impedimentoDeCierre(resumen),
      limite_pautas: C_Gestor_Alta_Clinica.LIMITE_PAUTAS_CONTINUIDAD,
    });
  } catch (error) {
    console.error('[resumenInformeAlta CU37]', error);
    return res.status(500).json({ error: 'No se pudo preparar el informe de alta.' });
  }
};

/**
 * CU37 — Emitiendo informe de alta y cierre de episodio
 * POST /api/clinica/episodio/:episodio_id/informe-alta   { pautas_continuidad }
 * Genera el PDF, lo guarda en los documentos del paciente y cierra el episodio.
 */
exports.emitirInformeAlta = async (req, res) => {
  const { episodio_id } = req.params;
  const pautasRecibidas = String(req.body?.pautas_continuidad || '').trim();

  try {
    const resumen = await C_Gestor_Alta_Clinica.resumenCierre(C_Capa_de_Acceso_a_Datos, episodio_id);
    if (!resumen) return res.status(404).json({ error: 'EPISODIO_NO_ENCONTRADO', mensaje: 'El episodio clínico no existe.' });
    if (await C_Motor_Clinico.rechazarSiAjeno(C_Capa_de_Acceso_a_Datos, episodio_id, req, res)) return;

    // Exc. 1, 2 y 4: episodio cerrado, evoluciones sin firmar, citas futuras.
    const impedimento = C_Gestor_Alta_Clinica.impedimentoDeCierre(resumen);
    if (impedimento) return res.status(409).json(impedimento);

    // Precondición: el paciente alcanzó el umbral de cumplimiento.
    if (!resumen.umbral_alcanzado) {
      return res.status(409).json({
        error: 'UMBRAL_NO_ALCANZADO',
        mensaje: resumen.porcentaje === null
          ? 'El episodio no tiene metas medidas: define y actualiza las metas antes de emitir el alta, o cierra el episodio sin informe.'
          : `Las metas van en ${resumen.porcentaje} % y el umbral de egreso es ${resumen.umbral} %. Actualiza las metas o cierra el episodio sin informe.`,
        porcentaje: resumen.porcentaje,
        umbral: resumen.umbral,
      });
    }

    // Exc. 3: se trunca al límite y se informa.
    const truncada = pautasRecibidas.length > C_Gestor_Alta_Clinica.LIMITE_PAUTAS_CONTINUIDAD;
    const pautas = truncada ? pautasRecibidas.slice(0, C_Gestor_Alta_Clinica.LIMITE_PAUTAS_CONTINUIDAD) : pautasRecibidas;

    if (!C_API_Adapter.cloudinaryConfigurado()) {
      return res.status(503).json({
        error: 'REPOSITORIO_NO_DISPONIBLE',
        mensaje: 'El repositorio de documentos no está configurado: el informe no se puede guardar.',
      });
    }

    const [[emisor]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT u.usuario_id, CONCAT_WS(' ', u.nombres, u.apellido_paterno) AS nombre, p.profesional_id
         FROM Usuario u LEFT JOIN Profesional p ON p.usuario_id = u.usuario_id
        WHERE u.usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );

    const pdf = await C_Gestor_Alta_Clinica.generarPdfInformeAlta(resumen, pautas, emisor?.nombre || 'Punto Paz Salud');
    const nombreArchivo = `informe-alta-episodio-${episodio_id}.pdf`;

    // CU33: el informe se guarda en el repositorio multimedia del paciente.
    let subida;
    try {
      subida = await C_API_Adapter.subirBuffer(pdf, {
        folder: `fro-salud/paciente-${resumen.episodio.paciente_id}`,
        public_id: `informe-alta-${episodio_id}-${Date.now()}`,
        // Sin 'raw': se sube como los PDF de CU33, para que el visor (CU35)
        // pueda mostrar sus páginas. Como 'raw' el informe no se podía abrir.
      });
    } catch (errorNube) {
      console.error('[emitirInformeAlta] fallo Cloudinary:', errorNube.message);
      return res.status(502).json({
        error: 'CARGA_INTERRUMPIDA',
        mensaje: 'No se pudo guardar el informe en el repositorio. El episodio sigue abierto: reintenta la emisión.',
      });
    }

    const conexion = await C_Capa_de_Acceso_a_Datos.getConnection();
    try {
      await conexion.beginTransaction();
      const [doc] = await conexion.query(
        `INSERT INTO Documento_Clinico
           (nombre_original, categoria, formato, tamano_bytes, tipo_recurso, url_publica, public_id_cloud,
            paginas, paciente_id, episodio_clinico_id, profesional_id)
         VALUES (?, 'INFORME_ALTA', 'pdf', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombreArchivo, pdf.length, subida.resource_type || 'image', subida.secure_url, subida.public_id,
         subida.pages || null,
         resumen.episodio.paciente_id, episodio_id, emisor?.profesional_id || resumen.episodio.profesional_id]
      );
      await conexion.query(
        `UPDATE Episodio_Clinico
            SET estado = ?, fecha_terminado = NOW(), pautas_continuidad = ?,
                informe_alta_documento_id = ?, informe_alta_emitido_en = NOW()
          WHERE episodio_clinico_id = ?`,
        [C_Motor_Clinico.ESTADO_CERRADO, pautas || null, doc.insertId, episodio_id]
      );
      // CU65: al cerrar el episodio se retira el acceso de los derivados.
      await C_Control_Acceso_Clinico.cerrarDerivacionesDelEpisodio(conexion, episodio_id);
      await conexion.query(
        `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('INFORME_ALTA_EMITIDO', 'Episodio_Clinico', ?, ?, ?)`,
        [obtenerIP(req), JSON.stringify({
          episodio_clinico_id: Number(episodio_id), documento_id: doc.insertId,
          porcentaje: resumen.porcentaje, umbral: resumen.umbral, pauta_truncada: truncada,
        }), req.user.usuario_id]
      );
      const [[pacienteUsuario]] = await conexion.query(
        `SELECT usuario_id FROM Paciente WHERE paciente_id = ? LIMIT 1`,
        [resumen.episodio.paciente_id]
      );
      // CU52: aviso al paciente
      await C_Despachador_Notificaciones.notificarUsuario(
        conexion,
        pacienteUsuario?.usuario_id,
        'ALTA_EMITIDA',
        `${emisor?.nombre || 'Tu profesional'} emitió tu informe de alta. Lo encuentras en Mis Documentos, junto con tus pautas de continuidad.`,
        { datos: { pantalla: 'Documentos' } }
      );
      await conexion.commit();
      // CU55 (correcciones Inc 4): al terminar el tratamiento se pide la calificación general.
      require('../evaluacionController').pedirEvaluacionTratamiento(C_Capa_de_Acceso_a_Datos, episodio_id);

      return res.status(201).json({
        mensaje: truncada
          ? `Informe de alta emitido y episodio cerrado. Las pautas se recortaron a ${C_Gestor_Alta_Clinica.LIMITE_PAUTAS_CONTINUIDAD} caracteres.`
          : 'Informe de alta emitido y episodio cerrado.',
        documento_id: doc.insertId,
        pauta_truncada: truncada,
        estado: C_Motor_Clinico.ESTADO_CERRADO,
      });
    } catch (error) {
      await conexion.rollback().catch(() => {});
      console.error('[emitirInformeAlta]', error);
      return res.status(500).json({
        error: 'NO_SE_PUDO_EMITIR',
        mensaje: 'No se pudo registrar el informe. El episodio sigue abierto: reintenta la emisión.',
      });
    } finally {
      conexion.release();
    }
  } catch (error) {
    console.error('[emitirInformeAlta CU37]', error);
    return res.status(500).json({ error: 'No se pudo emitir el informe de alta.' });
  }
};
