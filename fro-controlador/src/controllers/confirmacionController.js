/**
 * CU21 — Confirmación de asistencia distribuida.
 *
 * Dos superficies sobre el mismo servicio:
 *   · la app (con sesión), que muestra la solicitud pendiente en Mis Citas;
 *   · el correo (sin sesión), cuyo enlace abre una página web con el resultado.
 */

const pool = require('../config/database');
const {
  emitirSolicitud,
  despacharSolicitudesPendientes,
  leerSolicitud,
  responderPorEnlace,
} = require('../services/agenda/confirmacionService');

// ── Página web que ve el paciente al volver desde el correo ────────────────
function paginaHTML({ titulo, mensaje, detalle, tono }) {
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
    <p style="color:#7D756A;font-size:13px;margin-top:28px;border-top:1px solid #ECE8E3;padding-top:20px;">
      Puedes revisar el estado de tus horas en la app, sección Mis Citas.
    </p>
  </div>
</body></html>`;
}

function fechaLegible(valor) {
  if (!valor) return '';
  const f = new Date(valor);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()} a las ${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

/**
 * GET /api/citas/confirmacion/:token?accion=CONFIRMAR|CANCELAR   (público)
 *
 * Es el enlace del correo. Sin 'accion' muestra el detalle de la cita y los
 * dos botones; con 'accion' aplica la respuesta y muestra el resultado.
 */
exports.responderDesdeCorreo = async (req, res) => {
  const { token } = req.params;
  const accion = String(req.query?.accion || '').trim().toUpperCase();

  try {
    if (!['CONFIRMAR', 'CANCELAR'].includes(accion)) {
      const solicitud = await leerSolicitud(pool, token);

      if (!solicitud) {
        return res.status(404).send(paginaHTML({
          titulo: 'Enlace no válido',
          mensaje: 'Este enlace no corresponde a ninguna cita.',
          tono: 'error',
        }));
      }
      // Excepción 2: el token venció y no da acceso a la interfaz.
      if (Number(solicitud.vencida) === 1) {
        return res.status(410).send(paginaHTML({
          titulo: 'El enlace venció',
          mensaje: 'Por seguridad, este enlace de confirmación ya no está activo.',
          detalle: 'Entra a la app, en Mis Citas, para confirmar tu hora o pedir un enlace nuevo.',
          tono: 'aviso',
        }));
      }
      if (solicitud.momento_respuesta) {
        return res.status(200).send(paginaHTML({
          titulo: 'Ya respondiste esta solicitud',
          mensaje: `Tu cita está en estado ${solicitud.estado}.`,
          tono: 'aviso',
        }));
      }

      const base = `${req.protocol}://${req.get('host')}/api/citas/confirmacion/${token}`;
      return res.status(200).send(paginaHTML({
        titulo: 'Confirma tu asistencia',
        mensaje: `Cita del ${fechaLegible(solicitud.fecha_hora_inicio)} con ${solicitud.profesional} (${solicitud.especialidad}).`,
        detalle:
          `<a href="${base}?accion=CONFIRMAR" style="display:inline-block;margin:16px 8px 0 8px;` +
          `background:#003B4D;color:#fff;text-decoration:none;padding:14px 26px;border-radius:12px;` +
          `font-weight:600;">Confirmar asistencia</a>` +
          `<a href="${base}?accion=CANCELAR" style="display:inline-block;margin:16px 8px 0 8px;` +
          `color:#8B7140;text-decoration:none;padding:14px 20px;">No podré asistir</a>`,
      }));
    }

    const resultado = await responderPorEnlace(pool, token, accion, req);

    if (!resultado.ok) {
      const codigoHttp = resultado.codigo === 'TOKEN_INVALIDO' ? 404
        : resultado.codigo === 'ENLACE_VENCIDO' ? 410
        : resultado.codigo === 'ERROR' ? 500 : 409;
      return res.status(codigoHttp).send(paginaHTML({
        titulo: resultado.codigo === 'ENLACE_VENCIDO' ? 'El enlace venció' : 'No pudimos registrar tu respuesta',
        mensaje: resultado.mensaje,
        tono: resultado.codigo === 'ERROR' ? 'error' : 'aviso',
      }));
    }

    return res.status(200).send(paginaHTML({
      titulo: resultado.codigo === 'CONFIRMADA' ? '¡Asistencia confirmada!' : 'Cita cancelada',
      mensaje: resultado.mensaje,
      tono: 'ok',
    }));
  } catch (error) {
    console.error('[responderDesdeCorreo]', error);
    return res.status(500).send(paginaHTML({
      titulo: 'Algo salió mal',
      mensaje: 'No pudimos procesar tu respuesta. Inténtalo otra vez desde la app.',
      tono: 'error',
    }));
  }
};

