/**
 * CU19 — Lista de espera secuencial.
 *
 * El paciente se inscribe en un bloque que está ocupado. Cuando ese bloque se
 * libera, el cupo se ofrece a UNO SOLO: el primero de la fila por orden de
 * llegada, con un plazo para tomarlo. Si deja vencer el plazo, el turno pasa
 * automáticamente al siguiente (Excepción 4).
 */

const pool = require('../config/database');
const {
  leerParametroEntero,
  notificarUsuario,
  ofrecerCupoListaEspera,
  revisarVencimientosListaEspera,
  datosDelBloque,
  describirBloque,
} = require('../services/agenda/agendaService');

async function pacienteDe(conexion, usuario_id) {
  const [[fila]] = await conexion.execute(
    `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
    [usuario_id]
  );
  return fila?.paciente_id || null;
}

/**
 * POST /api/citas/:id/lista-espera
 *
 * Inscribe al paciente en la lista del bloque ocupado. La posición sale del
 * orden cronológico de llegada, como exige la ficha del CU.
 */
exports.inscribirse = async (req, res) => {
  const cita_id = req.params.id;
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const paciente_id = await pacienteDe(conexion, req.user.usuario_id);
    if (!paciente_id) {
      await conexion.rollback();
      return res.status(403).json({
        error: 'SOLO_PACIENTES',
        mensaje: 'Solo un paciente puede inscribirse en la lista de espera.',
      });
    }

    const [[cita]] = await conexion.execute(
      `SELECT cita_id, estado, fecha_hora_inicio, paciente_id
         FROM Cita WHERE cita_id = ? LIMIT 1 FOR UPDATE`,
      [cita_id]
    );

    if (!cita) {
      await conexion.rollback();
      return res.status(404).json({ error: 'CITA_NO_ENCONTRADA', mensaje: 'Ese bloque ya no existe.' });
    }

    if (String(cita.estado).startsWith('CANCELADA')) {
      await conexion.rollback();
      return res.status(409).json({
        error: 'BLOQUE_LIBRE',
        mensaje: 'Ese bloque ya está libre: puedes reservarlo directamente.',
      });
    }

    if (Number(cita.paciente_id) === Number(paciente_id)) {
      await conexion.rollback();
      return res.status(409).json({
        error: 'BLOQUE_PROPIO',
        mensaje: 'Ese bloque ya es tuyo: no necesitas esperarlo.',
      });
    }

    if (new Date(cita.fecha_hora_inicio).getTime() <= Date.now()) {
      await conexion.rollback();
      return res.status(409).json({
        error: 'BLOQUE_PASADO',
        mensaje: 'Ese bloque ya pasó. Busca una hora futura.',
      });
    }

    // Excepción 1: la lista tiene un tope, y lleno se deshabilita la inscripción.
    const maximo = await leerParametroEntero(conexion, 'MAX_PACIENTES_LISTA_ESPERA', 5);
    const [[conteo]] = await conexion.execute(
      `SELECT COUNT(*) AS activos FROM Lista_Espera
        WHERE cita_id = ? AND estado IN ('ESPERANDO', 'NOTIFICADO')`,
      [cita_id]
    );
    if (conteo.activos >= maximo) {
      await conexion.rollback();
      return res.status(409).json({
        error: 'LISTA_COMPLETA',
        mensaje: `La lista de espera de este bloque está completa (${maximo} personas). Prueba con otro horario o profesional.`,
      });
    }

    const [[yaInscrito]] = await conexion.execute(
      `SELECT lista_espera_id, estado, posicion FROM Lista_Espera
        WHERE cita_id = ? AND paciente_id = ? LIMIT 1`,
      [cita_id, paciente_id]
    );
    if (yaInscrito && ['ESPERANDO', 'NOTIFICADO'].includes(yaInscrito.estado)) {
      await conexion.rollback();
      return res.status(409).json({
        error: 'YA_INSCRITO',
        mensaje: `Ya estás en esta lista, en la posición ${yaInscrito.posicion}.`,
        posicion: yaInscrito.posicion,
      });
    }

    const [[ultimo]] = await conexion.execute(
      `SELECT COALESCE(MAX(posicion), 0) AS ultima FROM Lista_Espera WHERE cita_id = ?`,
      [cita_id]
    );
    const posicion = Number(ultimo.ultima) + 1;

    // Una inscripción anterior vencida se reutiliza: la clave (cita, paciente)
    // es única, así que no puede haber dos filas del mismo paciente.
    if (yaInscrito) {
      await conexion.execute(
        `UPDATE Lista_Espera
            SET estado = 'ESPERANDO', posicion = ?, notificado = FALSE,
                momento_inscripcion = NOW(), momento_notificacion = NULL, momento_expira = NULL
          WHERE lista_espera_id = ?`,
        [posicion, yaInscrito.lista_espera_id]
      );
    } else {
      await conexion.execute(
        `INSERT INTO Lista_Espera (posicion, paciente_id, cita_id) VALUES (?, ?, ?)`,
        [posicion, paciente_id, cita_id]
      );
    }

    const bloque = await datosDelBloque(conexion, cita_id);
    await notificarUsuario(
      conexion,
      req.user.usuario_id,
      'LISTA_ESPERA_INSCRITO',
      `Quedaste en la lista de espera de ${describirBloque(bloque)}` +
      `${bloque?.profesional ? ` con ${bloque.profesional}` : ''}, en la posición ${posicion}. ` +
      'Si el bloque se libera te avisamos, y si eres el primero tendrás un plazo para tomarlo.'
    );

    await conexion.commit();

    return res.status(201).json({
      mensaje: `Quedaste en la lista de espera, posición ${posicion}.`,
      posicion,
      total_en_espera: Number(conteo.activos) + 1,
    });
  } catch (error) {
    await conexion.rollback();
    // Excepción 2: falla de sincronización al guardar la posición.
    console.error('[listaEspera.inscribirse]', error);
    return res.status(500).json({
      error: 'NO_SE_PUDO_INSCRIBIR',
      mensaje: 'No pudimos guardar tu lugar en la lista. Vuelve a intentarlo.',
    });
  } finally {
    conexion.release();
  }
};

/** DELETE /api/citas/:id/lista-espera — salir de la lista por decisión propia. */
exports.salir = async (req, res) => {
  try {
    const paciente_id = await pacienteDe(pool, req.user.usuario_id);
    if (!paciente_id) {
      return res.status(403).json({ error: 'SOLO_PACIENTES' });
    }

    const [resultado] = await pool.query(
      `UPDATE Lista_Espera SET estado = 'CANCELADO'
        WHERE cita_id = ? AND paciente_id = ? AND estado IN ('ESPERANDO', 'NOTIFICADO')`,
      [req.params.id, paciente_id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'NO_INSCRITO', mensaje: 'No estabas en esta lista.' });
    }

    // Si quien salió tenía el turno, el cupo pasa al siguiente de inmediato.
    await ofrecerCupoListaEspera(pool, req.params.id);

    return res.status(200).json({ mensaje: 'Saliste de la lista de espera.' });
  } catch (error) {
    console.error('[listaEspera.salir]', error);
    return res.status(500).json({ error: 'No se pudo salir de la lista.' });
  }
};

/** GET /api/citas/mis-listas-espera */
exports.misListas = async (req, res) => {
  try {
    // Oportunista: en Render gratuito el servidor se duerme y el temporizador
    // no corre, así que cada consulta aprovecha de vencer los turnos caducados.
    await revisarVencimientosListaEspera(pool);

    const paciente_id = await pacienteDe(pool, req.user.usuario_id);
    if (!paciente_id) return res.status(200).json({ listas: [] });

    const [listas] = await pool.query(
      `SELECT le.lista_espera_id, le.posicion, le.estado, le.momento_inscripcion,
              le.momento_expira,
              c.cita_id, c.fecha_hora_inicio, c.fecha_hora_fin, c.estado AS estado_cita,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
                CONCAT('Profesional #', c.profesional_id)
              ) AS profesional,
              COALESCE(e.nombre, 'General') AS especialidad,
              (SELECT COUNT(*) FROM Lista_Espera o
                WHERE o.cita_id = le.cita_id AND o.estado IN ('ESPERANDO','NOTIFICADO')) AS en_espera
         FROM Lista_Espera le
         JOIN Cita c ON c.cita_id = le.cita_id
         JOIN Profesional p ON p.profesional_id = c.profesional_id
         LEFT JOIN Usuario u ON u.usuario_id = p.usuario_id
         LEFT JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
        WHERE le.paciente_id = ?
          AND le.estado IN ('ESPERANDO', 'NOTIFICADO')
        ORDER BY c.fecha_hora_inicio ASC`,
      [paciente_id]
    );

    return res.status(200).json({ listas });
  } catch (error) {
    console.error('[listaEspera.misListas]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus listas de espera.' });
  }
};

/**
 * Toma del cupo, compartida por la app y por el enlace del correo.
 *
 * @param {object} p
 * @param {number} [p.listaEsperaId]  turno elegido en la app
 * @param {number} [p.usuarioId]      paciente con sesión (app)
 * @param {string} [p.token]          enlace del correo (sin sesión)
 * @param {string} [p.ip]
 * @returns {Promise<{status: number, body: object}>}
 */
async function tomarTurno({ listaEsperaId, usuarioId, token, ip }) {
  const conexion = await pool.getConnection();

  try {
    await conexion.beginTransaction();

    const [[turno]] = await conexion.execute(
      `SELECT le.lista_espera_id, le.estado, le.paciente_id, le.cita_id,
              p.usuario_id,
              (le.momento_expira <= NOW()) AS vencido
         FROM Lista_Espera le
         JOIN Paciente p ON p.paciente_id = le.paciente_id
        WHERE ${token ? 'le.token_cupo = ?' : 'le.lista_espera_id = ?'}
        LIMIT 1 FOR UPDATE`,
      [token || listaEsperaId]
    );

    // En la app el turno tiene que ser del paciente con sesión.
    if (!turno || (!token && Number(turno.usuario_id) !== Number(usuarioId))) {
      await conexion.rollback();
      return {
        status: 404,
        body: {
          error: 'TURNO_NO_ENCONTRADO',
          mensaje: token ? 'Este enlace no corresponde a ningún cupo.' : 'Esta inscripción no es tuya.',
        },
      };
    }

    if (turno.estado === 'TOMADO') {
      await conexion.rollback();
      return { status: 409, body: { error: 'YA_TOMADO', mensaje: 'Ya tomaste este cupo: revisa Mis Citas en la app.' } };
    }

    if (turno.estado !== 'NOTIFICADO' || Number(turno.vencido) === 1) {
      await conexion.rollback();
      return {
        status: 409,
        body: {
          error: 'TURNO_NO_VIGENTE',
          mensaje:
            turno.estado === 'NOTIFICADO' || turno.estado === 'VENCIDO'
              ? 'Se venció tu plazo para tomar el cupo y pasó al siguiente de la lista.'
              : 'Este cupo ya no está disponible para ti.',
        },
      };
    }

    const bloque = await datosDelBloque(conexion, turno.cita_id);
    if (!bloque) {
      await conexion.rollback();
      return { status: 404, body: { error: 'BLOQUE_NO_ENCONTRADO', mensaje: 'El bloque ya no existe.' } };
    }

    // El bloque pudo ocuparse de nuevo mientras el paciente decidía.
    const [ocupadas] = await conexion.execute(
      `SELECT cita_id FROM Cita
        WHERE profesional_id = ?
          AND estado NOT LIKE 'CANCELADA%'
          AND fecha_hora_inicio < ?
          AND fecha_hora_fin > ?
        FOR UPDATE`,
      [bloque.profesional_id, bloque.fecha_hora_fin, bloque.fecha_hora_inicio]
    );
    if (ocupadas.length > 0) {
      await conexion.execute(
        `UPDATE Lista_Espera SET estado = 'VENCIDO' WHERE lista_espera_id = ?`,
        [turno.lista_espera_id]
      );
      await conexion.commit();
      return {
        status: 409,
        body: { error: 'BLOQUE_OCUPADO', mensaje: 'El bloque volvió a ocuparse. Busca otro horario disponible.' },
      };
    }

    const [creada] = await conexion.execute(
      `INSERT INTO Cita
         (fecha_hora_inicio, fecha_hora_fin, estado, modalidad, paciente_id, profesional_id, sede_id)
       SELECT fecha_hora_inicio, fecha_hora_fin, 'AGENDADA', modalidad, ?, profesional_id, sede_id
         FROM Cita WHERE cita_id = ?`,
      [turno.paciente_id, turno.cita_id]
    );

    await conexion.execute(
      `UPDATE Lista_Espera SET estado = 'TOMADO', token_cupo = NULL WHERE lista_espera_id = ?`,
      [turno.lista_espera_id]
    );

    // El cupo ya no existe para el resto de la fila: se cierra la lista y se
    // les avisa, en vez de dejarlos esperando un turno que no va a llegar.
    const [restantes] = await conexion.execute(
      `SELECT le.lista_espera_id, u.usuario_id
         FROM Lista_Espera le
         JOIN Paciente p ON p.paciente_id = le.paciente_id
         JOIN Usuario  u ON u.usuario_id = p.usuario_id
        WHERE le.cita_id = ? AND le.estado IN ('ESPERANDO', 'NOTIFICADO')`,
      [turno.cita_id]
    );
    for (const otro of restantes) {
      await conexion.execute(
        `UPDATE Lista_Espera SET estado = 'CERRADO', token_cupo = NULL WHERE lista_espera_id = ?`,
        [otro.lista_espera_id]
      );
      await notificarUsuario(
        conexion,
        otro.usuario_id,
        'CUPO_CEDIDO',
        `El cupo de ${describirBloque(bloque)} fue tomado por otro paciente de la lista. ` +
        'Puedes buscar otro horario o inscribirte en otro bloque.'
      );
    }

    // CU73: la hora tomada es una reserva como cualquier otra: falta pagarla.
    await notificarUsuario(
      conexion,
      turno.usuario_id,
      'CAMBIO_ESTADO_CITA',
      `Tomaste el cupo de ${describirBloque(bloque)}${bloque.profesional ? ` con ${bloque.profesional}` : ''}. ` +
      'Ahora completa el pago desde Mis Citas para que el profesional pueda confirmarla.',
      { datos: { pantalla: 'MisCitas', cita_id: creada.insertId } }
    );

    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('TOMA_CUPO_LISTA_ESPERA', 'Cita', ?, ?, ?)`,
      [
        ip || null,
        JSON.stringify({
          cita_id: creada.insertId,
          bloque_liberado: Number(turno.cita_id),
          lista_espera_id: Number(turno.lista_espera_id),
          origen: token ? 'CORREO' : 'APP',
        }),
        turno.usuario_id,
      ]
    );

    await conexion.commit();

    return {
      status: 201,
      body: {
        mensaje: 'El cupo quedó reservado a tu nombre. Complétalo pagando desde Mis Citas.',
        cita_id: creada.insertId,
        estado: 'AGENDADA',
        cuando: describirBloque(bloque),
        profesional: bloque.profesional || null,
      },
    };
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[listaEspera.tomarTurno]', error);
    return {
      status: 500,
      body: { error: 'NO_SE_PUDO_TOMAR', mensaje: 'No pudimos reservar el cupo. Vuelve a intentarlo.' },
    };
  } finally {
    conexion.release();
  }
}

