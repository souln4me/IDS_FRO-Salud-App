/**
 * Componente: C_Capa_de_Acceso_a_Datos (puerta de entrada: src/componentes/C_Capa_de_Acceso_a_Datos.js)
 * Casos de uso: CU59.
 *
 * Lectura y actualización de los parámetros globales del sistema.
 */
const pool = require('../config/database');

class ParametroModel {
    // CU59 — Gestionando Parámetros Globales del Sistema
    static async getAll() {
        const [rows] = await pool.query(`
            SELECT 
                parametro_id, 
                clave, 
                valor, 
                descripcion, 
                (UNIX_TIMESTAMP(ultima_modificacion) * 1000) AS ultima_modificacion, 
                administrador_id 
            FROM Parametro_Global
        `);
        return rows;
    }

    // CU59 — Gestionando Parámetros Globales del Sistema (control de edición concurrente)
    static async updateIfTimestampMatches(clave, nuevoValor, administradorId, timestampOriginal) {
        // Esta función la dejamos intacta por si la necesitas en el futuro
        const query = `
            UPDATE Parametro_Global 
            SET valor = ?, administrador_id = ? 
            WHERE clave = ? AND ultima_modificacion = ?
        `;
        const [result] = await pool.query(query, [nuevoValor, administradorId, clave, timestampOriginal]);
        return result.affectedRows;
    }
}

module.exports = ParametroModel;