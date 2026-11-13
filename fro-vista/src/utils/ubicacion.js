/**
 * Componente: GPS del Dispositivo
 * Casos de uso: CU39.
 */
// Ruta: fro-vista/src/utils/ubicacion.js
//
// CU39 — Ubicación para la presencialidad de las visitas a domicilio. Desde
// las correcciones del Incremento 4 nadie aprieta "check-in": el profesional
// manda su GPS al comenzar y al finalizar la atención, y la app del paciente
// envía la suya sola mientras está abierta el día de la visita.

import * as Location from 'expo-location';

/**
 * CU39 — Validando presencialidad mediante coordenadas GPS
 * Ubicación actual del teléfono como { latitud, longitud }, o null si el GPS
 * está apagado, falta el permiso o no responde a tiempo. Nunca lanza.
 */
export async function ubicacionActual({ pedirPermiso = true, esperaMs = 10000 } = {}) {
  try {
    if (!(await Location.hasServicesEnabledAsync())) return null;
    const permiso = pedirPermiso
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    if (!permiso.granted) return null;

    const tiempoAgotado = new Promise((resolver) => setTimeout(() => resolver(null), esperaMs));
    const posicion = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      tiempoAgotado,
    ]);
    // Sin respuesta a tiempo, la última conocida sirve si es reciente.
    const usable = posicion || (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }));
    if (!usable?.coords) return null;
    return { latitud: usable.coords.latitude, longitud: usable.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * CU39, CU09 — respaldo por dirección, salvo que el paciente la oculte
 * Respaldo del GPS del paciente: su dirección registrada convertida a
 * coordenadas con el servicio del propio teléfono. Devuelve null si la
 * dirección está oculta (CU09) o no se pudo ubicar. Nunca lanza.
 */
export async function coordenadasDeDireccion(paciente) {
  try {
    if (!paciente || paciente.direccion_oculta || !paciente.calle) return null;
    const texto = [`${paciente.calle} ${paciente.numero_calle || ''}`.trim(), paciente.comuna, 'Chile']
      .filter(Boolean)
      .join(', ');
    const resultados = await Location.geocodeAsync(texto);
    const primero = resultados?.[0];
    if (!primero) return null;
    return { latitud: primero.latitude, longitud: primero.longitude };
  } catch {
    return null;
  }
}
