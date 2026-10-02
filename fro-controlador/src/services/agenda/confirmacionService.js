/**
 * CU21 — Confirmación de asistencia distribuida.
 *
 * El sistema pide al paciente que confirme (o cancele) su cita cuando se
 * acerca la hora, según la regla de anticipación que administra el
 * administrador. La respuesta puede llegar por dos caminos:
 *
 *   · síncrono  — desde la app, en Mis Citas, con la sesión iniciada;
 *   · asíncrono — desde el correo, con un enlace que lleva un token propio y
 *                 vencimiento, sin necesidad de iniciar sesión.
 *
 * El token es de un solo uso por cita: vence con el plazo parametrizado
 * (Excepción 2) y no reabre nada si la cita ya cambió de estado.
 */

const crypto = require('crypto');

const {
  leerParametroEntero,
  registrarTrazabilidadAgenda,
  notificarUsuario,
  obtenerContactosCita,
  ofrecerCupoListaEspera,
  describirBloque,
  datosDelBloque,
} = require('./agendaService');

/**
 * Dirección pública del backend, para armar el enlace del correo. En Render
 * viene dada por la plataforma; en local cae al puerto de desarrollo.
 */
function urlPublica() {
  const base =
    process.env.URL_PUBLICA ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  return String(base).replace(/\/+$/, '');
}

function nuevoToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Crea (o renueva) la solicitud de confirmación de una cita y la despacha por
 * los canales del CU52. Devuelve el token generado.
 */
async function emitirSolicitud(conexion, cita) {
  const horasVigencia = await leerParametroEntero(
    conexion, 'VIGENCIA_ENLACE_CONFIRMACION_HORAS', 48
  );
  const token = nuevoToken();

  // Una cita tiene como mucho una solicitud viva: si ya había una, se
  // reemplaza por la nueva (Excepción 2: el paciente pide otra clave).
  await conexion.execute(
    `INSERT INTO Solicitud_Confirmacion (token, momento_expira, cita_id)
     VALUES (?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?)
     ON DUPLICATE KEY UPDATE
        token = VALUES(token),
        momento_envio = NOW(),
        momento_expira = VALUES(momento_expira),
        momento_respuesta = NULL,
        respuesta = NULL,
        canal_respuesta = NULL`,
    [token, horasVigencia, cita.cita_id]
  );

  const cuando = describirBloque(cita);
  const base = `${urlPublica()}/api/citas/confirmacion/${token}`;

  await notificarUsuario(
    conexion,
    cita.usuario_paciente,
    'SOLICITUD_CONFIRMACION',
    `Tu cita ${cuando}${cita.profesional ? ` con ${cita.profesional}` : ''} se acerca. ` +
    'Confirma tu asistencia para mantener la hora reservada.',
    {
      datos: { pantalla: 'MisCitas', cita_id: Number(cita.cita_id), confirmar: true },
      correo: {
        asunto: 'Confirma tu asistencia - Punto Paz Salud',
        accion:
          `<p style="margin:24px 0;">` +
          `<a href="${base}?accion=CONFIRMAR" ` +
          `style="background:#003B4D;color:#FFFFFF;text-decoration:none;padding:14px 28px;` +
          `border-radius:12px;font-weight:600;display:inline-block;">Confirmar asistencia</a>` +
          `</p>` +
          `<p style="font-size:14px;color:#5D564D;">` +
          `¿No podrás asistir? <a href="${base}?accion=CANCELAR" style="color:#8B7140;">` +
          `Cancela tu hora aquí</a> para liberar el bloque.</p>` +
          `<p style="font-size:12px;color:#7D756A;">El enlace vence en ${horasVigencia} horas.</p>`,
      },
    }
  );

  return token;
}

/**
 * Despacha las solicitudes de las citas que entran en la ventana de
 * anticipación y todavía no tienen una. Se llama desde el programador y, de
 * forma oportunista, cuando el paciente abre sus citas: en el plan gratuito de
 * Render el servidor se duerme y el temporizador deja de correr.
 *
 * @returns {Promise<number>} cuántas solicitudes salieron.
 */
