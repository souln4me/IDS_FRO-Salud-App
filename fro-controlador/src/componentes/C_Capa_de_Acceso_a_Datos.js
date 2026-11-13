/**
 * C_Capa_de_Acceso_a_Datos
 *
 * Componente "Capa de Acceso a Datos" del Diagrama de Componentes
 * (Incremento 1). Es el único camino hacia MySQL: todo el servidor consulta y
 * escribe la base a través de este componente, usando el Driver MySQL.
 *
 * Casos de uso: todos los que leen o guardan datos. Además, CU59 al leer los
 * parámetros globales.
 *
 * El componente ES el pool de conexiones de mysql2, así que se usa igual que
 * antes, pero con el nombre del diagrama:
 *   C_Capa_de_Acceso_a_Datos.query(...)
 *   C_Capa_de_Acceso_a_Datos.execute(...)
 *   C_Capa_de_Acceso_a_Datos.getConnection()   (para transacciones)
 * Se le agregan los modelos y la lectura de parámetros globales.
 */

const pool = require('../config/database');

// CU05 — Autenticando usuario y resguardando credenciales
pool.UserModel = require('../models/userModel');
// CU59 — Gestionando Parámetros Globales del Sistema
pool.ParametroModel = require('../models/parametroModel');
// CU69 — Registrando en Bitácora de Transacciones Externas
pool.TransactionAuditModel = require('../models/transactionAuditModel');

// CU59 — Lee un parámetro global numérico (con un valor por defecto si falta).
// Se carga al usarlo, porque vive junto a la agenda.
pool.leerParametroEntero = (...args) =>
  require('../services/agenda/agendaService').leerParametroEntero(...args);

module.exports = pool;

// Registro de actividad: anota este componente en la línea de cada petición.
{
  const { marcarComponente } = require('../services/registro/registroActividad');
  for (const metodo of ['query', 'execute', 'getConnection']) {
    const original = pool[metodo].bind(pool);
    pool[metodo] = (...args) => {
      marcarComponente('C_Capa_de_Acceso_a_Datos');
      return original(...args);
    };
  }
}
