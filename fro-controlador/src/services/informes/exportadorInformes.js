/**
 * Componente: C_Generador_Informes (puerta de entrada: src/componentes/C_Generador_Informes.js)
 * Casos de uso: CU63.
 *
 * CU63 — Exportación de los informes operativos en CSV, XLSX y PDF.
 *
 * Recibe las columnas y las filas ya calculadas por el panel de gestión y
 * devuelve el archivo listo para descargar. Antes vivía dentro de
 * gestionController; se separó para que el Generador de Informes del
 * Diagrama de Componentes tenga su propio código.
 */

// CU63 — Generando y exportando reportes operativos
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

// CU63 — Generando y exportando reportes operativos
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

// CU63 — Generando y exportando reportes operativos
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

module.exports = { aCSV, aXLSX, aPDF };
