const pool = require('../../config/database');
const { rechazarSiCerrado, estaCerrado } = require('../../services/clinico/episodioService');

// ─────────────────────────────────────────────────────────────────────────────
// CU32 - Paso 1.1: Objetivos Terapéuticos
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/clinica/episodio/:episodio_id/objetivos
// Recupera el historial de metas vinculadas a un episodio clínico.
exports.obtenerObjetivos = async (req, res) => {
  const { episodio_id } = req.params;

  if (!episodio_id) {
    return res.status(400).json({
      error: 'PARAMETRO_FALTANTE',
      mensaje: 'Falta el identificador del episodio clínico.'
    });
  }

  try {
    const [objetivos] = await pool.query(
      `SELECT objetivo_terapeutico_id, descripcion, meta_valor, valor_actual, unidad, episodio_clinico_id
         FROM Objetivo_Terapeutico
        WHERE episodio_clinico_id = ?`,
      [episodio_id]
    );

    return res.status(200).json({
      episodio_clinico_id: Number(episodio_id),
      total: objetivos.length,
      objetivos
    });

  } catch (error) {
    console.error('[obtenerObjetivos]', error);
    return res.status(500).json({ error: 'Error interno al obtener los objetivos terapéuticos.' });
  }
};

// POST /api/clinica/episodio/:episodio_id/objetivos
// Define una nueva meta clínica cuantitativa para un episodio.
exports.crearObjetivo = async (req, res) => {
  // El episodio viene en la URL (/episodio/:episodio_id/objetivos); body como respaldo
  const episodio_clinico_id = req.params.episodio_id || req.body.episodio_clinico_id;
  const { descripcion, meta_valor, unidad } = req.body;

  // ─ Validación de obligatoriedad estructural 
  const camposFaltantes = [];
  if (!episodio_clinico_id) camposFaltantes.push('episodio_clinico_id');
  if (!descripcion || !descripcion.trim()) camposFaltantes.push('descripcion');

  if (camposFaltantes.length > 0) {
    return res.status(400).json({
      error: 'CAMPOS_OBLIGATORIOS_FALTANTES',
      mensaje: 'Existen campos obligatorios sin completar.',
      campos: camposFaltantes
    });
  }

  // ─ Excepción 1: la meta carece de métrica cuantitativa 
  // (Cambia 422 por 400 aquí si prefieres tu acuerdo previo)
  const metaNumerica = Number(meta_valor);
  const unidadValida = typeof unidad === 'string' && unidad.trim().length > 0;

  if (
    meta_valor === undefined || meta_valor === null || meta_valor === '' ||
    Number.isNaN(metaNumerica) || metaNumerica <= 0 ||
    !unidadValida
  ) {
    return res.status(422).json({
      error: 'META_NO_CUANTIFICABLE',
      mensaje: 'La meta carece de una métrica cuantitativa. Defina un valor numérico y una unidad de medida (ej: 30 grados, 10 repeticiones).'
    });
  }

  try {
    // CU78 Exc.3 (D12): sin metas nuevas sobre un episodio cerrado.
    if (await rechazarSiCerrado(pool, episodio_clinico_id, res)) return;

    const [result] = await pool.query(
      `INSERT INTO Objetivo_Terapeutico (descripcion, meta_valor, valor_actual, unidad, episodio_clinico_id)
       VALUES (?, ?, ?, ?, ?)`,
      // valor_actual se inicializa en 0 (aún no hay avance)
      [descripcion.trim(), metaNumerica, 0, unidad.trim().slice(0, 20), episodio_clinico_id]
    );

    return res.status(201).json({
      mensaje: 'Objetivo terapéutico definido correctamente.',
      objetivo_terapeutico_id: result.insertId,
      valor_actual: 0
    });

  } catch (error) {
    console.error('[crearObjetivo]', error);
    return res.status(500).json({ error: 'Error interno al registrar el objetivo terapéutico.' });
  }
};