/**
 * CU60 — Registro y seguimiento de solicitudes de soporte.
 * CU61 — Enrutamiento automático por categoría.
 *
 * Un ticket entra con su etiqueta de área y el sistema lo enruta solo al
 * operador que cubre esa área. Si nadie la cubre, no se pierde: cae en la
 * bandeja de supervisión general y se avisa del desborde.
 */

const pool = require('./../config/database');
const { leerParametroEntero } = require('../services/agenda/agendaService');
const { notificarUsuario } = require('../services/agenda/agendaService');
const { subirBuffer, cloudinaryConfigurado } = require('../config/cloudinary');

// Áreas funcionales. Son las etiquetas taxonómicas del CU61: con ellas se
// decide a qué operador va cada solicitud.
const CATEGORIAS = [
  { clave: 'TECNICO', etiqueta: 'Problema técnico de la aplicación' },
  { clave: 'AGENDA', etiqueta: 'Citas y horarios' },
  { clave: 'PAGOS', etiqueta: 'Pagos, bonos y planes' },
  { clave: 'CLINICO', etiqueta: 'Consulta clínica o de tratamiento' },
  { clave: 'CUENTA', etiqueta: 'Mi cuenta y datos personales' },
  { clave: 'OTRO', etiqueta: 'Otro tema' },
];

const ESTADOS = ['ABIERTO', 'EN_PROCESO', 'RESUELTO', 'CERRADO'];

/** GET /api/soporte/categorias */
exports.categorias = (req, res) => {
  res.status(200).json({ categorias: CATEGORIAS });
};

/**
 * Busca el operador que cubre un área. Si hay varios, se reparte por carga:
 * el que tenga menos tickets abiertos.
 *
 * Excepción 2 del CU61: sin operador activo para esa área, devuelve null y el
 * ticket queda en la bandeja de supervisión general.
 */
async function operadorParaCategoria(conexion, categoria) {
  const [filas] = await conexion.query(
    `SELECT a.usuario_id,
            (SELECT COUNT(*) FROM Ticket_Soporte t
              WHERE t.asignado_a = a.usuario_id
                AND t.estado IN ('ABIERTO', 'EN_PROCESO')) AS carga
       FROM Area_Soporte_Operador a
       JOIN Usuario u ON u.usuario_id = a.usuario_id
      WHERE a.categoria = ? AND u.cuenta_activo = TRUE
      ORDER BY carga ASC, a.usuario_id ASC
      LIMIT 1`,
    [categoria]
  );
  return filas[0]?.usuario_id || null;
}

/** Avisa a los administradores cuando un área queda sin operador. */
async function alertarDesborde(conexion, ticketId, categoria) {
  const [admins] = await conexion.query(
    `SELECT u.usuario_id FROM Usuario u
      JOIN Rol r ON r.rol_id = u.rol_id
     WHERE r.nombre_rol = 'Administrador' AND u.cuenta_activo = TRUE`
  );
  for (const admin of admins) {
    await notificarUsuario(
      conexion,
      admin.usuario_id,
      'TICKET_SIN_OPERADOR',
      `El ticket #${ticketId} del área ${categoria} no tiene operador asignado y quedó en la bandeja de supervisión general.`,
      { datos: { pantalla: 'BandejaSoporte', ticket_id: ticketId } }
    ).catch(() => {});
  }
}

/**
 * POST /api/soporte/tickets   { categoria, descripcion }  [+ archivo "adjunto"]
 *
 * Excepción 3 del CU60: faltan campos obligatorios → validación estricta.
 * Excepción 4: el adjunto que supera el límite aborta la transferencia SIN
 * escribir el ticket, para que el usuario no crea que quedó a medias.
 */
