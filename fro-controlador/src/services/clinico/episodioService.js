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

/**
 * CU28/CU32: un episodio es el registro clínico de UN profesional. Otro
 * profesional vinculado al paciente puede leerlo para dar continuidad al
 * tratamiento, pero no escribir en él. Sin esta comprobación la app mostraba
 * el episodio "bloqueado" y aun así aceptaba metas nuevas.
 */
async function esProfesionalACargo(conexion, episodioId, usuarioId) {
  const [filas] = await conexion.query(
    `SELECT 1 AS ok
       FROM Episodio_Clinico ec
       JOIN Profesional p ON p.profesional_id = ec.profesional_id
      WHERE ec.episodio_clinico_id = ? AND p.usuario_id = ? LIMIT 1`,
    [episodioId, usuarioId]
  );
  return filas.length > 0;
}

/**
 * Responde 403 EPISODIO_AJENO y devuelve true cuando quien pide no es el
 * profesional a cargo. El Administrador queda fuera de la regla.
 */
async function rechazarSiAjeno(conexion, episodioId, req, res) {
  if (!episodioId) return false;
  if (req.user?.nombre_rol === 'Administrador') return false;
  if (await esProfesionalACargo(conexion, episodioId, req.user?.usuario_id)) return false;
  res.status(403).json({
    error: 'EPISODIO_AJENO',
    mensaje: 'Este episodio lo lleva otro profesional: puedes consultarlo, pero solo su profesional registra en él.',
  });
  return true;
}

/**
 * Avance global de las metas del episodio, en porcentaje entero (0-100), o
 * null si el episodio todavía no tiene metas definidas.
 *
 * Es el dato que la evolución clínica guarda en porcentaje_objetivo: antes
 * nadie lo escribía y el historial mostraba "No informado%" incluso en
 * sesiones con metas medidas.
 */
async function porcentajeObjetivosEpisodio(conexion, episodioId) {
  const [filas] = await conexion.query(
    `SELECT ROUND(AVG(LEAST(valor_actual / meta_valor, 1)) * 100) AS porcentaje
       FROM Objetivo_Terapeutico
      WHERE episodio_clinico_id = ? AND meta_valor > 0`,
    [episodioId]
  );
  const valor = filas[0]?.porcentaje;
  return valor === null || valor === undefined ? null : Number(valor);
}

module.exports = {
  ESTADO_ABIERTO,
  ESTADO_CERRADO,
  estaCerrado,
  obtenerEpisodio,
  rechazarSiCerrado,
  esProfesionalACargo,
  rechazarSiAjeno,
  porcentajeObjetivosEpisodio,
};
