const pool = require('../config/database');

exports.obtenerEspecialidades = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT especialidad_id, nombre
      FROM especialidad
      ORDER BY nombre
    `);

    return res.status(200).json({
      mensaje: 'Especialidades obtenidas correctamente.',
      data: rows
    });
  } catch (error) {
    console.error('Error al obtener especialidades:', error);
    return res.status(500).json({ error: 'Error al obtener especialidades.' });
  }
};

exports.obtenerDisponibilidad = async (req, res) => {
  const { especialidad_id, tipo_sede, fecha } = req.query;

  if (!especialidad_id || !tipo_sede || !fecha) {
    return res.status(400).json({
      error: 'Debe ingresar especialidad_id, tipo_sede y fecha.'
    });
  }

  try {
    const fechaObj = new Date(`${fecha}T00:00:00`);

    let diaSemana = fechaObj.getDay();

    // JS: domingo = 0, lunes = 1
    // BD: lunes = 1, domingo = 7
    diaSemana = diaSemana === 0 ? 7 : diaSemana;

    let sql = `
      SELECT
        p.profesional_id,
        u.nombres,
        u.apellido_paterno,
        u.apellido_materno,
        e.nombre AS especialidad,
        p.tipo_sede,
        pd.dia_semana,
        pd.hora_inicio,
        pd.hora_fin
      FROM profesional p
      INNER JOIN usuario u
        ON p.usuario_id = u.usuario_id
      INNER JOIN especialidad e
        ON p.especialidad_id = e.especialidad_id
      INNER JOIN profesional_disponibilidad pd
        ON p.profesional_id = pd.profesional_id
      WHERE p.especialidad_id = ?
        AND pd.dia_semana = ?
    `;

    const params = [especialidad_id, diaSemana];

    if (tipo_sede !== 'AMBOS') {
      sql += `
        AND (
          p.tipo_sede = ?
          OR p.tipo_sede = 'AMBOS'
        )
      `;

      params.push(tipo_sede);
    }

    const [rangos] = await pool.execute(sql, params);

    const bloquesDisponibles = [];

    for (const rango of rangos) {
      const horaInicio = parseInt(rango.hora_inicio.split(':')[0], 10);
      const horaFin = parseInt(rango.hora_fin.split(':')[0], 10);

      for (let hora = horaInicio; hora < horaFin; hora++) {
        const inicioBloque = `${fecha} ${String(hora).padStart(2, '0')}:00:00`;
        const finBloque = `${fecha} ${String(hora + 1).padStart(2, '0')}:00:00`;

        const [ocupadas] = await pool.execute(
          `
          SELECT COUNT(*) AS total
          FROM cita
          WHERE profesional_id = ?
            AND fecha_hora_inicio = ?
            AND estado IN ('AGENDADA', 'CONFIRMADA', 'EN_CURSO')
          `,
          [rango.profesional_id, inicioBloque]
        );

        if (ocupadas[0].total === 0) {
          bloquesDisponibles.push({
            profesional_id: rango.profesional_id,
            nombres: rango.nombres,
            apellido_paterno: rango.apellido_paterno,
            apellido_materno: rango.apellido_materno,
            especialidad: rango.especialidad,
            tipo_sede: rango.tipo_sede,
            fecha,
            hora_inicio: `${String(hora).padStart(2, '0')}:00:00`,
            hora_fin: `${String(hora + 1).padStart(2, '0')}:00:00`
          });
        }
      }
    }

    return res.status(200).json({
      mensaje: 'Bloques disponibles obtenidos correctamente.',
      data: bloquesDisponibles
    });

  } catch (error) {
    console.error('Error al obtener bloques disponibles:', error);

    return res.status(500).json({
      error: 'Error interno al obtener bloques disponibles.'
    });
  }
};

exports.validarBloque = async (req, res) => {
  const { profesional_id, fecha_hora_inicio, paciente_id } = req.body;

  if (!profesional_id || !fecha_hora_inicio || !paciente_id) {
    return res.status(401).json({
      error: 'Sesión expirada. Debe iniciar sesión nuevamente.'
    });
  }

  try {

    const [pacienteRows] = await pool.execute(
      'SELECT paciente_id FROM paciente WHERE paciente_id = ?',
      [paciente_id]
    );

    if (pacienteRows.length === 0) {
      return res.status(401).json({
        error: 'Sesión expirada. Debe iniciar sesión nuevamente.'
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM cita
      WHERE profesional_id = ?
        AND fecha_hora_inicio = ?
        AND estado IN ('AGENDADA', 'CONFIRMADA', 'EN_CURSO')
      `,
      [profesional_id, fecha_hora_inicio]
    );

    const disponible = rows[0].total === 0;

    return res.status(200).json({
      disponible,
      mensaje: disponible
        ? 'Bloque disponible para selección.'
        : 'El bloque ya no se encuentra disponible.'
    });

  } catch (error) {
    console.error('Error al validar bloque:', error);
    return res.status(500).json({ error: 'Error interno al validar bloque.' });
  }
};