/**
 * Componente: C_API_REST
 * Casos de uso: CU46, CU47, CU48, CU49, CU44, CU54, CU78, CU33, CU35.
 *
 * Pautas de ejercicio (Incremento 2, bloque 3).
 * CU46: biblioteca centralizada de material terapéutico.
 * CU47: prescripción de pautas con parámetros de carga.
 * CU48: cumplimiento diario del paciente (con control anti-rebote).
 * CU49: vigencia y ciclo de vida de las pautas.
 *
 * Correcciones Inc 4 (punto 8): cada ejercicio puede tener días específicos
 * de la semana (p. ej. lunes, miércoles y viernes) y su propio material de
 * apoyo subido por el profesional (documentos, imágenes o videos).
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Motor_Clinico = require('../../componentes/C_Motor_Clinico');
const C_Motor_Refuerzos = require('../../componentes/C_Motor_Refuerzos');
const C_API_Adapter = require('../../componentes/C_API_Adapter');

const FRECUENCIAS_VALIDAS = ['DIARIA', 'SEMANAL', 'DIAS_ESPECIFICOS'];
const NOMBRES_DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

// Apoyo común: manejo de días de la semana y fechas de las pautas (CU47, CU48, CU49)
/** Días válidos (1 = lunes … 7 = domingo), sin repetir y ordenados. */
function normalizarDias(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor || '').split(',');
  return [...new Set(lista.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b);
}

