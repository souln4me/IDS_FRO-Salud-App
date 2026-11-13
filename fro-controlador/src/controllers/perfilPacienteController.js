/**
 * Componente: C_API_REST
 * Casos de uso: CU09; la foto de perfil es apoyo común.
 *
 * Foto de perfil del paciente (opcional).
 *
 * Mientras no suba una, la app muestra sus iniciales. Se guarda en Cloudinary
 * con la misma receta que la foto del profesional (CU10): un archivo por
 * persona que se sobreescribe, recortado a cuadrado centrado en la cara.
 */

const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');
const C_API_Adapter = require('../componentes/C_API_Adapter');

const EXTENSIONES_FOTO = ['jpg', 'jpeg', 'png', 'webp', 'heic'];
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

// CU13: deja el cambio de foto en la bitácora de auditoría
async function auditar(req, accion) {
  C_Capa_de_Acceso_a_Datos.query(
    `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
     VALUES (?, 'Paciente', ?, NULL, ?)`,
    [accion, req.ip || null, req.user.usuario_id]
  ).catch(() => {});
}

// Apoyo común: ver la foto de perfil del paciente
// GET /api/auth/mi-foto — nombre y foto (o null) para el encabezado de "Mi perfil".
exports.obtener = async (req, res) => {
  try {
    const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT p.foto_url, u.nombres, u.apellido_paterno, u.apellido_materno
         FROM Paciente p JOIN Usuario u ON u.usuario_id = p.usuario_id
        WHERE p.usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (!fila) return res.status(404).json({ error: 'PACIENTE_NO_ENCONTRADO' });
    return res.json({
      foto_url: fila.foto_url || null,
      nombre: [fila.nombres, fila.apellido_paterno, fila.apellido_materno].filter(Boolean).join(' '),
    });
  } catch (error) {
    console.error('[perfilPaciente.obtener]', error);
    return res.status(500).json({ error: 'No se pudo cargar tu perfil.' });
  }
};

