/**
 * CU57 — Filtro de contenido restringido.
 *
 * Intercepta cada texto antes de que se escriba en la base y lo contrasta
 * contra el diccionario que administra el Administrador. Si hay coincidencia,
 * el mensaje no se guarda: la poscondición del caso de uso es que el texto
 * quede purgado, no almacenado y marcado.
 *
 * Aplica hoy al chat clínico (CU53) y queda listo para las reseñas públicas
 * del bloque de calidad (CU55/CU56), que usan el mismo diccionario.
 */

const pool = require('../../config/database');

// El diccionario cambia poco y se consulta en cada mensaje: se cachea un rato
// para no pegarle a la base en cada tecla enviada.
const VIDA_CACHE_MS = 60 * 1000;
let cache = { terminos: [], momento: 0 };

/**
 * Normaliza para comparar: minúsculas, sin acentos y sin repeticiones de
 * letras ("idiiiiota" no evade el filtro).
 */
function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(.)\1{2,}/g, '$1');
}

/** Lee el diccionario activo, con caché corta. */
async function diccionario(forzar = false) {
  if (!forzar && Date.now() - cache.momento < VIDA_CACHE_MS) {
    return cache.terminos;
  }
  try {
    const [filas] = await pool.query(
      `SELECT termino, categoria FROM Palabra_Restringida WHERE activa = TRUE`
    );
    cache = {
      terminos: filas.map((f) => ({
        termino: f.termino,
        normalizado: normalizar(f.termino),
        categoria: f.categoria,
      })),
      momento: Date.now(),
    };
  } catch (error) {
    console.error('[filtroContenido] diccionario no disponible:', error.message);
    // Sin diccionario no se bloquea a nadie: el filtro es una restricción, no
    // un requisito para poder conversar.
    cache = { terminos: [], momento: Date.now() };
  }
  return cache.terminos;
}

/** Invalida la caché tras una edición del administrador. */
function refrescar() {
  cache = { terminos: [], momento: 0 };
}

/**
 * Revisa un texto contra el diccionario.
 *
 * @returns {Promise<{permitido: boolean, motivo?: string, coincidencias: string[]}>}
 */
async function revisar(texto) {
  const original = String(texto ?? '');

  // Excepción 1: una cadena sin caracteres imprimibles no llega siquiera al
  // validador léxico. Se corta antes.
  if (original.trim().length === 0) {
    return {
      permitido: false,
      motivo: 'VACIO',
      mensaje: 'Escribe un mensaje antes de enviarlo.',
      coincidencias: [],
    };
  }

  const normalizado = normalizar(original);
  const terminos = await diccionario();
  const coincidencias = [];

  for (const entrada of terminos) {
    if (!entrada.normalizado) continue;
    // Límites de palabra: "casado" no puede activar el término "casa".
    const patron = new RegExp(
      `(^|[^\\p{L}\\p{N}])${entrada.normalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`,
      'u'
    );
    if (patron.test(normalizado)) {
      coincidencias.push(entrada.termino);
    }
  }

  // Excepción 2: sin coincidencias, el texto se autoriza y se inserta.
  if (coincidencias.length === 0) {
    return { permitido: true, coincidencias: [] };
  }

  return {
    permitido: false,
    motivo: 'CONTENIDO_RESTRINGIDO',
    mensaje:
      'Tu mensaje contiene términos que no están permitidos en el canal clínico. ' +
      'Reescríbelo y vuelve a enviarlo.',
    coincidencias,
  };
}

module.exports = { revisar, diccionario, refrescar, normalizar };
