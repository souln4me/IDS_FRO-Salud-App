/**
 * Componente: C_Validador_Presencialidad (puerta de entrada: src/componentes/C_Validador_Presencialidad.js)
 * Casos de uso: CU38, CU39, CU41.
 *
 * CU39 / CU41 — Presencialidad y factores de certificación de la sesión.
 *
 * Desde las correcciones del Incremento 4, las marcas de inicio y término las
 * dispara solo el profesional al apretar "Comenzar atención" y "Finalizar
 * atención"; el paciente ya no confirma nada. En ese instante se registran la
 * hora y las coordenadas de los dos:
 *
 *   - Profesional: el GPS de su teléfono, que viaja con la petición.
 *   - Paciente (decisión de Pablo, "ambas con respaldo"):
 *       1. la última ubicación que la app del paciente envió sola en los
 *          últimos VENTANA_UBICACION_PACIENTE_MINUTOS (30 por defecto);
 *       2. si no hay, su dirección registrada, convertida a coordenadas en el
 *          teléfono del profesional;
 *       3. si tampoco hay, queda sin ubicación y el cierre exige
 *          justificación manual.
 *
 * En domicilio, ambos deben estar dentro de RADIO_PRESENCIALIDAD_METROS (100).
 */

const C_Capa_de_Acceso_a_Datos = require('../../componentes/C_Capa_de_Acceso_a_Datos');

// CU39 — Validando presencialidad mediante coordenadas GPS
/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
function distanciaMetros(a, b) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// CU39 — Validando presencialidad mediante coordenadas GPS
function parsearJSON(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object') return valor;
  try { return JSON.parse(valor); } catch { return null; }
}

