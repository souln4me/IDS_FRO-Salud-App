const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const { comparePassword } = require('../utils/encriptar_bcrypt');
const { crearOTP, validarOTP, enviarPorEmail, explicarErrorSMTP } = require('../services/notifications/otpService');
const {
    DURACION_SESION_HORAS,
    validarRobustezContrasena,
    crearSesion,
    revocarTodasLasSesiones,
} = require('../services/auth/seguridadService');

// D4: la política de contraseña (8+, letra, número y símbolo) se exige
// también al registrarse; antes el registro aceptaba "11111111".
function rechazoPorContrasenaDebil(res, contrasena) {
    const robustez = validarRobustezContrasena(contrasena);
    if (robustez.valida) return false;
    res.status(400).json({
        error: 'CONTRASENA_DEBIL',
        mensaje: 'La contraseña no cumple los requisitos de seguridad.',
        requisitos: robustez.incumplidos,
    });
    return true;
}

// D7 / CU05 Exc.4: cada intento de acceso denegado deja rastro (RNF08).
async function registrarLoginFallido(req, rut, motivo, usuarioId = null) {
    try {
        await pool.query(
            `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
             VALUES ('LOGIN_FALLIDO', 'Usuario', ?, ?, ?)`,
            [req.ip || null, JSON.stringify({ rut, motivo }), usuarioId]
        );
    } catch (error) {
        console.error('[login] No se pudo registrar el intento fallido:', error.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas fantasma: un registro que nunca completó la verificación OTP deja
// un Usuario inactivo que bloquea el RUT y el correo para siempre (la app no
// tiene función de borrado). Antes de registrar, se eliminan esas cuentas
// a medio crear para que la persona pueda volver a intentarlo.
// Las cuentas ACTIVAS jamás se tocan.
// ─────────────────────────────────────────────────────────────────────────────
async function eliminarCuentasInactivas(connection, rut, email) {
    const [existentes] = await connection.execute(
        `SELECT usuario_id, cuenta_activo FROM Usuario WHERE rut = ? OR email = ?`,
        [rut, email]
    );

    for (const usuario of existentes) {
        if (usuario.cuenta_activo) {
            // Una cuenta verificada nunca se reemplaza.
            return { bloqueadoPorCuentaActiva: true };
        }
    }

    for (const usuario of existentes) {
        const id = usuario.usuario_id;

        // Rama profesional (la disponibilidad depende de Profesional)
        const [profesionales] = await connection.execute(
            `SELECT profesional_id FROM Profesional WHERE usuario_id = ?`, [id]
        );
        for (const profesional of profesionales) {
            await connection.execute(
                `DELETE FROM Profesional_Disponibilidad WHERE profesional_id = ?`,
                [profesional.profesional_id]
            );
        }
        await connection.execute(`DELETE FROM Profesional WHERE usuario_id = ?`, [id]);

        // Rama paciente (el contacto de emergencia se borra después que Paciente)
        const [pacientes] = await connection.execute(
            `SELECT contacto_emergencia_id FROM Paciente WHERE usuario_id = ?`, [id]
        );
        await connection.execute(`DELETE FROM Paciente WHERE usuario_id = ?`, [id]);
        for (const paciente of pacientes) {
            if (paciente.contacto_emergencia_id) {
                await connection.execute(
                    `DELETE FROM Contacto_Emergencia WHERE contacto_emergencia_id = ?`,
                    [paciente.contacto_emergencia_id]
                );
            }
        }

        // Resto de tablas que apuntan a Usuario
        await connection.execute(`DELETE FROM Sesion_Usuario WHERE usuario_id = ?`, [id]);
        await connection.execute(`DELETE FROM Usuario_Telefono WHERE usuario_id = ?`, [id]);
        await connection.execute(`DELETE FROM Notificacion WHERE usuario_id = ?`, [id]);
        await connection.execute(`DELETE FROM Ticket_Soporte WHERE usuario_id = ?`, [id]);
        await connection.execute(`DELETE FROM Bitacora_Auditoria WHERE usuario_id = ?`, [id]);

        await connection.execute(`DELETE FROM Usuario WHERE usuario_id = ?`, [id]);
        console.log(`[registro] Cuenta inactiva ${id} reemplazada (rut/email reutilizados).`);
    }

    return { eliminadas: existentes.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO PACIENTE
// ─────────────────────────────────────────────────────────────────────────────
exports.registrarPaciente = async (req, res) => {
    const {
        rut, nombres, apellido_paterno, apellido_materno, email, telefono,
        contrasena, confirmar_contrasena,
        sexo_clinico, calle, numero_calle, departamento, comuna_id,
        emergencia_nombre, emergencia_parentesco, emergencia_telefono
    } = req.body;

    if (contrasena !== confirmar_contrasena) {
        return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
    }
    if (rechazoPorContrasenaDebil(res, contrasena)) return;

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Si el RUT/correo quedó tomado por una cuenta que nunca se verificó,
        // se limpia aquí; si pertenece a una cuenta activa, se rechaza.
        const limpieza = await eliminarCuentasInactivas(connection, rut, email);
        if (limpieza.bloqueadoPorCuentaActiva) {
            await connection.rollback();
            return res.status(409).json({
                error: 'El RUT o correo ya pertenece a una cuenta verificada.'
            });
        }

        const saltRounds = 10;
        const contrasena_hash = await bcrypt.hash(contrasena, saltRounds);
        const rolPacienteId = 1;

        const [userResult] = await connection.execute(
            `INSERT INTO Usuario (rut, nombres, apellido_paterno, apellido_materno, email, contrasena_hash, rol_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [rut, nombres, apellido_paterno, apellido_materno, email, contrasena_hash, rolPacienteId]
        );
        const usuario_id = userResult.insertId;

        await connection.execute(
            `INSERT INTO Usuario_Telefono (usuario_id, telefono) VALUES (?, ?)`,
            [usuario_id, telefono]
        );

        const [contactoResult] = await connection.execute(
            `INSERT INTO Contacto_Emergencia (nombre, telefono, parentesco) VALUES (?, ?, ?)`,
            [emergencia_nombre, emergencia_telefono, emergencia_parentesco]
        );
        const contacto_emergencia_id = contactoResult.insertId;

        await connection.execute(
            `INSERT INTO Paciente (sexo_clinico, calle, numero_calle, departamento, contacto_emergencia_id, usuario_id, comuna_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sexo_clinico, calle, numero_calle, departamento || null, contacto_emergencia_id, usuario_id, comuna_id]
        );

        await connection.commit();

        // CU04: Generar OTP y responder de inmediato. El correo se envía en
        // segundo plano: si el SMTP está lento o caído, el usuario no debe
        // quedar esperando — puede reenviar el código desde OTPScreen.
        const { codigo } = await crearOTP(usuario_id);
        enviarPorEmail(email, codigo).catch((errorSMTP) => {
            console.error("Error SMTP en registro paciente:", errorSMTP.message);
        });

        res.status(201).json({
            mensaje: 'Paciente registrado. Verifica tu cuenta con el código enviado a tu correo.',
            usuario_id,
            email
        });

    } catch (error) {
        await connection.rollback();
        console.error("Error en registro:", error);
        res.status(500).json({
            error: 'Servicio no disponible temporalmente. Ocurrió un error interno.'
        });
    } finally {
        connection.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// OBTENER ESPECIALIDADES
// ─────────────────────────────────────────────────────────────────────────────
exports.obtenerEspecialidades = async (req, res) => {
    try {
        const [filas] = await pool.query('SELECT especialidad_id, nombre FROM Especialidad');
        res.status(200).json(filas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener especialidades' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAR PROFESIONAL
// ─────────────────────────────────────────────────────────────────────────────
exports.validarProfesional = async (req, res) => {
    const { rut } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT habilitado FROM Profesional_Autorizado WHERE rut_autorizado = ?',
            [rut]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'El RUT ingresado no figura en la nómina de profesionales autorizados.' });
        }
        if (!rows[0].habilitado) {
            return res.status(403).json({ error: 'El profesional se encuentra inhabilitado en el sistema.' });
        }
        res.status(200).json({ mensaje: 'Profesional validado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno de validación.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRAR PROFESIONAL
// ─────────────────────────────────────────────────────────────────────────────
exports.registrarProfesional = async (req, res) => {
    const {
        rut, nombres, apellido_paterno, apellido_materno, email, telefono, contrasena,
        num_registro_salud, especialidad_id, tipo_sede, resena_curricular, disponibilidad
    } = req.body;

    if (rechazoPorContrasenaDebil(res, contrasena)) return;

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Misma limpieza de cuentas fantasma que en el registro de paciente.
        const limpieza = await eliminarCuentasInactivas(connection, rut, email);
        if (limpieza.bloqueadoPorCuentaActiva) {
            await connection.rollback();
            return res.status(409).json({
                error: 'El RUT o correo ya pertenece a una cuenta verificada.'
            });
        }

        const saltRounds = 10;
        const contrasena_hash = await bcrypt.hash(contrasena, saltRounds);
        const rolProfesionalId = 2;

        const [userResult] = await connection.execute(
            `INSERT INTO Usuario (rut, nombres, apellido_paterno, apellido_materno, email, contrasena_hash, rol_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [rut, nombres, apellido_paterno, apellido_materno, email, contrasena_hash, rolProfesionalId]
        );
        const usuario_id = userResult.insertId;

        await connection.execute(
            `INSERT INTO Usuario_Telefono (usuario_id, telefono) VALUES (?, ?)`,
            [usuario_id, telefono]
        );

        const [profResult] = await connection.execute(
            `INSERT INTO Profesional (num_registro_salud, reseña_curricular, calificacion_promedio, foto_url, tipo_sede, usuario_id, especialidad_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [num_registro_salud, resena_curricular, 0.00, 'default.jpg', tipo_sede, usuario_id, especialidad_id]
        );
        const profesional_id = profResult.insertId;

        if (disponibilidad && disponibilidad.length > 0) {
            const MODALIDADES_VALIDAS = ['DOMICILIO', 'ONLINE', 'AMBOS'];
            for (let bloque of disponibilidad) {
                // Cada bloque trae su propia modalidad; si no viene (app
                // antigua), hereda la modalidad general del profesional.
                const modalidadBloque = MODALIDADES_VALIDAS.includes(bloque.modalidad)
                    ? bloque.modalidad
                    : tipo_sede;

                await connection.execute(
                    `INSERT INTO Profesional_Disponibilidad (profesional_id, dia_semana, hora_inicio, hora_fin, modalidad) VALUES (?, ?, ?, ?, ?)`,
                    [profesional_id, bloque.dia_semana, bloque.hora_inicio, bloque.hora_fin, modalidadBloque]
                );
            }
        }

        await connection.commit();

        // CU04: igual que en el registro de paciente, el correo no bloquea la
        // respuesta; se envía en segundo plano.
        const { codigo } = await crearOTP(usuario_id);
        enviarPorEmail(email, codigo).catch((errorSMTP) => {
            console.error("Error SMTP en registro profesional:", errorSMTP.message);
        });

        res.status(201).json({
            mensaje: 'Profesional registrado. Verifica tu cuenta con el código enviado a tu correo.',
            usuario_id,
            email
        });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Ocurrió un error al registrar el perfil. Verifique datos duplicados (Email/RUT/Registro).' });
    } finally {
        connection.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICAR UNICIDAD
// ─────────────────────────────────────────────────────────────────────────────
exports.verificarUnicidad = async (req, res) => {
    const { rut, email } = req.body;
    try {
        // Solo las cuentas VERIFICADAS bloquean el registro. Una cuenta que
        // nunca completó su OTP es un registro a medias: se informa y el
        // proceso de registro la reemplazará.
        const [rutExistente] = await pool.query(
            'SELECT usuario_id, cuenta_activo FROM Usuario WHERE rut = ?', [rut]
        );
        if (rutExistente.length > 0 && rutExistente[0].cuenta_activo) {
            return res.status(409).json({ error: 'El RUT ingresado ya se encuentra registrado en el sistema.', campo: 'rut' });
        }

        const [emailExistente] = await pool.query(
            'SELECT usuario_id, cuenta_activo FROM Usuario WHERE email = ?', [email]
        );
        if (emailExistente.length > 0 && emailExistente[0].cuenta_activo) {
            return res.status(409).json({ error: 'El correo electrónico ya está vinculado a otra cuenta.', campo: 'email' });
        }

        const reemplazo = rutExistente.length > 0 || emailExistente.length > 0;

        res.status(200).json({
            mensaje: reemplazo
                ? 'Existía un registro anterior sin verificar con estos datos; será reemplazado.'
                : 'Datos únicos, puede continuar.',
            reemplazo
        });
    } catch (error) {
        res.status(500).json({ error: 'Error interno al consultar el modelo de datos.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CU04 — SOLICITAR OTP
// POST /api/auth/otp/solicitar
// ─────────────────────────────────────────────────────────────────────────────
exports.solicitarOTP = async (req, res) => {
    const { usuario_id } = req.body;

    if (!usuario_id) {
        return res.status(400).json({ error: 'usuario_id es requerido.' });
    }

    try {
        const [usuarios] = await pool.query(
            `SELECT usuario_id, email, cuenta_activo FROM Usuario WHERE usuario_id = ?`,
            [usuario_id]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        if (usuarios[0].cuenta_activo) {
            return res.status(409).json({ error: 'La cuenta ya está activa.' });
        }

        const { codigo } = await crearOTP(usuario_id);

        try {
            await enviarPorEmail(usuarios[0].email, codigo);
        } catch (errorSMTP) {
            const explicacion = explicarErrorSMTP(errorSMTP);
            console.error(
                `[OTP] Envío fallido: ${explicacion} ` +
                `(code=${errorSMTP.code || '-'} responseCode=${errorSMTP.responseCode || '-'})`
            );

            try {
                await pool.query(
                    `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, usuario_id, datos_adicionales)
                     VALUES ('OTP_ENVIO_FALLIDO', 'Usuario', ?, ?)`,
                    [usuario_id, JSON.stringify({ error: errorSMTP.message })]
                );
            } catch (errorBitacora) {
                console.error('[OTP] No se pudo registrar en bitácora:', errorBitacora.message);
            }

            return res.status(502).json({
                error: 'ENVIO_FALLIDO',
                // El problema es del servidor de correo, no de la conexión de
                // quien usa la app: se dice qué pasa realmente.
                mensaje: 'No se pudo enviar el código: el servicio de correo del sistema no está disponible.',
                detalle: explicacion
            });
        }

        return res.status(200).json({ mensaje: 'Código enviado al correo registrado.' });

    } catch (error) {
        console.error('[solicitarOTP]', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CU04 — VERIFICAR OTP
// POST /api/auth/otp/verificar
// ─────────────────────────────────────────────────────────────────────────────
exports.verificarOTP = async (req, res) => {
    const { usuario_id, codigo } = req.body;
    console.log("verificarOTP recibido:", { usuario_id, codigo });

    if (!usuario_id || !codigo) {
        return res.status(400).json({ error: 'usuario_id y codigo son requeridos.' });
    }

    try {
        const resultado = await validarOTP(usuario_id, codigo);
        console.log("resultado validarOTP:", resultado);

        if (!resultado.valido) {
            return res.status(400).json({ error: resultado.error, mensaje: resultado.mensaje });
        }

        try {
            await pool.query(
                `UPDATE Usuario
                    SET cuenta_activo  = TRUE,
                        otp_codigo     = NULL,
                        otp_expiracion = NULL
                  WHERE usuario_id = ?`,
                [usuario_id]
            );
        } catch (errorBD) {
            await pool.query(
                `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, usuario_id, datos_adicionales)
                 VALUES ('OTP_ACTIVACION_FALLIDA', 'Usuario', ?, ?)`,
                [usuario_id, JSON.stringify({ error: errorBD.message })]
            );
            return res.status(500).json({
                error: 'PERSISTENCIA_FALLIDA',
                mensaje: 'No se pudo activar la cuenta. Intenta nuevamente.'
            });
        }

        return res.status(200).json({ mensaje: 'Cuenta activada exitosamente. Ya puedes iniciar sesión.' });

    } catch (error) {
        console.error('[verificarOTP]', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CU05 — LOGIN
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
    const { rut, contrasena } = req.body;

    if (!rut || !contrasena) {
        return res.status(400).json({ error: 'El RUT y la contraseña son obligatorios.' });
    }

    try {
        const usuario = await UserModel.findByRutActive(rut);

        if (!usuario) {
            await registrarLoginFallido(req, rut, 'USUARIO_INEXISTENTE_O_INACTIVO');
            return res.status(401).json({ error: 'Credenciales inválidas. Verifique su RUT y contraseña.' });
        }

        const contrasenaCorrecta = await comparePassword(contrasena, usuario.contrasena_hash);

        if (!contrasenaCorrecta) {
            await registrarLoginFallido(req, rut, 'CONTRASENA_INCORRECTA', usuario.usuario_id);
            return res.status(401).json({ error: 'Credenciales inválidas. Verifique su RUT y contraseña.' });
        }

        // CU08: cada inicio de sesión queda registrado por dispositivo y su
        // identificador viaja dentro del token, para poder revocarlo remoto.
        const jti = await crearSesion(
            pool,
            usuario.usuario_id,
            req.body?.dispositivo,
            req.ip,
            req.body?.dispositivo_id
        );

        const payload = {
            usuario_id: usuario.usuario_id,
            nombre_rol: usuario.nombre_rol,
            jti
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${DURACION_SESION_HORAS}h` });

        res.status(200).json({
            mensaje: 'Autenticación exitosa.',
            token,
            usuario: {
                usuario_id: usuario.usuario_id,
                nombres: usuario.nombres,
                apellido_paterno: usuario.apellido_paterno,
                rol: usuario.nombre_rol
            }
        });

    } catch (error) {
        console.error(" Error crítico en Login:", error);
        res.status(500).json({
            error: 'Servicio de autenticación no disponible temporalmente. Intente nuevamente en unos segundos.'
        });
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// CU06 — SOLICITAR RESTABLECIMIENTO DE CREDENCIALES
// POST /api/auth/recuperar/solicitar   { email }
// ─────────────────────────────────────────────────────────────────────────────

/** Busca al usuario, genera el OTP y lo envía. Compartido por CU06 y CU07. */
async function despacharOTPRecuperacion(usuario) {
    const { codigo } = await crearOTP(usuario.usuario_id);
    enviarPorEmail(usuario.email, codigo, 'RECUPERACION').catch((errorSMTP) => {
        console.error('[recuperacion] Error SMTP:', explicarErrorSMTP(errorSMTP));
    });
}

exports.solicitarRecuperacion = async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();

    // Excepción 3 (CU06): formato de correo inválido se rechaza de entrada.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            error: 'EMAIL_INVALIDO',
            mensaje: 'Ingresa un correo electrónico válido.'
        });
    }

    try {
        const [usuarios] = await pool.query(
            `SELECT usuario_id, email FROM Usuario WHERE email = ? LIMIT 1`,
            [email]
        );

        if (usuarios.length > 0) {
            await despacharOTPRecuperacion(usuarios[0]);
        }

        // Excepción 4 (CU06): la respuesta es idéntica exista o no la cuenta,
        // para no revelar qué correos están registrados.
        return res.status(200).json({
            mensaje: 'Si el correo está registrado, recibirás un código de verificación en unos minutos.'
        });
    } catch (error) {
        console.error('[solicitarRecuperacion]', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CU07 — EJECUTAR CAMBIO DE CONTRASEÑA
// Paso 1: POST /api/auth/recuperar/verificar   { email, codigo }
// Paso 2: POST /api/auth/recuperar/confirmar   { email, codigo, nueva_contrasena }
// Con sesión iniciada: /api/auth/cambio-contrasena/verificar|confirmar (sin email)
// ─────────────────────────────────────────────────────────────────────────────

const CODIGO_INVALIDO = {
    status: 400,
    cuerpo: { error: 'CODIGO_INVALIDO', mensaje: 'El código no es válido. Revisa e intenta de nuevo.' }
};

// Excepción 4 (CU07): la clave anterior sigue vigente porque se revierte todo.
const FALLO_PERSISTENCIA = {
    status: 500,
    cuerpo: {
        error: 'PERSISTENCIA_FALLIDA',
        mensaje: 'No se pudo completar el cambio: se interrumpió la comunicación con el servidor de datos. Tu contraseña anterior sigue vigente; intenta nuevamente en unos momentos.'
    }
};

async function buscarUsuarioConOTP(columna, valor) {
    const [usuarios] = await pool.query(
        `SELECT usuario_id, email, otp_codigo, otp_expiracion
           FROM Usuario WHERE ${columna} = ? LIMIT 1`,
        [valor]
    );
    return usuarios[0] || null;
}

/**
 * Excepción 2 (CU07): el código no coincide con el registro activo o expiró.
 * Devuelve null si el código sirve; si no, la respuesta de rechazo. Un usuario
 * inexistente recibe el mismo rechazo genérico, para no revelar cuentas.
 */
function rechazoDeCodigo(usuario, codigo) {
    const codigoLimpio = String(codigo || '').trim();
    if (!usuario || !usuario.otp_codigo || !/^\d{6}$/.test(codigoLimpio)) {
        return CODIGO_INVALIDO;
    }
    if (!usuario.otp_expiracion || new Date() > new Date(usuario.otp_expiracion)) {
        return {
            status: 400,
            cuerpo: { error: 'CODIGO_INVALIDO', mensaje: 'El código expiró. Solicita uno nuevo.' }
        };
    }
    return usuario.otp_codigo === codigoLimpio ? null : CODIGO_INVALIDO;
}

/** Deja rastro del fallo; si la base sigue caída, al menos queda en consola. */
async function registrarFalloPersistencia(contexto, usuarioId, error) {
    const detalle = error.code || error.message;
    console.error(`[CU07] Fallo de persistencia (${contexto}), usuario ${usuarioId ?? 'sin identificar'}:`, detalle);
    try {
        await pool.query(
            `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
             VALUES ('CAMBIO_CONTRASENA_FALLIDO', 'Usuario', ?, ?)`,
            [JSON.stringify({ contexto, error: detalle }), usuarioId ?? null]
        );
    } catch (errorBitacora) {
        console.error('[CU07] Tampoco se pudo escribir el fallo en la bitácora:', errorBitacora.code || errorBitacora.message);
    }
}

/**
 * Valida OTP + robustez y aplica el cambio. Devuelve {status, cuerpo}.
 * El servidor vuelve a revisar el código aunque la app ya lo haya verificado:
 * el paso 1 solo habilita el formulario, no autoriza el cambio por sí mismo.
 */
async function ejecutarCambioContrasena(usuario, codigo, nuevaContrasena, ip) {
    const rechazo = rechazoDeCodigo(usuario, codigo);
    if (rechazo) return rechazo;

    // Excepción 3 (CU07): política de robustez, con requisitos detallados.
    const robustez = validarRobustezContrasena(nuevaContrasena);
    if (!robustez.valida) {
        return {
            status: 400,
            cuerpo: {
                error: 'CONTRASENA_DEBIL',
                mensaje: 'La contraseña no cumple los requisitos de seguridad.',
                requisitos: robustez.incumplidos
            }
        };
    }

    const contrasena_hash = await bcrypt.hash(nuevaContrasena, 10);

    // Clave nueva, cierre de sesiones (CU08) y bitácora van en una transacción:
    // si la conexión se corta a mitad, no queda la clave cambiada con las
    // sesiones antiguas abiertas ni un cambio sin auditar.
    let conexion;
    try {
        conexion = await pool.getConnection();
        await conexion.beginTransaction();

        await conexion.query(
            `UPDATE Usuario
                SET contrasena_hash = ?, otp_codigo = NULL, otp_expiracion = NULL
              WHERE usuario_id = ?`,
            [contrasena_hash, usuario.usuario_id]
        );
        await revocarTodasLasSesiones(conexion, usuario.usuario_id);
        await conexion.query(
            `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, usuario_id)
             VALUES ('CAMBIO_CONTRASENA', 'Usuario', ?, ?)`,
            [ip || null, usuario.usuario_id]
        );

        await conexion.commit();
    } catch (error) {
        if (conexion) await conexion.rollback().catch(() => {});
        await registrarFalloPersistencia('guardado', usuario.usuario_id, error);
        return FALLO_PERSISTENCIA;
    } finally {
        if (conexion) conexion.release();
    }

    return {
        status: 200,
        cuerpo: {
            mensaje: 'Contraseña actualizada. Por seguridad se cerraron todas tus sesiones: inicia sesión con la clave nueva.'
        }
    };
}

exports.verificarCodigoRecuperacion = async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    try {
        const rechazo = rechazoDeCodigo(await buscarUsuarioConOTP('email', email), req.body?.codigo);
        if (rechazo) return res.status(rechazo.status).json(rechazo.cuerpo);
        return res.status(200).json({ mensaje: 'Código verificado.' });
    } catch (error) {
        console.error('[verificarCodigoRecuperacion]', error);
        return res.status(500).json({ error: 'Error interno del servidor.', mensaje: 'No se pudo verificar el código. Intenta nuevamente.' });
    }
};

exports.confirmarRecuperacion = async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const { codigo, nueva_contrasena } = req.body || {};

    try {
        const usuario = await buscarUsuarioConOTP('email', email);
        const resultado = await ejecutarCambioContrasena(usuario, codigo, nueva_contrasena, req.ip);
        return res.status(resultado.status).json(resultado.cuerpo);
    } catch (error) {
        // Lo único que puede fallar aquí es leer la base: misma Excepción 4.
        await registrarFalloPersistencia('recuperacion', null, error);
        return res.status(FALLO_PERSISTENCIA.status).json(FALLO_PERSISTENCIA.cuerpo);
    }
};

// Variante autenticada: cambiar la contraseña desde adentro de la app.
exports.solicitarCambioContrasena = async (req, res) => {
    try {
        const [usuarios] = await pool.query(
            `SELECT usuario_id, email FROM Usuario WHERE usuario_id = ? LIMIT 1`,
            [req.user.usuario_id]
        );
        if (usuarios.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        await despacharOTPRecuperacion(usuarios[0]);

        const [nombre, dominio] = usuarios[0].email.split('@');
        return res.status(200).json({
            mensaje: 'Código enviado.',
            destino: `${nombre[0]}***@${dominio}`
        });
    } catch (error) {
        console.error('[solicitarCambioContrasena]', error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

exports.verificarCodigoCambioContrasena = async (req, res) => {
    try {
        const usuario = await buscarUsuarioConOTP('usuario_id', req.user.usuario_id);
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const rechazo = rechazoDeCodigo(usuario, req.body?.codigo);
        if (rechazo) return res.status(rechazo.status).json(rechazo.cuerpo);
        return res.status(200).json({ mensaje: 'Código verificado.' });
    } catch (error) {
        console.error('[verificarCodigoCambioContrasena]', error);
        return res.status(500).json({ error: 'Error interno del servidor.', mensaje: 'No se pudo verificar el código. Intenta nuevamente.' });
    }
};

exports.confirmarCambioContrasena = async (req, res) => {
    const { codigo, nueva_contrasena } = req.body || {};
    try {
        const usuario = await buscarUsuarioConOTP('usuario_id', req.user.usuario_id);
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const resultado = await ejecutarCambioContrasena(usuario, codigo, nueva_contrasena, req.ip);
        return res.status(resultado.status).json(resultado.cuerpo);
    } catch (error) {
        await registrarFalloPersistencia('cambio con sesion', req.user.usuario_id, error);
        return res.status(FALLO_PERSISTENCIA.status).json(FALLO_PERSISTENCIA.cuerpo);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CU08 — GESTIÓN DE SESIONES ACTIVAS
// ─────────────────────────────────────────────────────────────────────────────

exports.listarSesiones = async (req, res) => {
    try {
        const [sesiones] = await pool.query(
            `SELECT sesion_usuario_id, dispositivo, ip_origen, momento_inicio, jti
               FROM Sesion_Usuario
              WHERE usuario_id = ? AND activa = TRUE
                AND momento_inicio > NOW() - INTERVAL ? HOUR
              ORDER BY momento_inicio DESC`,
            [req.user.usuario_id, DURACION_SESION_HORAS]
        );

        return res.status(200).json({
            sesiones: sesiones.map((sesion) => ({
                sesion_usuario_id: sesion.sesion_usuario_id,
                dispositivo: sesion.dispositivo,
                ip_origen: sesion.ip_origen,
                momento_inicio: sesion.momento_inicio,
                // La app marca "este dispositivo" comparando contra su token.
                actual: sesion.jti === req.user.jti,
            })),
        });
    } catch (error) {
        // Excepción 2 (CU08): no se pudo recuperar la lista de sesiones.
        console.error('[listarSesiones]', error);
        return res.status(500).json({
            error: 'SESIONES_NO_DISPONIBLES',
            mensaje: 'Información de dispositivos no disponible momentáneamente.'
        });
    }
};

exports.cerrarSesion = async (req, res) => {
    const { id } = req.params;
    try {
        // El WHERE por usuario impide cerrar sesiones ajenas, y solo alcanza a
        // sesiones vigentes: activas y con el token dentro de su duración.
        // Antes bastaba con que la fila existiera; como mysql2 cuenta las filas
        // encontradas (no las modificadas), revocar una sesión ya cerrada
        // respondía éxito.
        const [resultado] = await pool.query(
            `UPDATE Sesion_Usuario SET activa = FALSE
              WHERE sesion_usuario_id = ? AND usuario_id = ? AND activa = TRUE
                AND momento_inicio > NOW() - INTERVAL ? HOUR`,
            [id, req.user.usuario_id, DURACION_SESION_HORAS]
        );

        // Excepción 3 (CU08): la sesión ya fue cerrada o su token expiró.
        if (resultado.affectedRows === 0) {
            return res.status(409).json({
                error: 'SESION_NO_ACTIVA',
                mensaje: 'La sesión seleccionada ya no está activa.'
            });
        }

        return res.status(200).json({ mensaje: 'Sesión revocada exitosamente.' });
    } catch (error) {
        console.error('[cerrarSesion]', error);
        return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }
};

// Cierre de la propia sesión al salir de la app (mejor esfuerzo).
exports.cerrarSesionActual = async (req, res) => {
    try {
        if (req.user.jti) {
            await pool.query(
                `UPDATE Sesion_Usuario SET activa = FALSE WHERE jti = ?`,
                [req.user.jti]
            );
        }
        return res.status(200).json({ mensaje: 'Sesión finalizada.' });
    } catch (error) {
        console.error('[cerrarSesionActual]', error);
        return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CU09 — PRIVACIDAD DE DATOS DE CONTACTO (solo Paciente)
// ─────────────────────────────────────────────────────────────────────────────

const PRIVACIDAD_POR_DEFECTO = { mostrar_direccion: true, mostrar_telefono: true };

exports.obtenerPrivacidad = async (req, res) => {
    try {
        const [filas] = await pool.query(
            `SELECT privacidad_contacto FROM Paciente WHERE usuario_id = ? LIMIT 1`,
            [req.user.usuario_id]
        );
        if (filas.length === 0) {
            return res.status(404).json({ error: 'No se encontró el perfil de paciente.' });
        }

        let guardada = filas[0].privacidad_contacto;
        if (typeof guardada === 'string') {
            try { guardada = JSON.parse(guardada); } catch { guardada = null; }
        }

        return res.status(200).json({ ...PRIVACIDAD_POR_DEFECTO, ...(guardada || {}) });
    } catch (error) {
        console.error('[obtenerPrivacidad]', error);
        return res.status(500).json({ error: 'No se pudo leer la configuración de privacidad.' });
    }
};

exports.actualizarPrivacidad = async (req, res) => {
    // Excepción 3 (CU09): solo se aceptan los campos de la matriz, booleanos.
    const preferencias = {};
    for (const campo of Object.keys(PRIVACIDAD_POR_DEFECTO)) {
        const valor = req.body?.[campo];
        if (typeof valor !== 'boolean') {
            return res.status(400).json({
                error: 'CONFIGURACION_INVALIDA',
                mensaje: `El campo "${campo}" es obligatorio y debe ser verdadero o falso.`
            });
        }
        preferencias[campo] = valor;
    }

    try {
        const [resultado] = await pool.query(
            `UPDATE Paciente SET privacidad_contacto = ? WHERE usuario_id = ?`,
            [JSON.stringify(preferencias), req.user.usuario_id]
        );
        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'No se encontró el perfil de paciente.' });
        }

        try {
            await pool.query(
                `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, datos_adicionales, usuario_id)
                 VALUES ('CAMBIO_PRIVACIDAD', 'Paciente', ?, ?)`,
                [JSON.stringify(preferencias), req.user.usuario_id]
            );
        } catch (errorBitacora) {
            console.error('[actualizarPrivacidad] Sin registro en bitácora:', errorBitacora.message);
        }

        return res.status(200).json({ mensaje: 'Preferencias de privacidad guardadas.', ...preferencias });
    } catch (error) {
        console.error('[actualizarPrivacidad]', error);
        return res.status(500).json({ error: 'No se pudieron guardar los cambios.' });
    }
};
