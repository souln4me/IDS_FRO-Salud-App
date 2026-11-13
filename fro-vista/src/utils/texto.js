/**
 * Componente: Cliente Móvil
 * Casos de uso: apoyo común, usado por CU56 y CU58.
 */
// Ruta: fro-vista/src/utils/texto.js
//
// Texto escrito por personas, listo para mostrarse: compone las tildes que
// algunos teclados envían como un signo aparte de la letra (se dibujaban
// desplazadas) y repara el texto UTF-8 que llegó leído como Latin-1
// ("canciÃ³n" → "canción").

/** Reinterpreta cada carácter como un byte y decodifica UTF-8. null si no cuadra. */
function repararLatin1(texto) {
  const bytes = [];
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    if (codigo > 0xff) return null;
    bytes.push(codigo);
  }
  let salida = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let largo = 1;
    let punto = b;
    if (b >= 0xf0) { largo = 4; punto = b & 0x07; }
    else if (b >= 0xe0) { largo = 3; punto = b & 0x0f; }
    else if (b >= 0xc0) { largo = 2; punto = b & 0x1f; }
    else if (b >= 0x80) return null;
    for (let j = 1; j < largo; j++) {
      const c = bytes[i + j];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      punto = (punto << 6) | (c & 0x3f);
    }
    salida += String.fromCodePoint(punto);
    i += largo;
  }
  return salida;
}

export function textoLimpio(valor) {
  let texto = String(valor ?? '');
  if (/Ã[\u0080-¿]/.test(texto)) {
    const reparado = repararLatin1(texto);
    if (reparado) texto = reparado;
  }
  return typeof texto.normalize === 'function' ? texto.normalize('NFC') : texto;
}
