// Componente: C_Seguridad_JWT_BCrypt (puerta de entrada: src/componentes/C_Seguridad_JWT_BCrypt.js)
// Casos de uso: CU12.
//
// scripts/cu12_tokens.js
// Genera tokens JWT para documentar los casos de prueba del CU12 (RBAC).
// Uso (desde fro-controlador):  node scripts/cu12_tokens.js
require('dotenv').config();
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Falta JWT_SECRET en .env');
  process.exit(1);
}

const firmar = (payload, opts) => jwt.sign(payload, secret, opts);

// Ajusta los usuario_id a IDs reales de tu BD si lo necesitas.
console.log('\n=== CU12 · Tokens de prueba ===\n');

console.log('CASO 1 · PROFESIONAL válido (8h):');
console.log(firmar({ usuario_id: 2, nombre_rol: 'Profesional' }, { expiresIn: '8h' }) + '\n');

console.log('CASO 5 · PACIENTE válido (8h):');
console.log(firmar({ usuario_id: 1, nombre_rol: 'Paciente' }, { expiresIn: '8h' }) + '\n');

console.log('CASO 2 · ADMINISTRADOR token EXPIRADO:');
console.log(firmar({ usuario_id: 3, nombre_rol: 'Administrador' }, { expiresIn: '-10s' }) + '\n');

console.log('CASO 3 · token SIN nombre_rol (inconsistencia estructural):');
console.log(firmar({ usuario_id: 3 }, { expiresIn: '8h' }) + '\n');