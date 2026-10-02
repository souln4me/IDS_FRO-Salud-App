/**
 * CU52 — Despacho multicanal de avisos.
 *
 * Un solo punto por el que salen TODAS las notificaciones del sistema. Antes
 * cada controlador escribía a mano en la tabla Notificacion y el aviso moría
 * ahí: nadie lo leía nunca, porque la app no tenía dónde mostrarlo.
 *
 * Ahora cada aviso:
 *   1. queda en el centro de notificaciones de la app (siempre: es el registro
 *      histórico del usuario, y de ahí sale el globo de no leídos),
 *   2. sale como notificación push si el usuario la tiene activada y hay un
 *      dispositivo registrado,
 *   3. sale por correo si la tiene activada y el aviso trae cuerpo de correo.
 *
 * El canal efectivamente usado queda en la bitácora (Excepción 2 del CU52).
 *
 * Nada de esto puede tumbar la operación que lo disparó: el envío es "mejor
 * esfuerzo" y los errores se registran, nunca se propagan (Excepciones 1 y 3).
 */

const { enviarCorreo } = require('./otpService');

// Endpoint público de Expo. Funciona con cualquier token ExponentPushToken,
// venga de una build propia o de Expo Go en plataformas donde siga habilitado.
const URL_EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

// Tipos de aviso del sistema. El título es el que se ve en el centro de
// notificaciones y en la alerta del teléfono; 'pantalla' dice adónde lleva el
// toque (Excepción 3/4 del CU52: la redirección profunda al módulo).
const TIPOS = {
  CAMBIO_ESTADO_CITA:     { titulo: 'Cambio en tu cita',            pantalla: 'MisCitas' },
  SOLICITUD_CONFIRMACION: { titulo: 'Confirma tu asistencia',        pantalla: 'MisCitas' },
  CITA_CONFIRMADA:        { titulo: 'Asistencia confirmada',         pantalla: 'MisCitas' },
  CUPO_DISPONIBLE:        { titulo: 'Se liberó un cupo',             pantalla: 'MisCitas' },
  CUPO_CEDIDO:            { titulo: 'El cupo pasó al siguiente',     pantalla: 'MisCitas' },
  LISTA_ESPERA_INSCRITO:  { titulo: 'Estás en la lista de espera',   pantalla: 'MisCitas' },
  MENSAJE_CLINICO:        { titulo: 'Mensaje nuevo',                 pantalla: 'ChatClinico' },
  TESTIMONIO_PUBLICADO:   { titulo: 'Tienes un testimonio nuevo',  pantalla: 'MiPerfil' },
  TICKET_ASIGNADO:        { titulo: 'Ticket asignado',              pantalla: 'BandejaSoporte' },
  TICKET_SIN_OPERADOR:    { titulo: 'Ticket sin operador',          pantalla: 'BandejaSoporte' },
  TICKET_RESUELTO:        { titulo: 'Tu solicitud fue atendida',    pantalla: 'Soporte' },
  LIQUIDACION_EMITIDA:    { titulo: 'Liquidación emitida',           pantalla: 'MisLiquidaciones' },
  EVALUAR_SESION:         { titulo: 'Califica tu atención',          pantalla: 'MisCitas' },
  RECORDATORIO_PAGO:      { titulo: 'Paga tu hora',                 pantalla: 'MisCitas' },
  DEVOLUCION_PAGO:        { titulo: 'Te devolvimos el pago',         pantalla: 'Pagos' },
  ALERTA_DETERIORO:       { titulo: 'Bandera roja de un paciente',  pantalla: 'DashboardProfesional' },
  SESION_SUSPENDIDA:      { titulo: 'Sesión derivada a revisión',    pantalla: 'SesionesSuspendidas' },
  PAUTA_ASIGNADA:         { titulo: 'Tienes ejercicios nuevos',      pantalla: 'MisPautas' },
};

/** Datos de contacto y preferencias del destinatario, en una sola consulta. */
async function destinatario(conexion, usuario_id) {
  const [filas] = await conexion.query(
    `SELECT u.usuario_id, u.email, u.nombres,
            COALESCE(p.canal_push, TRUE)  AS acepta_push,
            COALESCE(p.canal_email, TRUE) AS acepta_email
       FROM Usuario u
       LEFT JOIN Preferencia_Notificacion p ON p.usuario_id = u.usuario_id
      WHERE u.usuario_id = ? LIMIT 1`,
    [usuario_id]
  );
  return filas[0] || null;
}

async function tokensDe(conexion, usuario_id) {
  const [filas] = await conexion.query(
    `SELECT token FROM Dispositivo_Push WHERE usuario_id = ? AND activo = TRUE`,
    [usuario_id]
  );
  return filas.map((f) => f.token);
}

/**
 * Envía a los tokens indicados y desactiva los que Expo declara muertos.
 *
 * Hoy Expo Go en Android no entrega push remoto (Google lo bloqueó desde el
 * SDK 53), así que en la práctica no habrá tokens registrados hasta que el
 * equipo compile una build propia. El camino queda escrito y probado para ese
 * día: registrar el token es lo único que falta del lado del teléfono.
 */
