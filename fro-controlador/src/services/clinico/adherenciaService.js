/**
 * CU44 — Índice de adherencia y curva de síntomas.
 *
 * La adherencia es una división simple: cuántas tareas ejecutó el paciente
 * sobre cuántas tenía programadas mientras su pauta estaba vigente. Lo que
 * tiene de delicado es el denominador, así que está escrito explícito:
 *
 *   · un ejercicio DIARIO programa una tarea por cada día de vigencia
 *     transcurrido (nunca días futuros: nadie está atrasado por no haber
 *     hecho lo de mañana);
 *   · un ejercicio SEMANAL programa una tarea por cada semana empezada.
 *
 * Las marcas fuera del periodo de vigencia no entran en el cálculo
 * (Excepción 1): la consulta las descarta por rango de fechas.
 */

const { leerParametroEntero } = require('../agenda/agendaService');
const { crearAlerta } = require('./alertaClinicaService');

/** Fecha AAAA-MM-DD de hoy en la hora de pared del servidor. */
function hoySQL() {
  const f = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
}

/**
 * Calcula la adherencia del paciente en un rango.
 *
 * @param {string|null} desde  AAAA-MM-DD; sin valor, toda la historia
 * @param {string|null} hasta  AAAA-MM-DD; sin valor, hoy
 * @returns {Promise<{porcentaje, programadas, cumplidas, ejercicios}>}
 * @throws  si la base no responde — quien llama decide qué mostrar (Exc.2)
 */
async function calcularAdherencia(conexion, pacienteId, { desde = null, hasta = null } = {}) {
  const tope = hasta || hoySQL();

  // Un ejercicio aporta tantas tareas como días (o semanas) de vigencia hayan
  // transcurrido dentro del rango consultado. DATEDIFF + 1 porque el día de
  // inicio también cuenta.
  const [filas] = await conexion.query(
    `SELECT
        pe.pauta_ejercicio_id,
        pe.nombre_ejercicio,
        pe.frecuencia,
        GREATEST(pt.fecha_inicio, COALESCE(?, pt.fecha_inicio))            AS inicio_efectivo,
        LEAST(pt.fecha_expiracion, ?)                                      AS fin_efectivo,
        (SELECT COUNT(*) FROM Pauta_Cumplimiento pc
          WHERE pc.pauta_ejercicio_id = pe.pauta_ejercicio_id
            AND pc.fecha BETWEEN GREATEST(pt.fecha_inicio, COALESCE(?, pt.fecha_inicio))
                             AND LEAST(pt.fecha_expiracion, ?))            AS cumplidas
       FROM Pauta_Ejercicio pe
       JOIN Pauta_Tratamiento pt ON pt.pauta_tratamiento_id = pe.pauta_tratamiento_id
       JOIN Episodio_Clinico ec ON ec.episodio_clinico_id = pt.episodio_clinico_id
      WHERE ec.paciente_id = ?
        AND pt.fecha_inicio <= ?`,
    [desde, tope, desde, tope, pacienteId, tope]
  );

  let programadas = 0;
  let cumplidas = 0;
  const ejercicios = [];

  for (const fila of filas) {
    const inicio = new Date(`${String(fila.inicio_efectivo).slice(0, 10)}T00:00:00`);
    const fin = new Date(`${String(fila.fin_efectivo).slice(0, 10)}T00:00:00`);
    const dias = Math.floor((fin - inicio) / 86400000) + 1;
    if (dias <= 0) continue;

    const esperadas =
      String(fila.frecuencia).toUpperCase() === 'SEMANAL' ? Math.ceil(dias / 7) : dias;
    // Una marca de más (por ejemplo, de una pauta que cambió de frecuencia) no
    // puede hacer que el paciente supere el 100%.
    const hechas = Math.min(Number(fila.cumplidas) || 0, esperadas);

    programadas += esperadas;
    cumplidas += hechas;
    ejercicios.push({
      pauta_ejercicio_id: fila.pauta_ejercicio_id,
      nombre: fila.nombre_ejercicio,
      frecuencia: fila.frecuencia,
      programadas: esperadas,
      cumplidas: hechas,
    });
  }

  return {
    porcentaje: programadas > 0 ? Math.round((cumplidas / programadas) * 100) : null,
    programadas,
    cumplidas,
    ejercicios,
  };
}

/** El último indicador guardado, para cuando el cálculo no se puede rehacer. */
async function ultimoIndicador(conexion, pacienteId) {
  try {
    const [[fila]] = await conexion.query(
      `SELECT porcentaje, tareas_programadas, tareas_cumplidas, fecha, momento_calculo
         FROM Indicador_Adherencia
        WHERE paciente_id = ?
        ORDER BY fecha DESC LIMIT 1`,
      [pacienteId]
    );
    return fila || null;
  } catch {
    return null;
  }
}

/**
 * Recalcula el índice del paciente, lo guarda como el dato de hoy y levanta
 * una alerta si cayó bajo el umbral (Excepción 4).
 *
 * Nunca lanza: si el cálculo no se puede hacer (Excepción 2), devuelve el
 * último porcentaje conocido marcado como suspendido, para que la app muestre
 * el valor previo en vez de un cero falso.
 */