exports.crearTicket = async (req, res) => {
  const categoria = String(req.body?.categoria || '').trim().toUpperCase();
  const descripcion = String(req.body?.descripcion || '').trim();

  const faltantes = [];
  if (!CATEGORIAS.some((c) => c.clave === categoria)) faltantes.push('categoria');
  if (descripcion.length < 10) faltantes.push('descripcion');

  if (faltantes.length > 0) {
    return res.status(400).json({
      error: 'CAMPOS_OBLIGATORIOS',
      mensaje:
        faltantes.includes('descripcion') && !faltantes.includes('categoria')
          ? 'Cuéntanos un poco más: la descripción necesita al menos 10 caracteres.'
          : 'Elige el área del problema y describe qué te pasó.',
      campos: faltantes,
    });
  }

  const conexion = await pool.getConnection();

  try {
    // Excepción 4: el adjunto se valida ANTES de escribir nada.
    let adjuntoUrl = null;
    if (req.file) {
      const topeMb = await leerParametroEntero(conexion, 'MAX_ADJUNTO_TICKET_MB', 5);
      if (req.file.size > topeMb * 1024 * 1024) {
        return res.status(413).json({
          error: 'ADJUNTO_MUY_PESADO',
          mensaje: `La imagen supera los ${topeMb} MB. Comprímela o envíala sin adjunto.`,
        });
      }
      if (!cloudinaryConfigurado()) {
        return res.status(503).json({
          error: 'ADJUNTOS_NO_DISPONIBLES',
          mensaje: 'El repositorio de imágenes no está disponible. Envía el ticket sin adjunto.',
        });
      }
      const subida = await subirBuffer(req.file.buffer, {
        folder: 'punto-paz/soporte',
        resource_type: 'image',
      });
      adjuntoUrl = subida.secure_url;
    }

    await conexion.beginTransaction();

    const [creado] = await conexion.execute(
      `INSERT INTO Ticket_Soporte (categoria, descripcion, adjunto_url, usuario_id)
       VALUES (?, ?, ?, ?)`,
      [categoria, descripcion.slice(0, 5000), adjuntoUrl, req.user.usuario_id]
    );
    const ticketId = creado.insertId;

    // CU61: el enrutamiento ocurre como consecuencia directa de la inserción.
    const operador = await operadorParaCategoria(conexion, categoria);
    if (operador) {
      await conexion.execute(
        `UPDATE Ticket_Soporte
            SET asignado_a = ?, momento_enrutamiento = NOW()
          WHERE ticket_soporte_id = ?`,
        [operador, ticketId]
      );
      await notificarUsuario(
        conexion,
        operador,
        'TICKET_ASIGNADO',
        `Se te asignó el ticket #${ticketId} del área ${categoria}.`,
        { datos: { pantalla: 'BandejaSoporte', ticket_id: ticketId } }
      ).catch(() => {});
    }

    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('ALTA_TICKET_SOPORTE', 'Ticket_Soporte', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({ ticket_soporte_id: ticketId, categoria, enrutado_a: operador }),
        req.user.usuario_id,
      ]
    );

    await conexion.commit();

    if (!operador) await alertarDesborde(pool, ticketId, categoria);

    return res.status(201).json({
      mensaje: `Tu solicitud quedó registrada con el número #${ticketId}.`,
      ticket_soporte_id: ticketId,
      estado: 'ABIERTO',
      enrutado: Boolean(operador),
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[crearTicket CU60]', error);
    return res.status(500).json({
      error: 'NO_SE_PUDO_CREAR',
      mensaje: 'No pudimos registrar tu solicitud. Inténtalo nuevamente.',
    });
  } finally {
    conexion.release();
  }
};

/** GET /api/soporte/mis-tickets — seguimiento del estado por su autor. */
exports.misTickets = async (req, res) => {
  try {
    const [tickets] = await pool.query(
      `SELECT ticket_soporte_id, categoria, descripcion, estado, resolucion,
              momento_creacion, momento_resuelto, adjunto_url
         FROM Ticket_Soporte
        WHERE usuario_id = ?
        ORDER BY momento_creacion DESC
        LIMIT 50`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ tickets, categorias: CATEGORIAS });
  } catch (error) {
    console.error('[misTickets CU60]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus solicitudes.' });
  }
};

/**
 * GET /api/soporte/bandeja?estado=ABIERTO&solo_mios=1   (Administrador)
 *
 * La bandeja del operador. Sin filtro muestra también los sin asignar, que son
 * los de supervisión general (Excepción 2 del CU61).
 */
