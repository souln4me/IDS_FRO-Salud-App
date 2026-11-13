/**
 * Componente: C_API_REST
 * Casos de uso: apoyo común, usado por CU19, CU21.
 *
 * Arranque del servidor: variables de entorno, migraciones, escucha HTTP y
 * programador de tareas de la agenda.
 */
const dotenv = require('dotenv');

// Cargar variables de entorno antes que cualquier módulo que las use
dotenv.config();

// Zona horaria del servidor. En la nube el contenedor arranca en UTC, y eso
// desplazaba todas las horas de las citas (una cita de 08:00 se mostraba a las
// 05:00). Las fechas de la base son hora de pared chilena, así que el proceso
// debe razonar en ese mismo huso, incluido el cambio de horario de verano.
process.env.TZ = process.env.TZ || 'America/Santiago';

// Sin esta clave el servidor arranca, pero todo inicio de sesión falla con
// "secretOrPrivateKey must have a value". Mejor decirlo aquí, de entrada.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'xxxxxxxxxxxxxxx') {
  console.error(
    '❌ Falta JWT_SECRET en el archivo .env (la clave con que se firman las sesiones).\n' +
    '   Agrega una línea como:  JWT_SECRET=una_clave_larga_cualquiera\n' +
    '   o ejecuta  npm run db:local  para que la genere por ti.'
  );
  process.exit(1);
}

const app = require('./src/app');

// Requerir la configuración de la base de datos para forzar la validación de conexión al arrancar
const C_Capa_de_Acceso_a_Datos = require('./src/componentes/C_Capa_de_Acceso_a_Datos');
const C_Programador_Agenda = require('./src/componentes/C_Programador_Agenda');
const { ejecutarMigraciones } = require('./scripts/migrar-db');

const PORT = process.env.PORT || 3000;
// En la nube el servicio corre dentro de un contenedor: hay que escuchar en
// todas las interfaces, no solo en localhost, para que el proveedor lo alcance.
const HOST = process.env.HOST || '0.0.0.0';

async function iniciar() {
  // Las migraciones pendientes se aplican solas en cada arranque (son
  // idempotentes): así ningún despliegue queda con la base desactualizada.
  try {
    await ejecutarMigraciones(C_Capa_de_Acceso_a_Datos);
  } catch (error) {
    console.error(`⚠️  No se pudieron aplicar las migraciones: ${error.message}`);
    console.error('   El servidor arranca igual, pero revisa la base de datos.');
  }

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor backend escuchando en ${HOST}:${PORT}`);
    // CU19/CU21: solicitudes de confirmación y turnos de lista de espera.
    C_Programador_Agenda.iniciarProgramador(C_Capa_de_Acceso_a_Datos);
  });
}

iniciar();
