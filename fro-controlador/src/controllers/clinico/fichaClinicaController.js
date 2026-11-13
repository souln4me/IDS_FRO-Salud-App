/**
 * Componente: C_API_REST
 * Casos de uso: CU29, CU28.
 *
 * Anamnesis de la ficha clínica (leer y guardar) y descarga de la ficha en PDF
 * por el propio paciente.
 */
const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Generador_Informes = require('../../componentes/C_Generador_Informes');

// Límites de campos según RF28/RF29 (Excepción 1)
const LIMITES = {
  anamnesis: 2000,
  alergia: 100,
  antecedente: 255
};

// CU29, CU28 — cargar la anamnesis de la ficha clínica del paciente
// GET /api/clinica/ficha/:paciente_id
exports.obtenerFicha = async (req, res) => {
  const { paciente_id } = req.params;

  try {
    const [fichas] = await C_Capa_de_Acceso_a_Datos.query(
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

    const [alergias] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT alergia FROM Ficha_Alergia WHERE ficha_clinica_id = ?`,
      [ficha.ficha_clinica_id]
    );
    const [quirurgicos] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT antecedente FROM Ficha_Antecedente_Quirurgico WHERE ficha_clinica_id = ?`,
      [ficha.ficha_clinica_id]
    );
    const [patologicos] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU29 — Registrando antecedentes en evaluación inicial
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

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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
    const [actualizada] = await C_Capa_de_Acceso_a_Datos.query(
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
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clinica/mi-ficha/pdf  (Paciente)
// El paciente descarga su ficha clínica completa en PDF. Se genera al momento
// y viaja directo en la respuesta: no pasa por Cloudinary, que en cuentas
// nuevas bloquea la entrega de PDF.
// ─────────────────────────────────────────────────────────────────────────────
// CU28 — Consolidando historial en ficha clínica electrónica (copia en PDF del paciente)
exports.miFichaPdf = async (req, res) => {
  try {
    const [[paciente]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (!paciente) {
      return res.status(404).json({ error: 'PACIENTE_NO_ENCONTRADO', mensaje: 'No encontramos tu registro de paciente.' });
    }
    const datos = await C_Generador_Informes.datosFicha(paciente.paciente_id);
    const pdf = await C_Generador_Informes.generarPdfFicha(datos);

    C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('DESCARGA_FICHA_PACIENTE', 'Ficha_Clinica', ?, ?, ?)`,
      [req.ip || null, JSON.stringify({ paciente_id: paciente.paciente_id, bytes: pdf.length }), req.user.usuario_id]
    ).catch(() => {});

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ficha-clinica-${fecha}.pdf"`);
    return res.status(200).send(pdf);
  } catch (error) {
    console.error('[miFichaPdf]', error);
    return res.status(500).json({ error: 'FICHA_NO_GENERADA', mensaje: 'No se pudo generar tu ficha clínica. Intenta nuevamente en unos minutos.' });
  }
};
