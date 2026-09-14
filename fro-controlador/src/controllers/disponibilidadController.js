const pool = require('../config/database');

// Convierte DD/MM/AAAA a formato MySQL YYYY-MM-DD.
// La fecha de inicio parte a las 00:00:00 y la de término cierra a las
// 23:59:59: así el ÚLTIMO día del bloqueo también queda inhabilitado
// completo (antes "del 5 al 10" dejaba el día 10 disponible).
const convertirFecha = (fechaStr, esFechaFin = false) => {
    const [d, m, y] = fechaStr.split('/');
    const hora = esFechaFin ? '23:59:59' : '00:00:00';
    return `${y}-${m}-${d} ${hora}`;
};

exports.restringirDisponibilidad = async (req, res) => {
    const { profesional_id, fecha_inicio, fecha_fin, motivo } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Buscamos el profesional_id real
        const [profesionales] = await connection.execute(
            'SELECT profesional_id FROM Profesional WHERE usuario_id = ? OR profesional_id = ? LIMIT 1',
            [profesional_id, profesional_id]
        );

        if (profesionales.length === 0) {
            await connection.rollback();
            return res.status(404).json({ mensaje: 'Error: Esta cuenta no tiene un perfil de profesional asociado en la base de datos.' });
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