async function despacharSolicitudesPendientes(pool) {
  let enviadas = 0;
  try {
    const horas = await leerParametroEntero(
      pool, 'ANTICIPACION_SOLICITUD_CONFIRMACION_HORAS', 24
    );

    const [citas] = await pool.execute(
      `SELECT c.cita_id, c.fecha_hora_inicio, c.fecha_hora_fin,
              u_pac.usuario_id AS usuario_paciente,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u_prof.nombres, u_prof.apellido_paterno)), ''),
                CONCAT('Profesional #', c.profesional_id)
              ) AS profesional
         FROM Cita c
         JOIN Paciente pac      ON pac.paciente_id = c.paciente_id
         JOIN Usuario u_pac     ON u_pac.usuario_id = pac.usuario_id
         JOIN Profesional prof  ON prof.profesional_id = c.profesional_id
         LEFT JOIN Usuario u_prof ON u_prof.usuario_id = prof.usuario_id
         LEFT JOIN Solicitud_Confirmacion s ON s.cita_id = c.cita_id
        WHERE c.estado = 'AGENDADA'
          AND c.fecha_hora_inicio > NOW()
          AND c.fecha_hora_inicio <= DATE_ADD(NOW(), INTERVAL ? HOUR)
          AND s.solicitud_confirmacion_id IS NULL
          -- CU73: solo se pide confirmar una hora ya pagada. Sin pago no hay
          -- nada que confirmar: lo que corresponde es recordar el pago.
          AND EXISTS (SELECT 1 FROM Transaccion t
                       WHERE t.cita_id = c.cita_id AND t.estado = 'PAGADA'
                         AND t.tipo <> 'DEVOLUCION')`,
      [horas]
    );

    for (const cita of citas) {
      try {
        await emitirSolicitud(pool, cita);
        enviadas++;
      } catch (error) {
        // Excepción 1 del CU21: si el despacho falla, la cita queda igual y el
        // intento se reintenta en la próxima pasada.
        console.error(`[confirmacion] cita ${cita.cita_id} sin solicitud:`, error.message);
      }
    }

    // Las citas agendadas SIN pago dentro de la misma ventana reciben, una
    // sola vez, el recordatorio "Paga tu hora" (app + correo).
    const [sinPago] = await pool.execute(
      `SELECT c.cita_id, c.fecha_hora_inicio,
              u_pac.usuario_id AS usuario_paciente,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u_prof.nombres, u_prof.apellido_paterno)), ''),
                CONCAT('Profesional #', c.profesional_id)
              ) AS profesional
         FROM Cita c
         JOIN Paciente pac      ON pac.paciente_id = c.paciente_id
         JOIN Usuario u_pac     ON u_pac.usuario_id = pac.usuario_id
         JOIN Profesional prof  ON prof.profesional_id = c.profesional_id
         LEFT JOIN Usuario u_prof ON u_prof.usuario_id = prof.usuario_id
        WHERE c.estado = 'AGENDADA'
          AND c.fecha_hora_inicio > NOW()
          AND c.fecha_hora_inicio <= DATE_ADD(NOW(), INTERVAL ? HOUR)
          AND NOT EXISTS (SELECT 1 FROM Transaccion t
                           WHERE t.cita_id = c.cita_id AND t.estado = 'PAGADA'
                             AND t.tipo <> 'DEVOLUCION')
          AND NOT EXISTS (SELECT 1 FROM Notificacion n
                           WHERE n.usuario_id = u_pac.usuario_id
                             AND n.tipo = 'RECORDATORIO_PAGO'
                             AND CAST(JSON_UNQUOTE(JSON_EXTRACT(n.datos, '$.cita_id')) AS UNSIGNED) = c.cita_id)`,
      [horas]
    );
    for (const cita of sinPago) {
      const cuando = describirBloque(await datosDelBloque(pool, cita.cita_id));
      await notificarUsuario(
        pool,
        cita.usuario_paciente,
        'RECORDATORIO_PAGO',
        `Tu hora de ${cuando}${cita.profesional ? ` con ${cita.profesional}` : ''} todavía no está pagada. ` +
          'Págala desde Mis Citas para que el profesional pueda confirmarla; sin pago, la reserva es temporal.',
        {
          datos: { pantalla: 'MisCitas', cita_id: Number(cita.cita_id) },
          correo: {
            asunto: 'Tu hora sigue sin pagar - Punto Paz Salud',
            accion:
              '<p style="color:#23201C;font-size:15px;">Entra a la app, sección <b>Mis Citas</b>, ' +
              'y toca <b>Pagar esta hora</b>.</p>',
          },
        }
      );
    }
  } catch (error) {
    console.error('[despacharSolicitudesPendientes]', error.message);
  }
  return enviadas;
}