exports.bandeja = async (req, res) => {
  const estado = String(req.query?.estado || '').toUpperCase();
  const soloMios = String(req.query?.solo_mios || '') === '1';

  try {
    // El enrutamiento se reintenta al abrir la bandeja: si un área ganó
    // operador después, sus tickets dejan de estar huérfanos.
    await reenrutarPendientes(pool);

    const [tickets] = await pool.query(
      `SELECT t.ticket_soporte_id, t.categoria, t.descripcion, t.estado, t.resolucion,
              t.momento_creacion, t.momento_enrutamiento, t.momento_resuelto,
              t.adjunto_url, t.asignado_a,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
                CONCAT('Usuario #', t.usuario_id)
              ) AS solicitante,
              r.nombre_rol AS rol_solicitante,
              -- Para que el operador pueda contactar a quien reportó.
              u.email AS email_solicitante,
              (SELECT GROUP_CONCAT(ut.telefono SEPARATOR ', ')
                 FROM Usuario_Telefono ut WHERE ut.usuario_id = t.usuario_id) AS telefono_solicitante,
              u.rut AS rut_solicitante,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', o.nombres, o.apellido_paterno)), ''),
                'Sin asignar'
              ) AS operador,
              TIMESTAMPDIFF(HOUR, t.momento_creacion, COALESCE(t.momento_resuelto, NOW())) AS horas_abierto
         FROM Ticket_Soporte t
         JOIN Usuario u ON u.usuario_id = t.usuario_id
         LEFT JOIN Rol r ON r.rol_id = u.rol_id
         LEFT JOIN Usuario o ON o.usuario_id = t.asignado_a
        WHERE (? = '' OR t.estado = ?)
          AND (? = 0 OR t.asignado_a = ?)
        ORDER BY FIELD(t.estado, 'ABIERTO', 'EN_PROCESO', 'RESUELTO', 'CERRADO'),
                 t.momento_creacion ASC
        LIMIT 100`,
      [estado, estado, soloMios ? 1 : 0, req.user.usuario_id]
    );

    const [[resumen]] = await pool.query(
      `SELECT
          SUM(estado = 'ABIERTO') AS abiertos,
          SUM(estado = 'EN_PROCESO') AS en_proceso,
          SUM(asignado_a IS NULL AND estado IN ('ABIERTO','EN_PROCESO')) AS sin_operador
         FROM Ticket_Soporte`
    );

    return res.status(200).json({
      tickets,
      resumen: {
        abiertos: Number(resumen?.abiertos || 0),
        en_proceso: Number(resumen?.en_proceso || 0),
        sin_operador: Number(resumen?.sin_operador || 0),
      },
      categorias: CATEGORIAS,
    });
  } catch (error) {
    console.error('[bandejaSoporte CU61]', error);
    return res.status(500).json({ error: 'No se pudo cargar la bandeja.' });
  }
};

