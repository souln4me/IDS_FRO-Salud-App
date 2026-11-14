/**
 * Componente: C_API_REST
 * Casos de uso: CU72, CU66, CU68, CU52, CU13.
 *
 * CU72 — Ingresando datos mediante interfaz de contingencia (Incremento 4).
 *
 * Cuando el financiador no puede validar bonos (reintentos agotados o modo
 * forzado por un administrador, ver contingenciaService), el Profesional o
 * el Administrador transcriben el bono a mano. El bono queda PROVISORIO: la
 * cita queda habilitada comercialmente sin esperar al tercero, y cuando el
 * financiador vuelve, el administrador lo regulariza con la validación real.
 */

const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');
const C_API_Adapter = require('../componentes/C_API_Adapter');
const C_Despachador_Notificaciones = require('../componentes/C_Despachador_Notificaciones');
const C_Gestor_Contingencia = require('../componentes/C_Gestor_Contingencia');

const REGEX_FOLIO = /^BON-\d{6}$/;
const ESTADO_PROVISORIO = 'PROVISORIO';
const ESTADOS_CITA_HABILITABLES = ['AGENDADA', 'CONFIRMADA', 'EN_CURSO', 'REALIZADA'];

// Apoyo común: IP de origen para la bitácora
function obtenerIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
}

function esAdministrador(req) {
  return req.user?.nombre_rol === 'Administrador';
}

// CU13 — Registrando bitácora de auditoría de seguridad
async function auditar(req, accion, datos) {
  try {
    await C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES (?, 'Bono', ?, ?, ?)`,
      [accion, obtenerIP(req), JSON.stringify(datos), req.user?.usuario_id || null]
    );
  } catch (error) {
    console.error('[contingencia] sin registro en bitácora:', error.message);
  }
}

// CU72 — Ingresando Datos mediante Interfaz de Contingencia
/** Catálogo de financiadores; si no se puede leer, el formulario pasa a texto libre (Exc. 2). */
async function catalogoFinanciadores() {
  try {
    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT financiador_id, nombre_institucion FROM Financiador
        WHERE convenio_activo = TRUE ORDER BY nombre_institucion`
    );
    return { disponible: filas.length > 0, financiadores: filas };
  } catch (error) {
    console.error('[contingencia] catálogo de financiadores no disponible:', error.message);
    return { disponible: false, financiadores: [] };
  }
}

