/**
 * CU50 — Alertas por deterioro clínico.
 *
 * El paciente reporta cómo va entre sesiones (dolor y limitación funcional).
 * El sistema compara ese reporte con sus umbrales y con el reporte anterior;
 * si la desviación supera el umbral, etiqueta el registro como riesgo crítico,
 * persiste la alerta y la deja en el panel del profesional (RF50).
 */

const { leerParametroEntero, notificarUsuario } = require('../agenda/agendaService');

/**
 * Decide si un reporte de síntomas constituye deterioro.
 *
 * @param {object} actual    { nivel_dolor, limitacion_funcional }
 * @param {object|null} anterior  el reporte previo del paciente, si existe
 * @param {object} umbrales  { dolorCritico, alzaDolor }
 * @returns {{critico: boolean, motivos: string[], severidad: string}}
 */
function evaluarDeterioro(actual, anterior, umbrales) {
  const motivos = [];

  if (actual.nivel_dolor >= umbrales.dolorCritico) {
    motivos.push(`dolor ${actual.nivel_dolor}/10 (umbral ${umbrales.dolorCritico})`);
  }

  if (anterior) {
    const alza = actual.nivel_dolor - anterior.nivel_dolor;
    if (alza >= umbrales.alzaDolor) {
      motivos.push(`el dolor subió ${alza} puntos desde el reporte anterior`);
    }
    const alzaLimitacion = actual.limitacion_funcional - anterior.limitacion_funcional;
    if (alzaLimitacion >= umbrales.alzaDolor) {
      motivos.push(`la limitación funcional subió ${alzaLimitacion} puntos`);
    }
  }

  // Excepción 2 del CU50: si la desviación no supera el umbral, la evolución se
  // clasifica como normal y no se genera ninguna etiqueta crítica.
  return {
    critico: motivos.length > 0,
    motivos,
    severidad: actual.nivel_dolor >= umbrales.dolorCritico ? 'CRITICA' : 'ALTA',
  };
}

/** Profesionales tratantes del paciente, para avisarles del deterioro. */
async function profesionalesDelPaciente(conexion, pacienteId) {
  const [filas] = await conexion.execute(
    `SELECT DISTINCT p.profesional_id, u.usuario_id
       FROM Profesional p
       JOIN Usuario u ON u.usuario_id = p.usuario_id
      WHERE p.profesional_id IN (
              SELECT ec.profesional_id FROM Episodio_Clinico ec
               WHERE ec.paciente_id = ?
                 AND (ec.estado IS NULL OR UPPER(ec.estado) <> 'CERRADO')
              UNION
              SELECT c.profesional_id FROM Cita c
               WHERE c.paciente_id = ?
                 AND c.estado NOT LIKE 'CANCELADA%'
            )`,
    [pacienteId, pacienteId]
  );
  return filas;
}

/**
 * Registra la alerta y avisa a los profesionales tratantes.
 *
 * Excepción 4 del CU50: si la alerta no se puede escribir, el reporte del
 * paciente NO se pierde (ya quedó guardado) y el fallo se anota; el paciente
 * recibe igual su acuse de recibo.
 */
async function crearAlerta(conexion, { pacienteId, tipo, severidad, motivo, datos, reporteSintomaId }) {
  try {
    const [resultado] = await conexion.execute(
      `INSERT INTO Alerta_Clinica
          (tipo, severidad, motivo, datos, paciente_id, reporte_sintoma_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tipo,
        severidad,
        String(motivo).slice(0, 255),
        JSON.stringify(datos || {}),
        pacienteId,
        reporteSintomaId || null,
      ]
    );

    const [[paciente]] = await conexion.execute(
      `SELECT COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
                CONCAT('Paciente #', pa.paciente_id)
              ) AS nombre
         FROM Paciente pa
         LEFT JOIN Usuario u ON u.usuario_id = pa.usuario_id
        WHERE pa.paciente_id = ? LIMIT 1`,
      [pacienteId]
    );

    // El texto del aviso depende de qué levantó la bandera: no es lo mismo un
    // reporte de síntomas que una pauta que el paciente dejó de cumplir.
    const encabezado =
      tipo === 'ADHERENCIA_BAJA'
        ? `${paciente?.nombre || 'Un paciente'} está dejando de cumplir su pauta`
        : `${paciente?.nombre || 'Un paciente'} reportó un deterioro`;

    const tratantes = await profesionalesDelPaciente(conexion, pacienteId);
    for (const tratante of tratantes) {
      await notificarUsuario(
        conexion,
        tratante.usuario_id,
        'ALERTA_DETERIORO',
        `${encabezado}: ${motivo}.`,
        {
          datos: { pantalla: 'DashboardProfesional', paciente_id: Number(pacienteId) },
          correo: {
            asunto: 'Bandera roja de un paciente - Punto Paz Salud',
            accion:
              '<p style="color:#23201C;font-size:15px;">Revisa el caso en la app, en tu panel de inicio, ' +
              'sección <b>Banderas rojas</b>.</p>',
          },
        }
      );
    }

    return resultado.insertId;
  } catch (error) {
    console.error('[crearAlerta CU50]', error.message);
    return null;
  }
}

/** Umbrales vigentes, editables por el administrador. */
async function umbralesVigentes(conexion) {
  return {
    dolorCritico: await leerParametroEntero(conexion, 'UMBRAL_DOLOR_CRITICO', 8),
    alzaDolor: await leerParametroEntero(conexion, 'UMBRAL_ALZA_DOLOR', 3),
  };
}

module.exports = { evaluarDeterioro, crearAlerta, umbralesVigentes, profesionalesDelPaciente };
