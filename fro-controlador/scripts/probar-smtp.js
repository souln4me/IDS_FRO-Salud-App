/**
 * Prueba las credenciales de correo (SMTP) sin registrar a nadie: se conecta
 * al servidor, valida usuario y contraseña, y envía un correo de prueba a la
 * propia casilla configurada.
 *
 * Uso:
 *   npm run smtp:probar
 *
 * Lee las variables SMTP_* del archivo .env (o del entorno, si se ejecuta en
 * el servidor de la nube).
 */

const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

async function main() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER } = process.env;
  const SMTP_PASS = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  console.log('Configuración detectada:');
  console.log(`  SMTP_HOST: ${SMTP_HOST || '(no definida)'}`);
  console.log(`  SMTP_PORT: ${SMTP_PORT || '(no definida)'}`);
  console.log(`  SMTP_USER: ${SMTP_USER || '(no definida)'}`);
  console.log(`  SMTP_PASS: ${SMTP_PASS ? `definida (${SMTP_PASS.length} caracteres)` : '(no definida)'}`);
  console.log();

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.error('❌ Faltan variables SMTP en el .env. Completa las cuatro y reintenta.');
    process.exit(1);
  }

  if (SMTP_PASS.length !== 16) {
    console.warn(
      '⚠️  La contraseña no tiene 16 caracteres. Las contraseñas de aplicación\n' +
        '   de Google tienen exactamente 16 letras (sin espacios). Si pusiste tu\n' +
        '   contraseña normal de Gmail, no va a funcionar: genera una en\n' +
        '   myaccount.google.com/apppasswords\n'
    );
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: SMTP_PORT === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  console.log('1/2 Verificando conexión y credenciales…');
  await transporter.verify();
  console.log('✅ El servidor aceptó las credenciales.');

  console.log(`2/2 Enviando correo de prueba a ${SMTP_USER}…`);
  await transporter.sendMail({
    from: `"Fro Salud" <${SMTP_USER}>`,
    to: SMTP_USER,
    subject: 'Prueba de configuración SMTP - Fro Salud',
    text:
      'Si estás leyendo esto, el envío de correos del sistema funciona correctamente. ' +
      'Puedes borrar este mensaje.',
  });
  console.log('✅ Correo enviado. Revisa la bandeja de entrada (y spam) de esa casilla.');
}

main().catch((error) => {
  console.error(`\n❌ Falló la prueba: ${error.message}`);

  if (/Invalid login|535|BadCredentials/i.test(error.message)) {
    console.error(
      '   Usuario o contraseña rechazados por Gmail.\n' +
        '   - SMTP_USER debe ser el correo completo (frosalud.app@gmail.com).\n' +
        '   - SMTP_PASS debe ser la contraseña de aplicación de 16 letras,\n' +
        '     no la contraseña normal. Se genera en myaccount.google.com/apppasswords\n' +
        '     (requiere tener activada la verificación en dos pasos).'
    );
  } else if (/timeout|timedout|ETIMEDOUT|ECONNECTION/i.test(error.message)) {
    console.error(
      '   No se pudo alcanzar el servidor de correo. Revisa SMTP_HOST y SMTP_PORT\n' +
        '   (para Gmail: smtp.gmail.com y 587), o si la red bloquea el puerto.'
    );
  }

  process.exit(1);
});
