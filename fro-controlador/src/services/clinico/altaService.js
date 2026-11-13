/**
 * Componente: C_Gestor_Alta_Clinica (puerta de entrada: src/componentes/C_Gestor_Alta_Clinica.js)
 * Casos de uso: CU37, CU51, CU78.
 *
 * Alta del tratamiento (Incremento 4, CU51 y CU37).
 *
 * - CU51: cuando el promedio de avance de las metas del episodio alcanza el
 *   umbral de egreso (parámetro UMBRAL_EGRESO_CLINICO, 80 %), el paciente
 *   gana acceso a los contenidos de prevención y mantenimiento de la
 *   biblioteca. Se evalúa cada vez que el profesional actualiza una meta y
 *   cada vez que el paciente abre su pestaña de alta (es idempotente).
 * - CU37: el informe de alta consolida el estado final del episodio, se
 *   guarda como PDF en los documentos del paciente y cierra el episodio.
 *   Las validaciones del cierre (evoluciones sin firmar, citas futuras) las
 *   comparte el cierre simple del CU78.
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');
const C_Despachador_Notificaciones = require('../../componentes/C_Despachador_Notificaciones');
const C_Motor_Clinico = require('../../componentes/C_Motor_Clinico');

// CU37 — Emitiendo informe de alta y cierre de episodio
const LIMITE_PAUTAS_CONTINUIDAD = 1000;

// CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
// La biblioteca clasifica el material por especialidad, pero no con el mismo
// nombre que la tabla Especialidad.
const CATEGORIA_POR_ESPECIALIDAD = { Nutricionista: 'Nutrición' };

// CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
async function umbralEgreso(conexion) {
  return C_Capa_de_Acceso_a_Datos.leerParametroEntero(conexion, 'UMBRAL_EGRESO_CLINICO', 80);
}

// CU51, CU37 — metas del episodio con su porcentaje de avance
async function metasDelEpisodio(conexion, episodioId) {
  const [filas] = await conexion.query(
    `SELECT objetivo_terapeutico_id, descripcion, meta_valor, valor_actual, unidad
       FROM Objetivo_Terapeutico
      WHERE episodio_clinico_id = ?
      ORDER BY objetivo_terapeutico_id`,
    [episodioId]
  );
  return filas.map((m) => {
    const meta = Number(m.meta_valor);
    const actual = Number(m.valor_actual);
    return {
      ...m,
      meta_valor: meta,
      valor_actual: actual,
      porcentaje: meta > 0 ? Math.min(100, Math.round((actual / meta) * 100)) : null,
    };
  });
}

/**
 * CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
 * CU51 Exc. 2: metas que no se pueden medir (sin valor objetivo, sin unidad
 * o con un avance que supera la meta). Con una sola de estas el cambio de
 * estado se aborta y queda anotado en la bitácora.
 */
function reglasContradictorias(metas) {
  const motivos = [];
  for (const m of metas) {
    if (!(m.meta_valor > 0)) motivos.push(`La meta "${m.descripcion}" no tiene un valor objetivo mayor a cero.`);
    if (!String(m.unidad || '').trim()) motivos.push(`La meta "${m.descripcion}" no tiene unidad de medida.`);
    if (m.meta_valor > 0 && m.valor_actual > m.meta_valor) {
      motivos.push(`La meta "${m.descripcion}" registra un avance mayor que su valor objetivo.`);
    }
  }
  return motivos;
}

// CU37, CU51 — deja constancia en la bitácora de auditoría
async function bitacora(conexion, accion, entidad, datos, usuarioId = null, ip = null) {
  try {
    await conexion.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [accion, entidad, ip, JSON.stringify(datos), usuarioId]
    );
  } catch (error) {
    console.error('[altaService.bitacora]', error.message);
  }
}

/**
 * CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
 * Evalúa si el episodio alcanzó el umbral de egreso y, si corresponde,
 * habilita la preparación para el alta (una sola vez) avisándole al paciente.
 *
 * `registrar` anota en la bitácora el aborto por reglas contradictorias: se
 * usa cuando el disparo viene de un cambio de meta, no de una consulta.
 */
