// Ruta: fro-vista/src/utils/contrasena.js
//
// Política de contraseñas (Documento 0): 8+ caracteres, letra, número y
// símbolo. Es la misma que valida el servidor en validarRobustezContrasena
// (fro-controlador/src/services/auth/seguridadService.js); si cambia allá,
// cambia aquí, con las mismas etiquetas.

export const REQUISITOS_CONTRASENA = [
  { etiqueta: 'Mínimo 8 caracteres', cumple: (texto) => texto.length >= 8 },
  { etiqueta: 'Al menos una letra', cumple: (texto) => /[a-zA-Z]/.test(texto) },
  { etiqueta: 'Al menos un número', cumple: (texto) => /[0-9]/.test(texto) },
  { etiqueta: 'Al menos un símbolo (ej: . _ - ! @ #)', cumple: (texto) => /[^A-Za-z0-9\s]/.test(texto) },
];

export const requisitosIncumplidos = (texto = '') =>
  REQUISITOS_CONTRASENA.filter((requisito) => !requisito.cumple(texto)).map((requisito) => requisito.etiqueta);
