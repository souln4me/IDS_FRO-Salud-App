/**
 * Componente: C_Capa_de_Acceso_a_Datos (puerta de entrada: src/componentes/C_Capa_de_Acceso_a_Datos.js)
 * Casos de uso: CU69, CU68.
 *
 * Escribe en la bitácora las transacciones con el proveedor externo.
 */
const pool = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// CU68 - Paso 1: acceso a datos sobre la bitácora EXISTENTE Bitacora_Auditoria.
// ─────────────────────────────────────────────────────────────────────────────
class TransactionAuditModel {
  // CU69 — Registrando en Bitácora de Transacciones Externas
  // Inserta una entrada de auditoría. `datos` se serializa en datos_adicionales.
  static async registrar({ accion, entidad_afectada = null, ip_origen = null, usuario_id = null, datos = {} }) {
    const [result] = await pool.query(
      `INSERT INTO Bitacora_Auditoria
         (accion, entidad_afectada, ip_origen, usuario_id, datos_adicionales)
       VALUES (?, ?, ?, ?, ?)`,
      [accion, entidad_afectada, ip_origen, usuario_id, JSON.stringify(datos)]
    );
    return result.insertId;
  }
}

module.exports = TransactionAuditModel;