async function evaluarPreparacionAlta(conexion, episodioId, { registrar = false, usuarioId = null, ip = null } = {}) {
  const [[episodio]] = await conexion.query(
    `SELECT ec.episodio_clinico_id, ec.estado, ec.preparacion_alta_en, pa.usuario_id AS usuario_paciente
       FROM Episodio_Clinico ec
       JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
      WHERE ec.episodio_clinico_id = ? LIMIT 1`,
    [episodioId]
  );
  if (!episodio) return null;

  const metas = await metasDelEpisodio(conexion, episodioId);
  const porcentaje = await C_Motor_Clinico.porcentajeObjetivosEpisodio(conexion, episodioId);
  const umbral = await umbralEgreso(conexion);
  const resultado = {
    porcentaje,
    umbral,
    metas,
    habilitada: Boolean(episodio.preparacion_alta_en),
    preparacion_alta_en: episodio.preparacion_alta_en,
    recien_habilitada: false,
    contradicciones: [],
  };

  const contradicciones = reglasContradictorias(metas);
  if (contradicciones.length > 0) {
    resultado.contradicciones = contradicciones;
    if (registrar && !resultado.habilitada) {
      await bitacora(conexion, 'PREPARACION_ALTA_ABORTADA', 'Episodio_Clinico',
        { episodio_clinico_id: Number(episodioId), porcentaje, umbral, motivos: contradicciones }, usuarioId, ip);
    }
    return resultado;
  }

  if (resultado.habilitada || porcentaje === null || porcentaje < umbral || C_Motor_Clinico.estaCerrado(episodio.estado)) {
    return resultado;
  }

  // El WHERE repite la condición: dos evaluaciones simultáneas no habilitan
  // dos veces ni mandan dos avisos.
  const [cambio] = await conexion.query(
    `UPDATE Episodio_Clinico SET preparacion_alta_en = NOW()
      WHERE episodio_clinico_id = ? AND preparacion_alta_en IS NULL`,
    [episodioId]
  );
  if (cambio.affectedRows === 0) {
    resultado.habilitada = true;
    return resultado;
  }

  resultado.habilitada = true;
  resultado.recien_habilitada = true;
  await bitacora(conexion, 'PREPARACION_ALTA_HABILITADA', 'Episodio_Clinico',
    { episodio_clinico_id: Number(episodioId), porcentaje, umbral }, usuarioId, ip);
  // CU52: aviso al paciente
  await C_Despachador_Notificaciones.notificarUsuario(
    conexion,
    episodio.usuario_paciente,
    'PREPARACION_ALTA',
    `Alcanzaste el ${porcentaje} % de tus metas de tratamiento. Ya puedes ver tus contenidos de prevención y mantenimiento.`,
    { datos: { pantalla: 'PreparacionAlta' } }
  );
  return resultado;
}

// CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
/** Recursos de prevención de la biblioteca, priorizando los de la especialidad. */
async function recursosPrevencion(conexion, especialidad) {
  const categoria = CATEGORIA_POR_ESPECIALIDAD[especialidad] || especialidad || null;
  const columnas = `material_terapeutico_id, nombre, tipo, url_archivo, categoria, formato, imagen_url`;
  if (categoria) {
    const [propios] = await conexion.query(
      `SELECT ${columnas} FROM Material_Terapeutico
        WHERE disponibilidad = TRUE AND proposito = 'PREVENCION' AND categoria = ?
        ORDER BY nombre`,
      [categoria]
    );
    if (propios.length > 0) return propios;
  }
  const [todos] = await conexion.query(
    `SELECT ${columnas} FROM Material_Terapeutico
      WHERE disponibilidad = TRUE AND proposito = 'PREVENCION'
      ORDER BY categoria, nombre`
  );
  return todos;
}

/**
 * CU37, CU78 — datos del episodio para el informe de alta y el cierre
 * Todo lo que el informe de alta y el cierre necesitan saber del episodio.
 */
