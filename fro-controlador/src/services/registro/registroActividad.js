/**
 * Componente: C_API_REST
 * Casos de uso: apoyo común (todas las peticiones).
 *
 * Registro de actividad del servidor: por cada petición a /api deja una línea
 * en la consola (la terminal de `npm run dev` o los Logs de Render) con:
 *   - hora, método, ruta, respuesta y duración;
 *   - quién la hizo (rol y número de usuario, nunca datos personales);
 *   - el caso de uso que atiende, sacado del comentario `// CUxx — …` que
 *     está sobre cada ruta en src/routes;
 *   - la conexión completa: desde la Vista (Cliente Móvil o Navegador Web),
 *     la API REST, cada componente del Diagrama de Componentes en el orden en
 *     que se usó, la base MySQL y los servicios externos (API Cloudinary, API
 *     Brevo…), el mismo recorrido que los diagramas de secuencia;
 *   - los eventos que esos componentes anunciaron (aviso enviado, archivo
 *     subido, evento crítico escalado…).
 *
 * Ejemplo:
 *   [14:03:22] POST /api/clinica/derivaciones → 201 · 140 ms · Profesional #4 · CU65 — Derivando…
 *              conexión: Cliente Móvil → C_API_REST → C_Seguridad_JWT_BCrypt → C_Control_Acceso_Clinico → C_Capa_de_Acceso_a_Datos → C_MYSQL → C_Despachador_Notificaciones
 *              ↳ C_Despachador_Notificaciones: aviso DERIVACION_RECIBIDA → usuario #9 (APP)
 *
 * Nunca se registran cuerpos de petición, contraseñas, RUT, correos ni
 * contenido clínico. Se apaga con LOG_ACTIVIDAD=0 en el .env.
 */

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const ACTIVO = process.env.LOG_ACTIVIDAD !== '0';
const contexto = new AsyncLocalStorage();

// Las pantallas que se actualizan solas (chat, contador de avisos, atención en
// curso…) repiten la misma consulta cada pocos segundos. Una consulta GET igual
// a la anterior, del mismo usuario y con la misma respuesta, se calla durante
// este tiempo y después se informa cuántas veces se repitió.
const SILENCIO_REPETIDAS_MS = 60 * 1000;
const ultimasRepetidas = new Map();

// Rutas que no aportan al seguimiento (las consulta Render para saber si el
// servidor está vivo).
const IGNORADAS = [/^\/api\/diagnostico/, /^\/api\/health/, /^\/favicon/];

// ── Caso de uso de cada ruta ─────────────────────────────────────────────────
// Se lee una vez, al arrancar, desde los mismos archivos de rutas: así el
// registro nunca queda desactualizado cuando se agrega una ruta nueva.
function limpiarComentario(linea) {
  const texto = linea
    .replace(/^\s*\/\/\s*/, '')
    .replace(/[─━-]{2,}/g, '')
    .replace(/^[─\s]+|[─\s]+$/g, '')
    .replace(/\s+/g, ' ');
  return texto.length <= 90 ? texto : `${texto.slice(0, 90).replace(/\s+\S*$/, '')}…`;
}

