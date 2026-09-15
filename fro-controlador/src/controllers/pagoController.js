/**
 * Bonos y copagos (Incremento 2, bloque 5).
 * CU66: registro y validación de bonos contra el financiador (vía adaptador).
 * CU67: cálculo del copago y liquidación en pasarela de pago simulada.
 * CU69: cada ida y vuelta al financiador queda en la bitácora (lo hace la
 *       capa adaptadora automáticamente).
 * CU71: cuadratura de sesiones ejecutadas versus coberturas autorizadas.
 */

const pool = require('../config/database');
const { ejecutarTransaccion } = require('../services/external/providerAdapter');
const { leerParametroEntero } = require('../services/agenda/agendaService');

const REGEX_FOLIO = /^BON-\d{6}$/;
const METODOS_PAGO = ['TARJETA_OK', 'TARJETA_RECHAZADA', 'TARJETA_LENTA'];
const SESIONES_PAQUETE = [4, 8, 12];

/** Arancel vigente de una prestación (editable por el administrador). */
async function arancelVigente() {
  return leerParametroEntero(pool, 'ARANCEL_ESPECIALIDAD', 40000);
}

/** Cita del paciente autenticado (o null). */
async function citaDelPaciente(citaId, usuarioId) {
  const [filas] = await pool.query(
    `SELECT c.cita_id, c.estado, c.fecha_hora_inicio, c.paciente_id
       FROM Cita c
       JOIN Paciente p ON p.paciente_id = c.paciente_id
      WHERE c.cita_id = ? AND p.usuario_id = ?
      LIMIT 1`,
    [citaId, usuarioId]
  );
  return filas[0] || null;
}

/**
 * CU66 — Excepción 4: si la escritura choca con un bloqueo de tabla, se
 * reintenta con retardo progresivo antes de rendirse.
 */
