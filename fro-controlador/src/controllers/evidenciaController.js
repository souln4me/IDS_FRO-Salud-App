/**
 * Evidencia de atención (Incremento 2, bloque 6).
 * CU39: presencialidad por GPS cruzado en sesiones domiciliarias.
 * CU41: certificación multi-factor de la sesión (marcas + GPS cruzados).
 * CU42: firma manuscrita de conformidad (o rechazo / conformidad por correo).
 * CU43: evidencia técnica de teleconsulta (IP, latencia, segmentos).
 */

const pool = require('../config/database');
const { leerParametroEntero } = require('../services/agenda/agendaService');
const { enviarCorreo } = require('../services/notifications/otpService');
const { notificarUsuario } = require('../services/agenda/agendaService');

const DECLARACION_CONFORMIDAD = {
  version: '1.0',
  texto:
    'Declaro haber recibido la atención de salud agendada, en la fecha y ' +
    'modalidad indicadas, y estar en conocimiento de que esta firma quedará ' +
    'vinculada de forma permanente al registro de la sesión como respaldo de ' +
    'conformidad con el servicio prestado.',
};

/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
// Formato exigido por los requerimientos: DD/MM/AAAA HH:MM en 24 horas. Las
// fechas de la base ya son hora de pared chilena, asi que se imprimen tal cual.
function formatearFechaHoraCL(valor) {
  const m = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return String(valor || '');
  const p = (n) => String(n).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

function distanciaMetros(a, b) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function parsearJSON(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object') return valor;
  try { return JSON.parse(valor); } catch { return null; }
}

/** Cita a la que el usuario pertenece (como paciente o profesional). */
async function citaDelActor(citaId, usuarioId) {
  const [filas] = await pool.query(
    `SELECT c.*,
            (pac_u.usuario_id = ?) AS es_paciente,
            (prof_u.usuario_id = ?) AS es_profesional,
            pac_u.email AS email_paciente
       FROM Cita c
       JOIN Paciente pac ON pac.paciente_id = c.paciente_id
       JOIN Usuario pac_u ON pac_u.usuario_id = pac.usuario_id
       JOIN Profesional prof ON prof.profesional_id = c.profesional_id
       JOIN Usuario prof_u ON prof_u.usuario_id = prof.usuario_id
      WHERE c.cita_id = ? AND (pac_u.usuario_id = ? OR prof_u.usuario_id = ?)
      LIMIT 1`,
    [usuarioId, usuarioId, citaId, usuarioId, usuarioId]
  );
  return filas[0] || null;
}

async function auditar(req, accion, datos) {
  try {
    await pool.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES (?, 'Cita', ?, ?, ?)`,
      [accion, req.ip || null, JSON.stringify(datos), req.user?.usuario_id ?? null]
    );
  } catch (error) {
    console.error(`[auditar ${accion}]`, error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU39 — Check-in GPS
//  POST /citas/:id/checkin-gps   { latitud, longitud, momento: 'INICIO'|'TERMINO' }
// ─────────────────────────────────────────────────────────────────────────────

exports.checkinGPS = async (req, res) => {
  const { id } = req.params;
  const latitud = Number(req.body?.latitud);
  const longitud = Number(req.body?.longitud);
  const momento = req.body?.momento === 'TERMINO' ? 'TERMINO' : 'INICIO';

  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    return res.status(400).json({
      error: 'COORDENADAS_INVALIDAS',
      mensaje: 'No llegaron coordenadas GPS válidas. Revisa que la ubicación esté activada.',
    });
  }

  try {
    const cita = await citaDelActor(id, req.user.usuario_id);
    if (!cita) {
      return res.status(404).json({ error: 'La cita no existe o no participas en ella.' });
    }
    if (!['CONFIRMADA', 'EN_CURSO'].includes(cita.estado)) {
      return res.status(409).json({
        error: 'CITA_NO_HABILITADA',
        mensaje: 'El check-in GPS solo aplica a citas confirmadas o en curso.',
      });
    }

    const rol = cita.es_paciente ? 'paciente' : 'profesional';
    const evidencia = parsearJSON(cita.evidencia_presencial) || {};
    evidencia[rol] = evidencia[rol] || {};

    const marca = { lat: latitud, lng: longitud, momento_registro: new Date().toISOString() };
    const radio = await leerParametroEntero(pool, 'RADIO_PRESENCIALIDAD_METROS', 200);

    // Validación cruzada: la referencia es la marca equivalente del otro actor.
    const otro = rol === 'paciente' ? 'profesional' : 'paciente';
    const marcaOtro = evidencia[otro]?.[momento.toLowerCase()];
    let distancia = null;

    if (marcaOtro) {
      distancia = distanciaMetros(marca, marcaOtro);

      if (momento === 'INICIO' && distancia > radio) {
        // Excepción 2: sin coincidencia geográfica no hay validación presencial.
        await auditar(req, 'PRESENCIALIDAD_NO_COINCIDENTE', {
          cita_id: Number(id), rol, distancia_metros: distancia, radio_metros: radio,
        });
        return res.status(409).json({
          error: 'PRESENCIALIDAD_NO_COINCIDENTE',
          mensaje: `Los dispositivos están a ${distancia} m de distancia (máximo ${radio} m). Verifiquen que ambos estén en el domicilio registrado.`,
          distancia_metros: distancia,
        });
      }

      if (momento === 'TERMINO' && rol === 'profesional' && distancia > radio) {
        // Excepción 4: el profesional abandonó el radio antes del término.
        // Se guarda igual, pero con bandera roja de auditoría.
        await auditar(req, 'BANDERA_FUGA_RADIO', {
          cita_id: Number(id), distancia_metros: distancia, radio_metros: radio,
        });
      }
    }

    evidencia[rol][momento.toLowerCase()] = marca;

    // Compatibilidad con el modelo original: el par lat,lng del inicio.
    const columnaLegacy = rol === 'paciente' ? 'coordenadas_gps_paciente' : 'coordenadas_gps_profesional';
    await pool.query(
      `UPDATE Cita SET evidencia_presencial = ?${momento === 'INICIO' ? `, ${columnaLegacy} = ?` : ''}
        WHERE cita_id = ?`,
      momento === 'INICIO'
        ? [JSON.stringify(evidencia), `${latitud.toFixed(6)},${longitud.toFixed(6)}`, id]
        : [JSON.stringify(evidencia), id]
    );

    await auditar(req, 'CHECKIN_GPS', {
      cita_id: Number(id), rol, momento, distancia_metros: distancia,
    });

    return res.status(200).json({
      mensaje:
        distancia === null
          ? `Check-in de ${momento.toLowerCase()} registrado. Falta la marca del otro participante para la validación cruzada.`
          : distancia <= radio
            ? `Check-in registrado y validado: ${distancia} m de distancia entre dispositivos.`
            : `Check-in registrado con bandera de auditoría: ${distancia} m de distancia (máximo ${radio} m).`,
      momento,
      distancia_metros: distancia,
      radio_metros: radio,
    });
  } catch (error) {
    console.error('[checkinGPS]', error);
    return res.status(500).json({ error: 'Error interno al registrar el check-in.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU43 — Evidencia técnica de teleconsulta
//  POST /citas/:id/evidencia-teleconsulta
//  { evento: 'INICIO'|'RECONEXION'|'TERMINO', latencia_ms, dispositivo, permisos }
// ─────────────────────────────────────────────────────────────────────────────

exports.registrarEvidenciaTeleconsulta = async (req, res) => {
  const { id } = req.params;
  const evento = ['INICIO', 'RECONEXION', 'TERMINO'].includes(req.body?.evento)
    ? req.body.evento
    : 'INICIO';

  try {
    const cita = await citaDelActor(id, req.user.usuario_id);
    if (!cita) {
      return res.status(404).json({ error: 'La cita no existe o no participas en ella.' });
    }

    const rol = cita.es_paciente ? 'paciente' : 'profesional';
    const metadatos = parsearJSON(cita.metadatos_teleconsulta) || { segmentos: [] };
    metadatos.segmentos = metadatos.segmentos || [];

    // Excepción 2: cada reconexión queda como un segmento corto adicional.
    metadatos.segmentos.push({
      evento,
      rol,
      ip: req.ip || null,
      latencia_ms: Number(req.body?.latencia_ms) || null,
      dispositivo: String(req.body?.dispositivo || '').slice(0, 80) || null,
      permisos: req.body?.permisos || null,
      momento: new Date().toISOString(),
    });

    await pool.query(
      `UPDATE Cita SET metadatos_teleconsulta = ? WHERE cita_id = ?`,
      [JSON.stringify(metadatos), id]
    );

    await auditar(req, 'EVIDENCIA_TELECONSULTA', {
      cita_id: Number(id), rol, evento, segmentos: metadatos.segmentos.length,
    });

    return res.status(200).json({
      mensaje: `Evidencia de ${evento.toLowerCase()} registrada.`,
      segmentos: metadatos.segmentos.length,
    });
  } catch (error) {
    console.error('[registrarEvidenciaTeleconsulta]', error);
    // Excepción 4: la app guarda un respaldo local y reintenta después.
    return res.status(500).json({
      error: 'PERSISTENCIA_FALLIDA',
      mensaje: 'No se pudo guardar la evidencia. Se reintentará automáticamente.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Resumen de evidencia de una cita
//  GET /citas/:id/evidencia
// ─────────────────────────────────────────────────────────────────────────────

exports.resumenEvidencia = async (req, res) => {
  const { id } = req.params;
  try {
    const cita = await citaDelActor(id, req.user.usuario_id);
    if (!cita) {
      return res.status(404).json({ error: 'La cita no existe o no participas en ella.' });
    }

    return res.status(200).json({
      cita_id: cita.cita_id,
      estado: cita.estado,
      modalidad: cita.modalidad,
      checkin_profesional: cita.checkin_profesional,
      checkin_paciente: cita.checkin_paciente,
      evidencia_presencial: parsearJSON(cita.evidencia_presencial),
      metadatos_teleconsulta: parsearJSON(cita.metadatos_teleconsulta),
      firma: parsearJSON(cita.firma_conformidad_datos),
    });
  } catch (error) {
    console.error('[resumenEvidencia]', error);
    return res.status(500).json({ error: 'Error interno al consultar la evidencia.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU41 Exc.2 (D11) — Derivación al Administrador
//  La sesión suspendida queda marcada en la cita y cada administrador recibe
//  un aviso en la app y por correo con los datos de contacto de ambas partes,
//  para que pueda resolver la discrepancia fuera del sistema.
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_CONTACTOS_CITA = `
  SELECT c.cita_id, c.fecha_hora_inicio, c.modalidad, c.sesion_suspendida_en, c.motivo_suspension,
         c.sesion_certificada_en, c.certificacion_tipo,
         CONCAT(up.nombres, ' ', up.apellido_paterno, ' ', up.apellido_materno) AS paciente_nombre,
         up.rut AS paciente_rut, up.email AS paciente_email,
         (SELECT GROUP_CONCAT(t.telefono SEPARATOR ' / ') FROM Usuario_Telefono t WHERE t.usuario_id = up.usuario_id) AS paciente_telefono,
         CONCAT(uf.nombres, ' ', uf.apellido_paterno, ' ', uf.apellido_materno) AS profesional_nombre,
         uf.rut AS profesional_rut, uf.email AS profesional_email,
         (SELECT GROUP_CONCAT(t.telefono SEPARATOR ' / ') FROM Usuario_Telefono t WHERE t.usuario_id = uf.usuario_id) AS profesional_telefono,
         e.nombre AS especialidad
    FROM Cita c
    JOIN Paciente pa ON pa.paciente_id = c.paciente_id
    JOIN Usuario up ON up.usuario_id = pa.usuario_id
    JOIN Profesional pr ON pr.profesional_id = c.profesional_id
    JOIN Usuario uf ON uf.usuario_id = pr.usuario_id
    LEFT JOIN Especialidad e ON e.especialidad_id = pr.especialidad_id`;

async function derivarAAdministracion(req, citaId, fallidos) {
  const factores = fallidos.map((f) => f.factor);
  await pool.query(
    `UPDATE Cita SET sesion_suspendida_en = NOW(), motivo_suspension = ? WHERE cita_id = ?`,
    [JSON.stringify({ factores, derivado_por: req.user?.usuario_id ?? null }), citaId]
  );

  const [[contactos]] = await pool.query(`${SELECT_CONTACTOS_CITA} WHERE c.cita_id = ? LIMIT 1`, [citaId]);
  const [administradores] = await pool.query(
    `SELECT u.usuario_id, u.email FROM Usuario u
       JOIN Rol r ON r.rol_id = u.rol_id
      WHERE r.nombre_rol = 'Administrador' AND u.cuenta_activo = TRUE`
  );

  const tel = (valor) => (valor ? `, ${valor}` : '');
  const resumen =
    `Sesión #${citaId} del ${formatearFechaHoraCL(contactos?.fecha_hora_inicio)} suspendida por discrepancias: ` +
    `${factores.join('; ')}. Paciente: ${contactos?.paciente_nombre} (${contactos?.paciente_email}${tel(contactos?.paciente_telefono)}). ` +
    `Profesional: ${contactos?.profesional_nombre} (${contactos?.profesional_email}${tel(contactos?.profesional_telefono)}).`;

  const html =
    `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
       <h2 style="color:#004639">Sesión derivada a revisión</h2>
       <p>La validación multi-factor de la sesión <b>#${citaId}</b> (${formatearFechaHoraCL(contactos?.fecha_hora_inicio)}) fue suspendida.</p>
       <p><b>Discrepancias:</b></p><ul>${factores.map((f) => `<li>${f}</li>`).join('')}</ul>
       <p><b>Paciente:</b> ${contactos?.paciente_nombre} · RUT ${contactos?.paciente_rut}<br>
          ${contactos?.paciente_email}${contactos?.paciente_telefono ? ' · ' + contactos.paciente_telefono : ''}</p>
       <p><b>Profesional:</b> ${contactos?.profesional_nombre} (${contactos?.especialidad || 'sin especialidad'}) · RUT ${contactos?.profesional_rut}<br>
          ${contactos?.profesional_email}${contactos?.profesional_telefono ? ' · ' + contactos.profesional_telefono : ''}</p>
       <p style="color:#475569">Revisa el caso en el panel de administración, sección "Sesiones suspendidas".</p>
     </div>`;

  for (const admin of administradores) {
    await notificarUsuario(pool, admin.usuario_id, 'SESION_SUSPENDIDA', resumen);
    // El correo es mejor esfuerzo: sin proveedor configurado, queda el aviso en la app.
    enviarCorreo(admin.email, `Sesión #${citaId} derivada a revisión - Fro Salud`, html).catch((error) => {
      console.error('[derivarAAdministracion] correo no enviado:', error.message);
    });
  }
  return administradores.length;
}

/** GET /citas/sesiones-suspendidas — bandeja del Administrador (D11). */
exports.sesionesSuspendidas = async (_req, res) => {
  try {
    const [filas] = await pool.query(
      `${SELECT_CONTACTOS_CITA}
        WHERE c.sesion_suspendida_en IS NOT NULL
        ORDER BY (c.sesion_certificada_en IS NULL) DESC, c.sesion_suspendida_en DESC`
    );
    return res.status(200).json({
      sesiones: filas.map((f) => ({
        ...f,
        motivo_suspension: parsearJSON(f.motivo_suspension),
        // Si después se certificó (cierre manual), la derivación quedó resuelta.
        resuelta: Boolean(f.sesion_certificada_en),
      })),
    });
  } catch (error) {
    console.error('[sesionesSuspendidas]', error);
    return res.status(500).json({ error: 'No se pudo consultar las sesiones suspendidas.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU41 — Validación multi-factor de la sesión
//  POST /citas/:id/validar-sesion   { confirmar, cierre_manual, justificacion }
// ─────────────────────────────────────────────────────────────────────────────

exports.validarSesion = async (req, res) => {
  const { id } = req.params;
  const cierreManual = Boolean(req.body?.cierre_manual);
  const confirmar = Boolean(req.body?.confirmar);
  const justificacion = String(req.body?.justificacion || '').trim();

  try {
    const cita = await citaDelActor(id, req.user.usuario_id);
    if (!cita || !cita.es_profesional) {
      return res.status(404).json({ error: 'La cita no existe o no eres su profesional.' });
    }
    if (cita.estado !== 'REALIZADA') {
      return res.status(409).json({
        error: 'CITA_NO_FINALIZADA',
        mensaje: 'Primero finaliza la atención; la certificación multi-factor cierra sesiones ya realizadas.',
      });
    }

    // Una sesión se certifica una sola vez. Antes la certificación quedaba
    // solo en la bitácora, así que ni la app ni este endpoint sabían que ya
    // estaba hecha y el botón "Validar sesión" seguía apareciendo.
    const [[yaCertificada]] = await pool.query(
      `SELECT sesion_certificada_en, certificacion_tipo FROM Cita WHERE cita_id = ? LIMIT 1`,
      [id]
    );
    if (yaCertificada?.sesion_certificada_en) {
      return res.status(409).json({
        error: 'SESION_YA_CERTIFICADA',
        certificada: true,
        sesion_certificada_en: yaCertificada.sesion_certificada_en,
        certificacion_tipo: yaCertificada.certificacion_tipo,
        mensaje: 'Esta sesión ya fue validada; no se puede certificar dos veces.',
      });
    }

    const evidencia = parsearJSON(cita.evidencia_presencial) || {};
    const tolerancia = await leerParametroEntero(pool, 'TOLERANCIA_MULTIFACTOR_MINUTOS', 15);
    const radio = await leerParametroEntero(pool, 'RADIO_PRESENCIALIDAD_METROS', 200);

    // ── Análisis cruzado de factores ──
    const factores = [];

    factores.push({
      factor: 'Marca temporal del profesional (inicio de atención)',
      ok: Boolean(cita.checkin_profesional),
    });

    const marcaPaciente = evidencia.paciente?.inicio || null;
    factores.push({
      factor: 'Marca de presencia del paciente',
      ok: Boolean(marcaPaciente || cita.checkin_paciente),
    });

    let diferenciaMin = null;
    if (cita.checkin_profesional && marcaPaciente?.momento_registro) {
      diferenciaMin = Math.abs(
        new Date(cita.checkin_profesional).getTime() -
          new Date(marcaPaciente.momento_registro).getTime()
      ) / 60000;
      factores.push({
        factor: `Diferencia entre marcas ≤ ${tolerancia} min (fue ${Math.round(diferenciaMin)} min)`,
        ok: diferenciaMin <= tolerancia,
      });
    }

    if (cita.modalidad === 'DOMICILIO' || (evidencia.paciente && evidencia.profesional)) {
      const a = evidencia.paciente?.inicio;
      const b = evidencia.profesional?.inicio;
      if (a && b) {
        const distancia = distanciaMetros(a, b);
        factores.push({
          factor: `Coordenadas GPS coincidentes ≤ ${radio} m (fue ${distancia} m)`,
          ok: distancia <= radio,
        });
      } else {
        factores.push({ factor: 'Coordenadas GPS de ambos actores', ok: false });
      }
    }

    const fallidos = factores.filter((f) => !f.ok);
    const faltaTerminoPaciente = !evidencia.paciente?.termino;

    // Excepción 1: sin término del paciente, se exige cierre manual justificado.
    if (faltaTerminoPaciente && !cierreManual) {
      return res.status(200).json({
        certificada: false,
        requiere_cierre_manual: true,
        factores,
        mensaje:
          'El paciente no emitió su marca de término. Puedes ejecutar un cierre manual justificado.',
      });
    }
    if (cierreManual && !justificacion) {
      return res.status(400).json({
        error: 'JUSTIFICACION_REQUERIDA',
        mensaje: 'El cierre manual requiere una justificación.',
      });
    }

    // Excepción 2: discrepancias críticas suspenden la validación y el caso
    // se deriva al Administrador (D11).
    if (fallidos.length > 0 && !cierreManual) {
      await auditar(req, 'SESION_SUSPENDIDA', {
        cita_id: Number(id), factores_fallidos: fallidos.map((f) => f.factor),
      });
      let administradoresAvisados = 0;
      try {
        administradoresAvisados = await derivarAAdministracion(req, id, fallidos);
      } catch (errorDerivacion) {
        console.error('[validarSesion] derivación fallida:', errorDerivacion.message);
      }
      return res.status(409).json({
        error: 'VALIDACION_SUSPENDIDA',
        certificada: false,
        factores,
        administradores_avisados: administradoresAvisados,
        mensaje:
          'Se detectaron discrepancias críticas entre los factores. La sesión quedó suspendida y fue derivada al Administrador para su revisión.',
      });
    }

    // Excepción 3: sin confirmación explícita, nada se persiste todavía.
    if (!confirmar) {
      return res.status(200).json({
        certificada: false,
        resumen_pendiente: true,
        factores,
        mensaje: 'Revisa el resumen de factores y confirma para certificar la sesión.',
      });
    }

    // Persistir en la cita (la bitácora sigue guardando el detalle de factores).
    await pool.query(
      `UPDATE Cita SET sesion_certificada_en = NOW(), certificacion_tipo = ? WHERE cita_id = ?`,
      [cierreManual ? 'MANUAL' : 'MULTIFACTOR', id]
    );

    await auditar(req, cierreManual ? 'SESION_CERTIFICADA_MANUAL' : 'SESION_CERTIFICADA', {
      cita_id: Number(id),
      factores,
      justificacion: cierreManual ? justificacion : null,
    });

    return res.status(200).json({
      certificada: true,
      factores,
      mensaje: cierreManual
        ? 'Sesión certificada mediante cierre manual auditado.'
        : 'Sesión certificada: todos los factores coinciden. Queda lista para procesos de reembolso.',
    });
  } catch (error) {
    console.error('[validarSesion]', error);
    // Excepción 4: fallo de escritura → el cliente reintenta en segundo plano.
    return res.status(500).json({
      error: 'CIERRE_ENCOLADO',
      mensaje: 'No se pudo guardar el cierre. Quedó encolado: reintenta en unos minutos.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU42 — Firma manuscrita de conformidad
// ─────────────────────────────────────────────────────────────────────────────

/** GET /citas/:id/declaracion-conformidad — Exc.2: sin texto legal, sin lienzo. */
exports.declaracionConformidad = (_req, res) => {
  return res.status(200).json(DECLARACION_CONFORMIDAD);
};

/**
 * POST /citas/:id/firma
 * { trazos: [[{x,y}...]] }  ó  { rechazo: 'motivo' }  ó  { por_correo: true }
 */
exports.guardarFirma = async (req, res) => {
  const { id } = req.params;
  const { trazos, rechazo, por_correo } = req.body || {};

  try {
    const cita = await citaDelActor(id, req.user.usuario_id);
    if (!cita || !cita.es_profesional) {
      return res.status(404).json({ error: 'La cita no existe o no eres su profesional.' });
    }
    if (!['EN_CURSO', 'REALIZADA'].includes(cita.estado)) {
      return res.status(409).json({
        error: 'CITA_NO_HABILITADA',
        mensaje: 'La firma de conformidad se captura al término de la atención.',
      });
    }

    const firmaPrevia = parsearJSON(cita.firma_conformidad_datos);
    if (firmaPrevia?.tipo === 'FIRMA') {
      return res.status(409).json({
        error: 'FIRMA_YA_REGISTRADA',
        mensaje: 'Esta sesión ya tiene una firma de conformidad registrada.',
      });
    }

    let registro;

    if (por_correo) {
      // Excepción 1: sin pantalla táctil, validación por correo electrónico.
      registro = {
        tipo: 'CONFORMIDAD_POR_CORREO',
        declaracion_version: DECLARACION_CONFORMIDAD.version,
        momento: new Date().toISOString(),
      };
      try {
        await enviarCorreo(
          cita.email_paciente,
          'Conformidad de atención - Fro Salud',
          `<div style="font-family:sans-serif;max-width:460px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px;">
             <h2 style="color:#0f172a">Conformidad de atención</h2>
             <p style="color:#475569">${DECLARACION_CONFORMIDAD.texto}</p>
             <p style="color:#475569">Si NO estás de acuerdo con esta declaración sobre tu atención del
             ${formatearFechaHoraCL(cita.fecha_hora_inicio)}, responde este correo indicándolo.</p>
           </div>`
        );
      } catch (errorCorreo) {
        return res.status(502).json({
          error: 'CORREO_FALLIDO',
          mensaje: 'No se pudo enviar el correo de conformidad. Intenta nuevamente.',
        });
      }
    } else if (rechazo !== undefined) {
      // Excepción 3: el paciente rechaza firmar; queda la observación.
      const motivo = String(rechazo || '').trim();
      if (!motivo) {
        return res.status(400).json({
          error: 'OBSERVACION_REQUERIDA',
          mensaje: 'Registra la justificación del rechazo de firma.',
        });
      }
      registro = {
        tipo: 'RECHAZO',
        observacion: motivo.slice(0, 255),
        declaracion_version: DECLARACION_CONFORMIDAD.version,
        momento: new Date().toISOString(),
      };
    } else {
      // Excepción 4: un trazo vacío no constituye firma.
      const trazosValidos =
        Array.isArray(trazos) &&
        trazos.some((t) => Array.isArray(t) && t.length >= 2);
      if (!trazosValidos) {
        return res.status(400).json({
          error: 'TRAZO_VACIO',
          mensaje: 'El lienzo está vacío. Pide al paciente dibujar su firma nuevamente.',
        });
      }
      const totalPuntos = trazos.reduce((n, t) => n + t.length, 0);
      registro = {
        tipo: 'FIRMA',
        trazos,
        puntos: totalPuntos,
        declaracion_version: DECLARACION_CONFORMIDAD.version,
        momento: new Date().toISOString(),
      };
    }

    await pool.query(
      `UPDATE Cita SET firma_conformidad_datos = ? WHERE cita_id = ?`,
      [JSON.stringify(registro), id]
    );

    await auditar(req, `CONFORMIDAD_${registro.tipo}`, { cita_id: Number(id) });

    const mensajes = {
      FIRMA: 'Firma registrada y vinculada de forma permanente a la sesión.',
      RECHAZO: 'Rechazo de firma registrado con su justificación.',
      CONFORMIDAD_POR_CORREO: `Correo de conformidad enviado a ${cita.email_paciente}.`,
    };

    return res.status(201).json({ mensaje: mensajes[registro.tipo], tipo: registro.tipo });
  } catch (error) {
    console.error('[guardarFirma]', error);
    return res.status(500).json({ error: 'Error interno al guardar la conformidad.' });
  }
};
