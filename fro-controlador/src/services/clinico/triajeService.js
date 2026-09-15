/**
 * Triaje clínico automatizado (Incremento 2, bloque 4).
 * CU27: disclaimer legal previo al uso de la herramienta.
 * CU23: árbol de decisión dinámico para capturar sintomatología.
 * CU24: estructuración de las respuestas hacia la Anamnesis.
 * CU77: plantillas de evaluación según la especialidad del profesional.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  CU27 — Disclaimer legal
// ─────────────────────────────────────────────────────────────────────────────

const DISCLAIMER = {
  version: '1.0',
  texto:
    'Estás por usar la entrevista clínica automatizada de FRO Salud.\n\n' +
    '1. Esta herramienta es un APOYO para ordenar tus síntomas antes de la ' +
    'consulta. NO entrega diagnósticos ni reemplaza la evaluación de un ' +
    'profesional de la salud.\n\n' +
    '2. Tus respuestas se integrarán a tu ficha clínica y serán revisadas por ' +
    'el profesional que te atienda, quien podrá corregirlas o completarlas.\n\n' +
    '3. Si presentas síntomas graves (dolor torácico intenso, dificultad ' +
    'respiratoria severa, pérdida de conciencia), NO uses esta herramienta y ' +
    'acude de inmediato a un servicio de urgencia.\n\n' +
    '4. La aceptación de este descargo queda registrada con fecha y hora, y es ' +
    'requisito para cada ciclo de entrevista.',
};

// ─────────────────────────────────────────────────────────────────────────────
//  CU23 — Árbol de decisión
//  Cada nodo: { id, pregunta, tipo, opciones? , siguiente? }
//  tipo 'opciones' → botones; la opción define el nodo siguiente (ramas).
//  tipo 'texto' / 'numero' → entrada libre; 'siguiente' fijo.
//  siguiente 'FIN' termina la entrevista.
// ─────────────────────────────────────────────────────────────────────────────

const ARBOL_TRIAJE = {
  inicio: 'motivo',
  nodos: {
    motivo: {
      id: 'motivo',
      pregunta: '¿Cuál es el motivo principal de tu consulta?',
      tipo: 'opciones',
      opciones: [
        { valor: 'DOLOR', etiqueta: 'Dolor o molestia física', siguiente: 'zona_dolor' },
        { valor: 'LESION', etiqueta: 'Lesión o accidente reciente', siguiente: 'zona_dolor' },
        { valor: 'RESPIRATORIO', etiqueta: 'Problema respiratorio', siguiente: 'sintoma_respiratorio' },
        { valor: 'NUTRICION', etiqueta: 'Consulta nutricional', siguiente: 'objetivo_nutricional' },
        { valor: 'OTRO', etiqueta: 'Otro motivo', siguiente: 'descripcion_libre' },
      ],
    },

    // ── Rama dolor / lesión ──
    zona_dolor: {
      id: 'zona_dolor',
      pregunta: '¿En qué zona del cuerpo se concentra la molestia?',
      tipo: 'opciones',
      opciones: [
        { valor: 'CUELLO_HOMBROS', etiqueta: 'Cuello u hombros', siguiente: 'intensidad' },
        { valor: 'ESPALDA', etiqueta: 'Espalda', siguiente: 'intensidad' },
        { valor: 'BRAZOS_MANOS', etiqueta: 'Brazos o manos', siguiente: 'intensidad' },
        { valor: 'CADERA_PIERNAS', etiqueta: 'Cadera o piernas', siguiente: 'intensidad' },
        { valor: 'RODILLA', etiqueta: 'Rodilla', siguiente: 'intensidad' },
        { valor: 'TOBILLO_PIE', etiqueta: 'Tobillo o pie', siguiente: 'intensidad' },
      ],
    },
    intensidad: {
      id: 'intensidad',
      pregunta: 'Del 1 al 10, ¿qué tan intensa es la molestia hoy?',
      tipo: 'numero',
      minimo: 1,
      maximo: 10,
      siguiente: 'tiempo_evolucion',
    },

    // ── Rama respiratoria ──
    sintoma_respiratorio: {
      id: 'sintoma_respiratorio',
      pregunta: '¿Cuál de estos síntomas describe mejor tu situación?',
      tipo: 'opciones',
      opciones: [
        { valor: 'TOS_PERSISTENTE', etiqueta: 'Tos persistente', siguiente: 'tiempo_evolucion' },
        { valor: 'FALTA_AIRE_ESFUERZO', etiqueta: 'Falta de aire al hacer esfuerzo', siguiente: 'tiempo_evolucion' },
        { valor: 'SECRECIONES', etiqueta: 'Secreciones o congestión', siguiente: 'tiempo_evolucion' },
        { valor: 'RECUPERACION_POST', etiqueta: 'Recuperación tras una enfermedad respiratoria', siguiente: 'tiempo_evolucion' },
      ],
    },

    // ── Rama nutricional ──
    objetivo_nutricional: {
      id: 'objetivo_nutricional',
      pregunta: '¿Cuál es tu objetivo principal?',
      tipo: 'opciones',
      opciones: [
        { valor: 'BAJAR_PESO', etiqueta: 'Bajar de peso', siguiente: 'habitos_alimentarios' },
        { valor: 'SUBIR_PESO', etiqueta: 'Subir de peso o masa muscular', siguiente: 'habitos_alimentarios' },
        { valor: 'CONTROL_PATOLOGIA', etiqueta: 'Controlar una condición (diabetes, hipertensión…)', siguiente: 'habitos_alimentarios' },
        { valor: 'ALIMENTACION_SANA', etiqueta: 'Mejorar mi alimentación general', siguiente: 'habitos_alimentarios' },
      ],
    },
    habitos_alimentarios: {
      id: 'habitos_alimentarios',
      pregunta: 'Describe brevemente tu alimentación en un día normal.',
      tipo: 'texto',
      siguiente: 'antecedentes_patologicos',
    },

    // ── Rama libre ──
    descripcion_libre: {
      id: 'descripcion_libre',
      pregunta: 'Cuéntanos con tus palabras qué te trae a la consulta.',
      tipo: 'texto',
      siguiente: 'tiempo_evolucion',
    },

    // ── Tramo común ──
    tiempo_evolucion: {
      id: 'tiempo_evolucion',
      pregunta: '¿Hace cuánto tiempo comenzó?',
      tipo: 'opciones',
      opciones: [
        { valor: 'MENOS_1_SEMANA', etiqueta: 'Menos de una semana', siguiente: 'antecedentes_patologicos' },
        { valor: '1_4_SEMANAS', etiqueta: 'Entre 1 y 4 semanas', siguiente: 'antecedentes_patologicos' },
        { valor: '1_6_MESES', etiqueta: 'Entre 1 y 6 meses', siguiente: 'antecedentes_patologicos' },
        { valor: 'MAS_6_MESES', etiqueta: 'Más de 6 meses', siguiente: 'antecedentes_patologicos' },
      ],
    },
    // Antes una sola pregunta mezclaba enfermedades, cirugías y tratamientos, y
    // todo se guardaba junto como UN antecedente patológico: en la ficha del
    // profesional aparecía pegado y "antecedentes quirúrgicos" quedaba vacío.
    // Ahora cada campo de la ficha tiene su propia pregunta.
    antecedentes_patologicos: {
      id: 'antecedentes_patologicos',
      pregunta: '¿Tienes enfermedades diagnosticadas o tratamientos en curso? Sepáralos con comas (escribe "no" si no aplica).',
      tipo: 'texto',
      siguiente: 'antecedentes_quirurgicos',
    },
    antecedentes_quirurgicos: {
      id: 'antecedentes_quirurgicos',
      pregunta: '¿Te han operado alguna vez? Indica cada cirugía y el año, separadas con comas (escribe "no" si nunca).',
      tipo: 'texto',
      siguiente: 'alergias',
    },
    alergias: {
      id: 'alergias',
      pregunta: '¿Tienes alergias a medicamentos u otras? Sepáralas con comas (escribe "no" si no tienes).',
      tipo: 'texto',
      siguiente: 'FIN',
    },
  },
};

// Etiquetas legibles para reconstruir texto clínico desde los valores.
const ETIQUETAS = {};
for (const nodo of Object.values(ARBOL_TRIAJE.nodos)) {
  if (nodo.opciones) {
    for (const opcion of nodo.opciones) {
      ETIQUETAS[`${nodo.id}.${opcion.valor}`] = opcion.etiqueta;
    }
  }
}

function etiquetaDe(nodoId, valor) {
  return ETIQUETAS[`${nodoId}.${valor}`] || String(valor);
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU24 — Estructuración de las respuestas hacia la Anamnesis
// ─────────────────────────────────────────────────────────────────────────────

const NEGACIONES = new Set(['no', 'no.', 'ninguna', 'ninguno', 'nada', 'n/a', '-']);

function esNegacion(texto) {
  return NEGACIONES.has(String(texto || '').trim().toLowerCase());
}

/**
 * Convierte las respuestas crudas del triaje en datos categorizados listos
 * para integrarse a la ficha. Las claves desconocidas caen en la sección
 * "sin clasificar" (Excepción 4 del CU24) en vez de perderse.
 */