function leerCasosDeUso() {
  const mapa = new Map();
  try {
    const dirRutas = path.join(__dirname, '../../routes');
    const fuenteRest = fs.readFileSync(path.join(__dirname, '../../componentes/C_API_REST.js'), 'utf8');
    const prefijos = [...fuenteRest.matchAll(/router\.use\(\s*'([^']+)'\s*,\s*require\('\.\.\/routes\/([^']+)'\)/g)];
    for (const [, prefijo, archivo] of prefijos) {
      const lineas = fs.readFileSync(path.join(dirRutas, `${archivo}.js`), 'utf8').split('\n');
      // Se usa el bloque de comentarios justo sobre la ruta, prefiriendo la
      // línea con el formato "CUxx — nombre". Una ruta sin comentario propio
      // hereda el de la ruta anterior (suelen ir en pares, como GET y POST).
      let comentario = null;
      let bloque = [];
      for (const linea of lineas) {
        if (/^\s*\/\//.test(linea)) {
          if (/CU\d{2}/.test(linea)) bloque.push(limpiarComentario(linea));
          continue;
        }
        const ruta = linea.match(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/);
        if (!ruta) continue;
        if (bloque.length) {
          comentario = bloque.find((texto) => /^CU\d{2}(,\s*CU\d{2})*\s*[—–-]\s*\S/.test(texto)) || bloque[0];
          bloque = [];
        }
        if (comentario) {
          mapa.set(`${ruta[1].toUpperCase()} /api${prefijo}${ruta[2] === '/' ? '' : ruta[2]}`, comentario);
        }
      }
    }
  } catch (error) {
    console.error('[registroActividad] no se pudieron leer los casos de uso:', error.message);
  }
  return mapa;
}

const CASOS_DE_USO = ACTIVO ? leerCasosDeUso() : new Map();

function casoDeUso(req) {
  if (!req.route) return null;
  const rutaDefinida = `${req.baseUrl}${req.route.path === '/' ? '' : req.route.path}`;
  return CASOS_DE_USO.get(`${req.method} ${rutaDefinida}`) || null;
}

// ── Componentes que participan ───────────────────────────────────────────────
function marcarComponente(nombre) {
  const ctx = contexto.getStore();
  if (ctx && !ctx.componentes.includes(nombre)) ctx.componentes.push(nombre);
}

// Servicios externos con el mismo nombre que en el Diagrama de Componentes.
const SERVICIOS_EXTERNOS = {
  OPENAI: 'API OpenAI',
  IMED: 'API Bonos Electrónicos',
  FINANCIADOR: 'API Bonos Electrónicos',
  PASARELA_PAGO: 'API Transacciones',
  CLOUDINARY: 'API Cloudinary',
  BREVO: 'API Brevo',
  SMTP: 'API Brevo',
  EXPO_PUSH: 'API Expo Push',
};
/** Anota la conexión del API Adapter (o del Despachador) con un servicio externo. */
function marcarServicioExterno(clave) {
  marcarComponente(SERVICIOS_EXTERNOS[clave] || clave);
}

// Quién inició la conexión: la app, un navegador (enlaces del correo) o el
// propio servidor (el financiador simulado lo llama el API Adapter).
function origen(req) {
  const agente = String(req.headers['user-agent'] || '');
  if (/^node|undici/i.test(agente)) return 'Servidor (llamada interna)';
  if (/Mozilla/.test(agente) && !/Expo|okhttp|Dalvik|CFNetwork/.test(agente)) return 'Navegador Web';
  return 'Cliente Móvil';
}

/**
 * Recorrido completo de la petición, de la Vista a la base de datos y a los
 * servicios externos: el mismo orden de los diagramas de secuencia.
 */
function cadenaDeConexion(req, ctx) {
  const cadena = [origen(req), 'C_API_REST'];
  for (const nombre of ctx.componentes) {
    cadena.push(nombre);
    if (nombre === 'C_Capa_de_Acceso_a_Datos') cadena.push('C_MYSQL');
  }
  return cadena;
}

/**
 * Envuelve las funciones de un componente (src/componentes/C_*.js) para que
 * cada uso quede anotado en la petición en curso. No cambia lo que hacen.
 */
function trazarComponente(nombre, objeto) {
  if (!ACTIVO || !objeto) return objeto;
  for (const clave of Object.keys(objeto)) {
    const descriptor = Object.getOwnPropertyDescriptor(objeto, clave);
    if (!descriptor || descriptor.get || typeof descriptor.value !== 'function') continue;
    const original = descriptor.value;
    objeto[clave] = function componenteTrazado(...args) {
      marcarComponente(nombre);
      return original.apply(this, args);
    };
  }
  return objeto;
}

