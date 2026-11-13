// Componente: C_API_Adapter (puerta de entrada: src/componentes/C_API_Adapter.js)
// Casos de uso: CU68, CU69.
//
// ⚠️ CU68 - Script de EVIDENCIA / DEMO (deuda técnica, NO usar en producción).
// Levanta un stub local que simula a un proveedor externo y ejecuta los 5 casos
// de prueba (CP68-01..05) contra la capa adaptadora. Cada caso deja su fila en
// Bitacora_Auditoria (la evidencia persistente) y se imprime el resultado.
//
// Uso (desde la carpeta fro-controlador):  node scripts/cu68_demo.js

// Timeout corto para poder demostrar la latencia crítica (CP68-04).
// DEBE definirse ANTES de requerir la capa adaptadora (lee el env al cargarse).
process.env.EXTERNAL_TIMEOUT_MS = process.env.EXTERNAL_TIMEOUT_MS || '2000';

const http = require('http');
const { ejecutarTransaccion } = require('../src/services/external/providerAdapter');
const pool = require('../src/config/database');

const PUERTO_STUB = 4599;
const BASE = `http://localhost:${PUERTO_STUB}`;

// ── Stub que simula al proveedor externo ──────────────────────────────────────
const stub = http.createServer((req, res) => {
  if (req.url === '/ok') {                 // 200 válido (CP01)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ estado: 'VIGENTE', monto_bono: 18500 }));
  }
  if (req.url === '/divergente') {         // 200 con esquema incorrecto (CP05)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ resultado: 'ok' }));
  }
  if (req.url === '/error500') {           // 500 (CP03)
    res.writeHead(500); return res.end('Error interno simulado');
  }
  if (req.url === '/lento') {              // demora > timeout (CP04)
    const t = setTimeout(() => { try { res.writeHead(200); res.end('tarde'); } catch {} }, 4000);
    req.on('close', () => clearTimeout(t)); // si el cliente aborta, cancelamos
    return;
  }
  res.writeHead(404); res.end();
});

const sep = (t) => console.log(`\n──────── ${t} ────────`);

async function correr(nombre, params) {
  sep(nombre);
  try {
    const r = await ejecutarTransaccion(params);
    console.log('✅ RESULTADO:', JSON.stringify(r));
  } catch (e) {
    console.log(`❌ EXCEPCIÓN  code=${e.code}  →  ${e.message}`);
  }
}

async function main() {
  await new Promise((r) => stub.listen(PUERTO_STUB, r));
  console.log(`Stub de proveedor en ${BASE}  (timeout=${process.env.EXTERNAL_TIMEOUT_MS}ms)`);

  const base = { proveedor: 'IMED', operacion: 'VALIDAR_BONO', usuarioId: 1 };
  const datosOk = { rut: '12345678-9', bono: 'BON-2024-0098' };

  await correr('CP68-01 Éxito',                  { ...base, datosInternos: datosOk, urlOverride: `${BASE}/ok` });
  await correr('CP68-02 Excepción 1 (sintaxis)', { ...base, datosInternos: { rut: '12345678-9' } });
  await correr('CP68-03 Excepción 2 (red/500)',  { ...base, datosInternos: datosOk, urlOverride: `${BASE}/error500` });
  await correr('CP68-04 Excepción 3 (latencia)', { ...base, datosInternos: datosOk, urlOverride: `${BASE}/lento` });
  await correr('CP68-05 Excepción 4 (esquema)',  { ...base, datosInternos: datosOk, urlOverride: `${BASE}/divergente` });

  sep('FIN — revisa la bitácora con esta consulta');
  console.log("SELECT bitacora_auditoria_id, entidad_afectada, datos_adicionales, momento_evento");
  console.log("FROM Bitacora_Auditoria WHERE accion='INTEGRACION_EXTERNA' ORDER BY bitacora_auditoria_id DESC LIMIT 10;");

  stub.close();
  await pool.end(); // cierra el pool para que el script termine
}

main().catch((e) => { console.error(e); process.exit(1); });