/**
 * Servicios compartidos del módulo de agenda (Incremento 2, bloque de citas).
 *
 * Reúne la lógica que necesitan tanto la máquina de estados de la cita
 * (citaController) como las marcas temporales (marcasTemporalesController),
 * para que ambas rutas de finalización produzcan exactamente los mismos
 * efectos: trazabilidad (CU22), descuento de sesiones (CU76) y avisos (CU18).
 */

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
async function notificarUsuario(connection, usuario_id, tipo, contenido) {
  if (!usuario_id) return false;
  try {
    await connection.execute(
      `INSERT INTO Notificacion (canal, tipo, contenido, usuario_id)
       VALUES ('APP', ?, ?, ?)`,
      [tipo, contenido, usuario_id]
    );
    return true;
  } catch (error) {
    console.error(`[notificarUsuario] Falló el aviso a usuario ${usuario_id}:`, error.message);
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
//  CU18 — Aviso a la lista de espera al liberarse un cupo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Notifica, en orden de posición, a los pacientes inscritos en la lista de
 * espera de una cita que acaba de liberarse. Nunca lanza: un fallo aquí no
 * debe revertir la cancelación (Excepción 4 del CU18).
 */
async function notificarListaEspera(connection, cita_id) {
  try {
    const [inscritos] = await connection.execute(
      `SELECT le.lista_espera_id, le.posicion, u.usuario_id
         FROM Lista_Espera le
         JOIN Paciente p ON p.paciente_id = le.paciente_id
         JOIN Usuario  u ON u.usuario_id  = p.usuario_id
        WHERE le.cita_id = ? AND le.notificado = FALSE
        ORDER BY le.posicion ASC, le.momento_inscripcion ASC`,
      [cita_id]
    );

    for (const inscrito of inscritos) {
      await notificarUsuario(
        connection,
        inscrito.usuario_id,
        'CUPO_DISPONIBLE',
        'Se liberó un cupo por el que estabas en lista de espera. Entra a la app para reservarlo.'
      );
      await connection.execute(
        `UPDATE Lista_Espera SET notificado = TRUE WHERE lista_espera_id = ?`,
        [inscrito.lista_espera_id]
      );
    }

    return inscritos.length;
  } catch (error) {
    console.error('[notificarListaEspera] Falló el aviso de cupo liberado:', error.message);
    return 0;
  }
}

module.exports = {
  leerParametroEntero,
  registrarTrazabilidadAgenda,
  obtenerTrazabilidadCita,
  notificarUsuario,
  obtenerContactosCita,
  descontarSesionPaquete,
  notificarListaEspera,
};