/**
 * Evento de un componente: se imprime bajo la línea de su petición o, si no
 * hay petición (tareas programadas, envíos que terminan después), de inmediato.
 */
function registrar(componente, mensaje) {
  if (!ACTIVO) return;
  const ctx = contexto.getStore();
  if (ctx && !ctx.terminada) {
    marcarComponente(componente);
    ctx.eventos.push(`${componente}: ${mensaje}`);
  } else {
    console.log(`[${hora()}] ↳ ${componente}: ${mensaje}`);
  }
}

// ── Línea por petición ───────────────────────────────────────────────────────
function hora() {
  return new Date().toLocaleTimeString('es-CL', { hour12: false, timeZone: 'America/Santiago' });
}

function quien(req) {
  if (!req.user) return 'sin sesión';
  const rol = req.user.nombre_rol || req.user.rol || 'Usuario';
  return `${rol} #${req.user.usuario_id}`;
}

function registrarPeticiones(req, res, next) {
  if (!ACTIVO || IGNORADAS.some((patron) => patron.test(req.path)) || req.method === 'OPTIONS') {
    return next();
  }
  const inicio = process.hrtime.bigint();
  const ctx = { componentes: [], eventos: [], terminada: false, codigoError: null };

  // El código de error de la respuesta (HORARIO_OCUPADO, ACCESO_DENEGADO…)
  // dice mucho más que el número; y la app lo muestra junto al caso de uso.
  const jsonOriginal = res.json.bind(res);
  res.json = (cuerpo) => {
    if (res.statusCode >= 400 && cuerpo && typeof cuerpo.error === 'string' && /^[A-Z_]+$/.test(cuerpo.error)) {
      ctx.codigoError = cuerpo.error;
    }
    const cu = casoDeUso(req);
    if (!res.headersSent) {
      if (cu) res.setHeader('X-Caso-Uso', (cu.match(/CU\d{2}/) || [''])[0]);
      // La app muestra en su terminal los componentes con que se conectó.
      // (Las cabeceras solo admiten letras sin tilde.)
      const componentes = cadenaDeConexion(req, ctx).slice(1).join(' > ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      res.setHeader('X-Componentes', componentes);
    }
    return jsonOriginal(cuerpo);
  };

  res.on('finish', () => {
    ctx.terminada = true;
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const ruta = (req.originalUrl || req.url).split('?')[0];
    const estado = res.statusCode;

    if (req.method === 'GET' && estado < 400) {
      const clave = `${req.user?.usuario_id || '-'} ${ruta} ${estado}`;
      const anterior = ultimasRepetidas.get(clave);
      const ahora = Date.now();
      if (anterior && ahora - anterior.desde < SILENCIO_REPETIDAS_MS) {
        anterior.veces += 1;
        return;
      }
      ultimasRepetidas.set(clave, { desde: ahora, veces: 0 });
      if (anterior?.veces) ctx.eventos.unshift(`(se repitió ${anterior.veces} veces en el último minuto)`);
      if (ultimasRepetidas.size > 2000) ultimasRepetidas.clear();
    }

    const marca = estado >= 500 ? '❌ ' : estado >= 400 ? '⚠️  ' : '';
    const cu = casoDeUso(req);
    const partes = [
      `[${hora()}] ${marca}${req.method} ${ruta} → ${estado}${ctx.codigoError ? ` ${ctx.codigoError}` : ''}`,
      `${Math.round(ms)} ms`,
      quien(req),
    ];
    if (cu) partes.push(cu);
    const lineas = [partes.join(' · ')];
    lineas.push(`           conexión: ${cadenaDeConexion(req, ctx).join(' → ')}`);
    for (const evento of ctx.eventos) lineas.push(`           ↳ ${evento}`);
    console.log(lineas.join('\n'));
  });

  return contexto.run(ctx, next);
}

module.exports = { registrarPeticiones, trazarComponente, registrar, marcarComponente, marcarServicioExterno, ACTIVO };