function estructurarTriaje(respuestas) {
  if (!respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) {
    const error = new Error('Las respuestas del triaje tienen un formato incompatible.');
    error.code = 'FALLA_INTEGRIDAD';
    throw error;
  }

  const lineas = [];
  const sinClasificar = [];
  const alergias = [];
  const antecedentes = [];
  const quirurgicos = [];

  const aLista = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

  const CATEGORIAS = {
    motivo: (v) => lineas.push(`Motivo de consulta: ${etiquetaDe('motivo', v)}.`),
    zona_dolor: (v) => lineas.push(`Zona anatómica comprometida: ${etiquetaDe('zona_dolor', v)}.`),
    intensidad: (v) => lineas.push(`Intensidad reportada: ${v}/10.`),
    sintoma_respiratorio: (v) => lineas.push(`Síntoma respiratorio principal: ${etiquetaDe('sintoma_respiratorio', v)}.`),
    objetivo_nutricional: (v) => lineas.push(`Objetivo nutricional: ${etiquetaDe('objetivo_nutricional', v)}.`),
    habitos_alimentarios: (v) => lineas.push(`Hábitos alimentarios declarados: ${v}.`),
    descripcion_libre: (v) => lineas.push(`Relato del paciente: ${v}.`),
    tiempo_evolucion: (v) => lineas.push(`Tiempo de evolución: ${etiquetaDe('tiempo_evolucion', v)}.`),
    antecedentes_patologicos: (v) => {
      if (!esNegacion(v)) {
        const lista = aLista(v);
        lineas.push(`Antecedentes patológicos declarados: ${lista.join(', ')}.`);
        antecedentes.push(...lista.map((a) => a.slice(0, 255)));
      } else {
        lineas.push('Sin antecedentes patológicos declarados.');
      }
    },
    antecedentes_quirurgicos: (v) => {
      if (!esNegacion(v)) {
        const lista = aLista(v);
        lineas.push(`Antecedentes quirúrgicos declarados: ${lista.join(', ')}.`);
        quirurgicos.push(...lista.map((a) => a.slice(0, 255)));
      } else {
        lineas.push('Sin antecedentes quirúrgicos declarados.');
      }
    },
    // Compatibilidad: entrevistas iniciadas antes del cambio traen la pregunta
    // antigua mezclada; se conserva como antecedentes patológicos en lista.
    antecedentes_relevantes: (v) => {
      if (!esNegacion(v)) {
        const lista = aLista(v);
        lineas.push(`Antecedentes declarados: ${lista.join(', ')}.`);
        antecedentes.push(...lista.map((a) => a.slice(0, 255)));
      } else {
        lineas.push('Sin antecedentes relevantes declarados.');
      }
    },
    alergias: (v) => {
      if (!esNegacion(v)) {
        const lista = String(v).split(',').map((a) => a.trim()).filter(Boolean);
        lineas.push(`Alergias declaradas: ${lista.join(', ')}.`);
        alergias.push(...lista.map((a) => a.slice(0, 100)));
      } else {
        lineas.push('Sin alergias declaradas.');
      }
    },
  };

  for (const [clave, valor] of Object.entries(respuestas)) {
    if (valor === null || valor === undefined || String(valor).trim() === '') continue;
    const categorizar = CATEGORIAS[clave];
    if (categorizar) {
      categorizar(valor);
    } else {
      // Excepción 4: dato ambiguo, se conserva en revisión aparte.
      sinClasificar.push(`${clave}: ${valor}`);
    }
  }

  const hoy = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const fecha = `${p(hoy.getDate())}/${p(hoy.getMonth() + 1)}/${hoy.getFullYear()}`;
  let texto = `── TRIAJE AUTOMATIZADO (${fecha}) ──\n${lineas.join('\n')}`;
  if (sinClasificar.length > 0) {
    texto += `\nInformación adicional en revisión (sin clasificar):\n- ${sinClasificar.join('\n- ')}`;
  }
  texto += '\n── FIN TRIAJE ──';

  return { texto, alergias, antecedentes, quirurgicos, sinClasificar };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CU77 — Plantillas de evaluación por especialidad
// ─────────────────────────────────────────────────────────────────────────────

const PLANTILLAS_EVALUACION = {
  'Kinesiología': [
    { id: 'dolor_eva', etiqueta: 'Dolor actual (escala EVA 0-10)', tipo: 'numero', obligatorio: true },
    { id: 'rango_movimiento', etiqueta: 'Rango de movimiento observado', tipo: 'texto', obligatorio: true },
    { id: 'fuerza_muscular', etiqueta: 'Evaluación de fuerza muscular', tipo: 'texto', obligatorio: false },
    { id: 'marcha_postura', etiqueta: 'Observaciones de marcha y postura', tipo: 'texto', obligatorio: false },
  ],
  'Kinesiología Respiratoria': [
    { id: 'saturacion', etiqueta: 'Saturación de O₂ en reposo (%)', tipo: 'numero', obligatorio: true },
    { id: 'patron_respiratorio', etiqueta: 'Patrón respiratorio', tipo: 'texto', obligatorio: true },
    { id: 'auscultacion', etiqueta: 'Hallazgos de auscultación', tipo: 'texto', obligatorio: true },
    { id: 'tos_secreciones', etiqueta: 'Manejo de tos y secreciones', tipo: 'texto', obligatorio: false },
  ],
  'Nutricionista': [
    { id: 'peso', etiqueta: 'Peso actual (kg)', tipo: 'numero', obligatorio: true },
    { id: 'talla', etiqueta: 'Talla (cm)', tipo: 'numero', obligatorio: true },
    { id: 'habitos', etiqueta: 'Hábitos alimentarios relevantes', tipo: 'texto', obligatorio: true },
    { id: 'objetivo_plan', etiqueta: 'Objetivo del plan nutricional', tipo: 'texto', obligatorio: false },
  ],
};

const PLANTILLA_GENERAL = [
  { id: 'estado_general', etiqueta: 'Estado general del paciente', tipo: 'texto', obligatorio: true },
  { id: 'observaciones', etiqueta: 'Observaciones de la evaluación', tipo: 'texto', obligatorio: false },
];

function plantillaParaEspecialidad(nombreEspecialidad) {
  return {
    especialidad: nombreEspecialidad,
    campos: PLANTILLAS_EVALUACION[nombreEspecialidad] || PLANTILLA_GENERAL,
  };
}

module.exports = {
  DISCLAIMER,
  ARBOL_TRIAJE,
  estructurarTriaje,
  plantillaParaEspecialidad,
};