async function enviarPush(pool, tokens, { titulo, contenido, datos }) {
  if (tokens.length === 0) return { enviados: 0 };

  const mensajes = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title: titulo,
    body: contenido,
    data: datos || {},
  }));

  const respuesta = await fetch(URL_EXPO_PUSH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(mensajes),
    signal: AbortSignal.timeout(10000),
  });

  if (!respuesta.ok) {
    throw new Error(`Expo respondió ${respuesta.status}`);
  }

  const cuerpo = await respuesta.json();
  const resultados = Array.isArray(cuerpo?.data) ? cuerpo.data : [];

  // Un token de un teléfono que desinstaló la app queda inservible: se apaga
  // para no reintentar con él en cada aviso.
  for (let i = 0; i < resultados.length; i++) {
    if (resultados[i]?.details?.error === 'DeviceNotRegistered') {
      await pool
        .query(`UPDATE Dispositivo_Push SET activo = FALSE WHERE token = ?`, [tokens[i]])
        .catch(() => {});
    }
  }

  return { enviados: resultados.filter((r) => r?.status === 'ok').length };
}

/** Plantilla sobria para los avisos que salen por correo. */
function cuerpoCorreo({ titulo, contenido, nombre, accion }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;">
    <p style="font-size:18px;letter-spacing:5px;color:#003B4D;margin:0;font-weight:600;">PUNTOPAZ</p>
    <p style="font-size:10px;letter-spacing:4px;color:#8B7140;margin:0 0 24px 0;font-weight:600;">SALUD</p>
    <h2 style="color:#003B4D;font-size:19px;margin:0 0 12px 0;">${titulo}</h2>
    <p style="color:#23201C;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
      ${nombre ? `Hola ${nombre}:<br/>` : ''}${contenido}
    </p>
    ${accion || ''}
    <p style="color:#7D756A;font-size:12px;margin-top:28px;border-top:1px solid #ECE8E3;padding-top:16px;">
      Puedes desactivar estos correos desde Notificaciones, en tu perfil de la app.
    </p>
  </div>`;
}

/**
 * Despacha un aviso por todos los canales que correspondan.
 *
 * @param {object} conexion  pool o conexión en transacción (la fila del centro
 *                           de notificaciones se escribe con ella).
 * @param {object} aviso
 *   usuario_id  destinatario
 *   tipo        clave de TIPOS (define título por defecto y pantalla destino)
 *   contenido   texto del aviso
 *   titulo      opcional, pisa el del tipo
 *   datos       opcional, carga útil para el toque (se mezcla con la pantalla)
 *   correo      opcional { asunto, accion } para enviar también por correo
 * @returns {Promise<{ canales: string[] }>}  nunca lanza.
 */
async function despachar(conexion, aviso) {
  const { usuario_id, tipo, contenido } = aviso;
  if (!usuario_id || !contenido) return { canales: [] };

  const plantilla = TIPOS[tipo] || {};
  const titulo = aviso.titulo || plantilla.titulo || 'Aviso de Punto Paz Salud';
  const datos = { ...(plantilla.pantalla ? { pantalla: plantilla.pantalla } : {}), ...(aviso.datos || {}) };
  const canales = [];

  // 1. Centro de notificaciones de la app. Es lo único que va dentro de la
  //    transacción de quien llama: si esto falla, el aviso no existió.
  try {
    await conexion.execute(
      `INSERT INTO Notificacion (canal, tipo, titulo, contenido, datos, usuario_id)
       VALUES ('APP', ?, ?, ?, ?, ?)`,
      [tipo || 'GENERAL', titulo, contenido, JSON.stringify(datos), usuario_id]
    );
    canales.push('APP');
  } catch (error) {
    console.error('[despachar] no se pudo guardar el aviso en la app:', error.message);
  }

  // 2. Push y correo salen fuera de la transacción y sin bloquearla: una
  //    llamada de red lenta no puede dejar una cita a medio confirmar.
  const pool = require('../../config/database');

  (async () => {
    let contacto = null;
    try {
      contacto = await destinatario(pool, usuario_id);
    } catch (error) {
      console.error('[despachar] sin datos del destinatario:', error.message);
      return;
    }
    if (!contacto) return;

    const usados = [];

    if (contacto.acepta_push) {
      try {
        const tokens = await tokensDe(pool, usuario_id);
        const { enviados } = await enviarPush(pool, tokens, { titulo, contenido, datos });
        if (enviados > 0) usados.push('PUSH');
      } catch (error) {
        // Excepción 1/3 del CU52: la latencia o la falta de red no rompen nada;
        // el aviso ya quedó en la app y el intento queda registrado.
        console.error('[despachar] push no entregado:', error.message);
      }
    }

    if (aviso.correo && contacto.acepta_email && contacto.email) {
      try {
        await enviarCorreo(
          contacto.email,
          aviso.correo.asunto || titulo,
          cuerpoCorreo({
            titulo,
            contenido,
            nombre: contacto.nombres,
            accion: aviso.correo.accion,
          })
        );
        usados.push('EMAIL');
      } catch (error) {
        console.error('[despachar] correo no entregado:', error.message);
      }
    }

    // Excepción 2 del CU52: queda escrito por dónde salió realmente el aviso.
    try {
      await pool.query(
        `INSERT INTO Bitacora_Auditoria
            (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('DESPACHO_NOTIFICACION', 'Notificacion', NULL, ?, ?)`,
        [
          JSON.stringify({
            tipo: tipo || 'GENERAL',
            canales: ['APP', ...usados],
            push_permitido: Boolean(contacto.acepta_push),
            email_permitido: Boolean(contacto.acepta_email),
          }),
          usuario_id,
        ]
      );
    } catch (error) {
      console.error('[despachar] bitácora del despacho:', error.message);
    }
  })();

  return { canales };
}

module.exports = { despachar, enviarPush, TIPOS };
