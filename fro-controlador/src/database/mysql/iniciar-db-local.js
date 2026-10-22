/**
 * Deja la base de datos lista en el computador de quien lo ejecute, de una
 * sola vez y sin pasos manuales. Vive junto a schema.sql porque es la forma
 * recomendada de cargarlo.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');

const RAIZ = path.join(__dirname, '..', '..', '..');          // fro-controlador/
const RUTA_SCHEMA = path.join(__dirname, 'schema.sql');
const RUTA_ENV = path.join(RAIZ, '.env');
const RUTA_ENV_EJEMPLO = path.join(RAIZ, '.env.example');
const RUTA_MIGRACIONES = path.join(RAIZ, 'scripts', 'migrar-db.js');

const REINICIAR = process.argv.includes('--reiniciar');

// ── Utilidades de consola ────────────────────────────────────────────────────

function paso(numero, texto) {
  console.log(`\n${numero}. ${texto}`);
}

function preguntar(texto, { oculto = false } = {}) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (oculto) {
      // La contraseña no se muestra mientras se escribe.
      rl.stdoutMuted = true;
      rl._writeToOutput = function (cadena) {
        if (this.stdoutMuted && !/^\r?\n$/.test(cadena)) return;
        rl.output.write(cadena);
      };
      process.stdout.write(texto);
    }
    rl.question(oculto ? '' : texto, (respuesta) => {
      rl.close();
      if (oculto) process.stdout.write('\n');
      resolver(respuesta.trim());
    });
  });
}

// ── 1. Archivo .env ──────────────────────────────────────────────────────────

function leerEnv() {
  if (!fs.existsSync(RUTA_ENV)) return {};
  const valores = {};
  for (const linea of fs.readFileSync(RUTA_ENV, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return valores;
}

function guardarEnEnv(clave, valor) {
  let contenido = fs.existsSync(RUTA_ENV) ? fs.readFileSync(RUTA_ENV, 'utf8') : '';
  const expresion = new RegExp(`^\\s*${clave}\\s*=.*$`, 'm');
  const linea = `${clave}=${valor}`;
  contenido = expresion.test(contenido)
    ? contenido.replace(expresion, linea)
    : `${contenido.replace(/\s*$/, '')}\n${linea}\n`;
  fs.writeFileSync(RUTA_ENV, contenido);
}

async function prepararEnv() {
  paso(1, 'Archivo de configuración (.env)');

  if (!fs.existsSync(RUTA_ENV)) {
    if (!fs.existsSync(RUTA_ENV_EJEMPLO)) {
      throw new Error(`No existe ${RUTA_ENV} ni ${RUTA_ENV_EJEMPLO} para copiarlo.`);
    }
    fs.copyFileSync(RUTA_ENV_EJEMPLO, RUTA_ENV);
    // La clave de sesión no puede quedar con el valor de ejemplo.
    guardarEnEnv('JWT_SECRET', require('crypto').randomBytes(48).toString('hex'));
    console.log('   Creado a partir de .env.example (con una clave de sesión nueva).');
  } else {
    console.log('   Ya existe; se usan sus datos.');
  }

  const env = leerEnv();

  if (env.DATABASE_URL) {
    console.log(
      '   ⚠️  El .env tiene DATABASE_URL (base en la nube). Este script es para\n' +
        '      MySQL local: comenta esa línea con # si quieres trabajar en local.'
    );
    process.exit(1);
  }

  const datos = {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD,
    database: env.DB_NAME || 'fro_salud_db',
  };

  // Lo que falte (o quedó con el valor de ejemplo) se pregunta una vez.
  if (!env.DB_USER) {
    const usuario = await preguntar(`   Usuario de MySQL [${datos.user}]: `);
    if (usuario) datos.user = usuario;
    guardarEnEnv('DB_USER', datos.user);
  }
  if (datos.password === undefined || datos.password === 'tu_password_aqui') {
    datos.password = await preguntar(`   Contraseña de MySQL del usuario ${datos.user} (Enter si no tiene): `, { oculto: true });
    guardarEnEnv('DB_PASSWORD', datos.password);
  }
  ['DB_HOST', 'DB_PORT', 'DB_NAME'].forEach((clave) => {
    if (!env[clave]) guardarEnEnv(clave, { DB_HOST: datos.host, DB_PORT: datos.port, DB_NAME: datos.database }[clave]);
  });
  if (!env.DB_SSL) guardarEnEnv('DB_SSL', 'false');

  console.log(`   Conexión: ${datos.user}@${datos.host}:${datos.port} · base ${datos.database}`);
  return datos;
}

// ── 2. Conexión al servidor ──────────────────────────────────────────────────

async function conectar(datos, conBase) {
  return mysql.createConnection({
    host: datos.host,
    port: datos.port,
    user: datos.user,
    password: datos.password,
    ...(conBase ? { database: datos.database } : {}),
    multipleStatements: true,
  });
}

function explicarErrorConexion(error) {
  const codigo = error.code || '';
  if (codigo === 'ECONNREFUSED') {
    return 'MySQL no está encendido o escucha en otro puerto.\n' +
      '   Windows: abre "Servicios" y arranca MySQL80.  Mac: brew services start mysql\n' +
      '   Si lo instalaste con XAMPP/WAMP, enciende MySQL desde su panel.';
  }
  if (codigo === 'ER_ACCESS_DENIED_ERROR') {
    return 'Usuario o contraseña incorrectos. Corrige DB_USER / DB_PASSWORD en el .env\n' +
      '   (borra la línea DB_PASSWORD para que el script la vuelva a preguntar).';
  }
  if (codigo === 'ENOTFOUND' || codigo === 'EAI_AGAIN') {
    return 'No se encontró el servidor. Revisa DB_HOST en el .env (en local es localhost).';
  }
  if (/auth_gssapi|sha256_password|caching_sha2/i.test(error.message || '')) {
    return 'El método de autenticación del usuario no es compatible. En MySQL ejecuta:\n' +
      `   ALTER USER 'usuario'@'localhost' IDENTIFIED WITH mysql_native_password BY 'clave';`;
  }
  return error.message || codigo || 'sin detalle';
}

// ── 3. Esquema ───────────────────────────────────────────────────────────────

async function cargarEsquema(datos) {
  paso(3, `Base de datos ${datos.database}`);

  if (!fs.existsSync(RUTA_SCHEMA)) throw new Error(`No se encontró ${RUTA_SCHEMA}`);
  // El archivo crea y selecciona fro_salud_db; aquí se usa el nombre del .env.
  const sql = fs
    .readFileSync(RUTA_SCHEMA, 'utf8')
    .replace(/^\s*CREATE DATABASE[^;]*;\s*/i, '')
    .replace(/^\s*USE\s+[^;]*;\s*/i, '');

  const servidor = await conectar(datos, false);
  try {
    await servidor.query(
      `CREATE DATABASE IF NOT EXISTS \`${datos.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await servidor.end();
  }

  const conexion = await conectar(datos, true);
  try {
    const [tablas] = await conexion.query('SHOW TABLES');

    if (tablas.length > 0 && !REINICIAR) {
      console.log(`   Ya tiene ${tablas.length} tablas: se conserva lo que hay.`);
      console.log('   (para partir de cero: npm run db:local -- --reiniciar)');
      return { creada: false };
    }

    if (tablas.length > 0) {
      console.log(`   ⚠️  --reiniciar: borrando ${tablas.length} tablas…`);
      await conexion.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const fila of tablas) {
        await conexion.query(`DROP TABLE IF EXISTS \`${Object.values(fila)[0]}\``);
      }
      await conexion.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    console.log('   Cargando schema.sql (tablas y datos iniciales)…');
    await conexion.query(sql);
    const [creadas] = await conexion.query('SHOW TABLES');
    console.log(`   ✅ ${creadas.length} tablas creadas.`);
    return { creada: true };
  } finally {
    await conexion.end();
  }
}

