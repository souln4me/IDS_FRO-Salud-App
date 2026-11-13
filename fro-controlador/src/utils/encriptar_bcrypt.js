/**
 * Componente: C_Seguridad_JWT_BCrypt (puerta de entrada: src/componentes/C_Seguridad_JWT_BCrypt.js)
 * Casos de uso: CU05, CU01, CU02, CU07.
 *
 * Cifrado y comparación de contraseñas con bcrypt.
 */
const bcrypt = require('bcrypt');

// Determina el nivel de seguridad (rondas de procesamiento). 10 es el estándar de la industria.
const SALT_ROUNDS = 10;

/**
 * CU01, CU02, CU07 — guardar la contraseña cifrada (registro y cambio de clave)
 * Toma una contraseña en texto plano y la encripta.
 * @param {string} password - Contraseña ingresada por el usuario (ej: "clave123")
 * @returns {Promise<string>} - Contraseña encriptada (hash irreversible)
 */
const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, salt);
  } catch (error) {
    throw new Error('Error al encriptar la contraseña: ' + error.message);
  }
};

/**
 * CU05 — Autenticando usuario y resguardando credenciales
 * Compara una contraseña en texto plano con un hash de la base de datos.
 * @param {string} password - Contraseña ingresada al intentar loguearse.
 * @param {string} hashedPassword - El hash guardado en la base de datos.
 * @returns {Promise<boolean>} - Devuelve true si coinciden, false si no.
 */
const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    throw new Error('Error al comparar las contraseñas: ' + error.message);
  }
};

// Exportamos ambas funciones para que todo el equipo las use
module.exports = {
  hashPassword,
  comparePassword
};