// CU39 — Validando presencialidad mediante coordenadas GPS
/** {lat, lng} válidos a partir de lo que mande la app, o null. */
function coordenadas(valor) {
  const lat = Number(valor?.latitud ?? valor?.lat);
  const lng = Number(valor?.longitud ?? valor?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const tieneCoordenadas = (marca) => Boolean(marca && Number.isFinite(marca.lat) && Number.isFinite(marca.lng));

const FUENTES = {
  GPS_PACIENTE: 'GPS del teléfono del paciente',
  DIRECCION_REGISTRADA: 'dirección registrada del paciente',
};

/**
 * CU38, CU39 — marca de inicio o término con la ubicación de ambos
 * Registra la marca presencial (INICIO o TERMINO) dentro de la transacción de
 * inicio/término de la atención. Solo aplica a citas a domicilio; en las
 * online devuelve null y no toca la evidencia.
 *
 * @param {object} cita  fila con cita_id, modalidad y evidencia_presencial
 * @param {'INICIO'|'TERMINO'} momento
 * @param {{ubicacion, direccion_paciente}} cuerpo  lo que mandó la app del profesional
 */
async function registrarMarcaPresencial(conexion, cita, momento, cuerpo = {}) {
  if (String(cita.modalidad || '').toUpperCase() !== 'DOMICILIO') return null;

  const clave = momento === 'TERMINO' ? 'termino' : 'inicio';
  const ahora = new Date();
  const ventana = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(conexion, 'VENTANA_UBICACION_PACIENTE_MINUTOS', 30);
  const radio = await C_Capa_de_Acceso_a_Datos.leerParametroEntero(conexion, 'RADIO_PRESENCIALIDAD_METROS', 100);
  const evidencia = parsearJSON(cita.evidencia_presencial) || {};
  evidencia.profesional = evidencia.profesional || {};
  evidencia.paciente = evidencia.paciente || {};

  // Profesional: el GPS de su teléfono (CU39 Exc. 1: sin GPS, queda la marca
  // sin coordenadas y el cierre pide justificación).
  const gpsProfesional = coordenadas(cuerpo.ubicacion);
  evidencia.profesional[clave] = gpsProfesional
    ? { ...gpsProfesional, momento_registro: ahora.toISOString() }
    : { sin_ubicacion: true, momento_registro: ahora.toISOString() };

  // Paciente: la última ubicación reciente de su teléfono o, si no, su dirección.
  const ultima = evidencia.paciente.ultima;
  const reciente =
    tieneCoordenadas(ultima) && ultima.momento_registro &&
    ahora.getTime() - new Date(ultima.momento_registro).getTime() <= ventana * 60000;
  const direccion = coordenadas(cuerpo.direccion_paciente);
  if (reciente) {
    evidencia.paciente[clave] = { lat: ultima.lat, lng: ultima.lng, momento_registro: ultima.momento_registro, fuente: 'GPS_PACIENTE' };
  } else if (direccion) {
    evidencia.paciente[clave] = { ...direccion, momento_registro: ahora.toISOString(), fuente: 'DIRECCION_REGISTRADA' };
  } else {
    evidencia.paciente[clave] = { sin_ubicacion: true, momento_registro: ahora.toISOString() };
  }

  const marcaProf = evidencia.profesional[clave];
  const marcaPac = evidencia.paciente[clave];
  const distancia = tieneCoordenadas(marcaProf) && tieneCoordenadas(marcaPac) ? distanciaMetros(marcaProf, marcaPac) : null;
  evidencia[`distancia_${clave}_metros`] = distancia;

  await conexion.query(
    `UPDATE Cita SET evidencia_presencial = ?
            ${clave === 'inicio' ? ', coordenadas_gps_profesional = ?, coordenadas_gps_paciente = ?' : ''}
      WHERE cita_id = ?`,
    clave === 'inicio'
      ? [
        JSON.stringify(evidencia),
        tieneCoordenadas(marcaProf) ? `${marcaProf.lat.toFixed(6)},${marcaProf.lng.toFixed(6)}` : null,
        tieneCoordenadas(marcaPac) ? `${marcaPac.lat.toFixed(6)},${marcaPac.lng.toFixed(6)}` : null,
        cita.cita_id,
      ]
      : [JSON.stringify(evidencia), cita.cita_id]
  );

  return {
    distancia_metros: distancia,
    radio_metros: radio,
    dentro_del_radio: distancia !== null && distancia <= radio,
    fuente_paciente: marcaPac.fuente || null,
    sin_ubicacion_profesional: !tieneCoordenadas(marcaProf),
    sin_ubicacion_paciente: !tieneCoordenadas(marcaPac),
  };
}

// CU38 — Registrando marcas temporales de la prestación
/** Texto corto para la app sobre la marca presencial recién registrada. */
function resumenMarca(resultado) {
  if (!resultado) return null;
  if (resultado.sin_ubicacion_profesional) return 'No se obtuvo la ubicación de tu teléfono: al finalizar deberás justificar el cierre.';
  if (resultado.sin_ubicacion_paciente) return 'No hay ubicación del paciente (su app no la envió y su dirección no está disponible): al finalizar deberás justificar el cierre.';
  const fuente = FUENTES[resultado.fuente_paciente] || 'ubicación del paciente';
  return resultado.dentro_del_radio
    ? `Presencialidad validada: ${resultado.distancia_metros} m entre tú y el paciente (${fuente}).`
    : `Están a ${resultado.distancia_metros} m (máximo ${resultado.radio_metros} m, según ${fuente}): al finalizar deberás justificar el cierre.`;
}

/**
 * CU41 — Validando sesión mediante protocolo multi-factor
 * Factores cruzados de la sesión. Con las marcas automáticas ya no hay
 * "marca del paciente" que esperar: lo que se verifica es que existan las
 * marcas del profesional y, en domicilio, que las ubicaciones coincidan.
 */
function analizarFactores(cita, radio) {
  const evidencia = parsearJSON(cita.evidencia_presencial) || {};
  const factores = [
    { factor: 'Marca de inicio de la atención', ok: Boolean(cita.checkin_profesional), clave: 'MARCA_INICIO' },
    { factor: 'Marca de término de la atención', ok: String(cita.estado).toUpperCase() === 'REALIZADA', clave: 'MARCA_TERMINO' },
  ];

  if (String(cita.modalidad || '').toUpperCase() === 'DOMICILIO') {
    for (const clave of ['inicio', 'termino']) {
      const prof = evidencia.profesional?.[clave];
      const pac = evidencia.paciente?.[clave];
      const nombre = clave === 'inicio' ? 'al inicio' : 'al término';
      if (!tieneCoordenadas(prof) || !tieneCoordenadas(pac)) {
        factores.push({
          factor: `Ubicación de ambos ${nombre} (${!tieneCoordenadas(prof) ? 'falta la del profesional' : 'falta la del paciente'})`,
          ok: false,
          clave: 'SIN_UBICACION',
        });
        continue;
      }
      const distancia = distanciaMetros(prof, pac);
      factores.push({
        factor: `Distancia ${nombre} ≤ ${radio} m (fue ${distancia} m, según ${FUENTES[pac.fuente] || 'ubicación del paciente'})`,
        ok: distancia <= radio,
        clave: 'DISTANCIA',
      });
    }
  }
  return factores;
}

const { registrar } = require('../registro/registroActividad');

// Registro de actividad: distancia medida en cada marca de una visita a domicilio.
async function registrarMarcaPresencialRegistrada(conexion, cita, momento, cuerpo) {
  const resultado = await registrarMarcaPresencial(conexion, cita, momento, cuerpo);
  if (resultado) {
    const texto = resultado.distancia_metros === null
      ? `sin ubicación del ${resultado.sin_ubicacion_profesional ? 'profesional' : 'paciente'}: el cierre pedirá justificación`
      : `${resultado.distancia_metros} m entre profesional y paciente (radio ${resultado.radio_metros} m) → ${resultado.dentro_del_radio ? 'presencialidad validada' : 'fuera del radio'}`;
    registrar('C_Validador_Presencialidad', `marca de ${momento === 'TERMINO' ? 'término' : 'inicio'} de la cita #${cita.cita_id}: ${texto}`);
  }
  return resultado;
}

module.exports = {
  distanciaMetros,
  parsearJSON,
  coordenadas,
  registrarMarcaPresencial: registrarMarcaPresencialRegistrada,
  resumenMarca,
  analizarFactores,
};
