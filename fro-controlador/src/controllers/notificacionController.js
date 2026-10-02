/**
 * CU52 — Centro de notificaciones, preferencias de canal y dispositivos push.
 *
 * La tabla Notificacion existía desde el Incremento 2, pero nadie la leía: los
 * avisos se escribían y ahí morían. Estos endpoints la convierten en la
 * bandeja del usuario, con globo de no leídos y salto a la pantalla que
 * corresponde al tocar cada aviso.
 */

const pool = require('../config/database');

const LIMITE_POR_PAGINA = 30;

/** GET /api/notificaciones?solo_no_leidas=1&pagina=0 */
exports.listar = async (req, res) => {
  const pagina = Math.max(0, parseInt(req.query?.pagina, 10) || 0);
  const soloNoLeidas = String(req.query?.solo_no_leidas || '') === '1';

  try {
    const [avisos] = await pool.query(
      `SELECT notificacion_id, tipo, titulo, contenido, datos, momento_envio, leida
         FROM Notificacion
        WHERE usuario_id = ?
          ${soloNoLeidas ? 'AND leida = FALSE' : ''}
        -- Lo que falta por leer arriba; lo ya visto baja al final.
        ORDER BY leida ASC, momento_envio DESC, notificacion_id DESC
        LIMIT ? OFFSET ?`,
      [req.user.usuario_id, LIMITE_POR_PAGINA, pagina * LIMITE_POR_PAGINA]
    );

    const [[conteo]] = await pool.query(
      `SELECT COUNT(*) AS no_leidas FROM Notificacion
        WHERE usuario_id = ? AND leida = FALSE`,
      [req.user.usuario_id]
    );

    return res.status(200).json({
      notificaciones: avisos.map((a) => ({
        ...a,
        // mysql2 ya entrega JSON como objeto, pero las filas viejas guardaron
        // texto: se normaliza para que la app reciba siempre lo mismo.
        datos: typeof a.datos === 'string' ? seguroJSON(a.datos) : a.datos || {},
      })),
      no_leidas: conteo.no_leidas,
      hay_mas: avisos.length === LIMITE_POR_PAGINA,
    });
  } catch (error) {
    console.error('[listarNotificaciones]', error);
    return res.status(500).json({
      error: 'ERROR_NOTIFICACIONES',
      mensaje: 'No se pudieron cargar tus notificaciones.',
    });
  }
};

function seguroJSON(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return {};
  }
}

/** GET /api/notificaciones/resumen — solo el contador, para el globo. */
exports.resumen = async (req, res) => {
  try {
    const [[conteo]] = await pool.query(
      `SELECT COUNT(*) AS no_leidas FROM Notificacion
        WHERE usuario_id = ? AND leida = FALSE`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ no_leidas: conteo.no_leidas });
  } catch (error) {
    // El globo es un adorno: si falla, la app sigue funcionando sin número.
    return res.status(200).json({ no_leidas: 0 });
  }
};

/** POST /api/notificaciones/:id/leer */
exports.marcarLeida = async (req, res) => {
  try {
    const [resultado] = await pool.query(
      `UPDATE Notificacion SET leida = TRUE
        WHERE notificacion_id = ? AND usuario_id = ?`,
      [req.params.id, req.user.usuario_id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'NOTIFICACION_NO_ENCONTRADA' });
    }
    return res.status(200).json({ mensaje: 'Aviso marcado como leído.' });
  } catch (error) {
    console.error('[marcarLeida]', error);
    return res.status(500).json({ error: 'No se pudo marcar el aviso.' });
  }
};

/** POST /api/notificaciones/leer-todas */
exports.marcarTodasLeidas = async (req, res) => {
  try {
    const [resultado] = await pool.query(
      `UPDATE Notificacion SET leida = TRUE WHERE usuario_id = ? AND leida = FALSE`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ mensaje: 'Listo.', marcadas: resultado.affectedRows });
  } catch (error) {
    console.error('[marcarTodasLeidas]', error);
    return res.status(500).json({ error: 'No se pudieron marcar los avisos.' });
  }
};