/** Lee la solicitud por token y dice si sigue sirviendo. */
async function leerSolicitud(pool, token) {
  const [[fila]] = await pool.execute(
    `SELECT s.solicitud_confirmacion_id, s.token, s.momento_expira, s.momento_respuesta,
            s.respuesta, c.cita_id, c.estado, c.fecha_hora_inicio, c.fecha_hora_fin,
            c.paciente_id, c.profesional_id,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', u_prof.nombres, u_prof.apellido_paterno)), ''),
              CONCAT('Profesional #', c.profesional_id)
            ) AS profesional,
            COALESCE(e.nombre, 'General') AS especialidad,
            (s.momento_expira <= NOW()) AS vencida
       FROM Solicitud_Confirmacion s
       JOIN Cita c ON c.cita_id = s.cita_id
       JOIN Profesional prof ON prof.profesional_id = c.profesional_id
       LEFT JOIN Usuario u_prof ON u_prof.usuario_id = prof.usuario_id
       LEFT JOIN Especialidad e ON e.especialidad_id = prof.especialidad_id
      WHERE s.token = ? LIMIT 1`,
    [token]
  );
  return fila || null;
}

/**
 * Aplica la respuesta del paciente llegada por el enlace del correo. No hay
 * sesión: la autorización la da el token, que es secreto y vence.
 *
 * @returns {Promise<{ok: boolean, codigo: string, mensaje: string, estado?: string}>}
 */
