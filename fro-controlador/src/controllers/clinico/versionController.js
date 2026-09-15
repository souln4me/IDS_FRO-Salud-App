// Ruta: fro-controlador/src/controllers/clinico/versionController.js
//
// CU31 — Gestionando versionado de correcciones auditadas.
// Una evolución clínica cerrada (inalterable) nunca se edita: las aclaraciones
// post-firma se anexan como versiones indexadas aparte, preservando el
// original íntegro para auditoría.

const pool = require('../../config/database');
const { leerParametroEntero } = require('../../services/agenda/agendaService');

function obtenerIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    'IP_DESCONOCIDA'
  );
}

async function auditar(req, accion, datos = {}) {
  try {
    await pool.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES (?, 'Evolucion_Version', ?, ?, ?)`,
      [accion, obtenerIP(req), JSON.stringify(datos), req.user?.usuario_id || null]
    );
  } catch (error) {
    console.error('[auditar version]', error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /clinica/evolucion/:evolucionId/versiones
// ─────────────────────────────────────────────────────────────────────────────
exports.listarVersiones = async (req, res) => {
  try {
    const { evolucionId } = req.params;

    const [versiones] = await pool.query(
      `SELECT v.version_id, v.numero_version, v.texto_correccion, v.fecha_creacion,
              CONCAT(COALESCE(u.nombres, ''), ' ', COALESCE(u.apellido_paterno, '')) AS autor
         FROM Evolucion_Version v
         LEFT JOIN Profesional pr ON pr.profesional_id = v.profesional_id
         LEFT JOIN Usuario u ON u.usuario_id = pr.usuario_id
        WHERE v.evolucion_clinica_id = ?
        ORDER BY v.numero_version ASC`,
      [evolucionId]
    );

    const maximo = await leerParametroEntero(pool, 'MAX_VERSIONES_CORRECCION', 5);

    res.json({ ok: true, versiones, maximo_versiones: maximo });
  } catch (error) {
    console.error('[listarVersiones]', error);
    res.status(500).json({ error: 'Error interno al listar las versiones.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /clinica/evolucion/:evolucionId/versiones  { texto }
// ─────────────────────────────────────────────────────────────────────────────
exports.crearVersion = async (req, res) => {
  const { evolucionId } = req.params;
  const texto = (req.body?.texto || '').trim();
  const usuarioId = req.user?.usuario_id;

  // Excepción 3: corrección vacía → mensaje de validación.
  if (!texto) {
    return res.status(400).json({
      error: 'CORRECCION_VACIA',
      mensaje: 'Ingresa el texto descriptivo de la corrección antes de guardar.',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[evolucion]] = await connection.query(
      `SELECT e.Evolucion_clinica_id AS evolucion_clinica_id, e.inalterable,
              e.profesional_id, e.episodio_clinico_id, pr.usuario_id AS usuario_autor
         FROM Evolucion_Clinica e
         LEFT JOIN Profesional pr ON pr.profesional_id = e.profesional_id
        WHERE e.Evolucion_clinica_id = ?
        FOR UPDATE`,
      [evolucionId]
    );

    if (!evolucion) {
      await connection.rollback();
      return res.status(404).json({
        error: 'EVOLUCION_NO_ENCONTRADA',
        mensaje: 'El registro clínico indicado no existe.',
      });
    }

    // Precondición: solo registros Finalizados (inalterables) se versionan.
    // Un registro abierto todavía se edita directo, sin correcciones.
    if (!evolucion.inalterable) {
      await connection.rollback();
      return res.status(409).json({
        error: 'REGISTRO_NO_FINALIZADO',
        mensaje: 'Esta evolución aún no está cerrada: puedes editarla directamente sin crear una corrección.',
      });
    }

    // Excepción 1: sin permisos de autoría → bloquear y derivar al supervisor.
    if (evolucion.usuario_autor !== usuarioId) {
      await connection.rollback();
      await auditar(req, 'CORRECCION_DENEGADA_AUTORIA', { evolucion_id: evolucionId });
      return res.status(403).json({
        error: 'SIN_PERMISO_AUTORIA',
        mensaje: 'No eres el autor de este registro clínico. Solicita acceso a tu supervisor.',
      });
    }

    // Excepción 2: número máximo de versiones alcanzado.
    const maximo = await leerParametroEntero(connection, 'MAX_VERSIONES_CORRECCION', 5);
    const [[conteo]] = await connection.query(
      `SELECT COUNT(*) AS total FROM Evolucion_Version WHERE evolucion_clinica_id = ?`,
      [evolucionId]
    );
    if (conteo.total >= maximo) {
      await connection.rollback();
      return res.status(409).json({
        error: 'MAXIMO_VERSIONES',
        mensaje: `Este registro ya alcanzó el máximo de ${maximo} correcciones. Contacta al administrador.`,
      });
    }

    // Excepción 4: si el vínculo con el episodio/evolución falla, la
    // transacción se revierte completa y el profesional puede reintentar.
    const [resultado] = await connection.query(
      `INSERT INTO Evolucion_Version
         (numero_version, texto_correccion, evolucion_clinica_id, profesional_id)
       VALUES (?, ?, ?, ?)`,
      [conteo.total + 1, texto, evolucionId, evolucion.profesional_id]
    );

    await connection.commit();

    await auditar(req, 'CORRECCION_VERSIONADA', {
      evolucion_id: evolucionId,
      version_id: resultado.insertId,
      numero_version: conteo.total + 1,
      episodio_clinico_id: evolucion.episodio_clinico_id,
    });

    res.status(201).json({
      ok: true,
      numero_version: conteo.total + 1,
      mensaje: `Corrección guardada como versión ${conteo.total + 1}. El registro original queda íntegro para auditoría.`,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[crearVersion]', error);
    res.status(500).json({
      error: 'VINCULACION_FALLIDA',
      mensaje: 'No fue posible vincular la nueva versión con el registro clínico. La operación fue cancelada, reintenta el guardado.',
    });
  } finally {
    connection.release();
  }
};