/** Reintenta el enrutamiento de los tickets que quedaron sin operador. */
async function reenrutarPendientes(conexion) {
  try {
    const [huerfanos] = await conexion.query(
      `SELECT ticket_soporte_id, categoria FROM Ticket_Soporte
        WHERE asignado_a IS NULL AND estado IN ('ABIERTO', 'EN_PROCESO')
        LIMIT 50`
    );
    for (const ticket of huerfanos) {
      const operador = await operadorParaCategoria(conexion, ticket.categoria);
      if (operador) {
        const [resultado] = await conexion.query(
          `UPDATE Ticket_Soporte
              SET asignado_a = ?, momento_enrutamiento = NOW()
            WHERE ticket_soporte_id = ? AND asignado_a IS NULL`,
          [operador, ticket.ticket_soporte_id]
        );
        // Igual que al enrutar en la creación: el operador se entera.
        if (resultado.affectedRows > 0) {
          await notificarUsuario(
            conexion,
            operador,
            'TICKET_ASIGNADO',
            `Se te asignó el ticket #${ticket.ticket_soporte_id} del área ${ticket.categoria}.`,
            { datos: { pantalla: 'BandejaSoporte', ticket_id: ticket.ticket_soporte_id } }
          ).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.error('[reenrutarPendientes CU61]', error.message);
  }
}

/**
 * PUT /api/soporte/tickets/:id   { estado, resolucion }   (Administrador)
 *
 * Excepción 3 del CU61: si otro operador tomó el ticket entre medio, la
 * escritura se rechaza y se pide refrescar la bandeja, en vez de pisar el
 * trabajo del otro.
 */
exports.actualizarTicket = async (req, res) => {
  const estado = String(req.body?.estado || '').trim().toUpperCase();
  const resolucion = String(req.body?.resolucion || '').trim().slice(0, 500);
  const tomar = req.body?.tomar === true;

  if (estado && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: 'ESTADO_INVALIDO' });
  }
  if (['RESUELTO', 'CERRADO'].includes(estado) && resolucion.length < 4) {
    return res.status(400).json({
      error: 'RESOLUCION_REQUERIDA',
      mensaje: 'Escribe cómo se resolvió: el solicitante lo verá en su seguimiento.',
    });
  }

  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [[ticket]] = await conexion.execute(
      `SELECT ticket_soporte_id, estado, asignado_a, usuario_id, categoria
         FROM Ticket_Soporte WHERE ticket_soporte_id = ? LIMIT 1 FOR UPDATE`,
      [req.params.id]
    );

    if (!ticket) {
      await conexion.rollback();
      return res.status(404).json({ error: 'TICKET_NO_ENCONTRADO' });
    }

    if (ticket.asignado_a && ticket.asignado_a !== req.user.usuario_id && !tomar) {
      await conexion.rollback();
      return res.status(409).json({
        error: 'TICKET_REASIGNADO',
        mensaje: 'Este ticket lo está atendiendo otro operador. Refresca la bandeja para ver el estado real.',
      });
    }

    const nuevoEstado = estado || ticket.estado;
    await conexion.execute(
      `UPDATE Ticket_Soporte
          SET estado = ?,
              resolucion = COALESCE(NULLIF(?, ''), resolucion),
              asignado_a = ?,
              momento_enrutamiento = COALESCE(momento_enrutamiento, NOW()),
              momento_resuelto = CASE WHEN ? IN ('RESUELTO','CERRADO') THEN NOW() ELSE momento_resuelto END
        WHERE ticket_soporte_id = ?`,
      [nuevoEstado, resolucion, req.user.usuario_id, nuevoEstado, req.params.id]
    );

    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('GESTION_TICKET_SOPORTE', 'Ticket_Soporte', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({
          ticket_soporte_id: Number(req.params.id),
          estado_anterior: ticket.estado,
          nuevo_estado: nuevoEstado,
        }),
        req.user.usuario_id,
      ]
    );

    await conexion.commit();

    if (['RESUELTO', 'CERRADO'].includes(nuevoEstado)) {
      notificarUsuario(
        pool,
        ticket.usuario_id,
        'TICKET_RESUELTO',
        `Tu solicitud #${ticket.ticket_soporte_id} fue marcada como ${nuevoEstado.toLowerCase()}. ${resolucion}`,
        { datos: { pantalla: 'Soporte', ticket_id: ticket.ticket_soporte_id } }
      ).catch(() => {});
    }

    return res.status(200).json({ mensaje: 'Ticket actualizado.', estado: nuevoEstado });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[actualizarTicket CU61]', error);
    return res.status(500).json({ error: 'No se pudo actualizar el ticket.' });
  } finally {
    conexion.release();
  }
};

/** GET /api/soporte/areas — áreas que cubre cada operador (Administrador). */
exports.misAreas = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT categoria FROM Area_Soporte_Operador WHERE usuario_id = ?`,
      [req.user.usuario_id]
    );
    return res.status(200).json({
      areas: filas.map((f) => f.categoria),
      categorias: CATEGORIAS,
    });
  } catch (error) {
    console.error('[misAreas CU61]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus áreas.' });
  }
};

/** PUT /api/soporte/areas   { areas: [...] }   (Administrador) */
exports.guardarAreas = async (req, res) => {
  const areas = Array.isArray(req.body?.areas)
    ? req.body.areas
        .map((a) => String(a).toUpperCase())
        .filter((a) => CATEGORIAS.some((c) => c.clave === a))
    : [];

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    await conexion.execute(`DELETE FROM Area_Soporte_Operador WHERE usuario_id = ?`, [
      req.user.usuario_id,
    ]);
    for (const area of new Set(areas)) {
      await conexion.execute(
        `INSERT INTO Area_Soporte_Operador (usuario_id, categoria) VALUES (?, ?)`,
        [req.user.usuario_id, area]
      );
    }
    await conexion.commit();

    // Con un área nueva cubierta, los tickets huérfanos encuentran dueño.
    await reenrutarPendientes(pool);

    return res.status(200).json({
      mensaje: areas.length
        ? `Atenderás ${areas.length} área(s) de soporte.`
        : 'Ya no tienes áreas asignadas.',
      areas,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[guardarAreas CU61]', error);
    return res.status(500).json({ error: 'No se pudieron guardar tus áreas.' });
  } finally {
    conexion.release();
  }
};

module.exports.CATEGORIAS = CATEGORIAS;
