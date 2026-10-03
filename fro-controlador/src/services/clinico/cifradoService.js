/**
 * CU53 — Cifrado del canal de mensajería clínica.
 *
 * Los mensajes entre paciente y profesional se guardan cifrados: quien mire la
 * base de datos ve un bloque ilegible, y el texto solo se reconstruye al
 * servirlo a uno de los dos participantes.
 *
 * Se usa AES-256-GCM, que además de cifrar autentica: si alguien alterara una
 * fila, el descifrado falla en vez de devolver basura.
 *
 * La clave sale de la variable de entorno CLAVE_CIFRADO_CHAT (64 caracteres
 * hexadecimales = 32 bytes). Si no está definida, se deriva del JWT_SECRET del
 * servidor para que el chat funcione igual en desarrollo; eso queda anotado en
 * el diagnóstico, porque en producción la clave debe ser propia.
 */

const crypto = require('crypto');

const ALGORITMO = 'aes-256-gcm';
const VERSION = 'v1';

let claveCache = null;
let derivada = false;

/** Clave de 32 bytes. Se calcula una vez y se reutiliza. */
function clave() {
  if (claveCache) return claveCache;

  const desdeEntorno = process.env.CLAVE_CIFRADO_CHAT;
  if (desdeEntorno && /^[0-9a-fA-F]{64}$/.test(desdeEntorno.trim())) {
    claveCache = Buffer.from(desdeEntorno.trim(), 'hex');
    derivada = false;
    return claveCache;
  }

  const semilla = process.env.JWT_SECRET || 'punto-paz-salud-desarrollo';
  // scrypt con sal fija: la clave tiene que ser la MISMA entre reinicios, o
  // los mensajes guardados dejarían de poder leerse.
  claveCache = crypto.scryptSync(semilla, 'punto-paz-chat', 32);
  derivada = true;
  return claveCache;
}

/** Para el diagnóstico: dice si la clave es propia o derivada del JWT. */
function estadoClave() {
  clave();
  return {
    configurada: !derivada,
    origen: derivada ? 'derivada del JWT_SECRET' : 'CLAVE_CIFRADO_CHAT',
  };
}

/**
 * Cifra un texto. El resultado es autocontenido: trae versión, vector de
 * inicialización y etiqueta de autenticación, así que se puede descifrar
 * aunque más adelante cambie el formato.
 */
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv(ALGORITMO, clave(), iv);
  const datos = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${etiqueta.toString('hex')}:${datos.toString('hex')}`;
}

/**
 * Descifra un paquete.
 *
 * Excepción 4 del CU53: si la clave no corresponde o el formato no se
 * reconoce, NO se lanza un error ni se muestra basura: se devuelve
 * `{ ok: false }` y la app avisa que ese mensaje no se puede leer.
 *
 * @returns {{ok: boolean, texto: string}}
 */
function descifrar(paquete) {
  try {
    const partes = String(paquete).split(':');
    if (partes.length !== 4 || partes[0] !== VERSION) {
      return { ok: false, texto: '' };
    }
    const [, ivHex, etiquetaHex, datosHex] = partes;
    const descifrador = crypto.createDecipheriv(ALGORITMO, clave(), Buffer.from(ivHex, 'hex'));
    descifrador.setAuthTag(Buffer.from(etiquetaHex, 'hex'));
    const texto = Buffer.concat([
      descifrador.update(Buffer.from(datosHex, 'hex')),
      descifrador.final(),
    ]).toString('utf8');
    return { ok: true, texto };
  } catch {
    return { ok: false, texto: '' };
  }
}

module.exports = { cifrar, descifrar, estadoClave };
