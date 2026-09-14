const dotenv = require('dotenv');

// Cargar variables de entorno antes que cualquier módulo que las use
dotenv.config();

// Zona horaria del servidor. En la nube el contenedor arranca en UTC, y eso
// desplazaba todas las horas de las citas (una cita de 08:00 se mostraba a las
// 05:00). Las fechas de la base son hora de pared chilena, así que el proceso
// debe razonar en ese mismo huso, incluido el cambio de horario de verano.
process.env.TZ = process.env.TZ || 'America/Santiago';

const app = require('./src/app');

// Requerir la configuración de la base de datos para forzar la validación de conexión al arrancar
const pool = require('./src/config/database');
const { ejecutarMigraciones } = require('./scripts/migrar-db');

const PORT = process.env.PORT || 3000;
// En la nube el servicio corre dentro de un contenedor: hay que escuchar en
// todas las interfaces, no solo en localhost, para que el proveedor lo alcance.
const HOST = process.env.HOST || '0.0.0.0';

async function iniciar() {
  // Las migraciones pendientes se aplican solas en cada arranque (son
  // idempotentes): así ningún despliegue queda con la base desactualizada.
  try {
    await ejecutarMigraciones(pool);
  } catch (error) {
    console.error(`⚠️  No se pudieron aplicar las migraciones: ${error.message}`);
    console.error('   El servidor arranca igual, pero revisa la base de datos.');
  }

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor backend escuchando en ${HOST}:${PORT}`);
  });
}

iniciar();