async function ejecutarConReintentoDeEscritura(operacion) {
  const CODIGOS_BLOQUEO = new Set(['ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK']);
  for (let intento = 1; intento <= 3; intento++) {
    try {
      return await operacion();
    } catch (error) {
      if (!CODIGOS_BLOQUEO.has(error.code) || intento === 3) throw error;
      await new Promise((r) => setTimeout(r, 200 * intento));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Simulador del Financiador (el "Proveedor Externo" del CU69)
//  POST /api/financiador-simulado/validar-bono
//
//  Comportamiento determinista por folio, para poder demostrar cada excepción:
//   - termina en 0 → no responde (simula financiador caído: timeout+reintentos)
//   - termina en 9 → discrepancia biométrica (bono queda NO_VALIDADO)
//   - empieza con BON-999 → cobertura mayor al arancel (inconsistencia CU67)
//   - cualquier otro → validado con 60% de cobertura
// ─────────────────────────────────────────────────────────────────────────────

exports.financiadorSimulado = async (req, res) => {
  // CU69 — Excepción 1: sin credencial de seguridad no hay conexión.
  if (!req.headers['x-api-key']) {
    return res.status(401).json({ error: 'Falta la credencial X-Api-Key.' });
  }

  const { folio, monto_prestacion } = req.body || {};
  const monto = Number(monto_prestacion) || 0;

  if (String(folio || '').endsWith('0')) {
    // CU69 — Excepción 2: el proveedor omite la respuesta (timeout).
    await new Promise((r) => setTimeout(r, 20000));
    return res.status(504).end();
  }

  if (String(folio || '').endsWith('9')) {
    return res.status(200).json({
      estado: 'RECHAZO_BIOMETRICO',
      monto_cobertura: 0,
      copago: monto,
      folio,
    });
  }

  const cobertura = String(folio || '').startsWith('BON-999')
    ? Math.round(monto * 1.5) // inconsistencia a propósito (CU67 Exc.2)
    : Math.round(monto * 0.6);

  return res.status(200).json({
    estado: 'VALIDADO',
    monto_cobertura: cobertura,
    copago: Math.max(0, monto - cobertura),
    folio,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU66 — Registrar y validar un bono
//  POST /api/pagos/citas/:id/bono   { folio, financiador_id }
// ─────────────────────────────────────────────────────────────────────────────

exports.registrarBono = async (req, res) => {
  const { id } = req.params;
  const folio = String(req.body?.folio || '').trim().toUpperCase();
  const financiadorId = Number(req.body?.financiador_id);

  // Excepción 1: el folio se valida localmente antes de cualquier envío.
  if (!REGEX_FOLIO.test(folio)) {
    return res.status(400).json({
      error: 'FOLIO_INVALIDO',
      mensaje: 'El folio debe tener el formato BON-XXXXXX (6 dígitos).',
    });
  }

  try {
    const cita = await citaDelPaciente(id, req.user.usuario_id);
    if (!cita) {
      return res.status(404).json({ error: 'La cita no existe o no te pertenece.' });
    }
    if (!['AGENDADA', 'CONFIRMADA'].includes(cita.estado)) {
      return res.status(409).json({
        error: 'CITA_NO_HABILITADA',
        mensaje: `Una cita ${cita.estado.toLowerCase()} no admite registro de bonos.`,
      });
    }

    const [financiadores] = await pool.query(
      `SELECT financiador_id, nombre_institucion, rut_institucion
         FROM Financiador WHERE financiador_id = ? AND convenio_activo = TRUE`,
      [financiadorId]
    );
    if (financiadores.length === 0) {
      return res.status(404).json({ error: 'El financiador no existe o su convenio no está activo.' });
    }
    const financiador = financiadores[0];

    // Un bono VALIDADO no se reemplaza; uno rechazado sí se puede reintentar.
    const [previos] = await pool.query(
      `SELECT bono_id, estado_validacion FROM Bono WHERE cita_id = ? LIMIT 1`,
      [id]
    );
    if (previos.length > 0 && previos[0].estado_validacion === 'VALIDADO') {
      return res.status(409).json({
        error: 'BONO_YA_VALIDADO',
        mensaje: 'Esta cita ya tiene un bono validado.',
      });
    }

    const arancel = await arancelVigente();

    // Viaje real por la capa adaptadora: validación de esquemas, reintentos
    // y bitácora de transacciones externas (CU69) incluidos.
    let resultado;
    try {
      resultado = await ejecutarTransaccion({
        proveedor: 'FINANCIADOR',
        operacion: 'VALIDAR_BONO',
        usuarioId: req.user.usuario_id,
        datosInternos: {
          folio,
          rut_institucion: financiador.rut_institucion,
          monto_prestacion: arancel,
        },
      });
    } catch (errorAdapter) {
      // Excepción 3 del CU66: reintentos agotados sin respuesta del financiador.
      const status =
        errorAdapter.code === 'LIMITE_REINTENTOS' || errorAdapter.code === 'LATENCIA_CRITICA'
          ? 503
          : 502;
      return res.status(status).json({
        error: errorAdapter.code || 'FINANCIADOR_NO_DISPONIBLE',
        mensaje:
          status === 503
            ? 'El financiador no respondió tras varios intentos. Tu bono no se registró: inténtalo más tarde.'
            : 'La respuesta del financiador no pudo procesarse. Inténtalo más tarde.',
      });
    }

    const validado = resultado.datos.estado === 'VALIDADO';
    const estadoValidacion = validado ? 'VALIDADO' : 'NO_VALIDADO';

    // Excepción 4: escritura con reintento ante bloqueos de tabla.
    await ejecutarConReintentoDeEscritura(async () => {
      if (previos.length > 0) {
        await pool.query(
          `UPDATE Bono
              SET folio = ?, monto_cobertura = ?, copago = ?, estado_validacion = ?,
                  payload_respuesta = ?, financiador_id = ?
            WHERE bono_id = ?`,
          [
            folio,
            resultado.datos.montoCobertura,
            resultado.datos.copago,
            estadoValidacion,
            JSON.stringify({ ...resultado.datos, meta: resultado.meta }),
            financiadorId,
            previos[0].bono_id,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO Bono
              (folio, monto_cobertura, copago, estado_validacion, payload_respuesta, cita_id, financiador_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            folio,
            resultado.datos.montoCobertura,
            resultado.datos.copago,
            estadoValidacion,
            JSON.stringify({ ...resultado.datos, meta: resultado.meta }),
            id,
            financiadorId,
          ]
        );
      }
    });

    if (!validado) {
      // Excepción 2: discrepancia del proveedor → queda NO_VALIDADO.
      return res.status(409).json({
        error: 'BONO_NO_VALIDADO',
        mensaje: `El financiador rechazó el bono (${resultado.datos.estado}). Quedó registrado como no validado; verifica el folio con tu institución.`,
        estado_validacion: estadoValidacion,
      });
    }

    return res.status(201).json({
      mensaje: 'Bono validado. Tu copago quedó calculado.',
      estado_validacion: estadoValidacion,
      arancel,
      monto_cobertura: resultado.datos.montoCobertura,
      copago: resultado.datos.copago,
    });
  } catch (error) {
    console.error('[registrarBono]', error);
    return res.status(500).json({ error: 'Error interno al registrar el bono.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU67 — Resumen de pagos del paciente
//  GET /api/pagos/resumen
// ─────────────────────────────────────────────────────────────────────────────

exports.resumenPagos = async (req, res) => {
  try {
    const arancel = await arancelVigente();

    const [citas] = await pool.query(
      `SELECT c.cita_id, c.fecha_hora_inicio, c.estado,
              CONCAT(u.nombres, ' ', u.apellido_paterno) AS nombre_profesional,
              b.bono_id, b.folio, b.estado_validacion, b.monto_cobertura, b.copago,
              f.nombre_institucion
         FROM Cita c
         JOIN Paciente pac ON pac.paciente_id = c.paciente_id
         JOIN Profesional prof ON prof.profesional_id = c.profesional_id
         JOIN Usuario u ON u.usuario_id = prof.usuario_id
         LEFT JOIN Bono b ON b.cita_id = c.cita_id
         LEFT JOIN Financiador f ON f.financiador_id = b.financiador_id
        WHERE pac.usuario_id = ? AND c.estado NOT LIKE 'CANCELADA%'
        ORDER BY c.fecha_hora_inicio DESC`,
      [req.user.usuario_id]
    );

    const ids = citas.map((c) => c.cita_id);
    let transacciones = [];
    if (ids.length > 0) {
      [transacciones] = await pool.query(
        `SELECT transaccion_id, cita_id, monto_total, tipo, estado, metodo_pago, momento_pago
           FROM Transaccion WHERE cita_id IN (?) ORDER BY transaccion_id DESC`,
        [ids]
      );
    }
    const porCita = new Map();
    for (const transaccion of transacciones) {
      const lista = porCita.get(transaccion.cita_id) || [];
      lista.push(transaccion);
      porCita.set(transaccion.cita_id, lista);
    }

    const [paquetes] = await pool.query(
      `SELECT ps.paquete_sesiones_id, ps.sesiones_total, ps.sesiones_usadas, ps.estado,
              ps.precio_total, ps.momento_adquisicion
         FROM Paquete_Sesiones ps
         JOIN Paciente p ON p.paciente_id = ps.paciente_id
        WHERE p.usuario_id = ?
        ORDER BY ps.paquete_sesiones_id DESC`,
      [req.user.usuario_id]
    );

    const [financiadores] = await pool.query(
      `SELECT financiador_id, nombre_institucion FROM Financiador WHERE convenio_activo = TRUE`
    );

    return res.status(200).json({
      arancel,
      financiadores,
      paquetes,
      citas: citas.map((cita) => {
        const pagos = porCita.get(cita.cita_id) || [];
        const pagada = pagos.some((t) => t.estado === 'PAGADA');
        const copagoExigible =
          cita.estado_validacion === 'VALIDADO' ? cita.copago : arancel;
        return {
          ...cita,
          transacciones: pagos,
          pagada,
          copago_exigible: pagada ? 0 : copagoExigible,
        };
      }),
    });
  } catch (error) {
    console.error('[resumenPagos]', error);
    return res.status(500).json({ error: 'No se pudo obtener tu resumen de pagos.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU67 — Pagar el copago de una cita
//  POST /api/pagos/citas/:id/pagar   { metodo_pago }
// ─────────────────────────────────────────────────────────────────────────────

exports.pagarCopago = async (req, res) => {
  const { id } = req.params;
  const metodo = String(req.body?.metodo_pago || '').trim();

  if (!METODOS_PAGO.includes(metodo)) {
    return res.status(400).json({ error: 'Método de pago no reconocido.' });
  }

  try {
    const cita = await citaDelPaciente(id, req.user.usuario_id);
    if (!cita) {
      return res.status(404).json({ error: 'La cita no existe o no te pertenece.' });
    }

    const arancel = await arancelVigente();

    const [bonos] = await pool.query(
      `SELECT estado_validacion, monto_cobertura, copago FROM Bono WHERE cita_id = ? LIMIT 1`,
      [id]
    );
    const bono = bonos[0] || null;

    // CU67 — Excepción 2: si el aporte supera la tarifa, el flujo se congela
    // y queda una traza técnica para revisión.
    if (bono?.estado_validacion === 'VALIDADO' && bono.monto_cobertura > arancel) {
      try {
        await pool.query(
          `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
           VALUES ('INCONSISTENCIA_COBERTURA', 'Bono', ?, ?)`,
          [
            JSON.stringify({ cita_id: Number(id), cobertura: bono.monto_cobertura, arancel }),
            req.user.usuario_id,
          ]
        );
      } catch (errorBitacora) {
        console.error('[pagarCopago] Sin traza de inconsistencia:', errorBitacora.message);
      }
      return res.status(409).json({
        error: 'FLUJO_CONGELADO',
        mensaje:
          'La cobertura informada supera el arancel de la prestación. El cobro quedó congelado y el caso fue elevado a revisión técnica.',
      });
    }

    const copago = bono?.estado_validacion === 'VALIDADO' ? bono.copago : arancel;

    const [pagosPrevios] = await pool.query(
      `SELECT transaccion_id, estado FROM Transaccion
        WHERE cita_id = ? ORDER BY transaccion_id DESC`,
      [id]
    );

    if (pagosPrevios.some((t) => t.estado === 'PAGADA')) {
      return res.status(409).json({ error: 'CITA_PAGADA', mensaje: 'Esta cita ya está pagada.' });
    }

    // CU67 — Excepción 4: una transacción quedó "en tránsito" (webhook
    // perdido). El siguiente intento la concilia en vez de cobrar de nuevo.
    const enTransito = pagosPrevios.find((t) => t.estado === 'EN_TRANSITO');
    if (enTransito) {
      await pool.query(
        `UPDATE Transaccion SET estado = 'PAGADA' WHERE transaccion_id = ?`,
        [enTransito.transaccion_id]
      );
      return res.status(200).json({
        mensaje: 'Encontramos tu pago anterior en tránsito y quedó conciliado. No se realizó un nuevo cobro.',
        estado: 'PAGADA',
        monto: copago,
      });
    }

    // Pasarela simulada, determinista por método elegido.
    if (metodo === 'TARJETA_RECHAZADA') {
      // Excepción 3: la entidad bancaria rechaza; el intento queda registrado.
      await pool.query(
        `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
         VALUES (?, 'COPAGO', 'RECHAZADA', ?, ?)`,
        [copago, metodo, id]
      );
      return res.status(402).json({
        error: 'PAGO_RECHAZADO',
        mensaje: 'Tu entidad bancaria rechazó la tarjeta. El intento quedó registrado; revisa tu método de pago.',
      });
    }

    const estadoFinal = metodo === 'TARJETA_LENTA' ? 'EN_TRANSITO' : 'PAGADA';
    await pool.query(
      `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
       VALUES (?, 'COPAGO', ?, ?, ?)`,
      [copago, estadoFinal, metodo, id]
    );

    if (estadoFinal === 'EN_TRANSITO') {
      return res.status(202).json({
        mensaje:
          'El banco descontó los fondos pero su confirmación aún no llega. Tu pago quedó en tránsito y se conciliará automáticamente.',
        estado: estadoFinal,
        monto: copago,
      });
    }

    return res.status(200).json({
      mensaje: `Pago realizado. Copago liquidado: $${copago.toLocaleString('es-CL')}.`,
      estado: estadoFinal,
      monto: copago,
    });
  } catch (error) {
    console.error('[pagarCopago]', error);
    return res.status(500).json({ error: 'Error interno al procesar el pago.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU67 — Adquirir un plan de sesiones (alimenta el inventario del CU76)
//  POST /api/pagos/paquetes   { sesiones, metodo_pago }
// ─────────────────────────────────────────────────────────────────────────────

exports.comprarPaquete = async (req, res) => {
  const sesiones = Number(req.body?.sesiones);
  const metodo = String(req.body?.metodo_pago || '').trim();

  if (!SESIONES_PAQUETE.includes(sesiones)) {
    return res.status(400).json({ error: `Los planes disponibles son de ${SESIONES_PAQUETE.join(', ')} sesiones.` });
  }
  if (!METODOS_PAGO.includes(metodo)) {
    return res.status(400).json({ error: 'Método de pago no reconocido.' });
  }

  try {
    const [pacientes] = await pool.query(
      `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });
    }

    const arancel = await arancelVigente();
    const precio = Math.round(arancel * sesiones * 0.9); // 10% de descuento por plan

    if (metodo === 'TARJETA_RECHAZADA') {
      return res.status(402).json({
        error: 'PAGO_RECHAZADO',
        mensaje: 'Tu entidad bancaria rechazó la tarjeta. El plan no fue adquirido.',
      });
    }

    await pool.query(
      `INSERT INTO Paquete_Sesiones (sesiones_total, estado, precio_total, paciente_id)
       VALUES (?, 'ACTIVO', ?, ?)`,
      [sesiones, precio, pacientes[0].paciente_id]
    );

    try {
      await pool.query(
        `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
         VALUES ('COMPRA_PAQUETE', 'Paquete_Sesiones', ?, ?)`,
        [JSON.stringify({ sesiones, precio, metodo }), req.user.usuario_id]
      );
    } catch (errorBitacora) {
      console.error('[comprarPaquete] Sin registro en bitácora:', errorBitacora.message);
    }

    return res.status(201).json({
      mensaje: `Plan de ${sesiones} sesiones activado por $${precio.toLocaleString('es-CL')}.`,
      sesiones,
      precio,
    });
  } catch (error) {
    console.error('[comprarPaquete]', error);
    return res.status(500).json({ error: 'Error interno al adquirir el plan.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU71 — Cuadratura de sesiones bonificables (Profesional)
//  GET /api/pagos/cuadratura/:paciente_id
// ─────────────────────────────────────────────────────────────────────────────

exports.cuadraturaCoberturas = async (req, res) => {
  const { paciente_id } = req.params;

  try {
    const [autorizadas] = await pool.query(
      `SELECT COALESCE(SUM(sesiones_total), 0) AS total,
              COALESCE(SUM(sesiones_usadas), 0) AS usadas
         FROM Paquete_Sesiones WHERE paciente_id = ?`,
      [paciente_id]
    );

    const [ejecutadas] = await pool.query(
      `SELECT COUNT(*) AS realizadas
         FROM Cita c
         JOIN Profesional p ON p.profesional_id = c.profesional_id
        WHERE c.paciente_id = ? AND p.usuario_id = ? AND c.estado = 'REALIZADA'`,
      [paciente_id, req.user.usuario_id]
    );

    const [bonos] = await pool.query(
      `SELECT c.cita_id, c.fecha_hora_inicio, c.estado AS estado_cita,
              b.folio, b.estado_validacion, b.monto_cobertura, b.copago
         FROM Cita c
         JOIN Profesional p ON p.profesional_id = c.profesional_id
         LEFT JOIN Bono b ON b.cita_id = c.cita_id
        WHERE c.paciente_id = ? AND p.usuario_id = ? AND c.estado NOT LIKE 'CANCELADA%'
        ORDER BY c.fecha_hora_inicio DESC`,
      [paciente_id, req.user.usuario_id]
    );

    const sesionesAutorizadas = Number(autorizadas[0].total);
    const sesionesRealizadas = Number(ejecutadas[0].realizadas);

    // Excepción 1: sesiones realizadas sin bono electrónico registrado.
    const realizadasSinBono = bonos.filter(
      (fila) => fila.estado_cita === 'REALIZADA' && !fila.folio
    );

    return res.status(200).json({
      sesiones_autorizadas: sesionesAutorizadas,
      sesiones_usadas: Number(autorizadas[0].usadas),
      sesiones_realizadas: sesionesRealizadas,
      // Excepción 2: lo ejecutado excede lo autorizado.
      discrepancia_saldo: sesionesRealizadas > sesionesAutorizadas,
      realizadas_sin_bono: realizadasSinBono.map((fila) => fila.cita_id),
      citas: bonos,
    });
  } catch (error) {
    console.error('[cuadraturaCoberturas]', error);
    // Excepción 4: la sincronización queda pendiente; el profesional reintenta.
    return res.status(500).json({
      error: 'SINCRONIZACION_PENDIENTE',
      mensaje: 'No se pudo completar la sincronización. Quedó pendiente: reintenta en unos minutos.',
    });
  }
};
