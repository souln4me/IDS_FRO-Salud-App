const pool = require('../../config/database');

// Límites de campos según RF28/RF29 (Excepción 1)
const LIMITES = {
  anamnesis: 2000,
  alergia: 100,
  antecedente: 255
};

// GET /api/clinica/ficha/:paciente_id
exports.obtenerFicha = async (req, res) => {
  const { paciente_id } = req.params;

  try {
    const [fichas] = await pool.query(
      `SELECT * FROM Ficha_Clinica WHERE paciente_id = ?`,
      [paciente_id]
    );

    if (fichas.length === 0) {
      // Aún no existe ficha: se devuelve estructura vacía para que el
      // Profesional comience a llenarla (no es un error, es estado inicial)
      return res.status(200).json({
        existe: false,
        ficha_clinica_id: null,
        anamnesis: '',
        plantilla_especialidad: '',
        alergias: [],
        antecedentes_quirurgicos: [],
        antecedentes_patologicos: [],
        version: 0
      });
    }

    const ficha = fichas[0];

    const [alergias] = await pool.query(
      `SELECT alergia FROM Ficha_Alergia WHERE ficha_clinica_id = ?`,
      [ficha.ficha_clinica_id]
    );
    const [quirurgicos] = await pool.query(
      `SELECT antecedente FROM Ficha_Antecedente_Quirurgico WHERE ficha_clinica_id = ?`,
      [ficha.ficha_clinica_id]
    );
    const [patologicos] = await pool.query(
      `SELECT antecedente FROM Ficha_Antecedente_Patologico WHERE ficha_clinica_id = ?`,
      [ficha.ficha_clinica_id]
    );

    return res.status(200).json({
      existe: true,
      ficha_clinica_id: ficha.ficha_clinica_id,
      anamnesis: ficha.anamnesis,
      plantilla_especialidad: ficha.plantilla_especialidad,
      alergias: alergias.map(a => a.alergia),
      antecedentes_quirurgicos: quirurgicos.map(a => a.antecedente),
      antecedentes_patologicos: patologicos.map(a => a.antecedente),
      // Usamos ultima_actualizacion como "version" para detección de colisión (Excepción 3)
      version: new Date(ficha.ultima_actualizacion).getTime()
    });

  } catch (error) {
    console.error('[obtenerFicha]', error);
    return res.status(500).json({ error: 'Error interno al obtener la ficha clínica.' });
  }
};

