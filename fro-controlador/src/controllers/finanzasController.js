/**
 * CU73 — Comercialización con restricción de cobro anticipado.
 * CU74 — Actualización a paquete y devoluciones.
 * CU75 — Liquidación de ganancias del profesional.
 *
 * La regla que ordena los tres: una cita solo puede pasar a CONFIRMADA
 * cuando el sistema verificó que el pago entró completo. Pagar NO confirma:
 * la cita queda AGENDADA y pagada, y es el profesional quien la confirma
 * (el servidor le impide confirmar una hora sin pago). Antes del pago la
 * reserva es temporal y se revoca si el cobro no prospera.
 */

const pool = require('./../config/database');
const {
  leerParametroEntero,
  notificarUsuario,
  ofrecerCupoListaEspera,
  obtenerContactosCita,
} = require('../services/agenda/agendaService');

const METODOS_PAGO = ['TARJETA_OK', 'TARJETA_RECHAZADA', 'TARJETA_LENTA'];

/** Con la hora pagada, el profesional ya puede confirmarla: se le avisa. */
async function avisarHoraPagada(conexion, citaId) {
  const contactos = await obtenerContactosCita(conexion, citaId).catch(() => null);
  if (!contactos?.usuario_profesional) return;
  await notificarUsuario(
    conexion,
    contactos.usuario_profesional,
    'CAMBIO_ESTADO_CITA',
    'Un paciente pagó su hora: ya puedes confirmarla desde su ficha.',
    { titulo: 'Hora pagada por confirmar', datos: { pantalla: 'MiJornada' } }
  );
}
const SESIONES_PAQUETE = [10, 15, 20];

async function arancelVigente(conexion = pool) {
  return leerParametroEntero(conexion, 'ARANCEL_ESPECIALIDAD', 40000);
}

/** Precio de un plan: arancel por sesión menos el descuento parametrizado. */
async function precioPaquete(conexion, sesiones) {
  const arancel = await arancelVigente(conexion);
  const descuento = await leerParametroEntero(conexion, 'DESCUENTO_PAQUETE_PORCENTAJE', 10);
  return Math.round(arancel * sesiones * (1 - descuento / 100));
}