// Apoyo común: subir la foto de perfil del paciente
// POST /api/auth/mi-foto  (multipart: foto)
exports.subir = async (req, res) => {
  if (!C_API_Adapter.cloudinaryConfigurado()) {
    return res.status(503).json({ error: 'REPOSITORIO_NO_CONFIGURADO', mensaje: 'El repositorio de imágenes no está configurado en el servidor.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'ARCHIVO_FALTANTE', mensaje: 'No se recibió ninguna imagen.' });
  }
  const extension = (req.file.originalname?.split('.').pop() || '').toLowerCase();
  if (!EXTENSIONES_FOTO.includes(extension)) {
    return res.status(400).json({ error: 'FORMATO_NO_PERMITIDO', mensaje: `La fotografía debe ser JPG, PNG, WEBP o HEIC (recibido: .${extension || '?'}).` });
  }
  if (req.file.size > MAX_FOTO_BYTES) {
    return res.status(413).json({ error: 'FOTO_MUY_PESADA', mensaje: `La fotografía pesa ${(req.file.size / 1024 / 1024).toFixed(1)} MB; el máximo es 5 MB.` });
  }
  try {
    const subida = await C_API_Adapter.subirBuffer(req.file.buffer, {
      folder: 'fro-salud/perfiles',
      public_id: `paciente-${req.user.usuario_id}`,
      overwrite: true,
      invalidate: true,
      resource_type: 'image',
      transformation: [{ width: 600, height: 600, crop: 'fill', gravity: 'face' }],
    });
    const [resultado] = await C_Capa_de_Acceso_a_Datos.query(`UPDATE Paciente SET foto_url = ? WHERE usuario_id = ?`, [subida.secure_url, req.user.usuario_id]);
    if (resultado.affectedRows === 0) return res.status(404).json({ error: 'PACIENTE_NO_ENCONTRADO' });
    auditar(req, 'ACTUALIZACION_FOTO_PACIENTE');
    return res.json({ mensaje: 'Fotografía actualizada.', foto_url: subida.secure_url });
  } catch (error) {
    console.error('[perfilPaciente.subir]', error);
    return res.status(502).json({ error: 'CARGA_INTERRUMPIDA', mensaje: 'No se pudo subir la fotografía. Intenta nuevamente.' });
  }
};

// Apoyo común: quitar la foto de perfil del paciente
// DELETE /api/auth/mi-foto — vuelve a las iniciales.
exports.quitar = async (req, res) => {
  try {
    await C_Capa_de_Acceso_a_Datos.query(`UPDATE Paciente SET foto_url = NULL WHERE usuario_id = ?`, [req.user.usuario_id]);
    if (C_API_Adapter.cloudinaryConfigurado()) {
      C_API_Adapter.cloudinary.uploader.destroy(`fro-salud/perfiles/paciente-${req.user.usuario_id}`, { invalidate: true }).catch(() => {});
    }
    auditar(req, 'ELIMINACION_FOTO_PACIENTE');
    return res.json({ mensaje: 'Fotografía eliminada. Se mostrarán tus iniciales.', foto_url: null });
  } catch (error) {
    console.error('[perfilPaciente.quitar]', error);
    return res.status(500).json({ error: 'No se pudo quitar la fotografía. Intenta nuevamente.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  Datos de contacto del paciente (correcciones Inc 4, dentro del CU09)
//  GET /api/auth/mi-perfil-paciente   → dirección, teléfono y contacto de emergencia
//  PUT /api/auth/mi-perfil-paciente   → los actualiza
//  RUT, nombre y correo no se editan aquí: identifican la cuenta.
// ─────────────────────────────────────────────────────────────────────────────

const PATRON_TELEFONO = /^\+?[\d\s-]{8,20}$/;
const digitos = (t) => String(t || '').replace(/\D/g, '');

// CU09 — Configurando privacidad de datos de contacto
exports.obtenerDatos = async (req, res) => {
  try {
    const [[fila]] = await C_Capa_de_Acceso_a_Datos.query(
      `SELECT u.rut, u.email, u.nombres, u.apellido_paterno, u.apellido_materno,
              p.calle, p.numero_calle, p.departamento, p.comuna_id, co.nombre AS comuna,
              (SELECT t.telefono FROM Usuario_Telefono t WHERE t.usuario_id = u.usuario_id LIMIT 1) AS telefono,
              ce.nombre AS emergencia_nombre, ce.telefono AS emergencia_telefono, ce.parentesco AS emergencia_parentesco
         FROM Paciente p
         JOIN Usuario u ON u.usuario_id = p.usuario_id
         LEFT JOIN Comuna co ON co.comuna_id = p.comuna_id
         LEFT JOIN Contacto_Emergencia ce ON ce.contacto_emergencia_id = p.contacto_emergencia_id
        WHERE p.usuario_id = ? LIMIT 1`,
      [req.user.usuario_id]
    );
    if (!fila) return res.status(404).json({ error: 'PACIENTE_NO_ENCONTRADO' });
    return res.json({ datos: fila });
  } catch (error) {
    console.error('[perfilPaciente.obtenerDatos]', error);
    return res.status(500).json({ error: 'No se pudieron cargar tus datos.' });
  }
};

// CU09 — Configurando privacidad de datos de contacto
exports.actualizarDatos = async (req, res) => {
  const limpio = (v, max) => String(v ?? '').trim().slice(0, max);
  const datos = {
    calle: limpio(req.body?.calle, 100),
    numero_calle: limpio(req.body?.numero_calle, 10),
    departamento: limpio(req.body?.departamento, 10),
    comuna_id: Number(req.body?.comuna_id),
    telefono: limpio(req.body?.telefono, 20),
    emergencia_nombre: limpio(req.body?.emergencia_nombre, 100),
    emergencia_telefono: limpio(req.body?.emergencia_telefono, 20),
    emergencia_parentesco: limpio(req.body?.emergencia_parentesco, 50),
  };

  // Campo por campo, para que la app marque exactamente qué corregir.
  const campos = {};
  if (!datos.calle) campos.calle = 'Ingresa tu calle.';
  if (!datos.numero_calle) campos.numero_calle = 'Ingresa el número.';
  if (!Number.isInteger(datos.comuna_id) || datos.comuna_id <= 0) campos.comuna_id = 'Elige tu comuna.';
  if (!PATRON_TELEFONO.test(datos.telefono) || digitos(datos.telefono).length < 8) campos.telefono = 'Ingresa un teléfono válido (ej. +56 9 1234 5678).';
  if (!datos.emergencia_nombre) campos.emergencia_nombre = 'Ingresa el nombre de tu contacto de emergencia.';
  if (!PATRON_TELEFONO.test(datos.emergencia_telefono) || digitos(datos.emergencia_telefono).length < 8) campos.emergencia_telefono = 'Ingresa un teléfono válido para tu contacto.';
  if (!datos.emergencia_parentesco) campos.emergencia_parentesco = 'Indica el parentesco.';
  if (Object.keys(campos).length > 0) {
    return res.status(400).json({ error: 'DATOS_INVALIDOS', campos, mensaje: 'Revisa los campos marcados.' });
  }

  const conexion = await C_Capa_de_Acceso_a_Datos.getConnection();
  try {
    const [[comuna]] = await conexion.query(`SELECT comuna_id FROM Comuna WHERE comuna_id = ? LIMIT 1`, [datos.comuna_id]);
    if (!comuna) return res.status(400).json({ error: 'DATOS_INVALIDOS', campos: { comuna_id: 'Esa comuna no existe.' } });

    await conexion.beginTransaction();
    const [[paciente]] = await conexion.query(
      `SELECT paciente_id, contacto_emergencia_id FROM Paciente WHERE usuario_id = ? LIMIT 1 FOR UPDATE`,
      [req.user.usuario_id]
    );
    if (!paciente) {
      await conexion.rollback();
      return res.status(404).json({ error: 'PACIENTE_NO_ENCONTRADO' });
    }

    let contactoId = paciente.contacto_emergencia_id;
    if (contactoId) {
      await conexion.query(
        `UPDATE Contacto_Emergencia SET nombre = ?, telefono = ?, parentesco = ? WHERE contacto_emergencia_id = ?`,
        [datos.emergencia_nombre, datos.emergencia_telefono, datos.emergencia_parentesco, contactoId]
      );
    } else {
      const [nuevo] = await conexion.query(
        `INSERT INTO Contacto_Emergencia (nombre, telefono, parentesco) VALUES (?, ?, ?)`,
        [datos.emergencia_nombre, datos.emergencia_telefono, datos.emergencia_parentesco]
      );
      contactoId = nuevo.insertId;
    }

    await conexion.query(
      `UPDATE Paciente SET calle = ?, numero_calle = ?, departamento = ?, comuna_id = ?, contacto_emergencia_id = ?
        WHERE paciente_id = ?`,
      [datos.calle, datos.numero_calle, datos.departamento || null, datos.comuna_id, contactoId, paciente.paciente_id]
    );
    // Un teléfono por paciente, como en el registro.
    await conexion.query(`DELETE FROM Usuario_Telefono WHERE usuario_id = ?`, [req.user.usuario_id]);
    await conexion.query(`INSERT INTO Usuario_Telefono (usuario_id, telefono) VALUES (?, ?)`, [req.user.usuario_id, datos.telefono]);

    // CU13: queda en la bitácora de auditoría
    await conexion.query(
      `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
       VALUES ('ACTUALIZACION_DATOS_PACIENTE', 'Paciente', ?, ?, ?)`,
      [req.ip || null, JSON.stringify({ campos: Object.keys(datos) }), req.user.usuario_id]
    );
    await conexion.commit();
    return res.json({ mensaje: 'Tus datos quedaron actualizados.' });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    console.error('[perfilPaciente.actualizarDatos]', error);
    // Igual que la Excepción 4 del CU09: nada queda a medias y se puede reintentar.
    return res.status(500).json({ error: 'NO_SE_GUARDO', mensaje: 'No se pudieron guardar los cambios. Intenta nuevamente.' });
  } finally {
    conexion.release();
  }
};