// POST /api/clinica/ficha
// Crea o actualiza la Anamnesis (CU29)
exports.guardarAnamnesis = async (req, res) => {
  const {
    paciente_id,
    anamnesis,
    plantilla_especialidad,
    alergias = [],
    antecedentes_quirurgicos = [],
    antecedentes_patologicos = [],
    version // timestamp recibido por el cliente (control de concurrencia)
  } = req.body;

  // ─ Excepción 2: validar obligatoriedad e integridad sintáctica 
  const camposFaltantes = [];
  if (!paciente_id) camposFaltantes.push('paciente_id');
  if (!anamnesis || !anamnesis.trim()) camposFaltantes.push('anamnesis');
  if (!plantilla_especialidad || !plantilla_especialidad.trim()) camposFaltantes.push('plantilla_especialidad');

  if (camposFaltantes.length > 0) {
    return res.status(400).json({
      error: 'CAMPOS_OBLIGATORIOS_FALTANTES',
      mensaje: 'Existen campos obligatorios sin completar.',
      campos: camposFaltantes
    });
  }

  // ─ Excepción 1: truncar campos que exceden el límite 
  let anamnesisFinal = anamnesis;
  let truncado = false;
  if (anamnesisFinal.length > LIMITES.anamnesis) {
    anamnesisFinal = anamnesisFinal.slice(0, LIMITES.anamnesis);
    truncado = true;
  }

  const alergiasFinal = alergias
    .filter(a => a && a.trim())
    .map(a => a.trim().slice(0, LIMITES.alergia));

  const quirurgicosFinal = antecedentes_quirurgicos
    .filter(a => a && a.trim())
    .map(a => a.trim().slice(0, LIMITES.antecedente));

  const patologicosFinal = antecedentes_patologicos
    .filter(a => a && a.trim())
    .map(a => a.trim().slice(0, LIMITES.antecedente));

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verificamos si ya existe ficha para este paciente
    const [existentes] = await connection.execute(
      `SELECT ficha_clinica_id, ultima_actualizacion FROM Ficha_Clinica WHERE paciente_id = ? FOR UPDATE`,
      [paciente_id]
    );

    let ficha_clinica_id;

    if (existentes.length > 0) {
      ficha_clinica_id = existentes[0].ficha_clinica_id;

      // ─ Excepción 3: colisión de escritura 
      const versionActual = new Date(existentes[0].ultima_actualizacion).getTime();
      if (version && versionActual > version) {
        await connection.rollback();
        return res.status(409).json({
          error: 'COLISION_ESCRITURA',
          mensaje: 'La ficha clínica fue modificada por otro usuario. Recarga la sesión clínica para continuar.'
        });
      }

      await connection.execute(
        `UPDATE Ficha_Clinica
            SET anamnesis = ?, plantilla_especialidad = ?
          WHERE ficha_clinica_id = ?`,
        [anamnesisFinal, plantilla_especialidad, ficha_clinica_id]
      );

      // Limpiamos antecedentes previos para reescribirlos
      await connection.execute(`DELETE FROM Ficha_Alergia WHERE ficha_clinica_id = ?`, [ficha_clinica_id]);
      await connection.execute(`DELETE FROM Ficha_Antecedente_Quirurgico WHERE ficha_clinica_id = ?`, [ficha_clinica_id]);
      await connection.execute(`DELETE FROM Ficha_Antecedente_Patologico WHERE ficha_clinica_id = ?`, [ficha_clinica_id]);

    } else {
      const [result] = await connection.execute(
        `INSERT INTO Ficha_Clinica (anamnesis, plantilla_especialidad, paciente_id)
         VALUES (?, ?, ?)`,
        [anamnesisFinal, plantilla_especialidad, paciente_id]
      );
      ficha_clinica_id = result.insertId;
    }

    // Insertar alergias y antecedentes
    for (const alergia of alergiasFinal) {
      await connection.execute(
        `INSERT INTO Ficha_Alergia (ficha_clinica_id, alergia) VALUES (?, ?)`,
        [ficha_clinica_id, alergia]
      );
    }
    for (const antecedente of quirurgicosFinal) {
      await connection.execute(
        `INSERT INTO Ficha_Antecedente_Quirurgico (ficha_clinica_id, antecedente) VALUES (?, ?)`,
        [ficha_clinica_id, antecedente]
      );
    }
    for (const antecedente of patologicosFinal) {
      await connection.execute(
        `INSERT INTO Ficha_Antecedente_Patologico (ficha_clinica_id, antecedente) VALUES (?, ?)`,
        [ficha_clinica_id, antecedente]
      );
    }

    await connection.commit();

    // Obtener nueva versión (timestamp actualizado)
    const [actualizada] = await pool.query(
      `SELECT ultima_actualizacion FROM Ficha_Clinica WHERE ficha_clinica_id = ?`,
      [ficha_clinica_id]
    );

    return res.status(200).json({
      mensaje: 'Anamnesis registrada correctamente.',
      ficha_clinica_id,
      truncado,
      limite_anamnesis: LIMITES.anamnesis,
      version: new Date(actualizada[0].ultima_actualizacion).getTime()
    });

  } catch (error) {
    await connection.rollback();
    console.error('[guardarAnamnesis]', error);
    return res.status(500).json({ error: 'Error interno al guardar la anamnesis.' });
  } finally {
    connection.release();
  }
};