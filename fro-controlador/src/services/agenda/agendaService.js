/**
 * Servicios compartidos del módulo de agenda (Incremento 2, bloque de citas).
 *
 * Reúne la lógica que necesitan tanto la máquina de estados de la cita
 * (citaController) como las marcas temporales (marcasTemporalesController),
 * para que ambas rutas de finalización produzcan exactamente los mismos
 * efectos: trazabilidad (CU22), descuento de sesiones (CU76) y avisos (CU18).
 */

const { despachar } = require('../notifications/despachador');

// ─────────────────────────────────────────────────────────────────────────────
//  Parámetros de negocio (editables por el administrador en Parámetros Globales)
// ─────────────────────────────────────────────────────────────────────────────

async function leerParametroEntero(connection, clave, valorPorDefecto) {
  try {
    const [filas] = await connection.execute(
      `SELECT valor FROM Parametro_Global WHERE clave = ? LIMIT 1`,
      [clave]
    );
    const valor = parseInt(filas[0]?.valor, 10);
    return Number.isFinite(valor) ? valor : valorPorDefecto;
  } catch {
    return valorPorDefecto;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU22 — Trazabilidad de transiciones de agenda
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra en la bitácora quién hizo qué sobre una cita, con motivo.
 * Usa las columnas reales de Bitacora_Auditoria (accion, entidad_afectada,
 * ip_origen, datos_adicionales, usuario_id).
 */
async function registrarTrazabilidadAgenda(connection, req, datos) {
  const { accion, cita_id, ...resto } = datos;
  await connection.execute(
    `INSERT INTO Bitacora_Auditoria
        (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
     VALUES (?, 'Cita', ?, ?, ?)`,
    [
      accion,
      req.ip || null,
      JSON.stringify({ cita_id: Number(cita_id), ...resto }),
      req.user?.usuario_id ?? null,
    ]
  );
}

/** Devuelve el historial de cambios de una cita, más reciente primero. */
async function obtenerTrazabilidadCita(connection, cita_id) {
  const [filas] = await connection.execute(
    `SELECT accion, momento_evento, datos_adicionales, usuario_id
       FROM Bitacora_Auditoria
      WHERE entidad_afectada = 'Cita'
        AND JSON_EXTRACT(datos_adicionales, '$.cita_id') = ?
      ORDER BY momento_evento DESC, bitacora_auditoria_id DESC`,
    [Number(cita_id)]
  );

  return filas.map((fila) => {
    let datos = fila.datos_adicionales;
    if (typeof datos === 'string') {
      try { datos = JSON.parse(datos); } catch { datos = {}; }
    }
    return {
      accion: fila.accion,
      momento: fila.momento_evento,
      usuario_id: fila.usuario_id,
      ...datos,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Notificaciones internas (tabla Notificacion)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deja un aviso en la bandeja del usuario. Nunca lanza: si el aviso falla,
 * la operación principal debe mantenerse (Excepción 4 de CU17/CU18).
 */
async function notificarUsuario(connection, usuario_id, tipo, contenido, extra = {}) {
  if (!usuario_id) return false;
  try {
    // CU52: el despachador decide los canales según las preferencias del
    // usuario. Antes esto escribía directo en la tabla y el aviso no salía de
    // la base de datos.
    await despachar(connection, { usuario_id, tipo, contenido, ...extra });
    return true;
  } catch (error) {
    console.error(`[notificarUsuario] Falló el aviso a usuario ${usuario_id}:`, error.message);
    return false;
  }
}

/**
 * CU55 — Terminada la sesión, se le pide al PACIENTE que califique la
 * atención con un aviso en su propio teléfono. Antes el formulario aparecía
 * en el celular del profesional, que no es quien debe evaluarse a sí mismo.
 * El aviso abre Mis Citas con el formulario de esa cita ya desplegado.
 */
async function pedirEvaluacion(connection, citaId) {
  try {
    const [[cita]] = await connection.execute(
      `SELECT pa.usuario_id,
              TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)) AS profesional
         FROM Cita c
         JOIN Paciente pa ON pa.paciente_id = c.paciente_id
         JOIN Profesional pr ON pr.profesional_id = c.profesional_id
         JOIN Usuario u ON u.usuario_id = pr.usuario_id
        WHERE c.cita_id = ? LIMIT 1`,
      [citaId]
    );
    if (!cita) return false;
    return notificarUsuario(
      connection,
      cita.usuario_id,
      'EVALUAR_SESION',
      `¿Cómo te fue en tu sesión con ${cita.profesional || 'tu profesional'}? ` +
        'Tócalo para calificar la atención: tu opinión ayuda a otros pacientes a elegir.',
      { datos: { pantalla: 'MisCitas', evaluar_cita_id: Number(citaId) } }
    );
  } catch (error) {
    console.error('[pedirEvaluacion CU55]', error.message);
    return false;
  }
}

/** Ids de usuario del paciente y del profesional de una cita. */
async function obtenerContactosCita(connection, cita_id) {
  const [filas] = await connection.execute(
    `SELECT c.paciente_id, c.profesional_id,
            u_pac.usuario_id  AS usuario_paciente,
            u_prof.usuario_id AS usuario_profesional
       FROM Cita c
       JOIN Paciente pac     ON pac.paciente_id = c.paciente_id
       JOIN Usuario u_pac    ON u_pac.usuario_id = pac.usuario_id
       JOIN Profesional prof ON prof.profesional_id = c.profesional_id
       JOIN Usuario u_prof   ON u_prof.usuario_id = prof.usuario_id
      WHERE c.cita_id = ?
      LIMIT 1`,
    [cita_id]
  );
  return filas[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU76 — Descuento del inventario de sesiones del paciente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descuenta una sesión del paquete activo del paciente. Si el paquete llega a
 * cero queda AGOTADO; si el paciente no tiene paquete activo, se omite la
 * sustracción (Excepción 4 del CU76) y se informa.
 */
async function descontarSesionPaquete(connection, paciente_id, motivo) {
  const [paquetes] = await connection.execute(
    `SELECT paquete_sesiones_id, sesiones_total, sesiones_usadas
       FROM Paquete_Sesiones
      WHERE paciente_id = ?
        AND estado = 'ACTIVO'
        AND sesiones_usadas < sesiones_total
      ORDER BY momento_adquisicion ASC
      LIMIT 1
      FOR UPDATE`,
    [paciente_id]
  );

  if (paquetes.length === 0) {
    return { descontada: false, sin_paquete: true, sesiones_restantes: 0 };
  }

  const paquete = paquetes[0];
  const usadas = paquete.sesiones_usadas + 1;
  const agotado = usadas >= paquete.sesiones_total;

  await connection.execute(
    `UPDATE Paquete_Sesiones
        SET sesiones_usadas = ?, estado = ?
      WHERE paquete_sesiones_id = ?`,
    [usadas, agotado ? 'AGOTADO' : 'ACTIVO', paquete.paquete_sesiones_id]
  );

  return {
    descontada: true,
    sin_paquete: false,
    motivo,
    paquete_sesiones_id: paquete.paquete_sesiones_id,
    sesiones_restantes: paquete.sesiones_total - usadas,
    paquete_agotado: agotado,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU19 — Lista de espera secuencial
// ─────────────────────────────────────────────────────────────────────────────

/** Datos del bloque liberado, para poder describirlo en el aviso. */
async function datosDelBloque(conexion, cita_id) {
  const [filas] = await conexion.execute(
    `SELECT c.cita_id, c.fecha_hora_inicio, c.fecha_hora_fin, c.profesional_id, c.sede_id,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
              CONCAT('Profesional #', c.profesional_id)
            ) AS profesional,
            COALESCE(e.nombre, 'General') AS especialidad
       FROM Cita c
       JOIN Profesional p ON p.profesional_id = c.profesional_id
       LEFT JOIN Usuario u ON u.usuario_id = p.usuario_id
       LEFT JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
      WHERE c.cita_id = ? LIMIT 1`,
    [cita_id]
  );
  return filas[0] || null;
}

/** "el martes 30/09/2026 a las 10:00", para los textos de los avisos. */
function describirBloque(bloque) {
  if (!bloque?.fecha_hora_inicio) return 'el bloque que esperabas';
  const f = new Date(bloque.fecha_hora_inicio);
  const dos = (n) => String(n).padStart(2, '0');
  return `el ${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()} a las ${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

/**
 * Ofrece el cupo liberado al PRIMERO de la lista que siga esperando, y a nadie
 * más: esa es la regla del CU19 (aviso secuencial por orden de llegada). Si ya
 * hay alguien con el turno vigente, no se toca nada hasta que venza.
 *
 * Nunca lanza: un fallo aquí no puede revertir la cancelación que liberó el
 * bloque (Excepción 4 del CU18).
 *
 * @returns {Promise<number>} 1 si se ofreció a alguien, 0 si no había a quién.
 */
async function ofrecerCupoListaEspera(connection, cita_id) {
  try {
    // El cupo solo existe si el bloque quedó realmente libre. Sin esta
    // comprobación, salir de la lista de un bloque OCUPADO le avisaba al
    // siguiente que se había liberado algo que nunca se liberó.
    const [[estadoBloque]] = await connection.execute(
      `SELECT estado FROM Cita WHERE cita_id = ? LIMIT 1`,
      [cita_id]
    );
    if (!estadoBloque || !String(estadoBloque.estado).startsWith('CANCELADA')) return 0;

    // ¿Alguien tiene el turno abierto todavía? Entonces el cupo es suyo.
    const [[turnoVigente]] = await connection.execute(
      `SELECT 1 AS ok FROM Lista_Espera
        WHERE cita_id = ? AND estado = 'NOTIFICADO' AND momento_expira > NOW()
        LIMIT 1`,
      [cita_id]
    );
    if (turnoVigente) return 0;

    const [[siguiente]] = await connection.execute(
      `SELECT le.lista_espera_id, le.posicion, u.usuario_id
         FROM Lista_Espera le
         JOIN Paciente p ON p.paciente_id = le.paciente_id
         JOIN Usuario  u ON u.usuario_id  = p.usuario_id
        WHERE le.cita_id = ? AND le.estado = 'ESPERANDO'
        ORDER BY le.posicion ASC, le.momento_inscripcion ASC
        LIMIT 1`,
      [cita_id]
    );
    if (!siguiente) return 0;

    const minutos = await leerParametroEntero(
      connection, 'PLAZO_RESPUESTA_LISTA_ESPERA_MINUTOS', 30
    );

    // Enlace del correo para tomar el cupo sin abrir la app.
    const token = require('crypto').randomBytes(24).toString('hex');
    await connection.execute(
      `UPDATE Lista_Espera
          SET estado = 'NOTIFICADO',
              notificado = TRUE,
              momento_notificacion = NOW(),
              momento_expira = DATE_ADD(NOW(), INTERVAL ? MINUTE),
              token_cupo = ?
        WHERE lista_espera_id = ?`,
      [minutos, token, siguiente.lista_espera_id]
    );
    // Carga diferida: confirmacionService depende de este módulo.
    const { urlPublica } = require('./confirmacionService');
    const enlace = `${urlPublica()}/api/citas/lista-espera/cupo/${token}`;

    const bloque = await datosDelBloque(connection, cita_id);
    const cuando = describirBloque(bloque);

    await notificarUsuario(
      connection,
      siguiente.usuario_id,
      'CUPO_DISPONIBLE',
      `Se liberó el cupo de ${cuando}${bloque?.profesional ? ` con ${bloque.profesional}` : ''}. ` +
      `Eres el primero de la lista: tienes ${minutos} minutos para tomarlo antes de que pase al siguiente.`,
      {
        datos: { pantalla: 'MisCitas', cita_id: Number(cita_id), lista_espera: true },
        correo: {
          asunto: 'Se liberó el cupo que esperabas - Punto Paz Salud',
          accion:
            `<p style="text-align:center;margin:24px 0;"><a href="${enlace}" ` +
            'style="display:inline-block;background:#003B4D;color:#FFFFFF;text-decoration:none;' +
            'font-weight:600;padding:14px 28px;border-radius:10px;font-size:15px;">Tomar el cupo</a></p>' +
            `<p style="color:#5D564D;font-size:13px;">Tienes ${minutos} minutos. También puedes tomarlo ` +
            'desde la app, sección <b>Mis Citas</b>.</p>',
        },
      }
    );

    return 1;
  } catch (error) {
    console.error('[ofrecerCupoListaEspera] Falló el aviso de cupo liberado:', error.message);
    return 0;
  }
}

/**
 * Excepción 4 del CU19: al que no responde dentro del plazo se le revoca la
 * prioridad y el cupo pasa automáticamente al siguiente de la fila.
 *
 * Se ejecuta desde el programador y también de forma oportunista cada vez que
 * alguien consulta sus listas, porque en el plan gratuito de Render el
 * servidor se duerme y el temporizador no corre mientras tanto.
 *
 * @returns {Promise<{vencidos: number, ofrecidos: number}>}
 */
async function revisarVencimientosListaEspera(conexion) {
  const resumen = { vencidos: 0, ofrecidos: 0 };
  try {
    const [vencidos] = await conexion.execute(
      `SELECT le.lista_espera_id, le.cita_id, u.usuario_id
         FROM Lista_Espera le
         JOIN Paciente p ON p.paciente_id = le.paciente_id
         JOIN Usuario  u ON u.usuario_id  = p.usuario_id
        WHERE le.estado = 'NOTIFICADO' AND le.momento_expira <= NOW()`
    );

    for (const turno of vencidos) {
      await conexion.execute(
        `UPDATE Lista_Espera SET estado = 'VENCIDO' WHERE lista_espera_id = ?`,
        [turno.lista_espera_id]
      );
      resumen.vencidos++;

      await notificarUsuario(
        conexion,
        turno.usuario_id,
        'CUPO_CEDIDO',
        'Se venció el plazo para tomar el cupo que se había liberado, así que pasó al siguiente de la lista. ' +
        'Puedes inscribirte en otro bloque cuando quieras.'
      );

      resumen.ofrecidos += await ofrecerCupoListaEspera(conexion, turno.cita_id);
    }
  } catch (error) {
    console.error('[revisarVencimientosListaEspera]', error.message);
  }
  return resumen;
}

module.exports = {
  leerParametroEntero,
  registrarTrazabilidadAgenda,
  obtenerTrazabilidadCita,
  notificarUsuario,
  pedirEvaluacion,
  obtenerContactosCita,
  descontarSesionPaquete,
  ofrecerCupoListaEspera,
  revisarVencimientosListaEspera,
  datosDelBloque,
  describirBloque,
};