async function resumenCierre(conexion, episodioId) {
  const [[episodio]] = await conexion.query(
    `SELECT ec.episodio_clinico_id, ec.motivo_consulta, ec.estado, ec.fecha_inicio, ec.fecha_terminado,
            ec.preparacion_alta_en, ec.pautas_continuidad, ec.informe_alta_documento_id, ec.informe_alta_emitido_en,
            ec.paciente_id, ec.profesional_id,
            CONCAT_WS(' ', up.nombres, up.apellido_paterno, up.apellido_materno) AS paciente,
            up.rut AS rut_paciente,
            CONCAT_WS(' ', upr.nombres, upr.apellido_paterno) AS profesional,
            pr.num_registro_salud, e.nombre AS especialidad
       FROM Episodio_Clinico ec
       JOIN Paciente pa ON pa.paciente_id = ec.paciente_id
       JOIN Usuario up ON up.usuario_id = pa.usuario_id
       LEFT JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
       LEFT JOIN Usuario upr ON upr.usuario_id = pr.usuario_id
       LEFT JOIN Especialidad e ON e.especialidad_id = pr.especialidad_id
      WHERE ec.episodio_clinico_id = ? LIMIT 1`,
    [episodioId]
  );
  if (!episodio) return null;

  const metas = await metasDelEpisodio(conexion, episodioId);
  const porcentaje = await C_Motor_Clinico.porcentajeObjetivosEpisodio(conexion, episodioId);
  const umbral = await umbralEgreso(conexion);

  const [evoluciones] = await conexion.query(
    `SELECT Evolucion_clinica_id AS evolucion_clinica_id, inalterable, hora_firma_digital,
            respuesta_fisiologica, tecnicas_aplicadas, porcentaje_objetivo
       FROM Evolucion_Clinica
      WHERE episodio_clinico_id = ?
      ORDER BY Evolucion_clinica_id`,
    [episodioId]
  );
  const pendientes = evoluciones.filter((e) => !e.inalterable);

  // Exc. 4 del CU37: citas que todavía no ocurrieron (o que están en curso).
  const [citasFuturas] = await conexion.query(
    `SELECT cita_id, fecha_hora_inicio, estado
       FROM Cita
      WHERE episodio_clinico_id = ?
        AND ((estado IN ('AGENDADA', 'CONFIRMADA') AND fecha_hora_inicio > NOW()) OR estado = 'EN_CURSO')
      ORDER BY fecha_hora_inicio`,
    [episodioId]
  );

  return {
    episodio,
    metas,
    porcentaje,
    umbral,
    umbral_alcanzado: porcentaje !== null && porcentaje >= umbral,
    contradicciones: reglasContradictorias(metas),
    evoluciones,
    evoluciones_pendientes: pendientes,
    citas_futuras: citasFuturas,
    limite_pautas: LIMITE_PAUTAS_CONTINUIDAD,
  };
}

/**
 * CU37, CU78 — validaciones antes de cerrar el episodio
 * Qué impide cerrar el episodio (Exc. 2 y 4 del CU37). Devuelve null si se
 * puede cerrar, o el cuerpo de la respuesta 409.
 */
function impedimentoDeCierre(resumen) {
  if (C_Motor_Clinico.estaCerrado(resumen.episodio.estado)) {
    return { error: 'EPISODIO_CERRADO', mensaje: 'Este episodio ya está cerrado.' };
  }
  if (resumen.evoluciones_pendientes.length > 0) {
    return {
      error: 'EVOLUCIONES_PENDIENTES',
      mensaje: `Hay ${resumen.evoluciones_pendientes.length} evolución(es) sin cerrar ni firmar. Regulariza esos registros antes de emitir el alta.`,
      evoluciones: resumen.evoluciones_pendientes.map((e) => e.evolucion_clinica_id),
    };
  }
  if (resumen.citas_futuras.length > 0) {
    return {
      error: 'CITAS_FUTURAS',
      mensaje: `El episodio tiene ${resumen.citas_futuras.length} cita(s) agendada(s) a futuro. Cancélalas antes de cerrar el episodio.`,
      citas: resumen.citas_futuras,
    };
  }
  return null;
}