// CU12: el profesional solo ve sus citas
// Filtro por rol: el profesional ve sus citas; el administrador, todas.
function filtroDeRol(req) {
  return esAdministrador(req)
    ? { sql: '', params: [] }
    : { sql: 'AND pr.usuario_id = ?', params: [req.user.usuario_id] };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /pagos/contingencia — estado, citas por habilitar y bonos provisorios
// ─────────────────────────────────────────────────────────────────────────────
// CU72 — Ingresando Datos mediante Interfaz de Contingencia
exports.obtener = async (req, res) => {
  try {
    const estado = await C_Gestor_Contingencia.estadoContingencia(C_Capa_de_Acceso_a_Datos);
    const filtro = filtroDeRol(req);

    const [provisorios] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT b.bono_id, b.folio, b.monto_cobertura, b.copago, b.momento_registro_manual,
              COALESCE(f.nombre_institucion, b.financiador_manual) AS financiador,
              b.financiador_id IS NULL AS financiador_fuera_de_catalogo,
              c.cita_id, c.fecha_hora_inicio, c.estado AS estado_cita,
              CONCAT(upa.nombres, ' ', upa.apellido_paterno) AS paciente,
              CONCAT(upr.nombres, ' ', upr.apellido_paterno) AS profesional,
              CONCAT(ure.nombres, ' ', ure.apellido_paterno) AS registrado_por
         FROM Bono b
         JOIN Cita c ON c.cita_id = b.cita_id
         JOIN Paciente pa ON pa.paciente_id = c.paciente_id
         JOIN Usuario upa ON upa.usuario_id = pa.usuario_id
         JOIN Profesional pr ON pr.profesional_id = c.profesional_id
         JOIN Usuario upr ON upr.usuario_id = pr.usuario_id
         LEFT JOIN Financiador f ON f.financiador_id = b.financiador_id
         LEFT JOIN Usuario ure ON ure.usuario_id = b.registrado_por_usuario_id
        WHERE b.estado_validacion = ? ${filtro.sql}
        ORDER BY b.momento_registro_manual DESC
        LIMIT 100`,
      [ESTADO_PROVISORIO, ...filtro.params]
    );

    // El catálogo se entrega siempre: sin contingencia lo usa la regularización.
    const catalogo = await catalogoFinanciadores();

    // Excepción 1: con el adaptador operativo no se carga el formulario.
    if (!estado.activa) {
      return res.status(200).json({
        contingencia: estado, formulario: false, provisorios, citas: [],
        financiadores: catalogo.financiadores, catalogo_disponible: catalogo.disponible,
      });
    }

    const [citas] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT c.cita_id, c.fecha_hora_inicio, c.estado,
              CONCAT(upa.nombres, ' ', upa.apellido_paterno) AS paciente,
              CONCAT(upr.nombres, ' ', upr.apellido_paterno) AS profesional,
              b.estado_validacion, b.folio
         FROM Cita c
         JOIN Paciente pa ON pa.paciente_id = c.paciente_id
         JOIN Usuario upa ON upa.usuario_id = pa.usuario_id
         JOIN Profesional pr ON pr.profesional_id = c.profesional_id
         JOIN Usuario upr ON upr.usuario_id = pr.usuario_id
         LEFT JOIN Bono b ON b.cita_id = c.cita_id
        WHERE c.estado IN (?)
          AND (b.bono_id IS NULL OR b.estado_validacion NOT IN ('VALIDADO', ?))
          AND c.fecha_hora_inicio BETWEEN NOW() - INTERVAL 30 DAY AND NOW() + INTERVAL 30 DAY
          ${filtro.sql}
        ORDER BY ABS(TIMESTAMPDIFF(MINUTE, NOW(), c.fecha_hora_inicio))
        LIMIT 50`,
      [ESTADOS_CITA_HABILITABLES, ESTADO_PROVISORIO, ...filtro.params]
    );

    return res.status(200).json({
      contingencia: estado,
      formulario: true,
      catalogo_disponible: catalogo.disponible,
      financiadores: catalogo.financiadores,
      arancel: await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'ARANCEL_ESPECIALIDAD', 40000),
      citas,
      provisorios,
    });
  } catch (error) {
    console.error('[contingencia.obtener]', error);
    return res.status(500).json({ error: 'No se pudo consultar el estado de contingencia.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /pagos/citas/:id/bono-contingencia
// { folio, financiador_id | financiador_nombre, monto_cobertura, copago }
// ─────────────────────────────────────────────────────────────────────────────
// CU72 — Ingresando Datos mediante Interfaz de Contingencia
exports.registrar = async (req, res) => {
  const citaId = Number(req.params.id);
  const folio = String(req.body?.folio || '').trim().toUpperCase();
  const financiadorId = req.body?.financiador_id ? Number(req.body.financiador_id) : null;
  const financiadorNombre = String(req.body?.financiador_nombre || '').trim();
  const cobertura = req.body?.monto_cobertura;
  const copago = req.body?.copago;

  try {
    const estado = await C_Gestor_Contingencia.estadoContingencia(C_Capa_de_Acceso_a_Datos);
    // Excepción 1: el adaptador está operativo → validación estándar.
    if (!estado.activa) {
      return res.status(409).json({
        error: 'ADAPTADOR_OPERATIVO',
        mensaje: 'El financiador está respondiendo con normalidad. El bono se valida de forma automática desde Pagos y bonos del paciente.',
      });
    }

    // Excepción 3: atributos obligatorios ausentes o inválidos, campo por campo.
    const campos = {};
    if (!folio) campos.folio = 'Ingresa el folio del bono.';
    else if (!REGEX_FOLIO.test(folio)) campos.folio = 'El folio debe tener el formato BON-XXXXXX (6 dígitos).';
    if (!financiadorId && financiadorNombre.length < 3) campos.financiador = 'Indica el financiador del bono.';
    if (financiadorNombre.length > 100) campos.financiador = 'El nombre del financiador admite hasta 100 caracteres.';
    const montoValido = (v) => v !== '' && v !== null && v !== undefined && Number.isInteger(Number(v)) && Number(v) >= 0;
    if (!montoValido(cobertura)) campos.monto_cobertura = 'Ingresa el monto de cobertura (número entero, sin puntos).';
    if (!montoValido(copago)) campos.copago = 'Ingresa el copago (número entero, sin puntos).';
    if (Object.keys(campos).length > 0) {
      return res.status(400).json({
        error: 'CAMPOS_OBLIGATORIOS',
        campos,
        mensaje: 'Faltan datos del bono o tienen un formato inválido. Revisa los campos marcados.',
      });
    }

    const filtro = filtroDeRol(req);
    const [[cita]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT c.cita_id, c.estado, c.paciente_id, pa.usuario_id AS usuario_paciente
         FROM Cita c
         JOIN Profesional pr ON pr.profesional_id = c.profesional_id
         JOIN Paciente pa ON pa.paciente_id = c.paciente_id
        WHERE c.cita_id = ? ${filtro.sql} LIMIT 1`,
      [citaId, ...filtro.params]
    );
    if (!cita) {
      return res.status(404).json({ error: 'CITA_NO_ENCONTRADA', mensaje: 'La cita no existe o no está a tu cargo.' });
    }
    if (!ESTADOS_CITA_HABILITABLES.includes(cita.estado)) {
      return res.status(409).json({ error: 'CITA_NO_HABILITADA', mensaje: `Una cita ${String(cita.estado).toLowerCase()} no admite bonos.` });
    }

    let idFinanciador = null;
    if (financiadorId) {
      const [[existe]] = await C_Capa_de_Acceso_a_Datos.query(
        `SELECT financiador_id FROM Financiador WHERE financiador_id = ? LIMIT 1`,
        [financiadorId]
      ).catch(() => [[null]]);
      if (!existe) {
        return res.status(400).json({ error: 'CAMPOS_OBLIGATORIOS', campos: { financiador: 'El financiador elegido no existe.' }, mensaje: 'Revisa el financiador.' });
      }
      idFinanciador = financiadorId;
    }

    const [[previo]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT bono_id, estado_validacion FROM Bono WHERE cita_id = ? LIMIT 1`,
      [citaId]
    );
    if (previo?.estado_validacion === 'VALIDADO') {
      return res.status(409).json({ error: 'BONO_YA_VALIDADO', mensaje: 'Esta cita ya tiene un bono validado por el financiador.' });
    }

    const payload = JSON.stringify({
      contingencia: true,
      origen: estado.origen,
      motivo: estado.motivo,
      registrado_por: req.user.usuario_id,
    });
    const valores = [folio, Number(cobertura), Number(copago), ESTADO_PROVISORIO, payload, idFinanciador,
      idFinanciador ? null : financiadorNombre, req.user.usuario_id];

    if (previo) {
      await C_Capa_de_Acceso_a_Datos.query(
        `UPDATE Bono
            SET folio = ?, monto_cobertura = ?, copago = ?, estado_validacion = ?, payload_respuesta = ?,
                financiador_id = ?, financiador_manual = ?, registrado_por_usuario_id = ?,
                momento_registro_manual = NOW(), regularizado_en = NULL
          WHERE bono_id = ?`,
        [...valores, previo.bono_id]
      );
    } else {
      await C_Capa_de_Acceso_a_Datos.query(
        `INSERT INTO Bono
           (folio, monto_cobertura, copago, estado_validacion, payload_respuesta, financiador_id,
            financiador_manual, registrado_por_usuario_id, momento_registro_manual, cita_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [...valores, citaId]
      );
    }

    await auditar(req, 'BONO_CONTINGENCIA_REGISTRADO', {
      cita_id: citaId, folio, monto_cobertura: Number(cobertura), copago: Number(copago),
      financiador_id: idFinanciador, financiador_manual: idFinanciador ? null : financiadorNombre,
      origen_contingencia: estado.origen,
    });
    // CU52: aviso al paciente
    await C_Despachador_Notificaciones.notificarUsuario(
      C_Capa_de_Acceso_a_Datos,
      cita.usuario_paciente,
      'BONO_PROVISORIO',
      `Tu bono ${folio} quedó registrado de forma provisoria mientras el financiador no responde. Tu atención sigue en pie; copago informado: $${Number(copago).toLocaleString('es-CL')}.`,
      { datos: { pantalla: 'Pagos', cita_id: citaId } }
    );

    return res.status(201).json({
      mensaje: 'Bono registrado en modo contingencia. La cita queda habilitada de forma provisoria hasta que el financiador lo valide.',
      estado_validacion: ESTADO_PROVISORIO,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'FOLIO_YA_REGISTRADO',
        campos: { folio: 'Ese folio ya está registrado en otra cita.' },
        mensaje: 'Ese folio ya está registrado en otra cita. Cada bono cubre una sola atención.',
      });
    }
    // Excepción 4: error de persistencia → se informa y se puede reintentar.
    console.error('[contingencia.registrar]', error);
    return res.status(500).json({
      error: 'PERSISTENCIA_FALLIDA',
      mensaje: 'La operación no pudo ser procesada y el bono no se guardó. Tus datos siguen en el formulario: reintenta el envío.',
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /pagos/contingencia/modo  { activo }  (Administrador)
// ─────────────────────────────────────────────────────────────────────────────
// CU72 — Ingresando Datos mediante Interfaz de Contingencia
exports.cambiarModo = async (req, res) => {
  const activo = req.body?.activo === true || req.body?.activo === 1 || req.body?.activo === '1';
  try {
    await C_Capa_de_Acceso_a_Datos.query(
      `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id)
       VALUES (?, ?, 'Fuerza la interfaz de contingencia de bonos (1) o la deja en automático (0).', ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor), administrador_id = VALUES(administrador_id)`,
      [C_Gestor_Contingencia.CLAVE_MODO, activo ? '1' : '0', req.user.usuario_id]
    );
    await auditar(req, activo ? 'CONTINGENCIA_ACTIVADA' : 'CONTINGENCIA_DESACTIVADA', { clave: C_Gestor_Contingencia.CLAVE_MODO });
    return res.status(200).json({
      mensaje: activo
        ? 'Modo de contingencia activado: profesionales y administradores pueden ingresar bonos a mano.'
        : 'Modo de contingencia desactivado: vuelve la validación automática (salvo que el financiador siga caído).',
      contingencia: await C_Gestor_Contingencia.estadoContingencia(C_Capa_de_Acceso_a_Datos),
    });
  } catch (error) {
    console.error('[contingencia.cambiarModo]', error);
    return res.status(500).json({ error: 'No se pudo cambiar el modo de contingencia.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /pagos/bonos/:id/regularizar  { financiador_id? }  (Administrador)
// Con el financiador de vuelta, el bono provisorio pasa por la validación real.
// ─────────────────────────────────────────────────────────────────────────────
// CU72, CU66 — regularizar el bono provisorio con el financiador
exports.regularizar = async (req, res) => {
  try {
    const estado = await C_Gestor_Contingencia.estadoContingencia(C_Capa_de_Acceso_a_Datos);
    if (estado.activa) {
      return res.status(409).json({
        error: 'CONTINGENCIA_ACTIVA',
        mensaje: estado.forzada
          ? 'El modo de contingencia sigue activado. Desactívalo para validar el bono con el financiador.'
          : 'El financiador sigue sin responder. Intenta regularizar más tarde.',
      });
    }

    const [[bono]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT b.bono_id, b.folio, b.financiador_id, b.cita_id, f.rut_institucion
         FROM Bono b LEFT JOIN Financiador f ON f.financiador_id = b.financiador_id
        WHERE b.bono_id = ? AND b.estado_validacion = ? LIMIT 1`,
      [req.params.id, ESTADO_PROVISORIO]
    );
    if (!bono) {
      return res.status(404).json({ error: 'BONO_NO_PROVISORIO', mensaje: 'El bono no existe o ya fue regularizado.' });
    }

    let financiadorId = bono.financiador_id;
    let rut = bono.rut_institucion;
    if (!financiadorId) {
      // Se registró con texto libre: para validarlo hay que elegirlo del catálogo.
      const elegido = Number(req.body?.financiador_id);
      const [[f]] = elegido
        ? await C_Capa_de_Acceso_a_Datos.query(`SELECT financiador_id, rut_institucion FROM Financiador WHERE financiador_id = ? AND convenio_activo = TRUE`, [elegido])
        : [[null]];
      if (!f) {
        return res.status(400).json({
          error: 'FINANCIADOR_REQUERIDO',
          mensaje: 'Este bono se registró con un financiador escrito a mano. Elige el financiador del catálogo para validarlo.',
        });
      }
      financiadorId = f.financiador_id;
      rut = f.rut_institucion;
    }

    const arancel = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(C_Capa_de_Acceso_a_Datos, 'ARANCEL_ESPECIALIDAD', 40000);
    let resultado;
    // CU68: validación real con el financiador externo
    try {
      resultado = await C_API_Adapter.ejecutarTransaccion({
        proveedor: 'FINANCIADOR',
        operacion: 'VALIDAR_BONO',
        usuarioId: req.user.usuario_id,
        datosInternos: { folio: bono.folio, rut_institucion: rut, monto_prestacion: arancel },
      });
    } catch (errorAdapter) {
      return res.status(503).json({
        error: errorAdapter.code || 'FINANCIADOR_NO_DISPONIBLE',
        mensaje: 'El financiador no respondió. El bono sigue provisorio y la contingencia se reactiva sola.',
      });
    }

    const validado = resultado.datos.estado === 'VALIDADO';
    const nuevoEstado = validado ? 'VALIDADO' : 'NO_VALIDADO';
    await C_Capa_de_Acceso_a_Datos.query(
      `UPDATE Bono
          SET estado_validacion = ?, monto_cobertura = ?, copago = ?, financiador_id = ?,
              payload_respuesta = JSON_SET(COALESCE(payload_respuesta, JSON_OBJECT()), '$.regularizacion', CAST(? AS JSON)),
              regularizado_en = NOW()
        WHERE bono_id = ?`,
      [nuevoEstado, resultado.datos.montoCobertura, resultado.datos.copago, financiadorId,
        JSON.stringify({ ...resultado.datos, meta: resultado.meta }), bono.bono_id]
    );
    await auditar(req, 'BONO_CONTINGENCIA_REGULARIZADO', { bono_id: bono.bono_id, folio: bono.folio, resultado: nuevoEstado });

    return res.status(200).json({
      estado_validacion: nuevoEstado,
      mensaje: validado
        ? `Bono ${bono.folio} validado por el financiador. Cobertura $${resultado.datos.montoCobertura.toLocaleString('es-CL')}, copago $${resultado.datos.copago.toLocaleString('es-CL')}.`
        : `El financiador rechazó el bono ${bono.folio} (${resultado.datos.estado}). Quedó como no validado.`,
    });
  } catch (error) {
    console.error('[contingencia.regularizar]', error);
    return res.status(500).json({ error: 'No se pudo regularizar el bono. Intenta nuevamente.' });
  }
};
