/**
 * Componente: C_Capa_de_Acceso_a_Datos (puerta de entrada: src/componentes/C_Capa_de_Acceso_a_Datos.js)
 * Casos de uso: CU05.
 *
 * Búsqueda de la cuenta activa por RUT para el inicio de sesión.
 */
// Importamos el pool de conexiones que configuramos en la Fase 0

const db = require('../config/database');

const UserModel = {
  /**
   * CU05 — Autenticando usuario y resguardando credenciales
   * Busca un usuario por su RUT, trayendo también el nombre de su Rol,
   * siempre y cuando la cuenta esté activa (Precondición del CU05).
   * @param {string} rut - El RUT limpio enviado desde el frontend (ej: "12345678K")
   * @returns {Promise<Object|null>} - Devuelve los datos del usuario o null si no existe/está inactivo.
   */
  findByRutActive: async (rut) => {
    try {
      // Explicación de la consulta (Cumple con las Excepciones 3 y 4 del CU05):
      // 1. SELECT u.*, r.nombre_rol: Trae los datos del usuario y el texto del rol (Paciente/Profesional/Admin).
      // 2. INNER JOIN Rol: Conecta ambas tablas mediante el id del rol.
      // 3. WHERE u.rut = ?: Busca el RUT específico de forma segura (evita SQL Injection).
      // 4. AND u.cuenta_activo = 1: Valida la precondición de que la cuenta no esté suspendida.
      const query = `
        SELECT u.*, r.nombre_rol 
        FROM Usuario u
        INNER JOIN Rol r ON u.rol_id = r.rol_id
        WHERE u.rut = ? AND u.cuenta_activo = 1
      `;

      // Ejecutamos la consulta usando promesas
      const [rows] = await db.execute(query, [rut]);

      // Si se encontró un registro, lo devolvemos; si no, devolvemos null
      if (rows.length > 0) {
        return rows[0];
      }
      return null;
    } catch (error) {
      // Excepción 2 y 3: Captura si la base de datos se cayó en mitad de la consulta
      throw new Error('Error en el repositorio de datos (Model): ' + error.message);
    }
  }
};

module.exports = UserModel;