// Apoyo común: fecha DD/MM/AAAA para el PDF
// Las fechas de la base llegan como texto 'AAAA-MM-DD[ hh:mm:ss]' (dateStrings):
// se toman tal cual para no correrlas un día. "Hoy" se calcula en hora de Chile.
function fechaLegible(valor) {
  if (!valor) return '—';
  const texto = typeof valor === 'string' ? valor.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (texto) return `${texto[3]}/${texto[2]}/${texto[1]}`;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' })
      .formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${partes.day}/${partes.month}/${partes.year}`;
}

// CU37 — Emitiendo informe de alta y cierre de episodio
/** El informe de alta como PDF (pdfkit se carga solo cuando hace falta). */
function generarPdfInformeAlta(resumen, pautas, emitidoPor) {
  const PDFDocument = require('pdfkit');
  const { episodio, metas, evoluciones, porcentaje, umbral } = resumen;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const trozos = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    const titulo = (texto) => {
      doc.moveDown(0.8);
      doc.fillColor('#003B4D').fontSize(12).text(texto.toUpperCase(), { characterSpacing: 1 });
      doc.moveTo(doc.x, doc.y + 2).lineTo(doc.page.width - 48, doc.y + 2).strokeColor('#8B7140').lineWidth(0.8).stroke();
      doc.moveDown(0.4);
      doc.fillColor('#23201C').fontSize(10);
    };
    const dato = (etiqueta, valor) => {
      doc.fillColor('#5D564D').text(`${etiqueta}: `, { continued: true }).fillColor('#23201C').text(String(valor ?? '—'));
    };

    doc.fillColor('#003B4D').fontSize(18).text('PUNTO PAZ SALUD', { characterSpacing: 3 });
    doc.fillColor('#8B7140').fontSize(9).text('INFORME DE ALTA DEL TRATAMIENTO', { characterSpacing: 2 });
    doc.moveDown(0.3);
    doc.fillColor('#5D564D').fontSize(9).text(`Emitido el ${fechaLegible(new Date())} por ${emitidoPor}`);

    titulo('Paciente y episodio');
    dato('Paciente', episodio.paciente);
    dato('RUT', episodio.rut_paciente);
    dato('Profesional tratante', `${episodio.profesional || '—'}${episodio.especialidad ? ` · ${episodio.especialidad}` : ''}`);
    dato('Registro de salud', episodio.num_registro_salud);
    dato('Episodio clínico', `#${episodio.episodio_clinico_id} · ${episodio.motivo_consulta}`);
    dato('Inicio del tratamiento', fechaLegible(episodio.fecha_inicio));
    dato('Alta', fechaLegible(new Date()));

    titulo('Estado final de las metas terapéuticas');
    dato('Cumplimiento global', porcentaje === null ? 'sin metas medidas' : `${porcentaje} % (umbral de egreso ${umbral} %)`);
    doc.moveDown(0.3);
    if (metas.length === 0) {
      doc.text('El episodio no registró metas terapéuticas.');
    }
    for (const m of metas) {
      doc.text(`• ${m.descripcion}: ${m.valor_actual} de ${m.meta_valor} ${m.unidad || ''} · ${m.porcentaje === null ? 'sin medir' : `${m.porcentaje} %`}`);
    }

    titulo('Resumen de la evolución clínica');
    const ultima = evoluciones[evoluciones.length - 1];
    dato('Sesiones registradas', evoluciones.length);
    if (ultima) {
      dato('Última respuesta fisiológica', ultima.respuesta_fisiologica || 'No informada');
      dato('Últimas técnicas aplicadas', ultima.tecnicas_aplicadas || 'No informadas');
      dato('Última sesión firmada el', fechaLegible(ultima.hora_firma_digital));
    }

    titulo('Pautas de continuidad terapéutica');
    doc.text(pautas || 'Sin pautas adicionales.', { align: 'justify' });

    doc.moveDown(2);
    doc.fillColor('#5D564D').fontSize(8).text(
      'Este informe consolida el estado final del episodio clínico y marca su cierre formal. Los registros clínicos del episodio quedan inalterables.',
      { align: 'center' }
    );
    doc.end();
  });
}

module.exports = {
  LIMITE_PAUTAS_CONTINUIDAD,
  umbralEgreso,
  metasDelEpisodio,
  reglasContradictorias,
  evaluarPreparacionAlta,
  recursosPrevencion,
  resumenCierre,
  impedimentoDeCierre,
  generarPdfInformeAlta,
};
