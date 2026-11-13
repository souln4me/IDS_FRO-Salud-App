// Componente: C_API_Adapter (puerta de entrada: src/componentes/C_API_Adapter.js)
// Casos de uso: CU70, CU69.
//
// ⚠️ CU70 - Script de EVIDENCIA / DEMO (deuda técnica, NO usar en producción).
// Levanta un stub local CON ESTADO que simula al "Proveedor Externo" y ejecuta los
// 5 casos de prueba (CP70-01..05) contra la capa adaptadora. Cada caso imprime su
// resultado y deja su(s) fila(s) en Bitacora_Auditoria (la evidencia persistente).
//
// Uso (desde la carpeta fro-controlador):  node scripts/cu70_demo.js
//   Requiere .env con la conexión a MySQL (dotenv lee el cwd = fro-controlador).

// Aceleramos un poco el backoff para que la demo sea ágil. DEBE ir antes de requerir
// la capa adaptadora (los módulos leen el env al cargarse).
process.env.EXTERNAL_BACKOFF_BASE_MS = process.env.EXTERNAL_BACKOFF_BASE_MS || '300';
process.env.EXTERNAL_MAX_INTENTOS = process.env.EXTERNAL_MAX_INTENTOS || '3';

const http = require('http');
const { ejecutarTransaccion } = require('../src/services/external/providerAdapter');
const retryState = require('../src/utils/retryState');
const pool = require('../src/config/database');

const PUERTO_STUB = 4670;
const BASE = `http://localhost:${PUERTO_STUB}`;

// Cuerpo de éxito que valida contra el esquema de entrada de IMED { estado, monto_bono }.
const CUERPO_OK = JSON.stringify({ estado: 'VIGENTE', monto_bono: 15000 });

// ── Stub del proveedor externo (con estado para el caso "falla y luego responde") ──
let flakyCount = 0;
const reiniciarFlaky = () => { flakyCount = 0; };

const stub = http.createServer((req, res) => {
  if (req.url.startsWith('/flaky')) {              // 500 en el 1.º intento, 200 en el 2.º
    flakyCount++;
    if (flakyCount === 1) { res.writeHead(500); return res.end('caida transitoria simulada'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(CUERPO_OK);
  }
  if (req.url.startsWith('/error400')) { res.writeHead(400); return res.end('formato incompatible'); }
  if (req.url.startsWith('/error500')) { res.writeHead(500); return res.end('caida permanente'); }
  if (req.url.startsWith('/ok')) {                 // 200 válido siempre
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(CUERPO_OK);
  }
  res.writeHead(404); res.end();
});

const base = {
  proveedor: 'IMED',
  operacion: 'validar_bono',
  datosInternos: { rut: '11.111.111-1', bono: 'BONO-2024-001' },
  usuarioId: 1
};

async function correr(nombre, params) {
  console.log(`\n──────── ${nombre} ────────`);
  try {
    const r = await ejecutarTransaccion(params);
    console.log('✅ ÉXITO (HTTP 200) | datos:', JSON.stringify(r.datos), '| meta:', JSON.stringify(r.meta));
  } catch (e) {
    console.log(`❌ EXCEPCIÓN | code=${e.code} → ${e.message}`);
  }
}

async function main() {
  await new Promise((r) => stub.listen(PUERTO_STUB, r));
  console.log(`Stub del proveedor en ${BASE} | MAX_INTENTOS=${process.env.EXTERNAL_MAX_INTENTOS} | backoff base=${process.env.EXTERNAL_BACKOFF_BASE_MS}ms`);

  // CP70-01: 500 → 200. Éxito en el 2.º intento, contador reiniciado.
  reiniciarFlaky();
  await correr('CP70-01 Flujo principal (reintento → éxito)', { ...base, urlOverride: `${BASE}/flaky` });

  // CP70-02: 400 → RECHAZO_FORMATO (aborta sin reintentar), HTTP 422.
  await correr('CP70-02 Exc 1 (HTTP 400 formato incompatible)', { ...base, urlOverride: `${BASE}/error400` });

  // CP70-03: caché caída + 500 → 200. Exc 2 (memoria local) Y, por estar la caché caída,
  // la consolidación tras éxito también falla → Exc 4 (consolidacion: 'inconsistente').
  retryState.simularFalloCache(true);
  reiniciarFlaky();
  await correr('CP70-03 Exc 2 (caché caída → memoria local)', { ...base, urlOverride: `${BASE}/flaky` });
  retryState.simularFalloCache(false);

  // CP70-04: 500 permanente → LIMITE_REINTENTOS tras 3 intentos, HTTP 503.
  await correr('CP70-04 Exc 3 (límite de reintentos)', { ...base, urlOverride: `${BASE}/error500` });

  // CP70-05: éxito + fallo SOLO en la limpieza → consolidacion: 'inconsistente' (Exc 4 aislada).
  retryState.simularFalloLimpieza(true);
  await correr('CP70-05 Exc 4 (fallo de consolidación)', { ...base, urlOverride: `${BASE}/ok` });
  retryState.simularFalloLimpieza(false);

  console.log('\n──────── FIN — revisa la bitácora con esta consulta ────────');
  console.log("SELECT bitacora_auditoria_id, entidad_afectada, datos_adicionales, momento_evento");
  console.log("FROM Bitacora_Auditoria WHERE accion='INTEGRACION_EXTERNA' ORDER BY bitacora_auditoria_id DESC LIMIT 10;");

  stub.close();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