/**
 * POST /api/citas/lista-espera/:lista_espera_id/tomar
 *
 * El primero de la fila acepta el cupo dentro de su plazo: se le agenda una
 * cita nueva en ese mismo bloque y la lista se cierra para el resto.
 */
exports.tomarCupo = async (req, res) => {
  const { status, body } = await tomarTurno({
    listaEsperaId: req.params.lista_espera_id,
    usuarioId: req.user.usuario_id,
    ip: req.ip,
  });
  return res.status(status).json(body);
};

// ── Enlace del correo: tomar el cupo sin abrir la app ─────────────────────
function paginaCupo({ titulo, mensaje, detalle, tono, boton }) {
  const color = tono === 'error' ? '#B3261E' : tono === 'aviso' ? '#A85A00' : '#003B4D';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} · Punto Paz Salud</title></head>
<body style="margin:0;background:#FCFBF9;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:520px;margin:48px auto;background:#FFFFFF;border:1px solid #ECE8E3;
              border-radius:16px;padding:32px;text-align:center;">
    <p style="font-size:20px;letter-spacing:6px;color:#003B4D;margin:0;font-weight:600;">PUNTOPAZ</p>
    <p style="font-size:11px;letter-spacing:5px;color:#8B7140;margin:0 0 28px 0;font-weight:600;">SALUD</p>
    <h1 style="color:${color};font-size:21px;margin:0 0 12px 0;">${titulo}</h1>
    <p style="color:#23201C;font-size:15px;line-height:1.6;margin:0 0 8px 0;">${mensaje}</p>
    ${detalle ? `<p style="color:#5D564D;font-size:14px;margin:0;">${detalle}</p>` : ''}
    ${boton ? `<a href="${boton.href}" style="display:inline-block;margin-top:24px;background:#003B4D;color:#FFFFFF;
        text-decoration:none;font-weight:600;padding:14px 28px;border-radius:10px;font-size:15px;">${boton.texto}</a>` : ''}
    <p style="color:#7D756A;font-size:13px;margin-top:28px;border-top:1px solid #ECE8E3;padding-top:20px;">
      También puedes hacerlo desde la app, sección Mis Citas.
    </p>
  </div>