/**
 * GET /api/citas/confirmaciones/pendientes   (paciente autenticado)
 *
 * Qué citas tienen una solicitud de confirmación abierta. La app la usa para
 * destacar esas horas en Mis Citas.
 */
exports.pendientes = async (req, res) => {
  try {
    // Oportunista: aprovecha la visita para despachar lo que el temporizador no
    // alcanzó a mandar mientras el servidor dormía.
    await despacharSolicitudesPendientes(pool);

    const [filas] = await pool.query(
      `SELECT s.cita_id, s.momento_envio, s.momento_expira,
              (s.momento_expira <= NOW()) AS vencida
         FROM Solicitud_Confirmacion s
         JOIN Cita c ON c.cita_id = s.cita_id
         JOIN Paciente p ON p.paciente_id = c.paciente_id
        WHERE p.usuario_id = ?
          AND s.momento_respuesta IS NULL
          AND c.estado = 'AGENDADA'`,
      [req.user.usuario_id]
    );

    return res.status(200).json({ pendientes: filas });
  } catch (error) {
    console.error('[confirmaciones.pendientes]', error);
    return res.status(200).json({ pendientes: [] });
  }
};

/**
 * POST /api/citas/:id/solicitar-confirmacion   (paciente autenticado)
 *
 * Excepción 2 del CU21: el paciente pide que le generen una clave nueva
 * cuando la anterior venció.
 */
exports.reenviar = async (req, res) => {
  try {
    const [[cita]] = await pool.query(
      `SELECT c.cita_id, c.fecha_hora_inicio, c.fecha_hora_fin, c.estado,
              u_pac.usuario_id AS usuario_paciente,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u_prof.nombres, u_prof.apellido_paterno)), ''),
                CONCAT('Profesional #', c.profesional_id)
              ) AS profesional
         FROM Cita c
         JOIN Paciente pac ON pac.paciente_id = c.paciente_id
         JOIN Usuario u_pac ON u_pac.usuario_id = pac.usuario_id
         JOIN Profesional prof ON prof.profesional_id = c.profesional_id
         LEFT JOIN Usuario u_prof ON u_prof.usuario_id = prof.usuario_id
        WHERE c.cita_id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!cita) {
      return res.status(404).json({ error: 'CITA_NO_ENCONTRADA' });
    }
    if (cita.usuario_paciente !== req.user.usuario_id) {
      return res.status(403).json({ error: 'CITA_AJENA', mensaje: 'Esta cita no es tuya.' });
    }
    const [[pago]] = await pool.query(
      `SELECT 1 AS ok FROM Transaccion
        WHERE cita_id = ? AND estado = 'PAGADA' AND tipo <> 'DEVOLUCION' LIMIT 1`,
      [cita.cita_id]
    );
    if (!pago) {
      return res.status(409).json({
        error: 'CITA_SIN_PAGO',
        mensaje: 'Esta hora todavía no está pagada. Págala primero y después podrás confirmarla.',
      });
    }

    if (cita.estado !== 'AGENDADA') {
      return res.status(409).json({
        error: 'ESTADO_NO_ESPERADO',
        mensaje: `Tu cita está en estado ${cita.estado}: no hay nada que confirmar.`,
      });
    }

    await emitirSolicitud(pool, cita);

    return res.status(200).json({
      mensaje: 'Te enviamos una solicitud nueva. Revisa tus notificaciones y tu correo.',
    });
  } catch (error) {
    console.error('[confirmaciones.reenviar]', error);
    return res.status(500).json({
      error: 'NO_SE_PUDO_ENVIAR',
      mensaje: 'No pudimos generar la solicitud. Inténtalo nuevamente.',
    });
  }
};
