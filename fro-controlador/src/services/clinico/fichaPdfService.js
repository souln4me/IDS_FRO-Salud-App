/**
 * Componente: C_Generador_Informes (puerta de entrada: src/componentes/C_Generador_Informes.js)
 * Casos de uso: CU28.
 *
 * Ficha clínica completa del paciente en PDF, para que la descargue él mismo.
 *
 * Reúne lo que el paciente puede ver de su historia: datos personales, la
 * anamnesis con alergias y antecedentes, cada episodio con sus metas, las
 * sesiones firmadas y las pautas de ejercicio, y la lista de documentos de su
 * repositorio. Usa el mismo estilo del informe de alta (CU37).
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');

const AZUL = '#003B4D';
const CAFE = '#8B7140';
const TEXTO = '#23201C';
const SUAVE = '#5D564D';
const MARGEN = 48;

// Apoyo común: fecha DD/MM/AAAA (con hora opcional) para el PDF
function fechaLegible(valor, conHora = false) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  const fecha = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (!conHora) return fecha;
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fecha} ${hora}`;
}

const DIAS = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
function textoDias(diasSemana) {
  const dias = String(diasSemana || '').split(',').map(Number).filter((n) => n >= 1 && n <= 7);
  return dias.length ? dias.map((n) => DIAS[n]).join(', ') : null;
}

// CU28 — Consolidando historial en ficha clínica electrónica
/** Todo lo que va en la ficha, en pocas consultas. */
async function datosFicha(pacienteId) {
  const [[paciente]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT p.paciente_id, p.sexo_clinico, p.calle, p.numero_calle, p.departamento,
            u.rut, u.email, CONCAT_WS(' ', u.nombres, u.apellido_paterno, u.apellido_materno) AS nombre,
            co.nombre AS comuna,
            ce.nombre AS contacto_nombre, ce.telefono AS contacto_telefono, ce.parentesco AS contacto_parentesco,
            (SELECT GROUP_CONCAT(t.telefono SEPARATOR ', ') FROM Usuario_Telefono t WHERE t.usuario_id = u.usuario_id) AS telefonos
       FROM Paciente p
       JOIN Usuario u ON u.usuario_id = p.usuario_id
       LEFT JOIN Comuna co ON co.comuna_id = p.comuna_id
       LEFT JOIN Contacto_Emergencia ce ON ce.contacto_emergencia_id = p.contacto_emergencia_id
      WHERE p.paciente_id = ? LIMIT 1`,
    [pacienteId]
  );
  if (!paciente) return null;

  const [[ficha]] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT ficha_clinica_id, anamnesis, plantilla_especialidad, ultima_actualizacion
       FROM Ficha_Clinica WHERE paciente_id = ? LIMIT 1`,
    [pacienteId]
  );
  let alergias = [], quirurgicos = [], patologicos = [];
  if (ficha) {
    [alergias] = await C_Capa_de_Acceso_a_Datos.query(`SELECT alergia AS t FROM Ficha_Alergia WHERE ficha_clinica_id = ?`, [ficha.ficha_clinica_id]);
    [quirurgicos] = await C_Capa_de_Acceso_a_Datos.query(`SELECT antecedente AS t FROM Ficha_Antecedente_Quirurgico WHERE ficha_clinica_id = ?`, [ficha.ficha_clinica_id]);
    [patologicos] = await C_Capa_de_Acceso_a_Datos.query(`SELECT antecedente AS t FROM Ficha_Antecedente_Patologico WHERE ficha_clinica_id = ?`, [ficha.ficha_clinica_id]);
  }

  const [episodios] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT ec.episodio_clinico_id, ec.motivo_consulta, COALESCE(ec.estado, 'ABIERTO') AS estado,
            ec.fecha_inicio, ec.fecha_terminado,
            CONCAT_WS(' ', u.nombres, u.apellido_paterno) AS profesional, es.nombre AS especialidad
       FROM Episodio_Clinico ec
       JOIN Profesional pr ON pr.profesional_id = ec.profesional_id
       JOIN Usuario u ON u.usuario_id = pr.usuario_id
       LEFT JOIN Especialidad es ON es.especialidad_id = pr.especialidad_id
      WHERE ec.paciente_id = ?
      ORDER BY ec.fecha_inicio DESC`,
    [pacienteId]
  );
  const ids = episodios.map((e) => e.episodio_clinico_id);
  let metas = [], evoluciones = [], pautas = [], ejercicios = [];
  if (ids.length > 0) {
    [metas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT episodio_clinico_id, descripcion, meta_valor, valor_actual, unidad
         FROM Objetivo_Terapeutico WHERE episodio_clinico_id IN (?) ORDER BY objetivo_terapeutico_id`,
      [ids]
    );
    // Solo las sesiones firmadas (inalterables): un borrador no es parte de la ficha.
    [evoluciones] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT ev.episodio_clinico_id, ev.hora_firma_digital, ev.tecnicas_aplicadas, ev.respuesta_fisiologica,
              ev.porcentaje_objetivo, CONCAT_WS(' ', u.nombres, u.apellido_paterno) AS profesional
         FROM Evolucion_Clinica ev
         JOIN Profesional pr ON pr.profesional_id = ev.profesional_id
         JOIN Usuario u ON u.usuario_id = pr.usuario_id
        WHERE ev.episodio_clinico_id IN (?) AND ev.inalterable = TRUE
        ORDER BY ev.hora_firma_digital DESC`,
      [ids]
    );
    [pautas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT pauta_tratamiento_id, episodio_clinico_id, nombre, fecha_inicio, fecha_expiracion
         FROM Pauta_Tratamiento WHERE episodio_clinico_id IN (?) ORDER BY fecha_inicio DESC`,
      [ids]
    );
    const pautaIds = pautas.map((p) => p.pauta_tratamiento_id);
    if (pautaIds.length > 0) {
      [ejercicios] = await C_Capa_de_Acceso_a_Datos.query(
        `SELECT pauta_tratamiento_id, nombre_ejercicio, series, repeticiones, frecuencia, dias_semana
           FROM Pauta_Ejercicio WHERE pauta_tratamiento_id IN (?) ORDER BY pauta_ejercicio_id`,
        [pautaIds]
      );
    }
  }

  const [documentos] = await C_Capa_de_Acceso_a_Datos.query(
    `SELECT nombre_original, categoria, fecha_carga FROM Documento_Clinico
      WHERE paciente_id = ? ORDER BY fecha_carga DESC`,
    [pacienteId]
  );

  return { paciente, ficha, alergias, quirurgicos, patologicos, episodios, metas, evoluciones, pautas, ejercicios, documentos };
}

