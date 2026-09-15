/**
 * Estado del episodio clínico (CU78, decisión D12).
 *
 * Un episodio nace ABIERTO y solo el profesional lo cierra. Una vez CERRADO
 * no admite nuevas sesiones, metas, pautas ni documentos: todo lo posterior
 * pertenece a un episodio nuevo. Estas dos funciones concentran la regla para
 * que cada controlador la aplique igual.
 */

const ESTADO_ABIERTO = 'ABIERTO';
const ESTADO_CERRADO = 'CERRADO';

function estaCerrado(estado) {
  return String(estado || '').trim().toUpperCase() === ESTADO_CERRADO;
}

/** Devuelve la fila del episodio (o null) con su estado normalizado. */
async function obtenerEpisodio(conexion, episodioId) {
  const [filas] = await conexion.query(
    `SELECT episodio_clinico_id, estado, paciente_id, profesional_id
       FROM Episodio_Clinico WHERE episodio_clinico_id = ? LIMIT 1`,
    [episodioId]
  );
  return filas[0] || null;
}

/**
 * Responde 409 EPISODIO_CERRADO si corresponde y devuelve true; si el
 * episodio está abierto (o no se indicó) devuelve false y no toca la respuesta.
 */
async function rechazarSiCerrado(conexion, episodioId, res) {
  if (!episodioId) return false;
  const episodio = await obtenerEpisodio(conexion, episodioId);
  if (episodio && estaCerrado(episodio.estado)) {
    res.status(409).json({
      error: 'EPISODIO_CERRADO',
      mensaje: 'Este episodio clínico está cerrado y no admite nuevos registros. Crea un episodio nuevo para continuar.',
    });
    return true;
  }
  return false;
}

module.exports = { ESTADO_ABIERTO, ESTADO_CERRADO, estaCerrado, obtenerEpisodio, rechazarSiCerrado };