/** Día de la semana de hoy en la hora del servidor, 1 = lunes … 7 = domingo. */
function diaSemanaHoy() {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

function textoDias(dias) {
  const nombres = dias.map((n) => NOMBRES_DIAS[n]);
  return nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

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
        await C_Capa_de_Acceso_a_Datos.query(
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

/** CU47, CU48 — Ejercicios de un conjunto de pautas, con su material y marca de hoy. */
async function ejerciciosDePautas(pautaIds) {
  if (pautaIds.length === 0) return new Map();

  const [filas] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT pe.pauta_ejercicio_id, pe.pauta_tratamiento_id, pe.nombre_ejercicio,
            pe.series, pe.repeticiones, pe.frecuencia, pe.dias_semana,
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

  // Material de apoyo subido al ejercicio (punto 8).
  const ids = filas.map((f) => f.pauta_ejercicio_id);
  const materialPorEjercicio = new Map();
  if (ids.length > 0) {
    const [adjuntos] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT pauta_ejercicio_material_id, pauta_ejercicio_id, nombre_original, formato, url_publica, tamano_bytes
         FROM Pauta_Ejercicio_Material WHERE pauta_ejercicio_id IN (?) ORDER BY pauta_ejercicio_material_id`,
      [ids]
    );
    for (const a of adjuntos) {
      const lista = materialPorEjercicio.get(a.pauta_ejercicio_id) || [];
      lista.push({
        pauta_ejercicio_material_id: a.pauta_ejercicio_material_id,
        nombre: a.nombre_original,
        formato: a.formato,
        // Miniatura solo para imágenes; el resto se abre en el visor.
        url: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(a.formato) ? a.url_publica : null,
        tamano_bytes: a.tamano_bytes,
      });
      materialPorEjercicio.set(a.pauta_ejercicio_id, lista);
    }
  }

  const hoy = diaSemanaHoy();
  const porPauta = new Map();
  for (const fila of filas) {
    const dias = normalizarDias(fila.dias_semana);
    const lista = porPauta.get(fila.pauta_tratamiento_id) || [];
    lista.push({
      ...fila,
      dias_semana: dias,
      dias_texto: dias.length ? textoDias(dias) : null,
      // Sin días específicos, todos los días corresponden.
      corresponde_hoy: dias.length === 0 || dias.includes(hoy),
      cumplido_hoy: Boolean(fila.cumplido_hoy),
      material_apoyo: materialPorEjercicio.get(fila.pauta_ejercicio_id) || [],
    });
    porPauta.set(fila.pauta_tratamiento_id, lista);
  }
  return porPauta;
}

/** CU47, CU49 — Arma la respuesta de una lista de pautas con vigencia y ejercicios. */
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
          ? { ...ejercicio, material_nombre: null, material_categoria: null, material_tipo: null, material_apoyo: [] }
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

// La biblioteca de las pautas muestra solo material de tratamiento: los
// recursos de prevención los habilita solo el CU51 al acercarse el alta, y el
// profesional suma sus propios archivos a cada ejercicio (CU47).
// CU46 — Seleccionando material en biblioteca centralizada
exports.buscarMateriales = async (req, res) => {
  const buscar = String(req.query?.buscar || '').trim();

  try {
    let filas;
    try {
      const patron = `%${buscar}%`;
      [filas] = await C_Capa_de_Acceso_a_Datos.query(
        `SELECT material_terapeutico_id, nombre, tipo, categoria, formato, disponibilidad
           FROM Material_Terapeutico
          WHERE disponibilidad = TRUE AND proposito <> 'PREVENCION'
            AND (? = '' OR nombre LIKE ? OR categoria LIKE ? OR tipo LIKE ?)
          ORDER BY categoria, nombre`,
        [buscar, patron, patron, patron]
      );
    } catch (errorBusqueda) {
      // CU46 — Excepción 2: si el motor de búsqueda falla, se entrega el
      // catálogo completo sin filtrar para permitir búsqueda visual.
      console.error('[buscarMateriales] Falla del filtro, catálogo completo:', errorBusqueda.message);
      [filas] = await C_Capa_de_Acceso_a_Datos.query(
        `SELECT material_terapeutico_id, nombre, tipo, categoria, formato, disponibilidad
           FROM Material_Terapeutico WHERE disponibilidad = TRUE AND proposito <> 'PREVENCION' ORDER BY categoria, nombre`
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

// CU47 — Prescribiendo pautas de ejercicio técnico
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
    // Punto 8: días específicos de la semana. Si vienen, mandan sobre la frecuencia.
    ejercicio.dias = normalizarDias(ejercicio?.dias_semana);
    if (ejercicio.dias.length > 0) {
      ejercicio.frecuencia = ejercicio.dias.length === 7 ? 'DIARIA' : 'DIAS_ESPECIFICOS';
      if (ejercicio.dias.length === 7) ejercicio.dias = [];
    } else if (ejercicio?.frecuencia === 'DIAS_ESPECIFICOS') {
      return res.status(400).json({ error: `Marca al menos un día de la semana para "${nombreEj}".` });
    }
    // CU47 — Excepción 2: sin frecuencia válida se asume DIARIA.
    if (!FRECUENCIAS_VALIDAS.includes(ejercicio?.frecuencia)) {
      ejercicio.frecuencia = 'DIARIA';
    }
  }

  const connection = await C_Capa_de_Acceso_a_Datos.getConnection();

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
    if (C_Motor_Clinico.estaCerrado(episodios[0].estado)) {
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
           FROM Material_Terapeutico
          WHERE material_terapeutico_id IN (?) AND proposito <> 'PREVENCION'`,
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

    // La app sube después el material de apoyo de cada ejercicio: necesita su id.
    const ejerciciosCreados = [];
    for (const ejercicio of ejercicios) {
      const [creado] = await connection.execute(
        `INSERT INTO Pauta_Ejercicio
            (pauta_tratamiento_id, nombre_ejercicio, series, repeticiones, frecuencia, dias_semana, material_terapeutico_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pautaId,
          String(ejercicio.nombre_ejercicio).trim(),
          Number(ejercicio.series),
          Number(ejercicio.repeticiones),
          ejercicio.frecuencia,
          ejercicio.dias.length ? ejercicio.dias.join(',') : null,
          ejercicio.material_terapeutico_id ? Number(ejercicio.material_terapeutico_id) : null,
        ]
      );
      ejerciciosCreados.push({ pauta_ejercicio_id: creado.insertId, nombre_ejercicio: String(ejercicio.nombre_ejercicio).trim() });
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
      ejercicios: ejerciciosCreados,
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

// CU47, CU49 — pautas del paciente con su vigencia, vista del profesional
exports.pautasDePaciente = async (req, res) => {
  const { paciente_id } = req.params;

  try {
    const [episodios] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT ec.episodio_clinico_id, ec.motivo_consulta, ec.estado
         FROM Episodio_Clinico ec
         JOIN Profesional p ON p.profesional_id = ec.profesional_id
        WHERE ec.paciente_id = ? AND p.usuario_id = ?
        ORDER BY ec.episodio_clinico_id DESC`,
      [paciente_id, req.user.usuario_id]
    );

    const [pautas] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU48, CU49 — pautas vigentes del paciente con la marca de hoy
exports.misPautas = async (req, res) => {
  try {
    const [pautas] = await C_Capa_de_Acceso_a_Datos.query(
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

/** CU48 — Verifica que el ejercicio pertenezca al paciente y su pauta esté vigente. */
async function ejercicioDelPaciente(pautaEjercicioId, usuarioId) {
  const [filas] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT pe.pauta_ejercicio_id, pe.dias_semana, pt.pauta_tratamiento_id, pt.estado,
            pt.fecha_inicio, pt.fecha_expiracion,
            -- CU44: hace falta para recalcular el índice de adherencia.
            ec.paciente_id
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

// CU48 — Registrando cumplimiento diario de tareas
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

    // Punto 8: un ejercicio con días específicos solo se marca esos días.
    const dias = normalizarDias(ejercicio.dias_semana);
    if (dias.length > 0 && !dias.includes(diaSemanaHoy())) {
      return res.status(409).json({
        error: 'NO_CORRESPONDE_HOY',
        mensaje: `Este ejercicio corresponde los ${textoDias(dias)}. Hoy no tienes que hacerlo.`,
      });
    }

    // CU48 — Excepción 4: la clave única (ejercicio, día) hace de control
    // anti-rebote; marcas repetidas quedan como un único registro.
    const [resultado] = await C_Capa_de_Acceso_a_Datos.query(
      `INSERT IGNORE INTO Pauta_Cumplimiento (pauta_ejercicio_id, fecha) VALUES (?, CURDATE())`,
      [id]
    );

    // CU44: marcar una tarea mueve el índice de adherencia. Se recalcula acá
    // mismo para que el panel de progreso muestre el dato al instante.
    const anterior = await C_Motor_Clinico.ultimoIndicador(C_Capa_de_Acceso_a_Datos, ejercicio.paciente_id);
    const adherencia = await C_Motor_Clinico.actualizarIndicador(C_Capa_de_Acceso_a_Datos, ejercicio.paciente_id);

    // CU54: si el índice subió, un mensaje de ánimo (máximo uno al día). Una
    // marca repetida (Exc. 1) no cuenta: affectedRows es 0.
    let refuerzo = null;
    if (resultado.affectedRows > 0) {
      refuerzo = await C_Motor_Refuerzos.evaluarRefuerzo(C_Capa_de_Acceso_a_Datos, {
        pacienteId: ejercicio.paciente_id, usuarioId: req.user.usuario_id,
        anterior: anterior?.porcentaje ?? null, actual: adherencia?.porcentaje ?? null,
      });
    }

    return res.status(200).json({
      mensaje: resultado.affectedRows > 0 ? '¡Ejercicio registrado!' : 'Ya estaba registrado hoy.',
      cumplido_hoy: true,
      adherencia: adherencia?.porcentaje ?? null,
      refuerzo: refuerzo?.enviado ? refuerzo.mensaje : null,
    });
  } catch (error) {
    console.error('[marcarCumplimiento]', error);
    return res.status(500).json({ error: 'No se pudo registrar el cumplimiento.' });
  }
};

// CU48 — Registrando cumplimiento diario de tareas (retirar la marca de hoy)
exports.desmarcarCumplimiento = async (req, res) => {
  const { id } = req.params;

  try {
    const ejercicio = await ejercicioDelPaciente(id, req.user.usuario_id);
    if (!ejercicio) {
      return res.status(404).json({ error: 'El ejercicio no existe o no pertenece a tus pautas.' });
    }

    await C_Capa_de_Acceso_a_Datos.query(
      `DELETE FROM Pauta_Cumplimiento WHERE pauta_ejercicio_id = ? AND fecha = CURDATE()`,
      [id]
    );

    // CU44: recalcula el índice de adherencia.
    const adherencia = await C_Motor_Clinico.actualizarIndicador(C_Capa_de_Acceso_a_Datos, ejercicio.paciente_id);

    return res.status(200).json({
      mensaje: 'Marca de hoy retirada.',
      cumplido_hoy: false,
      adherencia: adherencia?.porcentaje ?? null,
    });
  } catch (error) {
    console.error('[desmarcarCumplimiento]', error);
    return res.status(500).json({ error: 'No se pudo retirar la marca.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Punto 8 — Material de apoyo propio de cada ejercicio
//  POST   /clinica/pautas/ejercicios/:id/material   (multipart: archivo)
//  GET    /clinica/pautas/material/:id/ver
//  DELETE /clinica/pautas/material/:id
//  Mismos formatos y tope que el repositorio de la ficha (CU33). La biblioteca
//  centralizada (CU46) sigue disponible para recursos compartidos.
// ─────────────────────────────────────────────────────────────────────────────


/** CU47 — Ejercicio con su pauta y episodio, y si quien pregunta es su profesional o su paciente. */
async function ejercicioConPermisos(pautaEjercicioId, usuarioId) {
  const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT pe.pauta_ejercicio_id, pt.pauta_tratamiento_id, pt.estado, pt.fecha_inicio, pt.fecha_expiracion,
            ec.estado AS estado_episodio, ec.paciente_id,
            (pr.usuario_id = ?) AS es_profesional, (pa.usuario_id = ?) AS es_paciente
       FROM Pauta_Ejercicio pe
       JOIN Pauta_Tratamiento pt ON pt.pauta_tratamiento_id = pe.pauta_tratamiento_id
       JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = pt.episodio_clinico_id
       JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
       JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
      WHERE pe.pauta_ejercicio_id = ? LIMIT 1`,
    [usuarioId, usuarioId, pautaEjercicioId]
  );
  return fila || null;
}

// CU47, CU33 — subir material de apoyo propio a un ejercicio de la pauta
exports.subirMaterialApoyo = async (req, res) => {
  const { EXTENSIONES_PERMITIDAS } = require('./documentoController');
  try {
    const ejercicio = await ejercicioConPermisos(req.params.id, req.user.usuario_id);
    if (!ejercicio || !Number(ejercicio.es_profesional)) {
      return res.status(404).json({ error: 'EJERCICIO_NO_ENCONTRADO', mensaje: 'El ejercicio no existe o su pauta no es tuya.' });
    }
    if (C_Motor_Clinico.estaCerrado(ejercicio.estado_episodio) || (await estadoVigencia(ejercicio)) === 'EXPIRADA') {
      return res.status(409).json({ error: 'PAUTA_CERRADA', mensaje: 'La pauta ya terminó o su episodio está cerrado: no admite material nuevo.' });
    }
    if (!C_API_Adapter.cloudinaryConfigurado()) {
      return res.status(503).json({ error: 'REPOSITORIO_NO_DISPONIBLE', mensaje: 'El almacenamiento de archivos no está configurado en el servidor.' });
    }
    if (!req.file) return res.status(400).json({ error: 'ARCHIVO_FALTANTE', mensaje: 'No se recibió ningún archivo.' });

    const nombreOriginal = req.file.originalname || 'archivo';
    const formato = (nombreOriginal.split('.').pop() || '').toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(formato)) {
      return res.status(400).json({
        error: 'FORMATO_NO_PERMITIDO',
        mensaje: `El formato .${formato || '?'} no está permitido. Formatos aceptados: ${EXTENSIONES_PERMITIDAS.join(', ')}.`,
      });
    }
    const maxMB = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'MAX_TAMANO_ARCHIVO_MB', 10);
    if (req.file.size > maxMB * 1024 * 1024) {
      return res.status(413).json({ error: 'ARCHIVO_MUY_GRANDE', mensaje: `El archivo pesa ${(req.file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${maxMB} MB.` });
    }

    let subida;
    try {
      subida = await C_API_Adapter.subirBuffer(req.file.buffer, {
        folder: `fro-salud/pautas/ejercicio-${ejercicio.pauta_ejercicio_id}`,
        use_filename: true,
        filename_override: nombreOriginal,
        ...(formato === 'docx' ? { resource_type: 'raw' } : {}),
      });
    } catch (errorNube) {
      console.error('[subirMaterialApoyo] fallo Cloudinary:', errorNube.message);
      return res.status(502).json({ error: 'CARGA_INTERRUMPIDA', mensaje: 'Se perdió la conexión con el repositorio. Vuelve a adjuntar el archivo.' });
    }

    const [creado] = await C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Pauta_Ejercicio_Material
         (pauta_ejercicio_id, nombre_original, formato, tipo_recurso, url_publica, public_id_cloud, tamano_bytes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [ejercicio.pauta_ejercicio_id, nombreOriginal, formato, subida.resource_type, subida.secure_url, subida.public_id, req.file.size, req.user.usuario_id]
    );
    C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
       VALUES ('CARGA_MATERIAL_EJERCICIO', 'Pauta_Ejercicio_Material', ?, ?)`,
      [JSON.stringify({ pauta_ejercicio_id: ejercicio.pauta_ejercicio_id, archivo: nombreOriginal }), req.user.usuario_id]
    ).catch(() => {});

    return res.status(201).json({ pauta_ejercicio_material_id: creado.insertId, mensaje: `"${nombreOriginal}" quedó como material de apoyo del ejercicio.` });
  } catch (error) {
    console.error('[subirMaterialApoyo]', error);
    return res.status(500).json({ error: 'No se pudo guardar el material de apoyo.' });
  }
};

// CU47: material de apoyo, solo para el profesional o el paciente de la pauta
async function materialConPermisos(materialId, usuarioId) {
  const [[material]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT * FROM Pauta_Ejercicio_Material WHERE pauta_ejercicio_material_id = ? LIMIT 1`,
    [materialId]
  );
  if (!material) return null;
  const ejercicio = await ejercicioConPermisos(material.pauta_ejercicio_id, usuarioId);
  if (!ejercicio || (!Number(ejercicio.es_profesional) && !Number(ejercicio.es_paciente))) return null;
  return { material, ejercicio };
}

// CU47, CU35, CU49 — ver el material de apoyo en el visor embebido
exports.verMaterialApoyo = async (req, res) => {
  const { prepararVisor } = require('./documentoController');
  try {
    const encontrado = await materialConPermisos(req.params.id, req.user.usuario_id);
    if (!encontrado) return res.status(404).json({ error: 'MATERIAL_NO_ENCONTRADO' });
    const { material, ejercicio } = encontrado;
    // CU49: al expirar la pauta, su material deja de entregarse al paciente.
    if (Number(ejercicio.es_paciente) && (await estadoVigencia(ejercicio)) === 'EXPIRADA') {
      return res.status(409).json({ error: 'PAUTA_EXPIRADA', mensaje: 'Esta pauta ya terminó: su material quedó cerrado.' });
    }
    const vista = await prepararVisor(material, async (paginas) =>
      C_Capa_de_Acceso_a_Datos.query(`UPDATE Pauta_Ejercicio_Material SET paginas = ? WHERE pauta_ejercicio_material_id = ?`, [paginas, material.pauta_ejercicio_material_id])
    );
    return res.json({
      ok: true,
      documento: {
        nombre_original: material.nombre_original,
        formato: material.formato,
        tamano_bytes: material.tamano_bytes,
        fecha_carga: material.momento_carga,
        categoria: 'MATERIAL_APOYO',
        paginas: vista.paginas,
        ...vista.campos,
      },
    });
  } catch (error) {
    console.error('[verMaterialApoyo]', error);
    return res.status(500).json({ error: 'Error interno al preparar el visor.' });
  }
};

// CU47 — Prescribiendo pautas de ejercicio técnico (quitar material de apoyo)
exports.eliminarMaterialApoyo = async (req, res) => {
  try {
    const encontrado = await materialConPermisos(req.params.id, req.user.usuario_id);
    if (!encontrado || !Number(encontrado.ejercicio.es_profesional)) {
      return res.status(404).json({ error: 'MATERIAL_NO_ENCONTRADO' });
    }
    await C_Capa_de_Acceso_a_Datos.query(`DELETE FROM Pauta_Ejercicio_Material WHERE pauta_ejercicio_material_id = ?`, [req.params.id]);
    if (C_API_Adapter.cloudinaryConfigurado()) {
      C_API_Adapter.cloudinary.uploader.destroy(encontrado.material.public_id_cloud, { resource_type: encontrado.material.tipo_recurso || 'image' }).catch(() => {});
    }
    return res.json({ mensaje: 'Material de apoyo eliminado.' });
  } catch (error) {
    console.error('[eliminarMaterialApoyo]', error);
    return res.status(500).json({ error: 'No se pudo eliminar el material.' });
  }
};
