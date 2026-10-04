/**
 * CU64 — Dashboard de monitoreo de KPIs.
 * CU63 — Generación y exportación de reportes operativos.
 *
 * Los dos leen lo mismo —la operación completa— pero con propósitos distintos:
 * el panel resume para decidir, el informe detalla para auditar y archivar.
 */

const pool = require('./../config/database');
const { leerParametroEntero } = require('../services/agenda/agendaService');

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Excepción 2 del CU64: si el cálculo falla o se pone lento, se responde con
// el último resultado bueno avisando que es diferido, en vez de una pantalla
// en blanco. Vive en memoria: es un resumen, no un dato que haya que persistir.
let cacheKPIs = { datos: null, momento: 0 };
const VIDA_CACHE_MS = 2 * 60 * 1000;

function fechaValida(valor) {
  return PATRON_FECHA.test(String(valor || '')) ? valor : null;
}

/**
 * GET /api/gestion/kpis?desde=&hasta=   (Administrador)
 */
exports.kpis = async (req, res) => {
  const desde = fechaValida(req.query?.desde);
  const hasta = fechaValida(req.query?.hasta);

  if (desde && hasta && desde > hasta) {
    return res.status(400).json({
      error: 'RANGO_INVALIDO',
      mensaje: 'La fecha de inicio no puede ser posterior a la de término.',
    });
  }

  try {
    const [[citas]] = await pool.query(
      `SELECT
          COUNT(*) AS total,
          SUM(estado = 'REALIZADA') AS realizadas,
          SUM(estado = 'INASISTENCIA') AS inasistencias,
          SUM(estado LIKE 'CANCELADA%') AS canceladas,
          SUM(estado IN ('AGENDADA','CONFIRMADA')) AS vigentes
         FROM Cita
        WHERE (? IS NULL OR DATE(fecha_hora_inicio) >= ?)
          AND (? IS NULL OR DATE(fecha_hora_inicio) <= ?)`,
      [desde, desde, hasta, hasta]
    );

    const [[pacientes]] = await pool.query(
      `SELECT
          (SELECT COUNT(*) FROM Paciente) AS registrados,
          (SELECT COUNT(DISTINCT c.paciente_id) FROM Cita c
            WHERE c.estado NOT LIKE 'CANCELADA%'
              AND c.fecha_hora_inicio >= DATE_SUB(NOW(), INTERVAL 90 DAY)) AS activos`
    );

    const [[satisfaccion]] = await pool.query(
      `SELECT COUNT(*) AS evaluaciones, COALESCE(AVG(puntuacion), 0) AS promedio
         FROM Evaluacion_Satisfaccion e
         JOIN Cita c ON c.cita_id = e.cita_id
        WHERE (? IS NULL OR DATE(c.fecha_hora_inicio) >= ?)
          AND (? IS NULL OR DATE(c.fecha_hora_inicio) <= ?)`,
      [desde, desde, hasta, hasta]
    );

    const [[adherencia]] = await pool.query(
      `SELECT COALESCE(AVG(porcentaje), 0) AS promedio, COUNT(DISTINCT paciente_id) AS pacientes
         FROM Indicador_Adherencia
        WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`
    );

    const [[recaudacion]] = await pool.query(
      `SELECT
          -- Una devolución resta: si no, la recaudación del panel quedaría
          -- inflada con dinero que volvió al paciente (RF74).
          COALESCE(SUM(CASE WHEN tipo = 'DEVOLUCION' THEN -monto_total ELSE monto_total END), 0) AS total,
          COUNT(*) AS transacciones
         FROM Transaccion
        WHERE estado = 'PAGADA'
          AND (? IS NULL OR DATE(momento_pago) >= ?)
          AND (? IS NULL OR DATE(momento_pago) <= ?)`,
      [desde, desde, hasta, hasta]
    );

    const [[operacion]] = await pool.query(
      `SELECT
          (SELECT COUNT(*) FROM Ticket_Soporte WHERE estado IN ('ABIERTO','EN_PROCESO')) AS tickets_abiertos,
          (SELECT COUNT(*) FROM Alerta_Clinica WHERE estado = 'ABIERTA') AS alertas_abiertas,
          (SELECT COUNT(*) FROM Evaluacion_Satisfaccion
            WHERE estado_moderacion = 'PENDIENTE' AND resena IS NOT NULL) AS testimonios_pendientes,
          (SELECT COUNT(*) FROM Profesional p JOIN Usuario u ON u.usuario_id = p.usuario_id
            WHERE u.cuenta_activo = TRUE) AS profesionales_activos`
    );

    // Serie diaria de los últimos 30 días, para el gráfico del panel.
    const [serie] = await pool.query(
      `SELECT DATE(fecha_hora_inicio) AS fecha,
              COUNT(*) AS total,
              SUM(estado = 'REALIZADA') AS realizadas
         FROM Cita
        WHERE fecha_hora_inicio >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(fecha_hora_inicio)
        ORDER BY fecha ASC`
    );

    const atendidas = Number(citas?.realizadas || 0);
    const noAsistidas = Number(citas?.inasistencias || 0);

    const datos = {
      rango: { desde, hasta },
      pacientes: {
        registrados: Number(pacientes?.registrados || 0),
        activos: Number(pacientes?.activos || 0),
      },
      citas: {
        total: Number(citas?.total || 0),
        realizadas: atendidas,
        inasistencias: noAsistidas,
        canceladas: Number(citas?.canceladas || 0),
        vigentes: Number(citas?.vigentes || 0),
        tasa_asistencia:
          atendidas + noAsistidas > 0
            ? Math.round((atendidas / (atendidas + noAsistidas)) * 100)
            : null,
      },
      satisfaccion: {
        promedio: Number(Number(satisfaccion?.promedio || 0).toFixed(2)),
        evaluaciones: Number(satisfaccion?.evaluaciones || 0),
      },
      adherencia: {
        promedio: Math.round(Number(adherencia?.promedio || 0)),
        pacientes_medidos: Number(adherencia?.pacientes || 0),
      },
      recaudacion: {
        total: Number(recaudacion?.total || 0),
        transacciones: Number(recaudacion?.transacciones || 0),
      },
      operacion: {
        tickets_abiertos: Number(operacion?.tickets_abiertos || 0),
        alertas_abiertas: Number(operacion?.alertas_abiertas || 0),
        testimonios_pendientes: Number(operacion?.testimonios_pendientes || 0),
        profesionales_activos: Number(operacion?.profesionales_activos || 0),
      },
      serie_citas: serie.map((f) => ({
        fecha: String(f.fecha).slice(0, 10),
        total: Number(f.total),
        realizadas: Number(f.realizadas),
      })),
      momento_calculo: new Date().toISOString(),
    };

    cacheKPIs = { datos, momento: Date.now() };
    return res.status(200).json({ ...datos, desde_cache: false });
  } catch (error) {
    console.error('[kpis CU64]', error);

    // Excepción 2: se entrega el último resultado conocido, avisando.
    if (cacheKPIs.datos) {
      return res.status(200).json({
        ...cacheKPIs.datos,
        desde_cache: true,
        antiguedad_minutos: Math.round((Date.now() - cacheKPIs.momento) / 60000),
      });
    }

    return res.status(500).json({
      error: 'ERROR_KPIS',
      mensaje: 'No se pudieron calcular los indicadores. Vuelve a intentarlo.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU63 — Reportes operativos exportables
// ─────────────────────────────────────────────────────────────────────────────

/** Definición de cada informe: consulta, columnas y nombre de archivo. */
const INFORMES = {
  ASISTENCIA: {
    titulo: 'Informe de asistencia',
    columnas: [
      { clave: 'cita_id', titulo: 'N° cita', ancho: 10 },
      { clave: 'fecha', titulo: 'Fecha', ancho: 18 },
      { clave: 'paciente', titulo: 'Paciente', ancho: 28 },
      { clave: 'profesional', titulo: 'Profesional', ancho: 28 },
      { clave: 'especialidad', titulo: 'Especialidad', ancho: 22 },
      { clave: 'modalidad', titulo: 'Modalidad', ancho: 14 },
      { clave: 'estado', titulo: 'Estado', ancho: 20 },
    ],
    consulta: `
      SELECT c.cita_id,
             DATE_FORMAT(c.fecha_hora_inicio, '%d/%m/%Y %H:%i') AS fecha,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pu.nombres, pu.apellido_paterno)), ''), '—') AS paciente,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ru.nombres, ru.apellido_paterno)), ''), '—') AS profesional,
             COALESCE(e.nombre, '—') AS especialidad,
             COALESCE(c.modalidad, '—') AS modalidad,
             c.estado
        FROM Cita c
        LEFT JOIN Paciente pa ON pa.paciente_id = c.paciente_id
        LEFT JOIN Usuario pu ON pu.usuario_id = pa.usuario_id
        LEFT JOIN Profesional pr ON pr.profesional_id = c.profesional_id
        LEFT JOIN Usuario ru ON ru.usuario_id = pr.usuario_id
        LEFT JOIN Especialidad e ON e.especialidad_id = pr.especialidad_id
       WHERE (? IS NULL OR DATE(c.fecha_hora_inicio) >= ?)
         AND (? IS NULL OR DATE(c.fecha_hora_inicio) <= ?)
       ORDER BY c.fecha_hora_inicio DESC`,
  },
  RECAUDACION: {
    titulo: 'Informe de recaudación',
    columnas: [
      { clave: 'transaccion_id', titulo: 'N° transacción', ancho: 16 },
      { clave: 'fecha', titulo: 'Fecha de pago', ancho: 18 },
      { clave: 'paciente', titulo: 'Paciente', ancho: 28 },
      { clave: 'tipo', titulo: 'Tipo', ancho: 14 },
      { clave: 'metodo_pago', titulo: 'Método', ancho: 20 },
      { clave: 'estado', titulo: 'Estado', ancho: 14 },
      { clave: 'monto_total', titulo: 'Monto', ancho: 14 },
    ],
    consulta: `
      SELECT t.transaccion_id,
             DATE_FORMAT(t.momento_pago, '%d/%m/%Y %H:%i') AS fecha,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pu.nombres, pu.apellido_paterno)), ''), '—') AS paciente,
             t.tipo, t.metodo_pago, t.estado, t.monto_total
        FROM Transaccion t
        LEFT JOIN Cita c ON c.cita_id = t.cita_id
        LEFT JOIN Paciente pa ON pa.paciente_id = c.paciente_id
        LEFT JOIN Usuario pu ON pu.usuario_id = pa.usuario_id
       WHERE (? IS NULL OR DATE(t.momento_pago) >= ?)
         AND (? IS NULL OR DATE(t.momento_pago) <= ?)
       ORDER BY t.momento_pago DESC`,
  },
  ADHERENCIA: {
    titulo: 'Informe de adherencia',
    columnas: [
      { clave: 'fecha', titulo: 'Fecha', ancho: 14 },
      { clave: 'paciente', titulo: 'Paciente', ancho: 30 },
      { clave: 'porcentaje', titulo: 'Adherencia (%)', ancho: 16 },
      { clave: 'tareas_cumplidas', titulo: 'Cumplidas', ancho: 14 },
      { clave: 'tareas_programadas', titulo: 'Programadas', ancho: 14 },
    ],
    consulta: `
      SELECT DATE_FORMAT(i.fecha, '%d/%m/%Y') AS fecha,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''), '—') AS paciente,
             i.porcentaje, i.tareas_cumplidas, i.tareas_programadas
        FROM Indicador_Adherencia i
        JOIN Paciente pa ON pa.paciente_id = i.paciente_id
        LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
       WHERE (? IS NULL OR i.fecha >= ?)
         AND (? IS NULL OR i.fecha <= ?)
       ORDER BY i.fecha DESC`,
  },
};

/** GET /api/gestion/informes — qué informes existen y en qué formatos. */
exports.tiposDeInforme = (req, res) => {
  res.status(200).json({
    informes: Object.entries(INFORMES).map(([clave, def]) => ({
      clave,
      titulo: def.titulo,
      columnas: def.columnas.map((c) => c.titulo),
    })),
    formatos: ['XLSX', 'PDF', 'CSV'],
  });
};

function aCSV(columnas, filas) {
  const escapar = (valor) => {
    const texto = String(valor ?? '');
    return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const lineas = [columnas.map((c) => escapar(c.titulo)).join(';')];
  for (const fila of filas) {
    lineas.push(columnas.map((c) => escapar(fila[c.clave])).join(';'));
  }
  // BOM para que Excel abra los acentos bien al doble clic.
  return '﻿' + lineas.join('\n');
}

async function aXLSX(titulo, columnas, filas, subtitulo) {
  // Carga perezosa: la librería es pesada y solo hace falta al exportar.
  const ExcelJS = require('exceljs');
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Punto Paz Salud';
  libro.created = new Date();

  const hoja = libro.addWorksheet(titulo.slice(0, 30));
  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  if (subtitulo) hoja.addRow([subtitulo]);
  hoja.addRow([]);

  const cabecera = hoja.addRow(columnas.map((c) => c.titulo));
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecera.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003B4D' } };
  });

  columnas.forEach((c, i) => {
    hoja.getColumn(i + 1).width = c.ancho || 18;
  });

  for (const fila of filas) {
    hoja.addRow(columnas.map((c) => fila[c.clave] ?? ''));
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}

function aPDF(titulo, columnas, filas, subtitulo) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const trozos = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    doc.fillColor('#003B4D').fontSize(16).text('PUNTO PAZ SALUD', { characterSpacing: 3 });
    doc.fillColor('#8B7140').fontSize(9).text('SALUD', { characterSpacing: 4 });
    doc.moveDown(0.6);
    doc.fillColor('#23201C').fontSize(14).text(titulo);
    if (subtitulo) doc.fillColor('#5D564D').fontSize(9).text(subtitulo);
    doc.moveDown(0.8);

    const anchoUtil = doc.page.width - doc.options.margin * 2;
    const total = columnas.reduce((suma, c) => suma + (c.ancho || 18), 0);
    const anchos = columnas.map((c) => ((c.ancho || 18) / total) * anchoUtil);

    const escribirFila = (valores, negrita) => {
      const y = doc.y;
      let x = doc.options.margin;
      doc.fontSize(8).fillColor(negrita ? '#FFFFFF' : '#23201C');
      if (negrita) {
        doc.rect(doc.options.margin, y - 2, anchoUtil, 14).fill('#003B4D');
        doc.fillColor('#FFFFFF');
      }
      valores.forEach((valor, i) => {
        doc.text(String(valor ?? ''), x + 2, y + 1, { width: anchos[i] - 4, ellipsis: true });
        x += anchos[i];
      });
      doc.y = y + 14;
    };

    escribirFila(columnas.map((c) => c.titulo), true);
    for (const fila of filas) {
      if (doc.y > doc.page.height - 50) {
        doc.addPage();
        escribirFila(columnas.map((c) => c.titulo), true);
      }
      escribirFila(columnas.map((c) => fila[c.clave]));
    }

    doc.end();
  });
}

/**
 * GET /api/gestion/informes/:tipo?desde=&hasta=&formato=XLSX&tomo=1
 *
 * Devuelve el archivo listo para descargar.
 */
exports.exportarInforme = async (req, res) => {
  const tipo = String(req.params?.tipo || '').toUpperCase();
  const formato = String(req.query?.formato || 'XLSX').toUpperCase();
  const desde = fechaValida(req.query?.desde);
  const hasta = fechaValida(req.query?.hasta);
  const tomo = Math.max(1, Number.parseInt(req.query?.tomo, 10) || 1);

  const definicion = INFORMES[tipo];
  if (!definicion) {
    return res.status(400).json({ error: 'INFORME_DESCONOCIDO' });
  }

  // Excepción 1: el rango invertido no se consulta.
  if (desde && hasta && desde > hasta) {
    return res.status(400).json({
      error: 'RANGO_INVALIDO',
      mensaje: 'La fecha de inicio no puede ser posterior a la de término.',
    });
  }

  try {
    const [filas] = await pool.query(definicion.consulta, [desde, desde, hasta, hasta]);

    // Excepción 2: conjunto vacío. No se genera un archivo con solo encabezados.
    if (filas.length === 0) {
      return res.status(404).json({
        error: 'SIN_DATOS',
        mensaje: 'No hay registros en el periodo seleccionado. Cambia las fechas e inténtalo de nuevo.',
      });
    }

    // Excepción 4: con muchas filas el informe se parte en tomos, en vez de
    // intentar compilar un archivo que no cabe en memoria.
    const porTomo = await leerParametroEntero(pool, 'MAX_FILAS_POR_TOMO_INFORME', 2000);
    const tomos = Math.ceil(filas.length / porTomo);
    const parte = filas.slice((tomo - 1) * porTomo, tomo * porTomo);

    if (parte.length === 0) {
      return res.status(404).json({
        error: 'TOMO_INEXISTENTE',
        mensaje: `Este informe tiene ${tomos} tomo(s).`,
      });
    }

    const periodo = `Periodo: ${desde || 'inicio'} a ${hasta || 'hoy'}`;
    const subtitulo =
      tomos > 1
        ? `${periodo} · tomo ${tomo} de ${tomos} · ${filas.length} registros en total`
        : `${periodo} · ${filas.length} registros`;

    const base = `${tipo.toLowerCase()}_${(desde || 'inicio')}_${(hasta || 'hoy')}${
      tomos > 1 ? `_tomo${tomo}de${tomos}` : ''
    }`;

    res.setHeader('X-Total-Registros', String(filas.length));
    res.setHeader('X-Total-Tomos', String(tomos));
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Registros, X-Total-Tomos');

    if (formato === 'CSV') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      return res.status(200).send(aCSV(definicion.columnas, parte));
    }

    if (formato === 'PDF') {
      try {
        const pdf = await aPDF(definicion.titulo, definicion.columnas, parte, subtitulo);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
        return res.status(200).send(pdf);
      } catch (errorPdf) {
        // Excepción 3: el generador de PDF falló. Se dice con claridad y se
        // apunta a la salida tabular, que no depende de esa librería.
        console.error('[informe PDF]', errorPdf.message);
        return res.status(503).json({
          error: 'PDF_NO_DISPONIBLE',
          mensaje:
            'El generador de PDF no está disponible en este momento. ' +
            'Descarga el informe en formato Excel o CSV.',
        });
      }
    }

    try {
      const xlsx = await aXLSX(definicion.titulo, definicion.columnas, parte, subtitulo);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
      return res.status(200).send(xlsx);
    } catch (errorXlsx) {
      console.error('[informe XLSX]', errorXlsx.message);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      return res.status(200).send(aCSV(definicion.columnas, parte));
    }
  } catch (error) {
    console.error('[exportarInforme CU63]', error);
    return res.status(500).json({
      error: 'ERROR_INFORME',
      mensaje: 'No se pudo generar el informe.',
    });
  }
};

/**
 * Deja constancia de la extracción. Es la poscondición del CU63: leer
 * información sensible en bloque tiene que quedar registrado.
 */
exports.auditarDescarga = async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('EXPORTACION_INFORME', 'Reporte', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({
          tipo: req.params?.tipo,
          formato: req.query?.formato || 'XLSX',
          desde: req.query?.desde || null,
          hasta: req.query?.hasta || null,
          tomo: req.query?.tomo || 1,
        }),
        req.user?.usuario_id ?? null,
      ]
    );
  } catch (error) {
    console.error('[auditarDescarga CU63]', error.message);
  }
  next();
};
