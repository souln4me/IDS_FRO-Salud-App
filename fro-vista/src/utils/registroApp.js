/**
 * Componente: Cliente Móvil
 * Casos de uso: apoyo común (toda la app).
 *
 * Registro de actividad de la app. Escribe en la terminal donde corre Expo
 * (la de Visual Studio Code) qué vista se abre y cada conexión con el
 * servidor: primero el componente al que se está conectando (C_API_REST) y,
 * al volver la respuesta, su resultado, su duración, el caso de uso y los
 * componentes del servidor que participaron (el servidor los informa en las
 * cabeceras X-Caso-Uso y X-Componentes). Ejemplo:
 *
 *   [App] ▶ vista: ReservarCita
 *   [App] Cliente Móvil → C_API_REST: conectando… POST /citas
 *   [App] Cliente Móvil ← C_API_REST: POST /citas → 201 · 230 ms · CU15
 *         conectado con: C_API_REST → C_Seguridad_JWT_BCrypt → C_Motor_Agendamiento → C_Capa_de_Acceso_a_Datos → C_MYSQL
 *
 * Solo funciona en desarrollo (__DEV__): la app publicada no escribe nada.
 * Nunca registra lo que se envía ni lo que vuelve (RUT, contraseñas, datos
 * clínicos): solo la ruta, sin parámetros de búsqueda.
 */

const ACTIVO = typeof __DEV__ !== 'undefined' && __DEV__;

// Las pantallas que se actualizan solas (chat, avisos, atención en curso)
// repiten la misma consulta cada pocos segundos: se muestra una vez por minuto.
const SILENCIO_REPETIDAS_MS = 60 * 1000;
const repetidas = new Map();

function hora() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

export function registrar(mensaje) {
  if (ACTIVO) console.log(`[App ${hora()}] ${mensaje}`);
}

let vistaActual = null;
/** Vista que quedó en pantalla después de navegar. */
export function registrarVista(nombre) {
  if (!ACTIVO || !nombre || nombre === vistaActual) return;
  vistaActual = nombre;
  registrar(`▶ vista: ${nombre}`);
}

function esRepetida(verbo, ruta) {
  if (verbo !== 'GET') return false;
  const anterior = repetidas.get(`${ruta} salida`);
  return Boolean(anterior && Date.now() - anterior.desde < SILENCIO_REPETIDAS_MS);
}

/** Una llamada al servidor, al salir: el componente al que se conecta. */
export function registrarSalida({ metodo, url }) {
  if (!ACTIVO) return;
  const ruta = String(url || '').split('?')[0];
  const verbo = String(metodo || 'get').toUpperCase();
  if (esRepetida(verbo, ruta)) return;
  if (verbo === 'GET') repetidas.set(`${ruta} salida`, { desde: Date.now(), veces: 0 });
  registrar(`Cliente Móvil → C_API_REST: conectando… ${verbo} ${ruta}`);
}

/** Una llamada al servidor, al recibir la respuesta (o el error). */
export function registrarLlamada({ metodo, url, estado, ms, casoDeUso, codigoError, sinConexion, componentes }) {
  if (!ACTIVO) return;
  const ruta = String(url || '').split('?')[0];
  const verbo = String(metodo || 'get').toUpperCase();

  let sufijoRepetidas = '';
  if (verbo === 'GET' && estado && estado < 400) {
    const clave = `${ruta} ${estado}`;
    const anterior = repetidas.get(clave);
    const ahora = Date.now();
    if (anterior && ahora - anterior.desde < SILENCIO_REPETIDAS_MS) {
      anterior.veces += 1;
      return;
    }
    if (anterior?.veces) sufijoRepetidas = ` · (se repitió ${anterior.veces} veces)`;
    repetidas.set(clave, { desde: ahora, veces: 0 });
    if (repetidas.size > 500) repetidas.clear();
  }

  if (sinConexion) {
    registrar(`❌ Cliente Móvil ✕ C_API_REST: ${verbo} ${ruta} → no se pudo conectar con el servidor (${ms} ms)`);
    return;
  }
  const marca = estado >= 500 ? '❌ ' : estado >= 400 ? '⚠️ ' : '';
  const partes = [`${marca}Cliente Móvil ← C_API_REST: ${verbo} ${ruta} → ${estado}${codigoError ? ` ${codigoError}` : ''}`, `${ms} ms`];
  if (casoDeUso) partes.push(casoDeUso);
  let texto = partes.join(' · ') + sufijoRepetidas;
  if (componentes) texto += `\n      conectado con: ${String(componentes).split(' > ').join(' → ')}`;
  registrar(texto);
}