async function responderPorEnlace(pool, token, accion, req) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [[solicitud]] = await conexion.execute(
      `SELECT s.solicitud_confirmacion_id, s.momento_respuesta,
              (s.momento_expira <= NOW()) AS vencida,
              c.cita_id, c.estado, c.fecha_hora_inicio, c.paciente_id
         FROM Solicitud_Confirmacion s
         JOIN Cita c ON c.cita_id = s.cita_id
        WHERE s.token = ? LIMIT 1 FOR UPDATE`,
      [token]
    );

    if (!solicitud) {
      await conexion.rollback();
      return { ok: false, codigo: 'TOKEN_INVALIDO', mensaje: 'Este enlace no corresponde a ninguna cita.' };
    }

    // Excepción 2: el enlace venció y ya no da acceso a la confirmación.
    if (Number(solicitud.vencida) === 1) {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'ENLACE_VENCIDO',
        mensaje: 'El enlace de confirmación venció. Entra a la app, en Mis Citas, para confirmar o pedir uno nuevo.',
      };
    }

    if (solicitud.momento_respuesta) {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'YA_RESPONDIDA',
        mensaje: 'Esta solicitud ya fue respondida. Revisa el estado de tu cita en la app.',
        estado: solicitud.estado,
      };
    }

    if (solicitud.estado !== 'AGENDADA') {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'ESTADO_NO_ESPERADO',
        mensaje: `Tu cita ya está en estado ${solicitud.estado}: el enlace no cambia nada.`,
        estado: solicitud.estado,
      };
    }

    const confirma = accion === 'CONFIRMAR';

    // CU73: confirmar exige el pago íntegro. La solicitud solo se emite para
    // horas pagadas, pero una devolución posterior podría dejarla sin pago.
    if (confirma) {
      const [[pago]] = await conexion.execute(
        `SELECT 1 AS ok FROM Transaccion
          WHERE cita_id = ? AND estado = 'PAGADA' AND tipo <> 'DEVOLUCION' LIMIT 1`,
        [solicitud.cita_id]
      );
      if (!pago) {
        await conexion.rollback();
        return {
          ok: false,
          codigo: 'CITA_SIN_PAGO',
          mensaje: 'Esta hora todavía no está pagada. Págala desde la app, en Mis Citas, y después confírmala.',
        };
      }
    }

    // Cancelar por correo respeta el mismo plazo mínimo que la app (CU18).
    if (!confirma) {
      const horasMinimas = await leerParametroEntero(
        conexion, 'ANTICIPACION_MINIMA_CANCELACION_HORAS', 2
      );
      const horasRestantes =
        (new Date(solicitud.fecha_hora_inicio).getTime() - Date.now()) / 3600000;
      if (horasRestantes < horasMinimas) {
        await conexion.rollback();
        return {
          ok: false,
          codigo: 'FUERA_DE_PLAZO',
          mensaje: `Las citas se cancelan con al menos ${horasMinimas} horas de anticipación. Comunícate con el centro.`,
        };
      }
    }

    const nuevoEstado = confirma ? 'CONFIRMADA' : 'CANCELADA_PACIENTE';

    // Excepción 4: si la escritura no toma, nada queda a medias.
    const [resultado] = await conexion.execute(
      confirma
        ? `UPDATE Cita SET estado = ? WHERE cita_id = ?`
        : `UPDATE Cita SET estado = ?, motivo_cancelacion = 'Cancelada por el paciente desde el correo de confirmación' WHERE cita_id = ?`,
      [nuevoEstado, solicitud.cita_id]
    );
    if (resultado.affectedRows === 0) {
      await conexion.rollback();
      return {
        ok: false,
        codigo: 'NO_GUARDADO',
        mensaje: 'No pudimos guardar tu respuesta. Inténtalo otra vez en unos minutos.',
      };
    }

    await conexion.execute(
      `UPDATE Solicitud_Confirmacion
          SET momento_respuesta = NOW(), respuesta = ?, canal_respuesta = 'EMAIL'
        WHERE solicitud_confirmacion_id = ?`,
      [confirma ? 'CONFIRMADA' : 'CANCELADA', solicitud.solicitud_confirmacion_id]
    );

    // El correo no trae sesión: la trazabilidad guarda el canal en lugar del
    // usuario que la ejecutó desde la app.
    await registrarTrazabilidadAgenda(conexion, req || {}, {
      accion: 'TRANSICION_CITA',
      cita_id: solicitud.cita_id,
      estado_anterior: 'AGENDADA',
      nuevo_estado: nuevoEstado,
      evento: confirma ? 'CONFIRMAR' : 'CANCELAR',
      motivo: confirma ? null : 'Respuesta del paciente al correo de confirmación',
      rol_actor: 'Paciente',
      canal: 'EMAIL',
    });

    const contactos = await obtenerContactosCita(conexion, solicitud.cita_id);
    if (contactos) {
      const texto = confirma
        ? 'El paciente confirmó su asistencia desde el correo.'
        : 'El paciente canceló su cita desde el correo de confirmación.';
      await notificarUsuario(conexion, contactos.usuario_profesional, 'CAMBIO_ESTADO_CITA', texto);
      await notificarUsuario(
        conexion,
        contactos.usuario_paciente,
        confirma ? 'CITA_CONFIRMADA' : 'CAMBIO_ESTADO_CITA',
        confirma
          ? 'Tu asistencia quedó confirmada. Te esperamos.'
          : 'Tu cita quedó cancelada y el bloque fue liberado.'
      );
    }

    // Al cancelar, el bloque se ofrece a la lista de espera (CU19).
    if (!confirma) {
      await ofrecerCupoListaEspera(conexion, solicitud.cita_id);
    }

    await conexion.commit();

    return {
      ok: true,
      codigo: confirma ? 'CONFIRMADA' : 'CANCELADA',
      estado: nuevoEstado,
      mensaje: confirma
        ? 'Tu asistencia quedó confirmada. ¡Te esperamos!'
        : 'Tu cita quedó cancelada y el bloque se liberó para otro paciente.',
    };
  } catch (error) {
    await conexion.rollback();
    console.error('[responderPorEnlace]', error);
    return {
      ok: false,
      codigo: 'ERROR',
      mensaje: 'Tuvimos un problema al registrar tu respuesta. Inténtalo nuevamente.',
    };
  } finally {
    conexion.release();
  }
}

/**
 * Marca como respondida la solicitud de una cita cuando el paciente contesta
 * desde la app, para que el enlace del correo no quede dando vueltas vivo.
 */
async function cerrarSolicitudPorApp(conexion, cita_id, respuesta) {
  try {
    await conexion.execute(
      `UPDATE Solicitud_Confirmacion
          SET momento_respuesta = NOW(), respuesta = ?, canal_respuesta = 'APP'
        WHERE cita_id = ? AND momento_respuesta IS NULL`,
      [respuesta, cita_id]
    );
  } catch (error) {
    console.error('[cerrarSolicitudPorApp]', error.message);
  }
}

module.exports = {
  emitirSolicitud,
  despacharSolicitudesPendientes,
  leerSolicitud,
  responderPorEnlace,
  cerrarSolicitudPorApp,
  urlPublica,
};