/** GET /api/notificaciones/preferencias */
exports.obtenerPreferencias = async (req, res) => {
  try {
    const [[fila]] = await pool.query(
      `SELECT canal_push, canal_email FROM Preferencia_Notificacion WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    return res.status(200).json({
      // Sin fila guardada, todo activo: es el comportamiento por defecto.
      canal_push: fila ? Boolean(fila.canal_push) : true,
      canal_email: fila ? Boolean(fila.canal_email) : true,
    });
  } catch (error) {
    console.error('[obtenerPreferencias]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus preferencias.' });
  }
};

/** PUT /api/notificaciones/preferencias  { canal_push, canal_email } */
exports.guardarPreferencias = async (req, res) => {
  const push = req.body?.canal_push !== false;
  const email = req.body?.canal_email !== false;

  try {
    await pool.query(
      `INSERT INTO Preferencia_Notificacion (usuario_id, canal_push, canal_email)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE canal_push = VALUES(canal_push), canal_email = VALUES(canal_email)`,
      [req.user.usuario_id, push, email]
    );

    await pool
      .query(
        `INSERT INTO Bitacora_Auditoria
            (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('CAMBIO_PREFERENCIA_NOTIFICACION', 'Preferencia_Notificacion', ?, ?, ?)`,
        [req.ip || null, JSON.stringify({ canal_push: push, canal_email: email }), req.user.usuario_id]
      )
      .catch(() => {});

    return res.status(200).json({
      mensaje: 'Preferencias guardadas.',
      canal_push: push,
      canal_email: email,
    });
  } catch (error) {
    console.error('[guardarPreferencias]', error);
    return res.status(500).json({ error: 'No se pudieron guardar tus preferencias.' });
  }
};

/**
 * POST /api/notificaciones/dispositivo   { token, plataforma }
 *
 * Registra el token de notificación push del teléfono. Hoy Expo Go en Android
 * no entrega push remoto, así que la app manda token solo cuando el sistema se
 * lo da; el día que el equipo compile una build propia, esto ya funciona sin
 * tocar el servidor.
 */
exports.registrarDispositivo = async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const plataforma = String(req.body?.plataforma || 'DESCONOCIDA').trim().toUpperCase().slice(0, 20);

  if (!token) {
    return res.status(400).json({ error: 'TOKEN_REQUERIDO', mensaje: 'Falta el token del dispositivo.' });
  }

  try {
    // Un mismo teléfono puede cambiar de dueño (otro usuario inicia sesión):
    // el token pasa a la cuenta que lo registró por última vez.
    await pool.query(
      `INSERT INTO Dispositivo_Push (token, plataforma, usuario_id, activo)
       VALUES (?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
          usuario_id = VALUES(usuario_id),
          plataforma = VALUES(plataforma),
          activo = TRUE,
          momento_registro = CURRENT_TIMESTAMP`,
      [token, plataforma, req.user.usuario_id]
    );
    return res.status(200).json({ mensaje: 'Dispositivo registrado para notificaciones push.' });
  } catch (error) {
    console.error('[registrarDispositivo]', error);
    return res.status(500).json({ error: 'No se pudo registrar el dispositivo.' });
  }
};

/** DELETE /api/notificaciones/dispositivo  { token } — al cerrar sesión. */
exports.olvidarDispositivo = async (req, res) => {
  const token = String(req.body?.token || req.query?.token || '').trim();
  if (!token) return res.status(200).json({ mensaje: 'Nada que olvidar.' });

  try {
    await pool.query(
      `UPDATE Dispositivo_Push SET activo = FALSE WHERE token = ? AND usuario_id = ?`,
      [token, req.user.usuario_id]
    );
    return res.status(200).json({ mensaje: 'Dispositivo dado de baja.' });
  } catch (error) {
    console.error('[olvidarDispositivo]', error);
    return res.status(500).json({ error: 'No se pudo dar de baja el dispositivo.' });
  }
};
