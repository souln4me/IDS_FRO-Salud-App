/**
 * Componente: C_API_REST
 * Casos de uso: CU16.
 *
 * Bloqueos de agenda: el profesional inhabilita rangos de fechas.
 */
const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');

// Apoyo común: fecha DD/MM/AAAA a formato MySQL
// Convierte DD/MM/AAAA a formato MySQL YYYY-MM-DD.
// La fecha de inicio parte a las 00:00:00 y la de término cierra a las
// 23:59:59: así el ÚLTIMO día del bloqueo también queda inhabilitado
// completo (antes "del 5 al 10" dejaba el día 10 disponible).
const convertirFecha = (fechaStr, esFechaFin = false) => {
    const [d, m, y] = fechaStr.split('/');
    const hora = esFechaFin ? '23:59:59' : '00:00:00';
    return `${y}-${m}-${d} ${hora}`;
};

/**
 * CU16 — Bloqueos vigentes del profesional autenticado.
 * Sin esto, al confirmar un bloqueo no quedaba forma de ver lo ya inhabilitado.
 */
exports.listarBloqueos = async (req, res) => {
    try {
        const [bloqueos] = await C_Capa_de_Acceso_a_Datos.query(
            `SELECT b.bloqueo_id, b.fecha_inicio, b.fecha_fin, b.motivo
               FROM Bloqueo_Agenda b
               JOIN Profesional p ON p.profesional_id = b.profesional_id
              WHERE p.usuario_id = ?
              ORDER BY b.fecha_inicio DESC`,
            [req.user.usuario_id]
        );
        return res.status(200).json({ bloqueos });
    } catch (error) {
        console.error('[listarBloqueos CU16]', error);
        return res.status(500).json({ mensaje: 'No se pudieron recuperar los bloqueos de agenda.' });
    }
};

// CU16 — Restringiendo disponibilidad administrativa
exports.restringirDisponibilidad = async (req, res) => {
    const { profesional_id, fecha_inicio, fecha_fin, motivo } = req.body;
    const esAdministrador = req.user?.nombre_rol === 'Administrador';
    const PATRON = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!PATRON.test(String(fecha_inicio || '')) || !PATRON.test(String(fecha_fin || ''))) {
        return res.status(400).json({ mensaje: 'Indica las fechas en formato DD/MM/AAAA.' });
    }
    // El administrador indica a qué profesional bloquea; el profesional solo
    // puede bloquear su propia agenda, diga lo que diga la petición.
    if (esAdministrador && !(Number(profesional_id) > 0)) {
        return res.status(400).json({ mensaje: 'Indica el número de profesional a bloquear.' });
    }
    const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

    try {
        await connection.beginTransaction();

        // 1. El profesional cuya agenda se bloquea
        const [profesionales] = esAdministrador
            ? await connection.execute(
                'SELECT profesional_id FROM Profesional WHERE profesional_id = ? LIMIT 1',
                [Number(profesional_id)]
              )
            : await connection.execute(
                'SELECT profesional_id FROM Profesional WHERE usuario_id = ? LIMIT 1',
                [req.user.usuario_id]
              );

        if (profesionales.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                mensaje: esAdministrador
                    ? 'No existe un profesional con ese número.'
                    : 'Esta cuenta no tiene un perfil de profesional asociado.',
            });
        }

        const idRealProfesional = profesionales[0].profesional_id;
        const inicioSQL = convertirFecha(fecha_inicio);
        const finSQL = convertirFecha(fecha_fin, true);

        // 2. VALIDACIÓN 1: Verificar superposición con CITAS
        const [citas] = await connection.execute(
            `SELECT cita_id FROM Cita 
             WHERE profesional_id = ? 
             AND fecha_hora_inicio >= ? 
             AND fecha_hora_inicio <= ? 
             AND estado = 'AGENDADA'`,
            [idRealProfesional, inicioSQL, finSQL]
        );

        if (citas.length > 0) {
            await connection.rollback();
            return res.status(409).json({ mensaje: 'Existen citas agendadas en este rango. Reprográmelas primero.' });
        }

        // 3. VALIDACIÓN 2 (LA SOLUCIÓN): Verificar superposición con OTROS BLOQUEOS
        const [bloqueosExistentes] = await connection.execute(
            `SELECT bloqueo_id FROM Bloqueo_Agenda 
             WHERE profesional_id = ? 
             AND fecha_inicio <= ? 
             AND fecha_fin >= ?`,
            [idRealProfesional, finSQL, inicioSQL]
        );

        if (bloqueosExistentes.length > 0) {
            await connection.rollback();
            return res.status(409).json({ mensaje: 'Ya existe un bloqueo de agenda registrado que coincide con este rango de fechas.' });
        }

        // 4. INSERCIÓN FINAL
        await connection.execute(
            'INSERT INTO Bloqueo_Agenda (profesional_id, fecha_inicio, fecha_fin, motivo) VALUES (?, ?, ?, ?)',
            [idRealProfesional, inicioSQL, finSQL, motivo]
        );

        await connection.commit();
        res.status(200).json({ mensaje: 'Rango inhabilitado correctamente.' });

    } catch (error) {
        await connection.rollback();
        console.error("🚨 ERROR SQL RECHAZADO:", error);
        res.status(500).json({ mensaje: 'Error al persistir datos en la base de datos.' });
    } finally {
        connection.release();
    }
};