async function actualizarIndicador(conexion, pacienteId) {
  let calculo;
  try {
    calculo = await calcularAdherencia(conexion, pacienteId);
  } catch (error) {
    console.error('[adherencia] cálculo suspendido:', error.message);
    const previo = await ultimoIndicador(conexion, pacienteId);
    return {
      porcentaje: previo?.porcentaje ?? null,
      programadas: previo?.tareas_programadas ?? 0,
      cumplidas: previo?.tareas_cumplidas ?? 0,
      suspendido: true,
      momento: previo?.momento_calculo || null,
    };
  }

  // Sin pauta asignada no hay nada que medir: no se guarda ni se alerta.
  if (calculo.porcentaje === null) {
    return { ...calculo, suspendido: false, sin_pautas: true };
  }

  try {
    await conexion.execute(
      `INSERT INTO Indicador_Adherencia
          (fecha, porcentaje, tareas_programadas, tareas_cumplidas, paciente_id)
       VALUES (CURDATE(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          porcentaje = VALUES(porcentaje),
          tareas_programadas = VALUES(tareas_programadas),
          tareas_cumplidas = VALUES(tareas_cumplidas)`,
      [calculo.porcentaje, calculo.programadas, calculo.cumplidas, pacienteId]
    );
  } catch (error) {
    // El indicador se pudo calcular aunque no se haya podido guardar: se
    // devuelve igual, y el día siguiente vuelve a intentarlo.
    console.error('[adherencia] no se pudo guardar el indicador:', error.message);
  }

  // Excepción 4: la caída bajo el umbral es un deterioro y va al panel del
  // profesional como bandera roja, igual que el reporte de síntomas (CU50).
  try {
    const umbral = await leerParametroEntero(conexion, 'UMBRAL_ADHERENCIA_CRITICA', 50);
    // Se exige un mínimo de tareas programadas: con dos días de pauta, un día
    // sin marcar ya daría 50% y sería una alerta sin sustento.
    const minimo = await leerParametroEntero(conexion, 'MINIMO_TAREAS_PARA_ALERTA_ADHERENCIA', 5);

    if (calculo.porcentaje < umbral && calculo.programadas >= minimo) {
      if (await debeAlertarAdherencia(conexion, pacienteId, calculo.porcentaje, umbral)) {
        await crearAlerta(conexion, {
          pacienteId,
          tipo: 'ADHERENCIA_BAJA',
          severidad: 'ALTA',
          motivo:
            `adherencia en ${calculo.porcentaje}% ` +
            `(${calculo.cumplidas} de ${calculo.programadas} tareas), bajo el umbral de ${umbral}%`,
          datos: { ...calculo, umbral },
        });
      }
    }
  } catch (error) {
    console.error('[adherencia] alerta no evaluada:', error.message);
  }

  return { ...calculo, suspendido: false };
}

/**
 * ¿Corresponde levantar una bandera de adherencia baja? El índice se recalcula
 * en muchas lecturas (abrir la ficha, marcar un ejercicio), así que:
 * - con una alerta ABIERTA no se crea otra (sería ruido en el panel);
 * - una alerta ya REVISADA por el profesional no se repite por el mismo cuadro:
 *   solo si la adherencia empeoró respecto de la revisada, o si el paciente se
 *   recuperó sobre el umbral y volvió a caer. Antes, abrir la ficha después de
 *   marcarla como revisada la hacía reaparecer en el inicio.
 */
async function debeAlertarAdherencia(conexion, pacienteId, porcentaje, umbral) {
  const [[ultima]] = await conexion.query(
    `SELECT alerta_clinica_id, estado, datos, momento_revision, momento_creacion
       FROM Alerta_Clinica
      WHERE paciente_id = ? AND tipo = 'ADHERENCIA_BAJA'
      ORDER BY alerta_clinica_id DESC LIMIT 1`,
    [pacienteId]
  );
  if (!ultima) return true;
  if (ultima.estado === 'ABIERTA') return false;

  let datos = ultima.datos;
  if (typeof datos === 'string') {
    try {
      datos = JSON.parse(datos);
    } catch {
      datos = {};
    }
  }
  const porcentajeRevisado = Number(datos?.porcentaje);
  if (Number.isFinite(porcentajeRevisado) && porcentaje < porcentajeRevisado) return true;

  const [[recuperado]] = await conexion.query(
    `SELECT 1 AS si FROM Indicador_Adherencia
      WHERE paciente_id = ? AND fecha >= DATE(?) AND porcentaje >= ?
      LIMIT 1`,
    [pacienteId, ultima.momento_revision || ultima.momento_creacion, umbral]
  );
  return Boolean(recuperado);
}

/** Serie diaria del índice, para el gráfico del CU45. */
async function serieAdherencia(conexion, pacienteId, { desde = null, hasta = null } = {}) {
  const [filas] = await conexion.query(
    `SELECT fecha, porcentaje
       FROM Indicador_Adherencia
      WHERE paciente_id = ?
        AND (? IS NULL OR fecha >= ?)
        AND (? IS NULL OR fecha <= ?)
      ORDER BY fecha ASC`,
    [pacienteId, desde, desde, hasta, hasta]
  );
  return filas;
}

module.exports = { calcularAdherencia, actualizarIndicador, serieAdherencia, ultimoIndicador, hoySQL, debeAlertarAdherencia };
