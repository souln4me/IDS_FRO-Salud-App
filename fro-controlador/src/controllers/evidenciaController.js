/**
 * Componente: C_API_REST
 * Casos de uso: CU39, CU41, CU42, CU43, CU52, CU13.
 *
 * Evidencia de atención (Incremento 2, bloque 6).
 * CU39: presencialidad por GPS cruzado en sesiones domiciliarias.
 * CU41: certificación multi-factor de la sesión (marcas + GPS cruzados).
 * CU42: firma manuscrita de conformidad (o rechazo / conformidad por correo).
 * CU43: evidencia técnica de teleconsulta (IP, latencia, segmentos).
 */

const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');
const C_API_Adapter = require('../componentes/C_API_Adapter');
const C_Despachador_Notificaciones = require('../componentes/C_Despachador_Notificaciones');
const C_Validador_Presencialidad = require('../componentes/C_Validador_Presencialidad');

// CU42: texto legal que firma el paciente
const DECLARACION_CONFORMIDAD = {
  version: '1.0',
  texto:
    'Declaro haber recibido la atención de salud agendada, en la fecha y ' +
    'modalidad indicadas, y estar en conocimiento de que esta firma quedará ' +
    'vinculada de forma permanente al registro de la sesión como respaldo de ' +
    'conformidad con el servicio prestado.',
};

/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
// Apoyo común: fecha DD/MM/AAAA HH:MM para avisos y correos
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

// Distancia y lectura de la evidencia viven en el servicio de presencialidad,
// que también usan el inicio y el término automáticos de la atención (CU38).

/**
 * CU39, CU41, CU42, CU43 — la cita debe ser del paciente o profesional con sesión
 * Cita a la que el usuario pertenece (como paciente o profesional).
 */
