const mysql = require('mysql2/promise');

const { opcionesSSL, urlConexion, datosSueltos } = require('./dbOptions');

// En la nube el proveedor suele entregar una sola cadena de conexión
// (mysql://usuario:clave@host:puerto/base). Si existe, tiene prioridad;
// si no, se arman los datos por variables sueltas como en local.
const url = urlConexion();

const opcionesComunes = {
  // Las columnas DATETIME guardan hora de pared chilena, sin huso. Si mysql2
  // las convierte a objetos Date, Express las serializa como UTC y la app las
  // vuelve a desplazar al mostrarlas: una cita de 08:00 terminaba en 05:00.
  // Devolviéndolas como texto, la hora viaja intacta de la base a la pantalla.
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  queueLimit: 0,
  // Evita que una conexión ociosa quede colgada si el proveedor la corta.
  enableKeepAlive: true,
  ...opcionesSSL(),
};

const pool = url
  ? mysql.createPool({ uri: url, ...opcionesComunes })
  : mysql.createPool({ ...datosSueltos(), ...opcionesComunes });

// ─────────────────────────────────────────────────────────────────────────────
//  Zona horaria de la sesión MySQL
// ─────────────────────────────────────────────────────────────────────────────
// Las columnas TIMESTAMP con DEFAULT CURRENT_TIMESTAMP las genera MySQL, no
// nosotros, y usa la zona horaria de LA SESIÓN. El proveedor (Aiven) abre las
// sesiones en UTC, así que esas fechas quedaban 3 o 4 horas adelantadas:
// se veía en "Sesiones activas", y también en la bitácora, los documentos,
// las versiones de evolución y el triaje.
//
// Se fija la zona en cada conexión nueva del pool. Se intenta primero con el
// nombre de la zona (respeta el horario de verano por sí solo) y, si el
// servidor no tiene cargadas las tablas de zonas horarias, se cae al desfase
// numérico vigente hoy.
const ZONA = process.env.TZ || 'America/Santiago';

function desfaseActual() {
  // Desfase real de la zona en este momento, con el signo que espera MySQL.
  const minutos = -new Date().getTimezoneOffset();
  const signo = minutos < 0 ? '-' : '+';
  const abs = Math.abs(minutos);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${signo}${hh}:${mm}`;
}

pool.on('connection', (conexion) => {
  conexion.query(`SET time_zone = '${ZONA}'`, (error) => {
    if (!error) return;
    const respaldo = desfaseActual();
    conexion.query(`SET time_zone = '${respaldo}'`, (error2) => {
      if (error2) {
        console.warn(
          `⚠️  No se pudo fijar la zona horaria de MySQL (${error2.code || error2.message}). ` +
            'Las fechas generadas por la base podrían quedar en UTC.'
        );
      }
    });
  });
});

// Valida la conexión al arrancar. En la nube la base de datos puede tardar unos
// segundos en aceptar conexiones, así que se reintenta antes de rendirse.
async function checkConnection(intentosRestantes = Number(process.env.DB_RETRIES || 5)) {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL exitosamente');
    connection.release();
  } catch (error) {
    if (intentosRestantes > 1) {
      console.warn(
        `⏳ Base de datos no disponible (${error.code || error.message}). ` +
          `Reintentando… quedan ${intentosRestantes - 1} intentos.`
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return checkConnection(intentosRestantes - 1);
    }

    console.error('Error crítico: No se pudo conectar a la base de datos.');
    console.error(`Detalle del error: ${error.message || error.code}`);

    // Pistas concretas según el tipo de fallo, para no tener que adivinar.
    const detalle = `${error.code || ''} ${error.message || ''}`;

    if (/self.?signed|SELF_SIGNED|unable to verify|certificate/i.test(detalle)) {
      console.error(
        '\n   → Es el certificado de la base de datos, no la contraseña.\n' +
          '     Proveedores como Aiven firman con su propia autoridad, que no\n' +
          '     viene incluida en el sistema. Agrega esta variable de entorno:\n\n' +
          '        DB_SSL_REJECT_UNAUTHORIZED=false\n\n' +
          '     Y si definiste DB_SSL_CA sin pegarle un certificado, bórrala.'
      );
    } else if (/ACCESS_DENIED/i.test(detalle)) {
      console.error('\n   → Usuario o contraseña incorrectos en DATABASE_URL.');
    } else if (/ENOTFOUND|EAI_AGAIN/i.test(detalle)) {
      console.error('\n   → No se encontró el servidor. Revisa la dirección en DATABASE_URL.');
    } else if (/ETIMEDOUT|ECONNREFUSED/i.test(detalle)) {
      console.error('\n   → La base no responde. ¿Está encendida? ¿El puerto es el correcto?');
    }

    process.exit(1); // Detiene el servidor para evitar comportamientos erráticos
  }
}

checkConnection();

module.exports = pool;
