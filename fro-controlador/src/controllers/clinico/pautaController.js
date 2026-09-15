/**
 * Pautas de ejercicio (Incremento 2, bloque 3).
 * CU46: biblioteca centralizada de material terapéutico.
 * CU47: prescripción de pautas con parámetros de carga.
 * CU48: cumplimiento diario del paciente (con control anti-rebote).
 * CU49: vigencia y ciclo de vida de las pautas.
 */

const pool = require('../../config/database');
const { estaCerrado } = require('../../services/clinico/episodioService');

const FRECUENCIAS_VALIDAS = ['DIARIA', 'SEMANAL'];

/** Fecha local del servidor en formato YYYY-MM-DD. */
function hoyISO() {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * CU49: el estado real de una pauta se deriva de sus fechas. Si ya venció,
 * se persiste EXPIRADA en modo mejor esfuerzo (Excepción 4: si la escritura
 * falla, el estado calculado igual gobierna la respuesta).
 */
async function estadoVigencia(pauta) {
  const hoy = hoyISO();
  const inicio = String(pauta.fecha_inicio).slice(0, 10);
  const fin = String(pauta.fecha_expiracion).slice(0, 10);

  if (hoy > fin) {
    if (pauta.estado !== 'EXPIRADA') {
      try {
        await pool.query(
          `UPDATE Pauta_Tratamiento SET estado = 'EXPIRADA' WHERE pauta_tratamiento_id = ?`,
          [pauta.pauta_tratamiento_id]
        );
      } catch (error) {
        console.error('[estadoVigencia] No se pudo persistir la expiración:', error.message);
      }
    }
    return 'EXPIRADA';
  }
  if (hoy < inicio) return 'PROGRAMADA';
  return 'VIGENTE';
}

/** Ejercicios de un conjunto de pautas, con su material y marca de hoy. */
async function ejerciciosDePautas(pautaIds) {
  if (pautaIds.length === 0) return new Map();

  const [filas] = await pool.query(
    `SELECT pe.pauta_ejercicio_id, pe.pauta_tratamiento_id, pe.nombre_ejercicio,
            pe.series, pe.repeticiones, pe.frecuencia,
            mt.nombre AS material_nombre, mt.categoria AS material_categoria,
            mt.tipo AS material_tipo,
            (SELECT COUNT(*) FROM Pauta_Cumplimiento pc
              WHERE pc.pauta_ejercicio_id = pe.pauta_ejercicio_id) AS dias_cumplidos,
            EXISTS(SELECT 1 FROM Pauta_Cumplimiento pc
                    WHERE pc.pauta_ejercicio_id = pe.pauta_ejercicio_id
                      AND pc.fecha = CURDATE()) AS cumplido_hoy
       FROM Pauta_Ejercicio pe
       LEFT JOIN Material_Terapeutico mt
         ON mt.material_terapeutico_id = pe.material_terapeutico_id
      WHERE pe.pauta_tratamiento_id IN (?)
      ORDER BY pe.pauta_ejercicio_id ASC`,
    [pautaIds]
  );

  const porPauta = new Map();
  for (const fila of filas) {
    const lista = porPauta.get(fila.pauta_tratamiento_id) || [];
    lista.push({ ...fila, cumplido_hoy: Boolean(fila.cumplido_hoy) });
    porPauta.set(fila.pauta_tratamiento_id, lista);
  }
  return porPauta;
}

/** Arma la respuesta de una lista de pautas con vigencia y ejercicios. */
async function componerPautas(pautas) {
  const ejercicios = await ejerciciosDePautas(pautas.map((p) => p.pauta_tratamiento_id));
  const resultado = [];
  for (const pauta of pautas) {
    const estado = await estadoVigencia(pauta);
    resultado.push({
      pauta_tratamiento_id: pauta.pauta_tratamiento_id,
      nombre: pauta.nombre,
      estado,
      fecha_inicio: String(pauta.fecha_inicio).slice(0, 10),
      fecha_expiracion: String(pauta.fecha_expiracion).slice(0, 10),
      episodio_clinico_id: pauta.episodio_clinico_id,
      motivo_consulta: pauta.motivo_consulta,
      // CU49: al expirar, el material deja de viajar al dispositivo.
      ejercicios: (ejercicios.get(pauta.pauta_tratamiento_id) || []).map((ejercicio) =>
        estado === 'EXPIRADA'
          ? { ...ejercicio, material_nombre: null, material_categoria: null, material_tipo: null }
          : ejercicio
      ),
    });
  }
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU46 — Biblioteca centralizada
//  GET /clinica/materiales?buscar=texto
// ─────────────────────────────────────────────────────────────────────────────

exports.buscarMateriales = async (req, res) => {
  const buscar = String(req.query?.buscar || '').trim();

  try {
    let filas;
    try {
      const patron = `%${buscar}%`;
      [filas] = await pool.query(
        `SELECT material_terapeutico_id, nombre, tipo, categoria, formato, disponibilidad
           FROM Material_Terapeutico
          WHERE disponibilidad = TRUE
            AND (? = '' OR nombre LIKE ? OR categoria LIKE ? OR tipo LIKE ?)
          ORDER BY categoria, nombre`,
        [buscar, patron, patron, patron]
      );
    } catch (errorBusqueda) {
      // CU46 — Excepción 2: si el motor de búsqueda falla, se entrega el
      // catálogo completo sin filtrar para permitir búsqueda visual.
      console.error('[buscarMateriales] Falla del filtro, catálogo completo:', errorBusqueda.message);
      [filas] = await pool.query(
        `SELECT material_terapeutico_id, nombre, tipo, categoria, formato, disponibilidad
           FROM Material_Terapeutico WHERE disponibilidad = TRUE ORDER BY categoria, nombre`
      );
    }

    return res.status(200).json({ materiales: filas, filtro: buscar });
  } catch (error) {
    console.error('[buscarMateriales]', error);
    return res.status(500).json({ error: 'No se pudo consultar la biblioteca.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU47 — Prescribir una pauta
//  POST /clinica/pautas
// ─────────────────────────────────────────────────────────────────────────────

exports.crearPauta = async (req, res) => {
  const { episodio_clinico_id, nombre, fecha_inicio, fecha_expiracion } = req.body || {};
  const ejercicios = Array.isArray(req.body?.ejercicios) ? req.body.ejercicios : [];

  if (!episodio_clinico_id || !String(nombre || '').trim()) {
    return res.status(400).json({ error: 'Debes indicar el episodio y el nombre de la pauta.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_inicio || '') || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_expiracion || '')) {
    return res.status(400).json({ error: 'Las fechas deben tener formato AAAA-MM-DD.' });
  }
  if (fecha_expiracion < fecha_inicio) {
    return res.status(400).json({ error: 'La fecha de término no puede ser anterior al inicio.' });
  }
  if (ejercicios.length === 0) {
    return res.status(400).json({ error: 'La pauta debe incluir al menos un ejercicio.' });
  }

  // CU47 — Excepción 3: series y repeticiones deben ser números positivos.
  const nombresVistos = new Set();
  for (const ejercicio of ejercicios) {
    const nombreEj = String(ejercicio?.nombre_ejercicio || '').trim();
    if (!nombreEj) {
      return res.status(400).json({ error: 'Cada ejercicio necesita un nombre.' });
    }
    if (nombresVistos.has(nombreEj.toLowerCase())) {
      return res.status(400).json({ error: `El ejercicio "${nombreEj}" está repetido en la pauta.` });
    }
    nombresVistos.add(nombreEj.toLowerCase());

    const series = Number(ejercicio?.series);
    const repeticiones = Number(ejercicio?.repeticiones);
    if (!Number.isInteger(series) || series < 1 || !Number.isInteger(repeticiones) || repeticiones < 1) {
      return res.status(400).json({
        error: `Series y repeticiones de "${nombreEj}" deben ser números enteros mayores a cero.`,
      });
    }
    // CU47 — Excepción 2: sin frecuencia válida se asume DIARIA.
    if (!FRECUENCIAS_VALIDAS.includes(ejercicio?.frecuencia)) {
      ejercicio.frecuencia = 'DIARIA';
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // CU47 — Excepción 4: la pauta cuelga de un episodio clínico existente
    // que además debe pertenecer al profesional autenticado.
    const [episodios] = await connection.execute(
      `SELECT ec.episodio_clinico_id, ec.estado
         FROM Episodio_Clinico ec
         JOIN Profesional p ON p.profesional_id = ec.profesional_id
        WHERE ec.episodio_clinico_id = ? AND p.usuario_id = ?
        LIMIT 1`,
      [episodio_clinico_id, req.user.usuario_id]
    );

    if (episodios.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: 'EPISODIO_NO_ENCONTRADO',
        mensaje: 'El episodio clínico no existe o no pertenece a tu cartera. Crea primero el episodio base.',
      });
    }

    // CU78 Exc.3 (D12): un episodio cerrado no recibe pautas nuevas.
    if (estaCerrado(episodios[0].estado)) {
      await connection.rollback();
      return res.status(409).json({
        error: 'EPISODIO_CERRADO',
        mensaje: 'Este episodio clínico está cerrado. Crea un episodio nuevo para prescribir una pauta.',
      });
    }

    // CU46 — Excepción 4: no se puede asociar material marcado como obsoleto.
    const materialesIds = ejercicios
      .map((e) => e.material_terapeutico_id)
      .filter((id) => Number.isInteger(Number(id)) && Number(id) > 0)
      .map(Number);

    if (materialesIds.length > 0) {
      const [materiales] = await connection.query(
        `SELECT material_terapeutico_id, nombre, disponibilidad
           FROM Material_Terapeutico WHERE material_terapeutico_id IN (?)`,
        [materialesIds]
      );
      const porId = new Map(materiales.map((m) => [m.material_terapeutico_id, m]));
      for (const id of materialesIds) {
        const material = porId.get(id);
        if (!material) {
          await connection.rollback();
          return res.status(404).json({ error: `El material ${id} no existe en la biblioteca.` });
        }
        if (!material.disponibilidad) {
          await connection.rollback();
          return res.status(409).json({
            error: 'MATERIAL_OBSOLETO',
            mensaje: `"${material.nombre}" fue marcado como obsoleto. Selecciona un recurso actualizado.`,
          });
        }
      }
    }

    const [resultado] = await connection.execute(
      `INSERT INTO Pauta_Tratamiento (nombre, estado, fecha_inicio, fecha_expiracion, episodio_clinico_id)
       VALUES (?, 'VIGENTE', ?, ?, ?)`,
      [String(nombre).trim(), fecha_inicio, fecha_expiracion, episodio_clinico_id]
    );
    const pautaId = resultado.insertId;

    for (const ejercicio of ejercicios) {
      await connection.execute(
        `INSERT INTO Pauta_Ejercicio
            (pauta_tratamiento_id, nombre_ejercicio, series, repeticiones, frecuencia, material_terapeutico_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          pautaId,
          String(ejercicio.nombre_ejercicio).trim(),
          Number(ejercicio.series),
          Number(ejercicio.repeticiones),
          ejercicio.frecuencia,
          ejercicio.material_terapeutico_id ? Number(ejercicio.material_terapeutico_id) : null,
        ]
      );
    }

    try {
      await connection.execute(
        `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
         VALUES ('CREACION_PAUTA', 'Pauta_Tratamiento', ?, ?)`,
        [
          JSON.stringify({ pauta_tratamiento_id: pautaId, episodio_clinico_id, ejercicios: ejercicios.length }),
          req.user.usuario_id,
        ]
      );
    } catch (errorBitacora) {
      console.error('[crearPauta] Sin registro en bitácora:', errorBitacora.message);
    }

    await connection.commit();

    return res.status(201).json({
      mensaje: 'Pauta prescrita. El paciente ya puede verla en su aplicación.',
      pauta_tratamiento_id: pautaId,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[crearPauta]', error);
    return res.status(500).json({ error: 'Error interno al guardar la pauta.' });
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Vista del profesional: pautas y episodios de un paciente
//  GET /clinica/pautas/paciente/:paciente_id
// ─────────────────────────────────────────────────────────────────────────────

exports.pautasDePaciente = async (req, res) => {
  const { paciente_id } = req.params;

  try {
    const [episodios] = await pool.query(
      `SELECT ec.episodio_clinico_id, ec.motivo_consulta, ec.estado
         FROM Episodio_Clinico ec
         JOIN Profesional p ON p.profesional_id = ec.profesional_id
        WHERE ec.paciente_id = ? AND p.usuario_id = ?
        ORDER BY ec.episodio_clinico_id DESC`,
      [paciente_id, req.user.usuario_id]
    );

    const [pautas] = await pool.query(
      `SELECT pt.*, ec.motivo_consulta
         FROM Pauta_Tratamiento pt
         JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = pt.episodio_clinico_id
         JOIN Profesional p ON p.profesional_id = ec.profesional_id
        WHERE ec.paciente_id = ? AND p.usuario_id = ?
        ORDER BY pt.pauta_tratamiento_id DESC`,
      [paciente_id, req.user.usuario_id]
    );

    return res.status(200).json({ episodios, pautas: await componerPautas(pautas) });
  } catch (error) {
    console.error('[pautasDePaciente]', error);
    return res.status(500).json({ error: 'No se pudieron obtener las pautas del paciente.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU48/CU49 — Vista del paciente
//  GET /clinica/pautas/mis-pautas
// ─────────────────────────────────────────────────────────────────────────────

exports.misPautas = async (req, res) => {
  try {
    const [pautas] = await pool.query(
      `SELECT pt.*, ec.motivo_consulta
         FROM Pauta_Tratamiento pt
         JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = pt.episodio_clinico_id
         JOIN Paciente pac ON pac.paciente_id = ec.paciente_id
        WHERE pac.usuario_id = ?
        ORDER BY pt.pauta_tratamiento_id DESC`,
      [req.user.usuario_id]
    );

    return res.status(200).json({ hoy: hoyISO(), pautas: await componerPautas(pautas) });
  } catch (error) {
    console.error('[misPautas]', error);
    return res.status(500).json({ error: 'No se pudieron obtener tus pautas.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU48 — Marcar / desmarcar el cumplimiento de HOY
//  POST   /clinica/pautas/ejercicios/:id/cumplimiento
//  DELETE /clinica/pautas/ejercicios/:id/cumplimiento
// ─────────────────────────────────────────────────────────────────────────────

/** Verifica que el ejercicio pertenezca al paciente y su pauta esté vigente. */
async function ejercicioDelPaciente(pautaEjercicioId, usuarioId) {
  const [filas] = await pool.query(
    `SELECT pe.pauta_ejercicio_id, pt.pauta_tratamiento_id, pt.estado,
            pt.fecha_inicio, pt.fecha_expiracion
       FROM Pauta_Ejercicio pe
       JOIN Pauta_Tratamiento pt ON pt.pauta_tratamiento_id = pe.pauta_tratamiento_id
       JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = pt.episodio_clinico_id
       JOIN Paciente pac ON pac.paciente_id = ec.paciente_id
      WHERE pe.pauta_ejercicio_id = ? AND pac.usuario_id = ?
      LIMIT 1`,
    [pautaEjercicioId, usuarioId]
  );
  return filas[0] || null;
}

exports.marcarCumplimiento = async (req, res) => {
  const { id } = req.params;

  try {
    const ejercicio = await ejercicioDelPaciente(id, req.user.usuario_id);
    if (!ejercicio) {
      return res.status(404).json({ error: 'El ejercicio no existe o no pertenece a tus pautas.' });
    }

    // CU49 — Excepción 1 y CU48 — Excepción 1: fuera del rango de la pauta
    // no se aceptan marcas (la fecha siempre es la de HOY, del servidor, así
    // que tampoco es posible marcar días futuros — Excepción 3).
    const estado = await estadoVigencia(ejercicio);
    if (estado !== 'VIGENTE') {
      return res.status(409).json({
        error: estado === 'EXPIRADA' ? 'PAUTA_EXPIRADA' : 'PAUTA_NO_INICIADA',
        mensaje:
          estado === 'EXPIRADA'
            ? 'Esta pauta ya terminó: su contenido quedó cerrado.'
            : `Esta pauta comienza el ${String(ejercicio.fecha_inicio).slice(0, 10)}.`,
      });
    }

    // CU48 — Excepción 4: la clave única (ejercicio, día) hace de control
    // anti-rebote; marcas repetidas quedan como un único registro.
    const [resultado] = await pool.query(
      `INSERT IGNORE INTO Pauta_Cumplimiento (pauta_ejercicio_id, fecha) VALUES (?, CURDATE())`,
      [id]
    );

    return res.status(200).json({
      mensaje: resultado.affectedRows > 0 ? '¡Ejercicio registrado!' : 'Ya estaba registrado hoy.',
      cumplido_hoy: true,
    });
  } catch (error) {
    console.error('[marcarCumplimiento]', error);
    return res.status(500).json({ error: 'No se pudo registrar el cumplimiento.' });
  }
};

exports.desmarcarCumplimiento = async (req, res) => {
  const { id } = req.params;

  try {
    const ejercicio = await ejercicioDelPaciente(id, req.user.usuario_id);
    if (!ejercicio) {
      return res.status(404).json({ error: 'El ejercicio no existe o no pertenece a tus pautas.' });
    }

    await pool.query(
      `DELETE FROM Pauta_Cumplimiento WHERE pauta_ejercicio_id = ? AND fecha = CURDATE()`,
      [id]
    );

    return res.status(200).json({ mensaje: 'Marca de hoy retirada.', cumplido_hoy: false });
  } catch (error) {
    console.error('[desmarcarCumplimiento]', error);
    return res.status(500).json({ error: 'No se pudo retirar la marca.' });
  }
};
