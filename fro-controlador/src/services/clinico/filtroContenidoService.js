/**
 * Componente: C_Filtro_Contenido (puerta de entrada: src/componentes/C_Filtro_Contenido.js)
 * Casos de uso: CU57; lo usan CU53, CU55 y CU62.
 *
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

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');

// El diccionario cambia poco y se consulta en cada mensaje: se cachea un rato
// para no pegarle a la base en cada tecla enviada.
const VIDA_CACHE_MS = 60 * 1000;
let cache = { terminos: [], momento: 0 };

/**
 * CU57 — Filtrando automáticamente contenido restringido
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

// CU57 — Filtrando automáticamente contenido restringido
/** Lee el diccionario activo, con caché corta. */
async function diccionario(forzar = false) {
  if (!forzar && Date.now() - cache.momento < VIDA_CACHE_MS) {
    return cache.terminos;
  }
  try {
    const [filas] = await C_Capa_de_Acceso_a_Datos.query(
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

// CU57 — Filtrando automáticamente contenido restringido
/** Invalida la caché tras una edición del administrador. */
function refrescar() {
  cache = { terminos: [], momento: 0 };
}

/**
 * CU57, CU53, CU55 — revisa el texto del chat o de la reseña antes de guardarlo
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

  const { bloqueantes, criticos } = await coincidenciasDe(original);

  // Excepción 2: sin coincidencias, el texto se autoriza y se inserta. Los
  // términos CRITICO (CU62) no bloquean: se escalan aparte.
  if (bloqueantes.length === 0) {
    return { permitido: true, coincidencias: [], criticos };
  }

  return {
    permitido: false,
    motivo: 'CONTENIDO_RESTRINGIDO',
    mensaje:
      'Tu mensaje contiene términos que no están permitidos en el canal clínico. ' +
      'Reescríbelo y vuelve a enviarlo.',
    coincidencias: bloqueantes,
    criticos,
  };
}

// CU57, CU62 — separa términos que bloquean de los críticos
/** Términos del diccionario presentes en el texto, separados por su papel. */
async function coincidenciasDe(texto) {
  const normalizado = normalizar(texto);
  const terminos = await diccionario();
  const bloqueantes = [];
  const criticos = [];

  for (const entrada of terminos) {
    if (!entrada.normalizado) continue;
    // Límites de palabra: "casado" no puede activar el término "casa".
    const patron = new RegExp(
      `(^|[^\\p{L}\\p{N}])${entrada.normalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`,
      'u'
    );
    if (patron.test(normalizado)) {
      (entrada.categoria === 'CRITICO' ? criticos : bloqueantes).push(entrada.termino);
    }
  }
  return { bloqueantes, criticos };
}

// CU62 — Escalando Automáticamente Eventos Críticos a Supervisión
/** CU62: solo los términos críticos (vulnerabilidad clínica u operativa). */
async function detectarCriticos(texto) {
  if (!String(texto ?? '').trim()) return [];
  return (await coincidenciasDe(String(texto))).criticos;
}

module.exports = { revisar, detectarCriticos, diccionario, refrescar, normalizar };
