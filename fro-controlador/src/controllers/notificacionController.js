/**
 * Componente: C_API_REST
 * Casos de uso: CU52, CU54, CU13.
 *
 * CU52 — Centro de notificaciones, preferencias de canal y dispositivos push.
 *
 * La tabla Notificacion existía desde el Incremento 2, pero nadie la leía: los
 * avisos se escribían y ahí morían. Estos endpoints la convierten en la
 * bandeja del usuario, con globo de no leídos y salto a la pantalla que
 * corresponde al tocar cada aviso.
 */

const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');

const LIMITE_POR_PAGINA = 30;

/**
 * CU52 — Emitiendo notificaciones multicanal
 * GET /api/notificaciones?solo_no_leidas=1&pagina=0
 */
exports.listar = async (req, res) => {
  const pagina = Math.max(0, parseInt(req.query?.pagina, 10) || 0);
  const soloNoLeidas = String(req.query?.solo_no_leidas || '') === '1';

  try {
    const [avisos] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT notificacion_id, tipo, titulo, contenido, datos, momento_envio, leida
         FROM Notificacion
        WHERE usuario_id = ?
          ${soloNoLeidas ? 'AND leida = FALSE' : ''}
        -- Lo que falta por leer arriba; lo ya visto baja al final.
        ORDER BY leida ASC, momento_envio DESC, notificacion_id DESC
        LIMIT ? OFFSET ?`,
      [req.user.usuario_id, LIMITE_POR_PAGINA, pagina * LIMITE_POR_PAGINA]
    );

    const [[conteo]] = await C_Capa_de_Acceso_a_Datos.query(
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

// Apoyo común: lee JSON guardado como texto sin romper
function seguroJSON(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return {};
  }
}

/**
 * CU52 — Emitiendo notificaciones multicanal
 * GET /api/notificaciones/resumen — solo el contador, para el globo.
 */
exports.resumen = async (req, res) => {
  try {
    const [[conteo]] = await C_Capa_de_Acceso_a_Datos.query(
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

/**
 * CU52 — Emitiendo notificaciones multicanal
 * POST /api/notificaciones/:id/leer
 */
exports.marcarLeida = async (req, res) => {
  try {
    const [resultado] = await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Notificacion SET leida = TRUE
        WHERE notificacion_id = ? AND usuario_id = ?`,
      [req.params.id, req.user.usuario_id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'NOTIFICACION_NO_ENCONTRADA' });
    }
    // CU54 (paso 4): la lectura del refuerzo queda en el registro de telemetría.
    const [[aviso]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT tipo FROM Notificacion WHERE notificacion_id = ? LIMIT 1`, [req.params.id]
    );
    if (aviso?.tipo === 'REFUERZO_POSITIVO') {
      await C_Capa_de_Acceso_a_Datos.query(
        `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('REFUERZO_POSITIVO_LEIDO', 'Notificacion', ?, ?, ?)`,
        [req.ip || null, JSON.stringify({ notificacion_id: Number(req.params.id) }), req.user.usuario_id]
      ).catch(() => {});
    }
    return res.status(200).json({ mensaje: 'Aviso marcado como leído.' });
  } catch (error) {
    console.error('[marcarLeida]', error);
    return res.status(500).json({ error: 'No se pudo marcar el aviso.' });
  }
};

/**
 * CU52 — Emitiendo notificaciones multicanal
 * POST /api/notificaciones/leer-todas
 */
exports.marcarTodasLeidas = async (req, res) => {
  try {
    const [resultado] = await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Notificacion SET leida = TRUE WHERE usuario_id = ? AND leida = FALSE`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ mensaje: 'Listo.', marcadas: resultado.affectedRows });
  } catch (error) {
    console.error('[marcarTodasLeidas]', error);
    return res.status(500).json({ error: 'No se pudieron marcar los avisos.' });
  }
};

/**
 * CU52, CU54 — leer los canales y si acepta refuerzos
 * GET /api/notificaciones/preferencias
 */
exports.obtenerPreferencias = async (req, res) => {
  try {
    const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT canal_push, canal_email, refuerzos FROM Preferencia_Notificacion WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    return res.status(200).json({
      // Sin fila guardada, todo activo: es el comportamiento por defecto.
      canal_push: fila ? Boolean(fila.canal_push) : true,
      canal_email: fila ? Boolean(fila.canal_email) : true,
      // CU54: mensajes de ánimo por los ejercicios.
      refuerzos: fila ? Boolean(fila.refuerzos) : true,
    });
  } catch (error) {
    console.error('[obtenerPreferencias]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus preferencias.' });
  }
};

/**
 * CU52, CU54 — guardar los canales y si acepta refuerzos
 * PUT /api/notificaciones/preferencias  { canal_push, canal_email, refuerzos }
 */
exports.guardarPreferencias = async (req, res) => {
  const push = req.body?.canal_push !== false;
  const email = req.body?.canal_email !== false;
  const refuerzos = req.body?.refuerzos !== false;

  try {
    await C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Preferencia_Notificacion (usuario_id, canal_push, canal_email, refuerzos)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE canal_push = VALUES(canal_push), canal_email = VALUES(canal_email),
                               refuerzos = VALUES(refuerzos)`,
      [req.user.usuario_id, push, email, refuerzos]
    );

    // CU13: queda en la bitácora de auditoría
    await C_Capa_de_Acceso_a_Datos
      .query(
        `INSERT INTO Bitacora_Auditoria
            (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('CAMBIO_PREFERENCIA_NOTIFICACION', 'Preferencia_Notificacion', ?, ?, ?)`,
        [req.ip || null, JSON.stringify({ canal_push: push, canal_email: email, refuerzos }), req.user.usuario_id]
      )
      .catch(() => {});

    return res.status(200).json({
      mensaje: 'Preferencias guardadas.',
      canal_push: push,
      canal_email: email,
      refuerzos,
    });
  } catch (error) {
    console.error('[guardarPreferencias]', error);
    return res.status(500).json({ error: 'No se pudieron guardar tus preferencias.' });
  }
};

/**
 * CU52 — Emitiendo notificaciones multicanal
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
    await C_Capa_de_Acceso_a_Datos.query(
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

/**
 * CU52 — Emitiendo notificaciones multicanal
 * DELETE /api/notificaciones/dispositivo  { token } — al cerrar sesión.
 */
exports.olvidarDispositivo = async (req, res) => {
  const token = String(req.body?.token || req.query?.token || '').trim();
  if (!token) return res.status(200).json({ mensaje: 'Nada que olvidar.' });

  try {
    await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Dispositivo_Push SET activo = FALSE WHERE token = ? AND usuario_id = ?`,
      [token, req.user.usuario_id]
    );
    return res.status(200).json({ mensaje: 'Dispositivo dado de baja.' });
  } catch (error) {
    console.error('[olvidarDispositivo]', error);
    return res.status(500).json({ error: 'No se pudo dar de baja el dispositivo.' });
  }
};