// ── 4. Migraciones ───────────────────────────────────────────────────────────

async function aplicarMigraciones(datos) {
  paso(4, 'Migraciones (cambios posteriores al esquema base)');
  const { ejecutarMigraciones, MIGRACIONES } = require(RUTA_MIGRACIONES);
  const conexion = await conectar(datos, true);
  try {
    const aplicadas = await ejecutarMigraciones(conexion);
    console.log(
      aplicadas === 0
        ? `   ✅ Al día: las ${MIGRACIONES.length} migraciones ya estaban aplicadas.`
        : `   ✅ ${aplicadas} migración(es) aplicada(s); ${MIGRACIONES.length} en total.`
    );
    return MIGRACIONES.length;
  } finally {
    await conexion.end();
  }
}

// ── 5. Verificación ──────────────────────────────────────────────────────────

async function verificar(datos, totalMigraciones) {
  paso(5, 'Verificación');
  const conexion = await conectar(datos, true);
  try {
    const [[tablas]] = await conexion.query(
      'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [datos.database]
    );
    const [[roles]] = await conexion.query('SELECT COUNT(*) AS n FROM Rol');
    const [[admins]] = await conexion.query(
      `SELECT COUNT(*) AS n FROM Usuario u JOIN Rol r ON r.rol_id = u.rol_id WHERE r.nombre_rol = 'Administrador'`
    );
    const { MIGRACIONES } = require(RUTA_MIGRACIONES);
    let pendientes = 0;
    for (const m of MIGRACIONES) {
      if (!(await m.yaAplicada(conexion, datos.database))) pendientes++;
    }
    console.log(`   Tablas: ${tablas.n} · roles: ${roles.n} · administradores: ${admins.n} · migraciones pendientes: ${pendientes}/${totalMigraciones}`);
    if (roles.n === 0 || admins.n === 0 || pendientes > 0) {
      throw new Error('La base quedó incompleta. Vuelve a ejecutar con --reiniciar y revisa los mensajes.');
    }
  } finally {
    await conexion.end();
  }
}

// ── Principal ────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Punto Paz Salud · base de datos local');
  console.log('═══════════════════════════════════════════════════════════');

  const datos = await prepararEnv();

  paso(2, 'Conexión al servidor MySQL');
  try {
    const prueba = await conectar(datos, false);
    const [[version]] = await prueba.query('SELECT VERSION() AS v');
    await prueba.end();
    console.log(`   ✅ MySQL ${version.v} responde.`);
  } catch (error) {
    console.error(`   ❌ No se pudo conectar: ${explicarErrorConexion(error)}`);
    process.exit(1);
  }

  await cargarEsquema(datos);
  const total = await aplicarMigraciones(datos);
  await verificar(datos, total);

  console.log('\n✅ Base de datos lista. Para levantar el servidor:');
  console.log('   npm run dev');
  console.log('   y abre http://localhost:3000/api/diagnostico/base-datos para comprobarlo.\n');
}

main().catch((error) => {
  console.error(`\n❌ ${error.message || error}`);
  process.exit(1);
});
