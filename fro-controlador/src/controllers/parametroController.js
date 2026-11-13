/**
 * Componente: C_API_REST
 * Casos de uso: CU59, CU57, CU13.
 *
 * Panel de parámetros globales del Administrador y diccionario de términos
 * restringidos del filtro de contenido.
 */
const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');
const C_Filtro_Contenido = require('../componentes/C_Filtro_Contenido');

// CU13 — Registrando bitácora de auditoría de seguridad
// D6: antes esto escribía en logs/audit.log, que Render borra en cada
// despliegue. Ahora cada evento queda en Bitacora_Auditoria (RNF20).
// Mejor esfuerzo: un fallo al auditar no anula el cambio ya confirmado.
const registrarAuditoria = async (accion, administradorId, datos, ip) => {
    try {
        await C_Capa_de_Acceso_a_Datos.query(
            `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
             VALUES (?, 'Parametro_Global', ?, ?, ?)`,
            [accion, ip || null, JSON.stringify(datos), administradorId || null]
        );
    } catch (error) {
        console.error('[parametros] No se pudo registrar en bitácora:', error.message);
    }
};


// CU59 — Gestionando Parámetros Globales del Sistema
//  BLOQUE DE LECTURA (Flujo Normal)
exports.obtenerParametros = async (req, res) => {
    try {
        // Utilizamos el modelo creado en el Paso 2 para lectura masiva
        const parametros = await C_Capa_de_Acceso_a_Datos.ParametroModel.getAll();
        res.status(200).json(parametros);
    } catch (error) {
        console.error(" Error al obtener parámetros:", error);
        res.status(500).json({ error: 'Fallo al intentar sincronizar con la base de datos de lectura.' });
    }
};


// CU59 — Gestionando Parámetros Globales del Sistema
//  BLOQUE DE MUTACIÓN (Control de Concurrencia y Transacciones)
exports.actualizarParametro = async (req, res) => {
    const { clave, valor, ultima_modificacion } = req.body;
    
    const administradorId = req.user?.usuario_id; 

    // Un valor 0 es válido (por ejemplo, un descuento en 0 %); solo falta si viene vacío.
    const valorVacio = valor === undefined || valor === null || String(valor).trim() === '';
    if (!clave || valorVacio || !ultima_modificacion) {
        return res.status(400).json({ error: 'Faltan datos obligatorios para la actualización.' });
    }

    const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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


// CU57 — Filtrando automáticamente contenido restringido
/** GET /api/parametros/palabras-restringidas */
exports.listarPalabras = async (req, res) => {
  try {
    const [palabras] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU57 — Filtrando automáticamente contenido restringido
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
    await C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Palabra_Restringida (termino, categoria, administrador_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), activa = TRUE`,
      [termino, categoria, req.user.usuario_id]
    );
    C_Filtro_Contenido.refrescar();

    // CU13: queda en la bitácora de auditoría
    await C_Capa_de_Acceso_a_Datos
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

// CU57 — Filtrando automáticamente contenido restringido
/** PUT /api/parametros/palabras-restringidas/:id   { activa } */
exports.alternarPalabra = async (req, res) => {
  const activa = req.body?.activa !== false;
  try {
    const [resultado] = await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Palabra_Restringida SET activa = ? WHERE palabra_restringida_id = ?`,
      [activa, req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'TERMINO_NO_ENCONTRADO' });
    }
    C_Filtro_Contenido.refrescar();
    return res.status(200).json({
      mensaje: activa ? 'Término activado.' : 'Término desactivado.',
    });
  } catch (error) {
    console.error('[alternarPalabra CU57]', error);
    return res.status(500).json({ error: 'No se pudo cambiar el término.' });
  }
};

// CU57 — Filtrando automáticamente contenido restringido
/** DELETE /api/parametros/palabras-restringidas/:id */
exports.eliminarPalabra = async (req, res) => {
  try {
    const [resultado] = await C_Capa_de_Acceso_a_Datos.query(
      `DELETE FROM Palabra_Restringida WHERE palabra_restringida_id = ?`,
      [req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'TERMINO_NO_ENCONTRADO' });
    }
    C_Filtro_Contenido.refrescar();
    return res.status(200).json({ mensaje: 'Término eliminado del diccionario.' });
  } catch (error) {
    console.error('[eliminarPalabra CU57]', error);
    return res.status(500).json({ error: 'No se pudo eliminar el término.' });
  }
};
