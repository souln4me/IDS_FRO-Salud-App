const pool = require('../../config/database');
const { rechazarSiCerrado, estaCerrado } = require('../../services/clinico/episodioService');

// CU32

function obtenerIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket?.remoteAddress ||
    'IP_DESCONOCIDA'
  );
}

// PUT /api/clinica/objetivos/avance
exports.actualizarAvance = async (req, res) => {
  const { objetivo_terapeutico_id, valor_actual } = req.body;
  const usuario_id = req.user?.usuario_id || null;

  // ─ Validación de obligatoriedad
  if (!objetivo_terapeutico_id || valor_actual === undefined || valor_actual === null || valor_actual === '') {
    return res.status(400).json({
      error: 'CAMPOS_OBLIGATORIOS_FALTANTES',
      mensaje: 'Se requiere el identificador del objetivo y el valor de avance.'
    });
  }

  const nuevoValor = Number(valor_actual);
  if (Number.isNaN(nuevoValor) || nuevoValor < 0) {
    return res.status(400).json({
      error: 'VALOR_INVALIDO',
      mensaje: 'El avance debe ser un número igual o mayor a 0.'
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Bloqueamos la fila del objetivo y recuperamos la meta para validar el tope
    const [filas] = await connection.execute(
      `SELECT meta_valor, valor_actual FROM Objetivo_Terapeutico
        WHERE objetivo_terapeutico_id = ? FOR UPDATE`,
      [objetivo_terapeutico_id]
    );

    if (filas.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: 'OBJETIVO_NO_ENCONTRADO',
        mensaje: 'El objetivo terapéutico indicado no existe.'
      });
    }

    const metaValor = Number(filas[0].meta_valor);

    // ─ Excepción 3: el avance no puede superar la meta (100%) 
    if (nuevoValor > metaValor) {
      await connection.rollback();
      return res.status(400).json({
        error: 'AVANCE_SUPERA_META',
        mensaje: `El avance no puede superar la meta (${metaValor}). Equivaldría a más del 100% de cumplimiento.`
      });
    }

    // Actualización del valor medido
    await connection.execute(
      `UPDATE Objetivo_Terapeutico SET valor_actual = ? WHERE objetivo_terapeutico_id = ?`,
      [nuevoValor, objetivo_terapeutico_id]
    );

    // Auditoría dentro de la MISMA transacción (se revierte si algo falla)
    await connection.execute(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, usuario_id, datos_adicionales)
       VALUES (?, ?, ?, ?, ?)`,
      [
        'ACTUALIZACION_AVANCE_OBJETIVO',
        'Objetivo_Terapeutico',
        obtenerIP(req),
        usuario_id,
        JSON.stringify({
          objetivo_terapeutico_id,
          valor_anterior: Number(filas[0].valor_actual),
          valor_nuevo: nuevoValor,
          meta_valor: metaValor,
          timestamp: new Date().toISOString()
        })
      ]
    );

    await connection.commit();

    // Porcentaje calculado para el panel gráfico (la Excepción 4 se maneja en frontend)
    const porcentaje = metaValor > 0 ? Math.round((nuevoValor / metaValor) * 100) : 0;

    return res.status(200).json({
      mensaje: 'Avance del objetivo actualizado correctamente.',
      objetivo_terapeutico_id: Number(objetivo_terapeutico_id),
      valor_actual: nuevoValor,
      meta_valor: metaValor,
      porcentaje_cumplimiento: porcentaje
    });

  } catch (error) {
    await connection.rollback();
    console.error('[actualizarAvance]', error);
    return res.status(500).json({
      error: 'Error interno al actualizar el avance. La transacción fue revertida.'
    });
  } finally {
    connection.release();
  }
};

// POST /api/clinica/episodio/:episodio_id/evolucion
exports.crearEvolucionEnBlanco = async (req, res) => {
  const { episodio_id } = req.params;
  const usuario_id = req.user?.usuario_id;

  const connection = await pool.getConnection();

  try {
    // 1. Obtener el ID del Profesional real a partir del ID del Usuario logueado
    const [profesionales] = await connection.query(
      'SELECT profesional_id FROM Profesional WHERE usuario_id = ?',
      [usuario_id]
    );

    if (profesionales.length === 0) {
      return res.status(403).json({ error: 'Usuario no es un profesional acreditado.' });
    }

    const profesional_id = profesionales[0].profesional_id;

    // CU78 Exc.3 (D12): un episodio cerrado no abre sesiones nuevas.
    if (await rechazarSiCerrado(connection, episodio_id, res)) return;

    // 2. Insertar la evolución clínica en blanco, ligada al episodio
    const [result] = await connection.query(`
      INSERT INTO Evolucion_Clinica (
        inalterable, 
        episodio_clinico_id, 
        profesional_id,
        porcentaje_objetivo
      ) VALUES (0, ?, ?, 0)
    `, [episodio_id, profesional_id]);

    return res.status(201).json({
      mensaje: 'Sesión clínica iniciada exitosamente.',
      evolucion_clinica_id: result.insertId
    });

  } catch (error) {
    console.error('[crearEvolucionEnBlanco]', error);
    return res.status(500).json({ error: 'Error al iniciar la sesión clínica.' });
  } finally {
    connection.release();
  }
};