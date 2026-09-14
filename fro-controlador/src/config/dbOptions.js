/**
 * Lógica compartida para armar la conexión a MySQL, tanto para el servidor
 * como para los scripts. Concentra aquí las diferencias entre trabajar con
 * MySQL local y con una base de datos en la nube.
 */

const dotenv = require('dotenv');

dotenv.config();

/**
 * Los proveedores suelen entregar la dirección con parámetros propios
 * (por ejemplo ?ssl-mode=REQUIRED en Aiven) que la librería mysql2 no
 * reconoce. Se quitan para que pegar la dirección tal cual funcione.
 */
function limpiarUrlConexion(url) {
  if (!url) return url;

  try {
    const direccion = new URL(url);
    ['ssl-mode', 'sslmode', 'ssl_mode'].forEach((parametro) =>
      direccion.searchParams.delete(parametro)
    );
    return direccion.toString();
  } catch {
    // Si no se puede interpretar, se devuelve tal cual y que mysql2 decida.
    return url;
  }
}

/**
 * Las bases gestionadas exigen TLS. Proveedores como Aiven firman con su
 * propia autoridad certificadora, que no viene incluida en el sistema:
 *  - Si se entrega el certificado en DB_SSL_CA, se valida contra él.
 *  - Si no, se puede relajar la verificación con
 *    DB_SSL_REJECT_UNAUTHORIZED=false (cómodo para pruebas, menos seguro).
 */
function opcionesSSL() {
  if (String(process.env.DB_SSL || '').toLowerCase() !== 'true') return {};

  // Se ignora un CA vacío o con solo espacios: es lo que queda cuando la
  // variable se declara en el panel pero no se le pega ningún valor.
  const certificadoCA = (process.env.DB_SSL_CA || '').trim();

  if (certificadoCA) {
    if (!certificadoCA.includes('BEGIN CERTIFICATE')) {
      console.warn(
        '⚠️  DB_SSL_CA tiene un valor que no parece un certificado ' +
          '(debe incluir la línea -----BEGIN CERTIFICATE-----). Se ignora.'
      );
    } else {
      return { ssl: { ca: certificadoCA.replace(/\\n/g, '\n'), rejectUnauthorized: true } };
    }
  }

  const verificacionEstricta =
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

  return { ssl: { rejectUnauthorized: verificacionEstricta } };
}

/** Dirección completa de la base de datos, si el proveedor la entregó así. */
function urlConexion() {
  return limpiarUrlConexion(process.env.DATABASE_URL || process.env.MYSQL_URL);
}

/** Datos de conexión sueltos, como se usan en desarrollo local. */
function datosSueltos() {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

module.exports = { limpiarUrlConexion, opcionesSSL, urlConexion, datosSueltos };
