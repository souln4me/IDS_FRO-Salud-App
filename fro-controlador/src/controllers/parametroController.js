const pool = require('../config/database');
const ParametroModel = require('../models/parametroModel');

// D6: antes esto escribía en logs/audit.log, que Render borra en cada
// despliegue. Ahora cada evento queda en Bitacora_Auditoria (RNF20).
// Mejor esfuerzo: un fallo al auditar no anula el cambio ya confirmado.
const registrarAuditoria = async (accion, administradorId, datos, ip) => {
    try {
        await pool.query(
            `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
             VALUES (?, 'Parametro_Global', ?, ?, ?)`,
            [accion, ip || null, JSON.stringify(datos), administradorId || null]
        );
    } catch (error) {
        console.error('[parametros] No se pudo registrar en bitácora:', error.message);
    }
};


//  BLOQUE DE LECTURA (Flujo Normal)
exports.obtenerParametros = async (req, res) => {
    try {
        // Utilizamos el modelo creado en el Paso 2 para lectura masiva
        const parametros = await ParametroModel.getAll();
        res.status(200).json(parametros);
    } catch (error) {
        console.error(" Error al obtener parámetros:", error);
        res.status(500).json({ error: 'Fallo al intentar sincronizar con la base de datos de lectura.' });
    }
};


//  BLOQUE DE MUTACIÓN (Control de Concurrencia y Transacciones)
exports.actualizarParametro = async (req, res) => {
    const { clave, valor, ultima_modificacion } = req.body;
    
    const administradorId = req.user?.usuario_id; 

    if (!clave || !valor || !ultima_modificacion) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para la actualización.' });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const query = `
            UPDATE Parametro_Global 
            SET valor = ?, administrador_id = ? 
            WHERE clave = ? AND (UNIX_TIMESTAMP(ultima_modificacion) * 1000) = ?
        `;
        
        const timestampNumerico = parseInt(ultima_modificacion, 10);

        const [result] = await connection.execute(query, [valor, administradorId, clave, timestampNumerico]);

        // EXCEPCIÓN 3: CONFLICTO DE CONCURRENCIA
        if (result.affectedRows === 0) {
            // Abortamos formalmente y liberamos la BD
            await connection.rollback(); 
            
            await registrarAuditoria('PARAMETRO_CONFLICTO_CONCURRENCIA', administradorId, { clave, valor_intentado: valor }, req.ip);
            
            return res.status(409).json({ 
                error: 'Los datos han sido modificados por otro usuario recientemente. Por favor, recargue el panel para resincronizar la interfaz y reintente la mutación.' 
            });
        }

        // FLUJO NORMAL: COMMIT EXITOSO
        await connection.commit();
        await registrarAuditoria('PARAMETRO_MODIFICADO', administradorId, { clave, nuevo_valor: valor }, req.ip);

        res.status(200).json({ mensaje: 'Parámetro actualizado exitosamente.' });

    } catch (error) {
        // EXCEPCIÓN 4: FALLO DE RÉPLICA / PERSISTENCIA
        await connection.rollback(); 
        
        console.error(" Error grave en la transacción de parámetros:", error);
        await registrarAuditoria('PARAMETRO_FALLO_PERSISTENCIA', administradorId, { clave, error: error.message }, req.ip);
        
        res.status(500).json({ 
            error: 'Ocurrió un error en el servidor al intentar guardar los cambios. La transacción ha sido deshecha.' 
        });
        
    } finally {
        connection.release();
    }
};


// ─────────────────────────────────────────────────────────────────────────────
//  CU57 — Diccionario de términos restringidos
// ─────────────────────────────────────────────────────────────────────────────
// Es la precondición del caso de uso: el filtro del chat (y mañana el de las
// reseñas) solo puede bloquear lo que el Administrador haya declarado acá.

const { refrescar } = require('../services/clinico/filtroContenidoService');

/** GET /api/parametros/palabras-restringidas */
exports.listarPalabras = async (req, res) => {
  try {
    const [palabras] = await pool.query(
      `SELECT palabra_restringida_id, termino, categoria, activa, momento_creacion
         FROM Palabra_Restringida
        ORDER BY activa DESC, termino ASC`
    );
    return res.status(200).json({ palabras });
  } catch (error) {
    console.error('[listarPalabras CU57]', error);
    return res.status(500).json({ error: 'No se pudo cargar el diccionario.' });
  }
};

/** POST /api/parametros/palabras-restringidas   { termino, categoria } */
exports.agregarPalabra = async (req, res) => {
  const termino = String(req.body?.termino || '').trim().slice(0, 80);
  const categoria = String(req.body?.categoria || 'GENERAL').trim().slice(0, 40).toUpperCase();

  if (termino.length < 2) {
    return res.status(400).json({
      error: 'TERMINO_INVALIDO',
      mensaje: 'El término debe tener al menos dos caracteres.',
    });
  }

  try {
    await pool.query(
      `INSERT INTO Palabra_Restringida (termino, categoria, administrador_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), activa = TRUE`,
      [termino, categoria, req.user.usuario_id]
    );
    refrescar();

    await pool
      .query(
        `INSERT INTO Bitacora_Auditoria
            (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('ALTA_PALABRA_RESTRINGIDA', 'Palabra_Restringida', ?, ?, ?)`,
        [req.ip || null, JSON.stringify({ termino, categoria }), req.user.usuario_id]
      )
      .catch(() => {});

    return res.status(201).json({ mensaje: `"${termino}" quedó en el diccionario.` });
  } catch (error) {
    console.error('[agregarPalabra CU57]', error);
    return res.status(500).json({ error: 'No se pudo agregar el término.' });
  }
};

/** PUT /api/parametros/palabras-restringidas/:id   { activa } */
exports.alternarPalabra = async (req, res) => {
  const activa = req.body?.activa !== false;
  try {
    const [resultado] = await pool.query(
      `UPDATE Palabra_Restringida SET activa = ? WHERE palabra_restringida_id = ?`,
      [activa, req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'TERMINO_NO_ENCONTRADO' });
    }
    refrescar();
    return res.status(200).json({
      mensaje: activa ? 'Término activado.' : 'Término desactivado.',
    });
  } catch (error) {
    console.error('[alternarPalabra CU57]', error);
    return res.status(500).json({ error: 'No se pudo cambiar el término.' });
  }
};

/** DELETE /api/parametros/palabras-restringidas/:id */
exports.eliminarPalabra = async (req, res) => {
  try {
    const [resultado] = await pool.query(
      `DELETE FROM Palabra_Restringida WHERE palabra_restringida_id = ?`,
      [req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'TERMINO_NO_ENCONTRADO' });
    }
    refrescar();
    return res.status(200).json({ mensaje: 'Término eliminado del diccionario.' });
  } catch (error) {
    console.error('[eliminarPalabra CU57]', error);
    return res.status(500).json({ error: 'No se pudo eliminar el término.' });
  }
};
