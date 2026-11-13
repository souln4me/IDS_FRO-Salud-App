/**
 * Componente: C_API_REST
 * Casos de uso: CU78, CU28, CU37, CU65, CU55.
 *
 * Episodio clínico: leerlo, crearlo (nace abierto) y modificarlo o cerrarlo.
 */
const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Control_Acceso_Clinico = require('../../componentes/C_Control_Acceso_Clinico');
const C_Motor_Clinico = require('../../componentes/C_Motor_Clinico');
const C_Gestor_Alta_Clinica = require('../../componentes/C_Gestor_Alta_Clinica');
const { pedirEvaluacionTratamiento } = require('../evaluacionController');

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLADOR: Episodio Clínico
// ─────────────────────────────────────────────────────────────────────────────

// CU28, CU78 — consultar un episodio de la ficha clínica
// GET /api/clinica/episodio/:episodio_id
// Lectura de un episodio clínico
exports.obtenerEpisodio = async (req, res) => {
    const { episodio_id } = req.params;

    try {
        const [rows] = await C_Capa_de_Acceso_a_Datos.query(
            `SELECT ec.*, 
                    p.usuario_id AS paciente_usuario_id,
                    pr.usuario_id AS profesional_usuario_id
               FROM Episodio_Clinico ec
               JOIN Paciente p ON ec.paciente_id = p.paciente_id
               JOIN Profesional pr ON ec.profesional_id = pr.profesional_id
              WHERE ec.episodio_clinico_id = ?`,
            [episodio_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Episodio clínico no encontrado.' });
        }

        // return(operacion_clinica_exitosa) → return(HTTP 200 OK y confirmacion_accion)
        return res.status(200).json(rows[0]);

    } catch (error) {
        console.error('[obtenerEpisodio]', error);
        return res.status(500).json({ error: 'Error interno al obtener el episodio clínico.' });
    }
};

// CU78 — Agrupando registros bajo entidad episodio clínico
// POST /api/clinica/episodio
// Creación de un episodio clínico
exports.crearEpisodio = async (req, res) => {
    const { motivo_consulta, paciente_id } = req.body;

    if (!motivo_consulta || !paciente_id) {
        return res.status(400).json({ error: 'motivo_consulta y paciente_id son requeridos.' });
    }

    try {
        // El profesional sale de la sesión, no del formulario: pedirlo a mano
        // obligaba a que se supiera su propio identificador de memoria, y nada
        // impedía crear el episodio a nombre de otro. Se acepta el del cuerpo
        // solo si viene, por compatibilidad con clientes antiguos.
        let profesional_id = req.body?.profesional_id;
        if (!profesional_id) {
            const [profesionales] = await C_Capa_de_Acceso_a_Datos.query(
                'SELECT profesional_id FROM Profesional WHERE usuario_id = ? LIMIT 1',
                [req.user?.usuario_id]
            );
            if (profesionales.length === 0) {
                return res.status(403).json({
                    error: 'SOLO_PROFESIONALES',
                    mensaje: 'Tu cuenta no está acreditada como profesional.',
                });
            }
            profesional_id = profesionales[0].profesional_id;
        }

        // ejecutar_actualizacion(query_episodio)
        // D12: todo episodio nace ABIERTO; se cierra explícitamente (CU37/CU78).
        const [result] = await C_Capa_de_Acceso_a_Datos.query(
            `INSERT INTO Episodio_Clinico (motivo_consulta, estado, paciente_id, profesional_id)
             VALUES (?, ?, ?, ?)`,
            [motivo_consulta, C_Motor_Clinico.ESTADO_ABIERTO, paciente_id, profesional_id]
        );

        return res.status(201).json({
            mensaje: 'Episodio clínico creado exitosamente.',
            episodio_clinico_id: result.insertId
        });

    } catch (error) {
        console.error('[crearEpisodio]', error);
        return res.status(500).json({ error: 'Error interno al crear el episodio clínico.' });
    }
};

// CU78, CU37 — modificar o cerrar el episodio clínico
// PUT /api/clinica/episodio/:episodio_id
// Modificación de un episodio clínico
exports.actualizarEpisodio = async (req, res) => {
    const { episodio_id } = req.params;
    const { motivo_consulta, fecha_terminado } = req.body;
    // D12: los únicos estados válidos son ABIERTO y CERRADO.
    const estado = req.body?.estado ? String(req.body.estado).trim().toUpperCase() : null;
    if (estado && ![C_Motor_Clinico.ESTADO_ABIERTO, C_Motor_Clinico.ESTADO_CERRADO].includes(estado)) {
        return res.status(400).json({
            error: 'ESTADO_INVALIDO',
            mensaje: `El estado del episodio debe ser ${C_Motor_Clinico.ESTADO_ABIERTO} o ${C_Motor_Clinico.ESTADO_CERRADO}.`,
        });
    }

    try {
        // Solo el profesional dueño del episodio puede modificarlo.
        const [[dueno]] = await C_Capa_de_Acceso_a_Datos.query(
            `SELECT 1 AS ok FROM Episodio_Clinico ec
               JOIN Profesional p ON p.profesional_id = ec.profesional_id
              WHERE ec.episodio_clinico_id = ? AND p.usuario_id = ? LIMIT 1`,
            [episodio_id, req.user?.usuario_id]
        );
        if (!dueno && req.user?.nombre_rol !== 'Administrador') {
            return res.status(403).json({
                error: 'EPISODIO_AJENO',
                mensaje: 'Solo el profesional a cargo puede modificar este episodio.',
            });
        }

        // Cerrar fija la fecha de término si no viene explícita.
        const cierre = estado === C_Motor_Clinico.ESTADO_CERRADO;

        // CU37 (Exc. 2 y 4): tampoco el cierre sin informe deja evoluciones
        // sin firmar ni citas futuras colgando del episodio.
        if (cierre) {
            const resumen = await C_Gestor_Alta_Clinica.resumenCierre(C_Capa_de_Acceso_a_Datos, episodio_id);
            const impedimento = resumen && C_Gestor_Alta_Clinica.impedimentoDeCierre(resumen);
            if (impedimento) return res.status(409).json(impedimento);
        }
        // mysql2 rechaza los parámetros undefined: el cierre manda solo el
        // estado, así que el resto tiene que viajar como NULL explícito.
        const motivo = motivo_consulta ?? null;
        const terminado = fecha_terminado ?? null;
        const [result] = await C_Capa_de_Acceso_a_Datos.query(
            `UPDATE Episodio_Clinico
                SET motivo_consulta = COALESCE(?, motivo_consulta),
                    estado          = COALESCE(?, estado),
                    fecha_terminado = CASE
                        WHEN ? IS NOT NULL THEN ?
                        WHEN ? THEN NOW()
                        ELSE fecha_terminado END
              WHERE episodio_clinico_id = ?`,
            [motivo, estado, terminado, terminado, cierre, episodio_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Episodio clínico no encontrado.' });
        }

        // CU65: el puente de acceso de las derivaciones termina con el episodio.
        if (cierre) await C_Control_Acceso_Clinico.cerrarDerivacionesDelEpisodio(C_Capa_de_Acceso_a_Datos, episodio_id).catch((e) =>
            console.error('[actualizarEpisodio] derivaciones sin cerrar:', e.message));
        // CU55 (correcciones Inc 4): al terminar el tratamiento se pide la calificación general.
        if (cierre) pedirEvaluacionTratamiento(C_Capa_de_Acceso_a_Datos, episodio_id);

        // return(filas_afectadas) → return(confirmacion_update)
        // → return(operacion_clinica_exitosa) → return(HTTP 200 OK y confirmacion_accion)
        return res.status(200).json({
            mensaje: cierre
                ? 'Episodio clínico cerrado. No admitirá nuevos registros.'
                : 'Episodio clínico actualizado exitosamente.',
            estado: estado || undefined,
        });

    } catch (error) {
        console.error('[actualizarEpisodio]', error);
        return res.status(500).json({ error: 'Error interno al actualizar el episodio clínico.' });
    }
};