// CU28 — Consolidando historial en ficha clínica electrónica
/** Arma el PDF y lo entrega como Buffer. */
function generarPdfFicha(datos) {
  const PDFDocument = require('pdfkit');
  const { paciente, ficha, alergias, quirurgicos, patologicos, episodios, metas, evoluciones, pautas, ejercicios, documentos } = datos;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true });
    const trozos = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    const ancho = doc.page.width - MARGEN * 2;
    const titulo = (texto) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(0.8);
      doc.fillColor(AZUL).fontSize(12).text(texto.toUpperCase(), { characterSpacing: 1 });
      doc.moveTo(MARGEN, doc.y + 2).lineTo(doc.page.width - MARGEN, doc.y + 2).strokeColor(CAFE).lineWidth(0.8).stroke();
      doc.moveDown(0.4);
      doc.fillColor(TEXTO).fontSize(10);
    };
    const subtitulo = (texto) => {
      if (doc.y > doc.page.height - 110) doc.addPage();
      doc.moveDown(0.5);
      doc.fillColor(AZUL).fontSize(10.5).text(texto);
      doc.fillColor(TEXTO).fontSize(10);
    };
    const dato = (etiqueta, valor) => {
      doc.fillColor(SUAVE).text(`${etiqueta}: `, { continued: true }).fillColor(TEXTO).text(String(valor ?? '—'));
    };
    const lista = (items, vacio) => {
      if (!items.length) {
        doc.fillColor(SUAVE).text(vacio).fillColor(TEXTO);
        return;
      }
      items.forEach((t) => doc.text(`•  ${t}`, { indent: 6, width: ancho - 6 }));
    };

    // ── Encabezado ──
    doc.fillColor(AZUL).fontSize(18).text('PUNTO PAZ SALUD', { characterSpacing: 3 });
    doc.fillColor(CAFE).fontSize(9).text('FICHA CLÍNICA DEL PACIENTE', { characterSpacing: 2 });
    doc.moveDown(0.3);
    doc.fillColor(SUAVE).fontSize(9).text(
      `Copia descargada por el paciente el ${fechaLegible(new Date(), true)}. Documento informativo: los registros firmados en la plataforma son los oficiales.`
    );

    // ── Datos personales ──
    titulo('Datos del paciente');
    dato('Nombre', paciente.nombre);
    dato('RUT', paciente.rut);
    dato('Correo', paciente.email);
    dato('Teléfono', paciente.telefonos || '—');
    dato('Sexo clínico', paciente.sexo_clinico);
    dato('Dirección', [`${paciente.calle || ''} ${paciente.numero_calle || ''}`.trim(), paciente.departamento ? `depto. ${paciente.departamento}` : null, paciente.comuna].filter(Boolean).join(', ') || '—');
    dato('Contacto de emergencia', paciente.contacto_nombre
      ? `${paciente.contacto_nombre} (${paciente.contacto_parentesco}) · ${paciente.contacto_telefono}`
      : '—');

    // ── Anamnesis ──
    titulo('Anamnesis y antecedentes');
    if (!ficha) {
      doc.fillColor(SUAVE).text('Todavía no se ha registrado la anamnesis.').fillColor(TEXTO);
    } else {
      dato('Última actualización', fechaLegible(ficha.ultima_actualizacion, true));
      if (ficha.plantilla_especialidad) dato('Plantilla', ficha.plantilla_especialidad);
      doc.moveDown(0.3);
      doc.text(ficha.anamnesis || 'Sin anamnesis registrada.', { width: ancho });
      subtitulo('Alergias');
      lista(alergias.map((a) => a.t), 'Sin alergias registradas.');
      subtitulo('Antecedentes quirúrgicos');
      lista(quirurgicos.map((a) => a.t), 'Sin antecedentes quirúrgicos registrados.');
      subtitulo('Antecedentes patológicos');
      lista(patologicos.map((a) => a.t), 'Sin antecedentes patológicos registrados.');
    }

    // ── Episodios ──
    titulo('Episodios clínicos');
    if (!episodios.length) doc.fillColor(SUAVE).text('Sin episodios clínicos registrados.').fillColor(TEXTO);
    episodios.forEach((e) => {
      subtitulo(`Episodio #${e.episodio_clinico_id} · ${e.motivo_consulta}`);
      dato('Profesional a cargo', `${e.profesional}${e.especialidad ? ` · ${e.especialidad}` : ''}`);
      dato('Estado', e.estado === 'CERRADO' ? `Cerrado el ${fechaLegible(e.fecha_terminado)}` : 'Abierto');
      dato('Inicio', fechaLegible(e.fecha_inicio));

      const susMetas = metas.filter((m) => m.episodio_clinico_id === e.episodio_clinico_id);
      if (susMetas.length) {
        doc.moveDown(0.2).fillColor(SUAVE).text('Metas terapéuticas:').fillColor(TEXTO);
        lista(susMetas.map((m) => `${m.descripcion}: ${Number(m.valor_actual)} de ${Number(m.meta_valor)} ${m.unidad}`), '');
      }

      const susPautas = pautas.filter((p) => p.episodio_clinico_id === e.episodio_clinico_id);
      if (susPautas.length) {
        doc.moveDown(0.2).fillColor(SUAVE).text('Pautas de ejercicio:').fillColor(TEXTO);
        susPautas.forEach((p) => {
          doc.text(`•  ${p.nombre} (${fechaLegible(p.fecha_inicio)} al ${fechaLegible(p.fecha_expiracion)})`, { indent: 6 });
          ejercicios
            .filter((x) => x.pauta_tratamiento_id === p.pauta_tratamiento_id)
            .forEach((x) => {
              const dias = textoDias(x.dias_semana);
              doc.fillColor(SUAVE).text(
                `–  ${x.nombre_ejercicio}: ${x.series} series de ${x.repeticiones} repeticiones${dias ? ` · ${dias}` : ` · ${String(x.frecuencia || 'DIARIA').toLowerCase()}`}`,
                { indent: 22 }
              ).fillColor(TEXTO);
            });
        });
      }

      const susSesiones = evoluciones.filter((v) => v.episodio_clinico_id === e.episodio_clinico_id);
      doc.moveDown(0.2).fillColor(SUAVE).text(`Sesiones firmadas (${susSesiones.length}):`).fillColor(TEXTO);
      if (!susSesiones.length) doc.fillColor(SUAVE).text('Sin sesiones firmadas.', { indent: 6 }).fillColor(TEXTO);
      susSesiones.forEach((v) => {
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.moveDown(0.2).text(`${fechaLegible(v.hora_firma_digital, true)} · ${v.profesional}${v.porcentaje_objetivo != null ? ` · avance ${v.porcentaje_objetivo} %` : ''}`, { indent: 6 });
        if (v.tecnicas_aplicadas) doc.fillColor(SUAVE).text(`Técnicas: ${v.tecnicas_aplicadas}`, { indent: 14, width: ancho - 14 });
        if (v.respuesta_fisiologica) doc.fillColor(SUAVE).text(`Respuesta: ${v.respuesta_fisiologica}`, { indent: 14, width: ancho - 14 });
        doc.fillColor(TEXTO);
      });
    });

    // ── Documentos ──
    titulo('Documentos del repositorio');
    lista(documentos.map((d) => `${d.nombre_original} · ${String(d.categoria || '').replace(/_/g, ' ').toLowerCase()} · ${fechaLegible(d.fecha_carga)}`),
      'Sin documentos cargados.');
    doc.moveDown(0.3).fillColor(SUAVE).fontSize(9).text('Los archivos se consultan en la app, en Mensajes → Mis documentos.');

    // ── Pie con numeración ──
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(SUAVE).fontSize(8).text(
        `Ficha clínica de ${paciente.nombre} · página ${i + 1} de ${rango.count}`,
        MARGEN, doc.page.height - 34, { width: ancho, align: 'center', lineBreak: false }
      );
    }
    doc.end();
  });
}

module.exports = { datosFicha, generarPdfFicha };
