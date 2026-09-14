/**
 * Carga el archivo schema.sql en la base de datos configurada en el .env.
 * Sirve tanto para MySQL local como para la base en la nube.
 *
 * Uso:
 *   npm run db:importar
 *
 * No requiere instalar MySQL ni ninguna herramienta extra: usa la misma
 * librería que ya ocupa el servidor.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const { opcionesSSL, urlConexion, datosSueltos } = require('../src/config/dbOptions');

const RUTA_SCHEMA = path.join(__dirname, '..', 'src', 'database', 'mysql', 'schema.sql');

async function main() {
  if (!fs.existsSync(RUTA_SCHEMA)) {
    console.error(`No se encontró el archivo del esquema en:\n  ${RUTA_SCHEMA}`);
    process.exit(1);
  }

  const sqlCompleto = fs.readFileSync(RUTA_SCHEMA, 'utf8');
  const url = urlConexion();

  // Con --sin-crear-base se omiten las instrucciones CREATE DATABASE / USE del
  // inicio del archivo. Es lo que se necesita en proveedores que ya entregan
  // una base creada y no permiten crear otras.
  const omitirCreacion = process.argv.includes('--sin-crear-base');
  const sql = omitirCreacion
    ? sqlCompleto.replace(/^\s*CREATE DATABASE[^;]*;\s*/i, '').replace(/^\s*USE\s+[^;]*;\s*/i, '')
    : sqlCompleto;

  const base = {
    multipleStatements: true,
    ...opcionesSSL(),
  };

  let conexion;
  if (url) {
    conexion = await mysql.createConnection({ uri: url, ...base });
  } else {
    const { database, ...resto } = datosSueltos();
    conexion = await mysql.createConnection({
      ...resto,
      // Si la base se crea desde el propio script no se puede exigir de antemano.
      ...(omitirCreacion ? { database } : {}),
      ...base,
    });
  }

  console.log('✅ Conexión establecida.');

  try {
    // Con --reiniciar se borra todo lo que haya antes de cargar. Sirve cuando
    // una importación anterior quedó a medias y dejó tablas sueltas.
    if (process.argv.includes('--reiniciar')) {
      const [tablasPrevias] = await conexion.query('SHOW TABLES');

      if (tablasPrevias.length > 0) {
        console.log(`⚠️  Borrando ${tablasPrevias.length} tablas existentes…`);
        const nombres = tablasPrevias.map((fila) => Object.values(fila)[0]);

        await conexion.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const nombre of nombres) {
          await conexion.query(`DROP TABLE IF EXISTS \`${nombre}\``);
        }
        await conexion.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('   Base de datos vaciada.');
      }
    }

    console.log('Cargando el esquema…');
    await conexion.query(sql);
    console.log('✅ Esquema y datos iniciales cargados correctamente.');

    const [tablas] = await conexion.query('SHOW TABLES');
    console.log(`   Se crearon ${tablas.length} tablas.`);
  } catch (error) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.error(
        '\n⚠️  Las tablas ya existen en esta base de datos.\n' +
          '   Si solo querías conectarte, no hace falta hacer nada: ya está lista.\n' +
          '   Si quieres partir de cero, agrega --reiniciar al comando:\n' +
          '     npm run db:importar -- --sin-crear-base --reiniciar'
      );
    } else if (error.errno === 1824 || /referenced table/i.test(error.message || '')) {
      console.error(
        '\n⚠️  Una tabla referenciada no está disponible.\n' +
          '   Suele pasar cuando una importación anterior quedó a medias y dejó\n' +
          '   tablas sueltas. Vuelve a ejecutar el comando agregando --reiniciar:\n' +
          '     npm run db:importar -- --sin-crear-base --reiniciar'
      );
    } else if (error.code === 'ER_DBACCESS_DENIED_ERROR' || error.code === 'ER_SPECIFIC_ACCESS_DENIED_ERROR') {
      console.error(
        '\n⚠️  El usuario no tiene permiso para crear la base de datos.\n' +
          '   Vuelve a ejecutar el comando así:\n' +
          '     npm run db:importar -- --sin-crear-base\n' +
          '   (usará la base que ya te entregó el proveedor)'
      );
    } else {
      console.error(`\n❌ Error al cargar el esquema: ${error.message}`);
    }
    process.exitCode = 1;
  } finally {
    await conexion.end();
  }
}

main().catch((error) => {
  const detalle = error.message || error.code || 'sin detalle';
  console.error(`\n❌ No se pudo conectar a la base de datos: ${detalle}`);

  if (error.code === 'ECONNREFUSED') {
    console.error('   Nadie responde en esa dirección. ¿Está encendida la base de datos?');
  } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('   Usuario o contraseña incorrectos.');
  } else if (error.code === 'ENOTFOUND') {
    console.error('   No se encontró el servidor. Revisa que la dirección esté bien escrita.');
  } else if (error.code === 'HANDSHAKE_SSL_ERROR' || /certificate/i.test(detalle)) {
    console.error(
      '   Problema con el certificado de seguridad.\n' +
        '   Si usas una base en la nube, agrega a tu .env:  DB_SSL_REJECT_UNAUTHORIZED=false'
    );
  }

  console.error('   Revisa los datos de conexión en tu archivo .env');
  process.exit(1);
});