</body></html>`;
}

const escaparHTML = (t) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * GET /api/citas/lista-espera/cupo/:token?accion=TOMAR   (público)
 *
 * Sin 'accion' muestra el cupo y el botón (los lectores de correo abren los
 * enlaces para previsualizarlos: por eso tomar el cupo exige el segundo paso).
 * Con 'accion=TOMAR' reserva la hora y muestra el resultado.
 */
exports.cupoDesdeCorreo = async (req, res) => {
  const token = String(req.params.token || '');
  const accion = String(req.query?.accion || '').toUpperCase();

  if (!/^[a-f0-9]{32,64}$/.test(token)) {
    return res.status(404).send(paginaCupo({
      titulo: 'Enlace no válido', mensaje: 'Este enlace no corresponde a ningún cupo.', tono: 'error',
    }));
  }

  if (accion === 'TOMAR') {
    const { status, body } = await tomarTurno({ token, ip: req.ip });
    if (status === 201) {
      return res.status(200).send(paginaCupo({
        titulo: '¡El cupo es tuyo!',
        mensaje: `Reservamos tu hora de ${escaparHTML(body.cuando)}${body.profesional ? ` con ${escaparHTML(body.profesional)}` : ''}.`,
        detalle: 'Entra a la app y completa el pago en Mis Citas para que el profesional pueda confirmarla.',
      }));
    }
    return res.status(status).send(paginaCupo({
      titulo: status === 409 ? 'No se pudo tomar el cupo' : 'Algo salió mal',
      mensaje: escaparHTML(body.mensaje),
      tono: status >= 500 ? 'error' : 'aviso',
    }));
  }

  try {
    const [[turno]] = await pool.query(
      `SELECT le.estado, le.cita_id,
              GREATEST(0, TIMESTAMPDIFF(MINUTE, NOW(), le.momento_expira)) AS minutos_restantes,
              (le.momento_expira <= NOW()) AS vencido
         FROM Lista_Espera le WHERE le.token_cupo = ? LIMIT 1`,
      [token]
    );
    if (!turno) {
      return res.status(404).send(paginaCupo({
        titulo: 'Enlace no válido',
        mensaje: 'Este enlace ya no corresponde a ningún cupo disponible.',
        tono: 'error',
      }));
    }
    if (turno.estado !== 'NOTIFICADO' || Number(turno.vencido) === 1) {
      return res.status(410).send(paginaCupo({
        titulo: 'El plazo terminó',
        mensaje: 'Se venció el tiempo para tomar este cupo y pasó al siguiente de la lista.',
        tono: 'aviso',
      }));
    }
    const bloque = await datosDelBloque(pool, turno.cita_id);
    return res.status(200).send(paginaCupo({
      titulo: 'Se liberó tu cupo',
      mensaje: `Hora de ${escaparHTML(describirBloque(bloque))}${bloque?.profesional ? ` con ${escaparHTML(bloque.profesional)}` : ''}.`,
      detalle: `Te quedan ${Number(turno.minutos_restantes)} minutos para tomarlo.`,
      boton: { href: `?accion=TOMAR`, texto: 'Tomar el cupo' },
    }));
  } catch (error) {
    console.error('[listaEspera.cupoDesdeCorreo]', error);
    return res.status(500).send(paginaCupo({
      titulo: 'Algo salió mal', mensaje: 'No pudimos cargar el cupo. Intenta desde la app.', tono: 'error',
    }));
  }
};