async function citaDelActor(citaId, usuarioId) {
  const [filas] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU13 — Registrando bitácora de auditoría de seguridad
async function auditar(req, accion, datos) {
  try {
    await C_Capa_de_Acceso_a_Datos.query(
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

// CU39 — Validando presencialidad mediante coordenadas GPS
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
    const evidencia = C_Validador_Presencialidad.parsearJSON(cita.evidencia_presencial) || {};
    evidencia[rol] = evidencia[rol] || {};

    const marca = { lat: latitud, lng: longitud, momento_registro: new Date().toISOString() };
    const radio = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'RADIO_PRESENCIALIDAD_METROS', 200);

    // Validación cruzada: la referencia es la marca equivalente del otro actor.
    const otro = rol === 'paciente' ? 'profesional' : 'paciente';
    const marcaOtro = evidencia[otro]?.[momento.toLowerCase()];
    let distancia = null;

    if (marcaOtro) {
      distancia = C_Validador_Presencialidad.distanciaMetros(marca, marcaOtro);

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
    await C_Capa_de_Acceso_a_Datos.query(
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

// CU43 — Registrando evidencia técnica de teleconsulta
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
    const metadatos = C_Validador_Presencialidad.parsearJSON(cita.metadatos_teleconsulta) || { segmentos: [] };
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

    await C_Capa_de_Acceso_a_Datos.query(
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

// CU39, CU41, CU42, CU43 — GPS, certificación, firma y teleconsulta de la cita
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
      evidencia_presencial: C_Validador_Presencialidad.parsearJSON(cita.evidencia_presencial),
      metadatos_teleconsulta: C_Validador_Presencialidad.parsearJSON(cita.metadatos_teleconsulta),
      firma: C_Validador_Presencialidad.parsearJSON(cita.firma_conformidad_datos),
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

// CU41 Exc. 2: datos de contacto de ambas partes para el Administrador
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

// CU41 — Validando sesión mediante protocolo multi-factor
async function derivarAAdministracion(req, citaId, fallidos) {
  const factores = fallidos.map((f) => f.factor);
  await C_Capa_de_Acceso_a_Datos.query(
    `UPDATE Cita SET sesion_suspendida_en = NOW(), motivo_suspension = ? WHERE cita_id = ?`,
    [JSON.stringify({ factores, derivado_por: req.user?.usuario_id ?? null }), citaId]
  );

  const [[contactos]] = await C_Capa_de_Acceso_a_Datos.query(`${SELECT_CONTACTOS_CITA} WHERE c.cita_id = ? LIMIT 1`, [citaId]);
  const [administradores] = await C_Capa_de_Acceso_a_Datos.query(
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
       <h2 style="color:#003B4D">Sesión derivada a revisión</h2>
       <p>La validación multi-factor de la sesión <b>#${citaId}</b> (${formatearFechaHoraCL(contactos?.fecha_hora_inicio)}) fue suspendida.</p>
       <p><b>Discrepancias:</b></p><ul>${factores.map((f) => `<li>${f}</li>`).join('')}</ul>
       <p><b>Paciente:</b> ${contactos?.paciente_nombre} · RUT ${contactos?.paciente_rut}<br>
          ${contactos?.paciente_email}${contactos?.paciente_telefono ? ' · ' + contactos.paciente_telefono : ''}</p>
       <p><b>Profesional:</b> ${contactos?.profesional_nombre} (${contactos?.especialidad || 'sin especialidad'}) · RUT ${contactos?.profesional_rut}<br>
          ${contactos?.profesional_email}${contactos?.profesional_telefono ? ' · ' + contactos.profesional_telefono : ''}</p>
       <p style="color:#475569">Revisa el caso en el panel de administración, sección "Sesiones suspendidas".</p>
     </div>`;

  // CU52: aviso en la app y por correo a cada administrador
  for (const admin of administradores) {
    await C_Despachador_Notificaciones.notificarUsuario(C_Capa_de_Acceso_a_Datos, admin.usuario_id, 'SESION_SUSPENDIDA', resumen);
    // El correo es mejor esfuerzo: sin proveedor configurado, queda el aviso en la app.
    C_API_Adapter.enviarCorreo(admin.email, `Sesión #${citaId} derivada a revisión - Punto Paz Salud`, html).catch((error) => {
      console.error('[derivarAAdministracion] correo no enviado:', error.message);
    });
  }
  return administradores.length;
}

/**
 * CU41 — Validando sesión mediante protocolo multi-factor
 * GET /citas/sesiones-suspendidas — bandeja del Administrador (D11).
 */
exports.sesionesSuspendidas = async (_req, res) => {
  try {
    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
      `${SELECT_CONTACTOS_CITA}
        WHERE c.sesion_suspendida_en IS NOT NULL
        ORDER BY (c.sesion_certificada_en IS NULL) DESC, c.sesion_suspendida_en DESC`
    );
    return res.status(200).json({
      sesiones: filas.map((f) => ({
        ...f,
        motivo_suspension: C_Validador_Presencialidad.parsearJSON(f.motivo_suspension),
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

/**
 * CU41 — Validando sesión mediante protocolo multi-factor
 * Certificación automática al finalizar la atención (CU41). Si todos los
 * factores cuadran, la sesión queda certificada como MULTIFACTOR sin pasos
 * extra. Si estaban lejos, se deriva al Administrador (D11). En ambos casos
 * de falla el profesional puede cerrar con justificación.
 */
exports.certificarAlFinalizar = async (req, citaId) => {
  const [[cita]] = await C_Capa_de_Acceso_a_Datos.query(`SELECT * FROM Cita WHERE cita_id = ? LIMIT 1`, [citaId]);
  if (!cita || cita.sesion_certificada_en) return { certificada: Boolean(cita?.sesion_certificada_en), factores: [] };
  const radio = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'RADIO_PRESENCIALIDAD_METROS', 100);
  const factores = C_Validador_Presencialidad.analizarFactores(cita, radio);
  const fallidos = factores.filter((f) => !f.ok);

  if (fallidos.length === 0) {
    await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Cita SET sesion_certificada_en = NOW(), certificacion_tipo = 'MULTIFACTOR' WHERE cita_id = ?`,
      [citaId]
    );
    await auditar(req, 'SESION_CERTIFICADA', { cita_id: Number(citaId), factores, automatica: true });
    return { certificada: true, factores };
  }

  let administradoresAvisados = 0;
  if (fallidos.some((f) => f.clave === 'DISTANCIA')) {
    await auditar(req, 'SESION_SUSPENDIDA', { cita_id: Number(citaId), factores_fallidos: fallidos.map((f) => f.factor) });
    administradoresAvisados = await derivarAAdministracion(req, citaId, fallidos).catch((e) => {
      console.error('[certificarAlFinalizar] derivación fallida:', e.message);
      return 0;
    });
  }
  return { certificada: false, requiere_cierre_manual: true, factores, administradores_avisados: administradoresAvisados };
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU39 — Ubicación del paciente, enviada sola por su app
//  GET  /citas/ubicacion-pendiente   → citas a domicilio de hoy que la necesitan
//  POST /citas/:id/ubicacion         { latitud, longitud }
//  El paciente no aprieta nada: la app la envía al abrirse el día de la visita,
//  y el profesional la usa al comenzar y finalizar la atención.
// ─────────────────────────────────────────────────────────────────────────────

// CU39 — Validando presencialidad mediante coordenadas GPS
exports.ubicacionPendiente = async (req, res) => {
  try {
    const [citas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT c.cita_id, c.fecha_hora_inicio, c.estado
         FROM Cita c JOIN Paciente pa ON pa.paciente_id = c.paciente_id
        WHERE pa.usuario_id = ? AND c.modalidad = 'DOMICILIO'
          AND (c.estado = 'EN_CURSO'
               OR (c.estado IN ('AGENDADA', 'CONFIRMADA')
                   AND c.fecha_hora_inicio BETWEEN NOW() - INTERVAL 3 HOUR AND NOW() + INTERVAL 2 HOUR))
        ORDER BY c.fecha_hora_inicio`,
      [req.user.usuario_id]
    );
    return res.json({ citas });
  } catch (error) {
    console.error('[ubicacionPendiente]', error);
    return res.status(500).json({ error: 'No se pudo consultar tus visitas de hoy.' });
  }
};

// CU39 — Validando presencialidad mediante coordenadas GPS
exports.reportarUbicacion = async (req, res) => {
  const punto = C_Validador_Presencialidad.coordenadas(req.body);
  if (!punto) return res.status(400).json({ error: 'COORDENADAS_INVALIDAS' });
  try {
    const cita = await citaDelActor(req.params.id, req.user.usuario_id);
    if (!cita || !Number(cita.es_paciente)) return res.status(404).json({ error: 'La cita no existe o no es tuya.' });
    if (cita.modalidad !== 'DOMICILIO' || !['AGENDADA', 'CONFIRMADA', 'EN_CURSO'].includes(cita.estado)) {
      return res.status(409).json({ error: 'CITA_NO_HABILITADA', mensaje: 'Solo se registra la ubicación de visitas a domicilio por realizar.' });
    }
    await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Cita SET evidencia_presencial = JSON_SET(COALESCE(evidencia_presencial, JSON_OBJECT()),
              '$.paciente', JSON_MERGE_PATCH(COALESCE(JSON_EXTRACT(evidencia_presencial, '$.paciente'), JSON_OBJECT()),
                                             JSON_OBJECT('ultima', CAST(? AS JSON))))
        WHERE cita_id = ?`,
      [JSON.stringify({ ...punto, momento_registro: new Date().toISOString() }), cita.cita_id]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('[reportarUbicacion]', error);
    return res.status(500).json({ error: 'No se pudo registrar la ubicación.' });
  }
};

// CU41 — Validando sesión mediante protocolo multi-factor
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
    const [[yaCertificada]] = await C_Capa_de_Acceso_a_Datos.query(
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

    const radio = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'RADIO_PRESENCIALIDAD_METROS', 100);

    // ── Análisis cruzado de factores ── (las marcas ahora son automáticas:
    // ya no se espera una confirmación del paciente).
    const factores = C_Validador_Presencialidad.analizarFactores(cita, radio);
    const fallidos = factores.filter((f) => !f.ok);
    const hayDiscrepancia = fallidos.some((f) => f.clave === 'DISTANCIA');

    // Falta alguna ubicación: no es una discrepancia, pero sin ella no se
    // puede certificar solo. Se pide el cierre manual justificado.
    if (fallidos.length > 0 && !hayDiscrepancia && !cierreManual) {
      return res.status(200).json({
        certificada: false,
        requiere_cierre_manual: true,
        factores,
        mensaje: 'Falta la ubicación de uno de los dos para validar la presencialidad. Puedes cerrar la sesión con una justificación.',
      });
    }
    if (cierreManual && !justificacion) {
      return res.status(400).json({
        error: 'JUSTIFICACION_REQUERIDA',
        mensaje: 'El cierre manual requiere una justificación.',
      });
    }

    // Excepción 2: discrepancias críticas (estaban lejos) suspenden la
    // validación y el caso se deriva al Administrador (D11).
    // La derivación se hace una sola vez (al finalizar o en el primer intento):
    // los reintentos no vuelven a avisar a los administradores. En ambos casos
    // el profesional puede cerrar la sesión con una justificación.
    if (hayDiscrepancia && !cierreManual) {
      const yaDerivada = Boolean(cita.sesion_suspendida_en);
      let administradoresAvisados = 0;
      if (!yaDerivada) {
        await auditar(req, 'SESION_SUSPENDIDA', {
          cita_id: Number(id), factores_fallidos: fallidos.map((f) => f.factor),
        });
        try {
          administradoresAvisados = await derivarAAdministracion(req, id, fallidos);
        } catch (errorDerivacion) {
          console.error('[validarSesion] derivación fallida:', errorDerivacion.message);
        }
      }
      return res.status(409).json({
        error: 'VALIDACION_SUSPENDIDA',
        certificada: false,
        requiere_cierre_manual: true,
        ya_derivada: yaDerivada,
        factores,
        administradores_avisados: administradoresAvisados,
        mensaje: yaDerivada
          ? 'La sesión sigue suspendida por discrepancias y el Administrador ya está avisado. Puedes cerrarla con una justificación.'
          : 'Se detectaron discrepancias críticas entre los factores. La sesión quedó suspendida y fue derivada al Administrador para su revisión. Puedes cerrarla con una justificación.',
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
    await C_Capa_de_Acceso_a_Datos.query(
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

/**
 * CU42 — Capturando firma manuscrita de conformidad
 * GET /citas/:id/declaracion-conformidad — Exc.2: sin texto legal, sin lienzo.
 */
exports.declaracionConformidad = (_req, res) => {
  return res.status(200).json(DECLARACION_CONFORMIDAD);
};

/**
 * CU42 — Capturando firma manuscrita de conformidad
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

    const firmaPrevia = C_Validador_Presencialidad.parsearJSON(cita.firma_conformidad_datos);
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
        await C_API_Adapter.enviarCorreo(
          cita.email_paciente,
          'Conformidad de atención - Punto Paz Salud',
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

    await C_Capa_de_Acceso_a_Datos.query(
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
