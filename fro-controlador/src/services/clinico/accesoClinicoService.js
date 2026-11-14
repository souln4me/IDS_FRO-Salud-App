/**
 * Componente: C_Control_Acceso_Clinico (puerta de entrada: src/componentes/C_Control_Acceso_Clinico.js)
 * Casos de uso: CU12, CU28, CU65.
 *
 * Acceso clínico de un profesional a un paciente.
 *
 * Antes el mismo criterio estaba copiado en el historial, el repositorio de
 * documentos y el seguimiento. Ahora vive aquí y suma la tercera vía que
 * agrega el Incremento 4:
 *
 *   1. es responsable de algún episodio del paciente,
 *   2. tiene una cita vigente con él, o
 *   3. CU65: tiene una derivación interna PENDIENTE sobre un episodio que
 *      sigue ABIERTO (lee la ficha para decidir si acepta). Al aceptar, el
 *      episodio pasa a ser suyo y entra por la vía 1.
 *   4. CU65: derivó un episodio y el receptor lo aceptó. Conserva la ficha en
 *      solo lectura (las escrituras ya exigen ser el responsable del episodio).
 */

// CU65 — Registrando y Siguiendo Derivaciones Internas
const ESTADOS_DERIVACION_CON_ACCESO = ['PENDIENTE'];

// CU28, CU65 — pacientes cuya ficha puede ver el profesional
// Pacientes a los que el profesional (identificado por usuario_id) tiene acceso.
// Lleva cuatro marcadores: los cuatro son el usuario_id.
const SQL_PACIENTES_CON_ACCESO = `
  SELECT ec.paciente_id FROM Episodio_Clinico ec
    JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
   WHERE pr.usuario_id = ?
  UNION
  SELECT c.paciente_id FROM Cita c
    JOIN Profesional pr ON pr.profesional_id = c.profesional_id
   WHERE pr.usuario_id = ? AND c.estado NOT LIKE 'CANCELADA%'
  UNION
  SELECT ec.paciente_id FROM Derivacion_Interna di
    JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = di.episodio_clinico_id
    JOIN Profesional pr ON pr.profesional_id = di.profesional_destino_id
   WHERE pr.usuario_id = ? AND di.estado = 'PENDIENTE'
     AND COALESCE(ec.estado, 'ABIERTO') <> 'CERRADO'
  UNION
  SELECT ec.paciente_id FROM Derivacion_Interna di
    JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = di.episodio_clinico_id
    JOIN Profesional pr ON pr.profesional_id = di.profesional_origen_id
   WHERE pr.usuario_id = ? AND di.momento_respuesta IS NOT NULL
     AND di.estado IN ('ACEPTADA', 'CERRADA')`;

// CU28, CU65 — parámetros de la consulta de acceso
function parametrosAcceso(usuarioId) {
  return [usuarioId, usuarioId, usuarioId, usuarioId];
}

// CU12, CU28, CU65 — decide si el profesional puede ver la ficha del paciente
/** true si el profesional (usuario_id) puede consultar la información clínica del paciente. */
async function profesionalTratante(conexion, usuarioId, pacienteId) {
  if (!usuarioId || !pacienteId) return false;
  const [filas] = await conexion.query(
    `SELECT 1 FROM Paciente p
      WHERE p.paciente_id = ? AND p.paciente_id IN (${SQL_PACIENTES_CON_ACCESO})
      LIMIT 1`,
    [pacienteId, ...parametrosAcceso(usuarioId)]
  );
  return filas.length > 0;
}

/**
 * CU65 — Registrando y Siguiendo Derivaciones Internas
 * CU65: al cerrar un episodio, sus derivaciones abiertas pasan a CERRADA. Una
 * aceptada conserva momento_respuesta, así quien derivó sigue con su lectura.
 */
async function cerrarDerivacionesDelEpisodio(conexion, episodioId) {
  const [resultado] = await conexion.query(
    `UPDATE Derivacion_Interna
        SET estado = 'CERRADA', momento_cierre = NOW()
      WHERE episodio_clinico_id = ? AND estado IN ('PENDIENTE', 'ACEPTADA')`,
    [episodioId]
  );
  return resultado.affectedRows || 0;
}

module.exports = {
  ESTADOS_DERIVACION_CON_ACCESO,
  SQL_PACIENTES_CON_ACCESO,
  parametrosAcceso,
  profesionalTratante,
  cerrarDerivacionesDelEpisodio,
};
