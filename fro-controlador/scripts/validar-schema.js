/**
 * Revisa el esquema y las consultas del backend sin necesidad de conectarse a
 * ninguna base de datos. Detecta dos errores que en Mac y Windows pasan
 * desapercibidos pero rompen la aplicación en la nube (donde MySQL corre sobre
 * Linux):
 *
 *   1. Sentencias SQL mal terminadas (un punto y coma olvidado).
 *   2. Nombres de tabla escritos con mayúsculas distintas a las del esquema.
 *      Linux distingue "Paciente" de "paciente"; Mac y Windows no.
 *
 * Uso:
 *   npm run db:validar
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const RUTA_SCHEMA = path.join(RAIZ, 'src', 'database', 'mysql', 'schema.sql');

const sqlBruto = fs.readFileSync(RUTA_SCHEMA, 'utf8');
const sql = sqlBruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

let problemas = 0;

// ── 1. Sentencias bien formadas ──────────────────────────────────────────────
function separarSentencias(texto) {
  const partes = [];
  let actual = '';
  let enComilla = false;

  for (let i = 0; i < texto.length; i++) {
    const caracter = texto[i];
    if (caracter === "'" && texto[i - 1] !== '\\') enComilla = !enComilla;
    if (caracter === ';' && !enComilla) {
      partes.push(actual);
      actual = '';
    } else {
      actual += caracter;
    }
  }
  if (actual.trim()) partes.push(actual);
  return partes;
}

const INICIO_VALIDO = /^(CREATE|INSERT|USE|ALTER|DROP|SET|DELETE|UPDATE|TRUNCATE)\b/i;

let numeroLinea = 1;
let sentencias = 0;

for (const bruta of separarSentencias(sql)) {
  const texto = bruta.trim();
  const lineaInicio = numeroLinea;
  numeroLinea += bruta.split('\n').length - 1;

  if (!texto) continue;
  sentencias++;

  const resumen = texto.slice(0, 75).replace(/\s+/g, ' ');

  if (!INICIO_VALIDO.test(texto)) {
    problemas++;
    console.log(`schema.sql:~${lineaInicio}  la sentencia no empieza con una palabra clave SQL`);
    console.log(`   → ${resumen}…\n`);
    continue;
  }

  // Si dentro de una sentencia empieza otra, falta un punto y coma.
  if (/^\s*(CREATE TABLE|INSERT INTO)\b/im.test(texto.slice(10))) {
    problemas++;
    console.log(`schema.sql:~${lineaInicio}  falta un ";" — hay otra sentencia adentro`);
    console.log(`   → ${resumen}…\n`);
  }
}

// ── 2. Nombres de tabla consistentes ─────────────────────────────────────────
const creadas = [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?(\w+)[`"]?/gi)].map(
  (m) => m[1]
);
const canonico = new Map(creadas.map((t) => [t.toLowerCase(), t]));
const PALABRAS_RESERVADAS = new Set(['select', 'dual', 'set', 'values', 'where', 'as', 'on', 'if']);
const PATRON = /\b(FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM|REFERENCES|ALTER\s+TABLE)(\s+)[`"]?(\w+)[`"]?/gi;

function* archivosJs(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules') continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) yield* archivosJs(completo);
    else if (entrada.name.endsWith('.js')) yield completo;
  }
}

function revisarTablas(contenido, etiqueta) {
  let usos = 0;
  let m;
  const patron = new RegExp(PATRON.source, 'gi');

  while ((m = patron.exec(contenido))) {
    const usado = m[3];
    if (PALABRAS_RESERVADAS.has(usado.toLowerCase())) continue;

    const esperado = canonico.get(usado.toLowerCase());
    if (!esperado) continue;

    usos++;
    if (esperado !== usado) {
      problemas++;
      const linea = contenido.slice(0, m.index).split('\n').length;
      console.log(`${etiqueta}:${linea}  usa "${usado}" pero la tabla se llama "${esperado}"`);
    }
  }
  return usos;
}

let usosTotales = revisarTablas(sql, 'schema.sql');

for (const archivo of archivosJs(path.join(RAIZ, 'src'))) {
  usosTotales += revisarTablas(fs.readFileSync(archivo, 'utf8'), path.relative(RAIZ, archivo));
}

// ── Resultado ────────────────────────────────────────────────────────────────
console.log(
  `\n${creadas.length} tablas · ${sentencias} sentencias · ${usosTotales} usos de tablas revisados.`
);

if (problemas === 0) {
  console.log('✅ Sin problemas. El esquema y las consultas funcionarán también en Linux.');
} else {
  console.log(`❌ ${problemas} problema(s) que romperían la aplicación en la nube.`);
}

process.exit(problemas ? 1 : 0);