async function pacienteDe(conexion, usuarioId) {
  const [[fila]] = await conexion.query(
    `SELECT paciente_id FROM Paciente WHERE usuario_id = ? LIMIT 1`,
    [usuarioId]
  );
  return fila?.paciente_id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU73 — Cobro anticipado de la prestación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/finanzas/citas/:id/opciones   (Paciente)
 *
 * Lo que el paciente necesita para elegir: cuánto cuesta una sesión suelta,
 * cuánto cada plan y si ya tiene sesiones compradas que puede usar.
 *
 * Excepción 2 del CU73: si este cálculo falla, la app muestra el error técnico
 * y ofrece reintentar, en vez de dejar al paciente frente a un monto en blanco.
 */
exports.opcionesDeCompra = async (req, res) => {
  try {
    const pacienteId = await pacienteDe(pool, req.user.usuario_id);
    if (!pacienteId) return res.status(404).json({ error: 'No se encontró tu registro de paciente.' });

    const [[cita]] = await pool.query(
      `SELECT c.cita_id, c.estado, c.fecha_hora_inicio, c.paciente_id
         FROM Cita c WHERE c.cita_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!cita || Number(cita.paciente_id) !== Number(pacienteId)) {
      return res.status(404).json({ error: 'La cita no existe o no te pertenece.' });
    }

    const arancel = await arancelVigente();
    const descuento = await leerParametroEntero(pool, 'DESCUENTO_PAQUETE_PORCENTAJE', 10);

    const planes = [];
    for (const sesiones of SESIONES_PAQUETE) {
      planes.push({
        sesiones,
        precio: await precioPaquete(pool, sesiones),
        precio_sin_descuento: arancel * sesiones,
      });
    }

    const [[paquete]] = await pool.query(
      `SELECT paquete_sesiones_id, sesiones_total, sesiones_usadas
         FROM Paquete_Sesiones
        WHERE paciente_id = ? AND estado = 'ACTIVO' AND sesiones_usadas < sesiones_total
        ORDER BY paquete_sesiones_id ASC LIMIT 1`,
      [pacienteId]
    );

    const [[pagada]] = await pool.query(
      `SELECT transaccion_id, monto_total, tipo FROM Transaccion
        WHERE cita_id = ? AND estado = 'PAGADA' AND tipo <> 'DEVOLUCION'
        ORDER BY transaccion_id DESC LIMIT 1`,
      [req.params.id]
    );

    return res.status(200).json({
      cita: { cita_id: cita.cita_id, estado: cita.estado, fecha_hora_inicio: cita.fecha_hora_inicio },
      arancel,
      descuento_paquete: descuento,
      planes,
      paquete_activo: paquete
        ? {
            paquete_sesiones_id: paquete.paquete_sesiones_id,
            disponibles: paquete.sesiones_total - paquete.sesiones_usadas,
            total: paquete.sesiones_total,
          }
        : null,
      ya_pagada: Boolean(pagada),
      monto_pagado: pagada ? Number(pagada.monto_total) : 0,
      metodos: METODOS_PAGO,
    });
  } catch (error) {
    console.error('[opcionesDeCompra CU73]', error);
    return res.status(503).json({
      error: 'CALCULO_NO_DISPONIBLE',
      mensaje:
        'No pudimos calcular el valor de la prestación en este momento. Inténtalo nuevamente en unos minutos.',
    });
  }
};

/**
 * POST /api/finanzas/citas/:id/comprar   (Paciente)
 * { modalidad: 'UNITARIA' | 'PAQUETE' | 'USAR_PAQUETE', sesiones, metodo_pago }
 *
 * Cobra por anticipado y solo entonces confirma la cita. Si el cobro no
 * prospera, la reserva se revoca (Excepciones 3 y 4).
 */
exports.comprarPrestacion = async (req, res) => {
  const modalidad = String(req.body?.modalidad || '').trim().toUpperCase();
  const metodo = String(req.body?.metodo_pago || '').trim();
  const sesiones = Number(req.body?.sesiones);

  // Excepción 1 del CU73: sin modalidad no hay transición posible.
  if (!['UNITARIA', 'PAQUETE', 'USAR_PAQUETE'].includes(modalidad)) {
    return res.status(400).json({
      error: 'MODALIDAD_REQUERIDA',
      mensaje: 'Elige si pagas esta sesión o compras un plan antes de continuar.',
    });
  }
  if (modalidad === 'PAQUETE' && !SESIONES_PAQUETE.includes(sesiones)) {
    return res.status(400).json({
      error: 'PLAN_INVALIDO',
      mensaje: `Los planes disponibles son de ${SESIONES_PAQUETE.join(', ')} sesiones.`,
    });
  }
  if (modalidad !== 'USAR_PAQUETE' && !METODOS_PAGO.includes(metodo)) {
    return res.status(400).json({ error: 'METODO_INVALIDO', mensaje: 'Elige un método de pago.' });
  }

  const conexion = await pool.getConnection();

  try {
    const pacienteId = await pacienteDe(conexion, req.user.usuario_id);
    const [[cita]] = await conexion.execute(
      `SELECT cita_id, estado, paciente_id FROM Cita WHERE cita_id = ? LIMIT 1 FOR UPDATE`,
      [req.params.id]
    );

    if (!cita || Number(cita.paciente_id) !== Number(pacienteId)) {
      return res.status(404).json({ error: 'La cita no existe o no te pertenece.' });
    }
    if (!['AGENDADA', 'CONFIRMADA'].includes(cita.estado)) {
      return res.status(409).json({
        error: 'ESTADO_NO_COBRABLE',
        mensaje: `Esta cita está en estado ${cita.estado}: no corresponde cobrarla.`,
      });
    }

    const [[yaPagada]] = await conexion.execute(
      `SELECT transaccion_id FROM Transaccion
        WHERE cita_id = ? AND estado = 'PAGADA' AND tipo <> 'DEVOLUCION' LIMIT 1`,
      [req.params.id]
    );
    if (yaPagada) {
      return res.status(409).json({
        error: 'YA_PAGADA',
        mensaje: 'Esta prestación ya está pagada.',
      });
    }

    // Excepción 4 del CU73: un pago anterior quedó "en tránsito" (el banco no
    // alcanzó a confirmar). El siguiente intento lo concilia y NO cobra de
    // nuevo: antes se registraba un segundo pago y el primero quedaba colgado.
    const [[enTransito]] = await conexion.execute(
      `SELECT transaccion_id, monto_total, tipo FROM Transaccion
        WHERE cita_id = ? AND estado = 'EN_TRANSITO'
        ORDER BY transaccion_id DESC LIMIT 1`,
      [req.params.id]
    );
    if (enTransito) {
      await conexion.beginTransaction();
      await conexion.execute(
        `UPDATE Transaccion SET estado = 'PAGADA' WHERE transaccion_id = ?`,
        [enTransito.transaccion_id]
      );

      // Si lo que quedó en tránsito era un plan, se activa ahora. El plan se
      // reconoce por su precio; si el arancel cambió entre medio, se usa el
      // plan que el paciente eligió en este intento.
      let sesionesPlan = null;
      if (enTransito.tipo === 'PAQUETE') {
        for (const opcion of SESIONES_PAQUETE) {
          if ((await precioPaquete(conexion, opcion)) === Number(enTransito.monto_total)) {
            sesionesPlan = opcion;
            break;
          }
        }
        sesionesPlan = sesionesPlan || (SESIONES_PAQUETE.includes(sesiones) ? sesiones : SESIONES_PAQUETE[0]);
        await conexion.execute(
          `INSERT INTO Paquete_Sesiones (sesiones_total, sesiones_usadas, estado, precio_total, paciente_id)
           VALUES (?, 0, 'ACTIVO', ?, ?)`,
          [sesionesPlan, enTransito.monto_total, pacienteId]
        );
      }

      await conexion.execute(
        `INSERT INTO Bitacora_Auditoria
            (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('CONCILIACION_PAGO_EN_TRANSITO', 'Transaccion', ?, ?, ?)`,
        [
          req.ip || null,
          JSON.stringify({
            cita_id: Number(req.params.id),
            transaccion_id: enTransito.transaccion_id,
            monto: Number(enTransito.monto_total),
            plan: sesionesPlan,
          }),
          req.user.usuario_id,
        ]
      );
      await avisarHoraPagada(conexion, req.params.id);
      await conexion.commit();

      return res.status(200).json({
        mensaje:
          'Encontramos tu pago anterior en tránsito y quedó conciliado: no se hizo un nuevo cobro. ' +
          'Te avisaremos cuando el profesional confirme la cita.',
        estado: 'AGENDADA',
        monto: Number(enTransito.monto_total),
        conciliado: true,
      });
    }

    // ── Camino A: usar una sesión de un plan ya comprado ────────────────
    if (modalidad === 'USAR_PAQUETE') {
      await conexion.beginTransaction();

      const [[paquete]] = await conexion.execute(
        `SELECT paquete_sesiones_id, sesiones_total, sesiones_usadas
           FROM Paquete_Sesiones
          WHERE paciente_id = ? AND estado = 'ACTIVO' AND sesiones_usadas < sesiones_total
          ORDER BY paquete_sesiones_id ASC LIMIT 1 FOR UPDATE`,
        [pacienteId]
      );
      if (!paquete) {
        await conexion.rollback();
        return res.status(409).json({
          error: 'SIN_PAQUETE',
          mensaje: 'No tienes sesiones disponibles en un plan activo.',
        });
      }

      // La sesión se descuenta al finalizar la atención (CU76). Acá solo se
      // deja constancia de que la hora queda cubierta por el plan (monto 0):
      // descontarla dos veces sería cobrarle dos sesiones por una. La cita
      // sigue AGENDADA hasta que el profesional la confirme.
      await conexion.execute(
        `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
         VALUES (0, 'SESION_PLAN', 'PAGADA', 'PLAN_SESIONES', ?)`,
        [req.params.id]
      );
      await conexion.execute(
        `INSERT INTO Bitacora_Auditoria
            (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('CONFIRMACION_CON_PAQUETE', 'Cita', ?, ?, ?)`,
        [
          req.ip || null,
          JSON.stringify({
            cita_id: Number(req.params.id),
            paquete_sesiones_id: paquete.paquete_sesiones_id,
            disponibles: paquete.sesiones_total - paquete.sesiones_usadas,
          }),
          req.user.usuario_id,
        ]
      );
      await avisarHoraPagada(conexion, req.params.id);
      await conexion.commit();

      return res.status(200).json({
        mensaje:
          'Listo: esta hora queda cubierta con una sesión de tu plan. ' +
          'Te avisaremos cuando el profesional la confirme.',
        estado: 'AGENDADA',
        monto: 0,
        disponibles: paquete.sesiones_total - paquete.sesiones_usadas,
      });
    }

    // ── Camino B: pago con tarjeta ──────────────────────────────────────
    const monto =
      modalidad === 'PAQUETE'
        ? await precioPaquete(conexion, sesiones)
        : await arancelVigente(conexion);

    // Excepciones 3 y 4: la entidad rechaza y la reserva temporal se revoca.
    if (metodo === 'TARJETA_RECHAZADA') {
      await conexion.beginTransaction();
      await conexion.execute(
        `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
         VALUES (?, ?, 'RECHAZADA', ?, ?)`,
        [monto, modalidad === 'PAQUETE' ? 'PAQUETE' : 'PRESTACION', metodo, req.params.id]
      );
      await conexion.execute(
        `UPDATE Cita
            SET estado = 'CANCELADA_PACIENTE',
                motivo_cancelacion = 'Reserva revocada: el pago anticipado fue rechazado'
          WHERE cita_id = ?`,
        [req.params.id]
      );
      await conexion.commit();

      // El bloque liberado se ofrece a quien esté esperando (CU19).
      await ofrecerCupoListaEspera(pool, req.params.id);

      return res.status(402).json({
        error: 'PAGO_RECHAZADO',
        mensaje:
          'Tu entidad bancaria rechazó el pago, así que la reserva del bloque quedó revocada. ' +
          'Puedes volver a buscar la hora y pagar con otro método.',
        reserva_revocada: true,
      });
    }

    await conexion.beginTransaction();

    const estadoPago = metodo === 'TARJETA_LENTA' ? 'EN_TRANSITO' : 'PAGADA';
    await conexion.execute(
      `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
       VALUES (?, ?, ?, ?, ?)`,
      [monto, modalidad === 'PAQUETE' ? 'PAQUETE' : 'PRESTACION', estadoPago, metodo, req.params.id]
    );

    // RF73: con el pago ÍNTEGRO la hora queda pagada y lista para que el
    // profesional la confirme. Un pago en tránsito todavía no habilita eso.
    if (estadoPago === 'PAGADA') {
      if (modalidad === 'PAQUETE') {
        // El plan se activa con una sesión ya asignada a esta cita.
        await conexion.execute(
          `INSERT INTO Paquete_Sesiones (sesiones_total, sesiones_usadas, estado, precio_total, paciente_id)
           VALUES (?, 0, 'ACTIVO', ?, ?)`,
          [sesiones, monto, pacienteId]
        );
      }
    }

    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('COBRO_ANTICIPADO', 'Transaccion', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({
          cita_id: Number(req.params.id),
          modalidad,
          sesiones: modalidad === 'PAQUETE' ? sesiones : 1,
          monto,
          estado: estadoPago,
        }),
        req.user.usuario_id,
      ]
    );

    if (estadoPago === 'PAGADA') await avisarHoraPagada(conexion, req.params.id);
    await conexion.commit();

    if (estadoPago === 'EN_TRANSITO') {
      return res.status(202).json({
        mensaje:
          'El banco aún no confirma el pago. Tu hora queda reservada pero no confirmada: ' +
          'vuelve a intentarlo en unos minutos y la conciliaremos sin cobrarte de nuevo.',
        estado: 'EN_TRANSITO',
        monto,
      });
    }

    return res.status(200).json({
      mensaje:
        (modalidad === 'PAQUETE'
          ? `Plan de ${sesiones} sesiones activado y hora pagada.`
          : 'Pago recibido.') +
        ' Te avisaremos cuando el profesional confirme la cita.',
      estado: 'AGENDADA',
      monto,
      sesiones: modalidad === 'PAQUETE' ? sesiones : 1,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[comprarPrestacion CU73]', error);
    return res.status(500).json({
      error: 'ERROR_COBRO',
      mensaje: 'No pudimos procesar el pago. Tu reserva sigue vigente: inténtalo otra vez.',
    });
  } finally {
    conexion.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU74 — Actualización a plan y devoluciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/finanzas/citas/:id/actualizar-a-paquete   (Paciente)
 * { sesiones, metodo_pago }
 *
 * Cobra solo la diferencia entre lo que ya pagó por la sesión suelta y el
 * valor del plan.
 */
exports.actualizarAPaquete = async (req, res) => {
  const sesiones = Number(req.body?.sesiones);
  const metodo = String(req.body?.metodo_pago || '').trim();

  if (!SESIONES_PAQUETE.includes(sesiones)) {
    return res.status(400).json({
      error: 'PLAN_INVALIDO',
      mensaje: `Los planes disponibles son de ${SESIONES_PAQUETE.join(', ')} sesiones.`,
    });
  }
  if (!METODOS_PAGO.includes(metodo)) {
    return res.status(400).json({ error: 'METODO_INVALIDO', mensaje: 'Elige un método de pago.' });
  }

  const conexion = await pool.getConnection();

  try {
    const pacienteId = await pacienteDe(conexion, req.user.usuario_id);
    const [[cita]] = await conexion.execute(
      `SELECT cita_id, estado, fecha_hora_inicio, paciente_id
         FROM Cita WHERE cita_id = ? LIMIT 1 FOR UPDATE`,
      [req.params.id]
    );

    if (!cita || Number(cita.paciente_id) !== Number(pacienteId)) {
      return res.status(404).json({ error: 'La cita no existe o no te pertenece.' });
    }
    if (!['AGENDADA', 'CONFIRMADA'].includes(cita.estado)) {
      return res.status(409).json({
        error: 'ESTADO_NO_ACTUALIZABLE',
        mensaje: 'Solo se puede cambiar a plan una prestación pagada que aún no se realiza.',
      });
    }

    // Ya cubierta por un plan (comprado al reservar, con una sesión del plan
    // o por un cambio anterior): no hay nada que actualizar.
    const [[yaEnPlan]] = await conexion.execute(
      `SELECT transaccion_id FROM Transaccion
        WHERE cita_id = ? AND estado = 'PAGADA'
          AND tipo IN ('PAQUETE', 'SESION_PLAN', 'ACTUALIZACION') LIMIT 1`,
      [req.params.id]
    );
    if (yaEnPlan) {
      return res.status(409).json({
        error: 'YA_EN_PLAN',
        mensaje: 'Esta hora ya está cubierta por un plan de sesiones.',
      });
    }

    const [[pagoPrevio]] = await conexion.execute(
      `SELECT transaccion_id, monto_total, momento_pago FROM Transaccion
        WHERE cita_id = ? AND estado = 'PAGADA' AND tipo = 'PRESTACION'
        ORDER BY transaccion_id DESC LIMIT 1`,
      [req.params.id]
    );

    // Excepción 2: sin registro del pago previo no se puede calcular nada.
    // Se detiene y queda la alerta de auditoría.
    if (!pagoPrevio) {
      await conexion.execute(
        `INSERT INTO Bitacora_Auditoria
            (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
         VALUES ('INCONSISTENCIA_PAGO_PREVIO', 'Transaccion', ?, ?, ?)`,
        [
          req.ip || null,
          JSON.stringify({ cita_id: Number(req.params.id), motivo: 'sin transacción pagada' }),
          req.user.usuario_id,
        ]
      );
      return res.status(409).json({
        error: 'PAGO_PREVIO_INCONSISTENTE',
        mensaje:
          'No encontramos el registro del pago de esta prestación. El caso quedó elevado a revisión: ' +
          'comunícate con soporte antes de volver a intentarlo.',
      });
    }

    // Excepción 1: la actualización es del MISMO DÍA de la prestación. Fuera
    // de esa ventana no se actualiza: se devuelve el pago completo y el
    // paciente agenda de nuevo.
    const horasVentana = await leerParametroEntero(conexion, 'HORAS_ANTICIPACION_DEVOLUCION', 24);
    const horasHastaLaCita =
      (new Date(cita.fecha_hora_inicio).getTime() - Date.now()) / 3600000;

    if (horasHastaLaCita > horasVentana) {
      await conexion.beginTransaction();
      await conexion.execute(
        `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
         VALUES (?, 'DEVOLUCION', 'PAGADA', ?, ?)`,
        [pagoPrevio.monto_total, metodo, req.params.id]
      );
      await conexion.execute(
        `UPDATE Cita
            SET estado = 'CANCELADA_PACIENTE',
                motivo_cancelacion = 'Actualización fuera de plazo: se devolvió el pago íntegro'
          WHERE cita_id = ?`,
        [req.params.id]
      );
      await conexion.commit();

      await ofrecerCupoListaEspera(pool, req.params.id);

      return res.status(200).json({
        devolucion: true,
        monto_devuelto: Number(pagoPrevio.monto_total),
        mensaje:
          `El cambio a plan solo se puede hacer dentro de las ${horasVentana} horas previas a la prestación. ` +
          `Te devolvimos $${Number(pagoPrevio.monto_total).toLocaleString('es-CL')} y liberamos la hora: ` +
          'puedes agendar de nuevo y comprar el plan desde el inicio.',
      });
    }

    const precio = await precioPaquete(conexion, sesiones);
    const diferencia = Math.max(0, precio - Number(pagoPrevio.monto_total));

    // Excepción 3: el paciente abandona la pasarela. El rechazo deja todo como
    // estaba: conserva su prestación unitaria.
    if (metodo === 'TARJETA_RECHAZADA') {
      await conexion.execute(
        `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
         VALUES (?, 'ACTUALIZACION', 'RECHAZADA', ?, ?)`,
        [diferencia, metodo, req.params.id]
      );
      return res.status(402).json({
        error: 'PAGO_RECHAZADO',
        mensaje:
          'El pago del diferencial no se completó. Tu prestación sigue vigente como sesión unitaria.',
      });
    }

    await conexion.beginTransaction();

    await conexion.execute(
      `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
       VALUES (?, 'ACTUALIZACION', 'PAGADA', ?, ?)`,
      [diferencia, metodo, req.params.id]
    );

    // El plan entra con una sesión ya consumida: la de esta cita, que el
    // paciente había pagado suelta.
    await conexion.execute(
      `INSERT INTO Paquete_Sesiones (sesiones_total, sesiones_usadas, estado, precio_total, paciente_id)
       VALUES (?, 1, 'ACTIVO', ?, ?)`,
      [sesiones, precio, pacienteId]
    );

    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('ACTUALIZACION_A_PAQUETE', 'Paquete_Sesiones', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({
          cita_id: Number(req.params.id),
          sesiones,
          precio_plan: precio,
          pagado_antes: Number(pagoPrevio.monto_total),
          diferencia,
        }),
        req.user.usuario_id,
      ]
    );

    await conexion.commit();

    return res.status(200).json({
      mensaje:
        `Listo: tu sesión pasó a un plan de ${sesiones}. Pagaste la diferencia de ` +
        `$${diferencia.toLocaleString('es-CL')} y te quedan ${sesiones - 1} sesiones disponibles.`,
      diferencia,
      sesiones_disponibles: sesiones - 1,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[actualizarAPaquete CU74]', error);
    // Excepción 4: latencia de red al registrar. La app reintenta.
    return res.status(503).json({
      error: 'REINTENTAR',
      mensaje: 'La red tardó demasiado al registrar la actualización. Inténtalo nuevamente.',
    });
  } finally {
    conexion.release();
  }
};

/**
 * RF74 — Devolución total por cancelación anticipada.
 *
 * La llama la máquina de estados de la cita cuando el paciente cancela. No
 * lanza: una devolución fallida no puede impedir que la cita se cancele.
 *
 * Solo se devuelve dinero por una sesión pagada suelta (PRESTACION). Si la
 * cita se pagó comprando un plan, el plan sigue activo con todas sus sesiones
 * (se descuentan al realizarse la atención): devolver el precio del plan y
 * dejarle las sesiones sería pagarle dos veces.
 *
 * @returns {Promise<{devuelto: number}|{sesion_en_plan: true}|null>}
 */
async function devolverPorCancelacion(conexion, citaId, fechaHoraInicio, req) {
  try {
    const horas = await leerParametroEntero(conexion, 'HORAS_ANTICIPACION_DEVOLUCION', 24);
    const anticipacion = (new Date(fechaHoraInicio).getTime() - Date.now()) / 3600000;
    if (anticipacion < horas) return null;

    const [[pago]] = await conexion.execute(
      `SELECT transaccion_id, monto_total, metodo_pago, tipo FROM Transaccion
        WHERE cita_id = ? AND estado = 'PAGADA' AND tipo <> 'DEVOLUCION'
        ORDER BY transaccion_id DESC LIMIT 1`,
      [citaId]
    );
    if (!pago) return null;
    if (pago.tipo !== 'PRESTACION') return { sesion_en_plan: true };

    // Una sola devolución por cita.
    const [[yaDevuelta]] = await conexion.execute(
      `SELECT transaccion_id FROM Transaccion
        WHERE cita_id = ? AND tipo = 'DEVOLUCION' AND estado = 'PAGADA' LIMIT 1`,
      [citaId]
    );
    if (yaDevuelta) return null;

    await conexion.execute(
      `INSERT INTO Transaccion (monto_total, tipo, estado, metodo_pago, cita_id)
       VALUES (?, 'DEVOLUCION', 'PAGADA', ?, ?)`,
      [pago.monto_total, pago.metodo_pago, citaId]
    );

    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('DEVOLUCION_POR_CANCELACION', 'Transaccion', ?, ?, ?)`,
      [
        req?.ip || null,
        JSON.stringify({
          cita_id: Number(citaId),
          monto: Number(pago.monto_total),
          horas_anticipacion: Math.round(anticipacion),
        }),
        req?.user?.usuario_id ?? null,
      ]
    );

    // El aviso queda en la campana (y sale por correo/push si corresponde).
    const [[paciente]] = await conexion.execute(
      `SELECT pa.usuario_id FROM Cita c
         JOIN Paciente pa ON pa.paciente_id = c.paciente_id
        WHERE c.cita_id = ? LIMIT 1`,
      [citaId]
    );
    if (paciente) {
      await notificarUsuario(
        conexion,
        paciente.usuario_id,
        'DEVOLUCION_PAGO',
        `Cancelaste con ${Math.floor(anticipacion)} horas de anticipación, así que te devolvimos ` +
          `$${Number(pago.monto_total).toLocaleString('es-CL')} por la sesión. ` +
          'Lo verás como devolución en Pagos y Bonos.'
      ).catch(() => {});
    }

    return { devuelto: Number(pago.monto_total) };
  } catch (error) {
    console.error('[devolverPorCancelacion RF74]', error.message);
    return null;
  }
}

exports.devolverPorCancelacion = devolverPorCancelacion;

// ─────────────────────────────────────────────────────────────────────────────
//  CU75 — Liquidación de ganancias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/finanzas/liquidaciones?anio=&mes=   (Administrador)
 *
 * Calcula el monto del mes para cada profesional a partir de sus prestaciones
 * VALIDADAS, y muestra si ya se emitió la liquidación de ese periodo.
 */
exports.liquidacionesDelMes = async (req, res) => {
  const inicio = Date.now();
  const ahora = new Date();
  const anio = Number.parseInt(req.query?.anio, 10) || ahora.getFullYear();
  const mes = Number.parseInt(req.query?.mes, 10) || ahora.getMonth() + 1;

  if (mes < 1 || mes > 12 || anio < 2020 || anio > 2100) {
    return res.status(400).json({ error: 'PERIODO_INVALIDO', mensaje: 'Indica un mes válido.' });
  }

  try {
    const arancel = await arancelVigente();
    const porcentaje = await leerParametroEntero(pool, 'PORCENTAJE_HONORARIO_PROFESIONAL', 70);

    // Una prestación cuenta cuando la sesión quedó certificada (CU41): ese es
    // el "estado Validada" del caso de uso.
    const [filas] = await pool.query(
      `SELECT p.profesional_id,
              COALESCE(
                NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellido_paterno)), ''),
                CONCAT('Profesional #', p.profesional_id)
              ) AS profesional,
              COALESCE(e.nombre, 'General') AS especialidad,
              COUNT(c.cita_id) AS sesiones_validadas,
              l.liquidacion_id, l.bonificacion, l.monto_total AS total_emitido, l.momento_emision
         FROM Profesional p
         JOIN Usuario u ON u.usuario_id = p.usuario_id
         LEFT JOIN Especialidad e ON e.especialidad_id = p.especialidad_id
         LEFT JOIN Cita c
           ON c.profesional_id = p.profesional_id
          AND c.sesion_certificada_en IS NOT NULL
          AND YEAR(c.sesion_certificada_en) = ?
          AND MONTH(c.sesion_certificada_en) = ?
         LEFT JOIN Liquidacion l
           ON l.profesional_id = p.profesional_id AND l.anio = ? AND l.mes = ?
        WHERE u.cuenta_activo = TRUE
        GROUP BY p.profesional_id, u.nombres, u.apellido_paterno, e.nombre,
                 l.liquidacion_id, l.bonificacion, l.monto_total, l.momento_emision
        ORDER BY sesiones_validadas DESC, profesional ASC`,
      [anio, mes, anio, mes]
    );

    const valorSesion = Math.round(arancel * (porcentaje / 100));

    const liquidaciones = filas.map((f) => ({
      profesional_id: f.profesional_id,
      profesional: f.profesional,
      especialidad: f.especialidad,
      sesiones_validadas: Number(f.sesiones_validadas),
      // Excepción 2: cero prestaciones validadas da cero pesos, no un error.
      monto_prestaciones: Number(f.sesiones_validadas) * valorSesion,
      emitida: Boolean(f.liquidacion_id),
      bonificacion: f.liquidacion_id ? Number(f.bonificacion) : 0,
      monto_total: f.liquidacion_id ? Number(f.total_emitido) : Number(f.sesiones_validadas) * valorSesion,
      momento_emision: f.momento_emision || null,
    }));

    const duracion = Date.now() - inicio;
    // Excepción 4: el cálculo que pasa del tope queda anotado.
    const tope = await leerParametroEntero(pool, 'LATENCIA_MAXIMA_LIQUIDACION_MS', 2000);
    if (duracion > tope) {
      pool
        .query(
          `INSERT INTO Bitacora_Auditoria
              (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
           VALUES ('LATENCIA_LIQUIDACION', 'Liquidacion', ?, ?, ?)`,
          [req.ip || null, JSON.stringify({ anio, mes, milisegundos: duracion, tope }), req.user.usuario_id]
        )
        .catch(() => {});
    }

    return res.status(200).json({
      periodo: { anio, mes },
      valor_sesion: valorSesion,
      porcentaje_honorario: porcentaje,
      arancel,
      // Excepción 1: un periodo futuro simplemente no tiene prestaciones.
      periodo_futuro:
        anio > ahora.getFullYear() ||
        (anio === ahora.getFullYear() && mes > ahora.getMonth() + 1),
      liquidaciones,
      latencia_ms: duracion,
    });
  } catch (error) {
    console.error('[liquidacionesDelMes CU75]', error);
    return res.status(500).json({ error: 'No se pudo calcular la liquidación.' });
  }
};

/**
 * POST /api/finanzas/liquidaciones   (Administrador)
 * { profesional_id, anio, mes, bonificacion, observacion }
 *
 * Emite la liquidación. Una vez emitida es inalterable: es el respaldo del
 * pago y el profesional la ve en modo lectura.
 */
exports.emitirLiquidacion = async (req, res) => {
  const profesionalId = Number(req.body?.profesional_id);
  const anio = Number(req.body?.anio);
  const mes = Number(req.body?.mes);
  const bonificacion = Number(req.body?.bonificacion ?? 0);
  const observacion = String(req.body?.observacion || '').trim().slice(0, 255);

  if (!profesionalId || !anio || !mes) {
    return res.status(400).json({ error: 'DATOS_INCOMPLETOS' });
  }
  // Excepción 3: el campo monetario no admite letras. El servidor lo verifica
  // igual que la pantalla.
  if (!Number.isFinite(bonificacion) || bonificacion < 0) {
    return res.status(400).json({
      error: 'BONIFICACION_INVALIDA',
      mensaje: 'La bonificación debe ser un monto numérico igual o mayor que cero.',
    });
  }

  const conexion = await pool.getConnection();

  try {
    const [[yaEmitida]] = await conexion.execute(
      `SELECT liquidacion_id FROM Liquidacion
        WHERE profesional_id = ? AND anio = ? AND mes = ? LIMIT 1`,
      [profesionalId, anio, mes]
    );
    if (yaEmitida) {
      return res.status(409).json({
        error: 'YA_EMITIDA',
        mensaje:
          'La liquidación de ese periodo ya fue emitida y el historial es inalterable. ' +
          'Si hay una corrección, regístrala como bonificación del mes siguiente.',
      });
    }

    const arancel = await arancelVigente(conexion);
    const porcentaje = await leerParametroEntero(conexion, 'PORCENTAJE_HONORARIO_PROFESIONAL', 70);
    const valorSesion = Math.round(arancel * (porcentaje / 100));

    const [[conteo]] = await conexion.execute(
      `SELECT COUNT(*) AS sesiones FROM Cita
        WHERE profesional_id = ?
          AND sesion_certificada_en IS NOT NULL
          AND YEAR(sesion_certificada_en) = ?
          AND MONTH(sesion_certificada_en) = ?`,
      [profesionalId, anio, mes]
    );

    const sesiones = Number(conteo.sesiones);
    const montoPrestaciones = sesiones * valorSesion;
    const total = montoPrestaciones + Math.round(bonificacion);

    await conexion.beginTransaction();

    await conexion.execute(
      `INSERT INTO Liquidacion
          (anio, mes, sesiones_validadas, monto_prestaciones, bonificacion, monto_total,
           observacion, profesional_id, emitida_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        anio,
        mes,
        sesiones,
        montoPrestaciones,
        Math.round(bonificacion),
        total,
        observacion || null,
        profesionalId,
        req.user.usuario_id,
      ]
    );

    await conexion.execute(
      `INSERT INTO Bitacora_Auditoria
          (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('EMISION_LIQUIDACION', 'Liquidacion', ?, ?, ?)`,
      [
        req.ip || null,
        JSON.stringify({ profesional_id: profesionalId, anio, mes, sesiones, total }),
        req.user.usuario_id,
      ]
    );

    await conexion.commit();

    const [[profesional]] = await pool.query(
      `SELECT u.usuario_id FROM Profesional p
         JOIN Usuario u ON u.usuario_id = p.usuario_id
        WHERE p.profesional_id = ? LIMIT 1`,
      [profesionalId]
    );
    if (profesional) {
      notificarUsuario(
        pool,
        profesional.usuario_id,
        'LIQUIDACION_EMITIDA',
        `Tu liquidación de ${String(mes).padStart(2, '0')}/${anio} quedó emitida por $${total.toLocaleString('es-CL')}.`,
        { datos: { pantalla: 'MisLiquidaciones' } }
      ).catch(() => {});
    }

    return res.status(201).json({
      mensaje: `Liquidación emitida por $${total.toLocaleString('es-CL')}.`,
      sesiones_validadas: sesiones,
      monto_prestaciones: montoPrestaciones,
      bonificacion: Math.round(bonificacion),
      monto_total: total,
    });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[emitirLiquidacion CU75]', error);
    return res.status(500).json({ error: 'No se pudo emitir la liquidación.' });
  } finally {
    conexion.release();
  }
};

/** GET /api/finanzas/mis-liquidaciones   (Profesional) — solo lectura. */
exports.misLiquidaciones = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT l.liquidacion_id, l.anio, l.mes, l.sesiones_validadas, l.monto_prestaciones,
              l.bonificacion, l.monto_total, l.observacion, l.momento_emision
         FROM Liquidacion l
         JOIN Profesional p ON p.profesional_id = l.profesional_id
        WHERE p.usuario_id = ?
        ORDER BY l.anio DESC, l.mes DESC
        LIMIT 36`,
      [req.user.usuario_id]
    );
    return res.status(200).json({ liquidaciones: filas });
  } catch (error) {
    console.error('[misLiquidaciones CU75]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus liquidaciones.' });
  }
};
