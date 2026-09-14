/**
 * Servicios de seguridad de cuenta (Incremento 2, bloque 2).
 * CU06/CU07: recuperación y cambio de contraseña con OTP.
 * CU08: sesiones por dispositivo revocables.
 */

const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
//  CU07 — Robustez de contraseña
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida la política de contraseñas y devuelve la lista de requisitos
 * incumplidos, para que la interfaz pueda resaltarlos (Excepción 3 del CU07).
 */
function validarRobustezContrasena(contrasena) {
  const texto = String(contrasena || '');
  const incumplidos = [];

  if (texto.length < 8) incumplidos.push('Mínimo 8 caracteres');
  if (!/[a-zA-Z]/.test(texto)) incumplidos.push('Al menos una letra');
  if (!/[0-9]/.test(texto)) incumplidos.push('Al menos un número');
  // Documento 0, definición de Contraseña: "al menos un símbolo especial".
  if (!/[^A-Za-z0-9\s]/.test(texto)) incumplidos.push('Al menos un símbolo (ej: . _ - ! @ #)');

  return { valida: incumplidos.length === 0, incumplidos };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU08 — Sesiones por dispositivo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vida del Token de Acceso. La fila de Sesion_Usuario no se apaga sola al
 * vencer el token, así que las consultas de sesiones usan este mismo plazo
 * para no tratar como activa una sesión cuyo token ya expiró.
 */
const DURACION_SESION_HORAS = 8;

/**
 * Crea el registro de sesión y devuelve su identificador para el JWT.
 *
 * Cada instalación de la app manda un dispositivo_id estable. Volver a entrar
 * desde el mismo teléfono cierra la sesión anterior de ese dispositivo en vez
 * de acumular una fila nueva, que era lo que llenaba la lista de "sesiones
 * activas" con entradas repetidas de la misma IP. Sin dispositivo_id (app
 * antigua) se mantiene el comportamiento previo.
 */
async function crearSesion(conexion, usuario_id, dispositivo, ip, dispositivo_id) {
  const idDispositivo = dispositivo_id ? String(dispositivo_id).slice(0, 64) : null;

  if (idDispositivo) {
    await conexion.execute(
      `UPDATE Sesion_Usuario SET activa = FALSE
        WHERE usuario_id = ? AND dispositivo_id = ? AND activa = TRUE`,
      [usuario_id, idDispositivo]
    );
  }

  const jti = crypto.randomUUID();
  await conexion.execute(
    `INSERT INTO Sesion_Usuario (jti, dispositivo, dispositivo_id, ip_origen, usuario_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      jti,
      String(dispositivo || 'Dispositivo desconocido').slice(0, 120),
      idDispositivo,
      ip || null,
      usuario_id,
    ]
  );
  return jti;
}

/**
 * Indica si la sesión del token sigue vigente. Los tokens antiguos (sin jti)
 * se aceptan mientras expiran solos: evita cerrar la sesión a todo el equipo
 * en el momento del despliegue.
 */
async function sesionVigente(conexion, jti) {
  if (!jti) return true;
  const [filas] = await conexion.execute(
    `SELECT activa FROM Sesion_Usuario WHERE jti = ? LIMIT 1`,
    [jti]
  );
  if (filas.length === 0) return true; // legado: fila no registrada
  return Boolean(filas[0].activa);
}

/** Cierra todas las sesiones de un usuario (tras un cambio de contraseña). */
async function revocarTodasLasSesiones(conexion, usuario_id) {
  await conexion.execute(
    `UPDATE Sesion_Usuario SET activa = FALSE WHERE usuario_id = ?`,
    [usuario_id]
  );
}

module.exports = {
  DURACION_SESION_HORAS,
  validarRobustezContrasena,
  crearSesion,
  sesionVigente,
  revocarTodasLasSesiones,
};
