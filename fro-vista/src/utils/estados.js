// Ruta: fro-vista/src/utils/estados.js
//
// Estados de una cita: color, etiqueta legible y prioridad de orden.
//
// Vive aquí porque el estado se muestra en tres pantallas distintas y en dos
// de ellas se pintaba el valor crudo de la base: se leía "EN_CURSO", con
// guion bajo y en mayúsculas, en medio de la ficha clínica.

import { colores } from '../theme';

export const ESTADOS = {
  EN_CURSO:     { color: colores.advertencia, etiqueta: 'En curso',     orden: 0 },
  CONFIRMADA:   { color: colores.exito,       etiqueta: 'Confirmada',   orden: 1 },
  AGENDADA:     { color: colores.primario,    etiqueta: 'Agendada',     orden: 2 },
  REALIZADA:    { color: colores.textoSuave,  etiqueta: 'Realizada',    orden: 3 },
  INASISTENCIA: { color: colores.error,       etiqueta: 'Inasistencia', orden: 4 },
  // RF20: la cancelación distingue quién la hizo (D2). 'CANCELADA' a secas
  // queda solo para citas anteriores a la separación.
  CANCELADA_PACIENTE:    { color: colores.error, etiqueta: 'Cancelada por paciente',    orden: 5 },
  CANCELADA_PROFESIONAL: { color: colores.error, etiqueta: 'Cancelada por profesional', orden: 5 },
  CANCELADA:    { color: colores.error,       etiqueta: 'Cancelada',    orden: 5 },

  // Pagos y bonos
  PAGADA:       { color: colores.exito,       etiqueta: 'Pagada',       orden: 3 },
  PENDIENTE:    { color: colores.advertencia, etiqueta: 'Pendiente',    orden: 2 },
  EN_TRANSITO:  { color: colores.primario,    etiqueta: 'En tránsito',  orden: 1 },
  VALIDADO:     { color: colores.exito,       etiqueta: 'Validado',     orden: 3 },
  RECHAZADO:    { color: colores.error,       etiqueta: 'Rechazado',    orden: 5 },

  // Pautas de ejercicio
  VIGENTE:      { color: colores.exito,       etiqueta: 'Vigente',      orden: 1 },
  PROGRAMADA:   { color: colores.primario,    etiqueta: 'Programada',   orden: 2 },
  EXPIRADA:     { color: colores.textoSuave,  etiqueta: 'Expirada',     orden: 4 },
  ACTIVO:       { color: colores.exito,       etiqueta: 'Activo',       orden: 1 },
  AGOTADO:      { color: colores.textoSuave,  etiqueta: 'Agotado',      orden: 4 },
};

/** Datos de presentación de un estado, con respaldo para valores desconocidos. */
export function datosEstado(estado) {
  const clave = String(estado || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (ESTADOS[clave]) return ESTADOS[clave];
  return {
    color: colores.textoSuave,
    // Al menos sin guiones bajos y con la primera letra en mayúscula.
    etiqueta: clave
      ? clave.charAt(0) + clave.slice(1).toLowerCase().replace(/_/g, ' ')
      : 'Sin estado',
    orden: 3,
  };
}

/** Solo la etiqueta legible. */
export const etiquetaEstado = (estado) => datosEstado(estado).etiqueta;

/** Estados en los que la cita ya no admite acciones. */
export const ESTADOS_TERMINALES = ['REALIZADA', 'INASISTENCIA', 'CANCELADA_PACIENTE', 'CANCELADA_PROFESIONAL', 'CANCELADA'];
export const esEstadoTerminal = (estado) =>
  ESTADOS_TERMINALES.includes(String(estado || '').trim().toUpperCase().replace(/\s+/g, '_'));

/** En curso arriba, terminadas al final; dentro de cada grupo, por fecha. */
export function ordenarCitas(lista) {
  return [...lista].sort((a, b) => {
    const da = datosEstado(a.estado).orden;
    const db = datosEstado(b.estado).orden;
    if (da !== db) return da - db;
    const fa = String(a.fecha_hora_inicio || '');
    const fb = String(b.fecha_hora_inicio || '');
    // Las terminadas se leen de la más reciente a la más antigua.
    return da >= 3 ? fb.localeCompare(fa) : fa.localeCompare(fb);
  });
}

/**
 * Cualquier otro valor crudo de la base que se muestre en pantalla: quita los
 * guiones bajos y deja solo la primera letra en mayúscula ("GUIA" → "Guía" no,
 * pero sí "PLANTILLA" → "Plantilla" y "EN_PROGRESO" → "En progreso").
 */
export function textoLegible(valor, respaldo = 'No informado') {
  const texto = String(valor || '').trim();
  if (!texto) return respaldo;
  const limpio = texto.replace(/_/g, ' ').toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}
