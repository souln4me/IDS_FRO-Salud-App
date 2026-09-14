// Ruta: fro-vista/src/utils/modalidad.js
//
// La modalidad de una cita es DOMICILIO u ONLINE. Antes algunas pantallas
// mostraban el nombre de la sede ("Sede Principal"), que no dice nada al
// paciente ni al profesional.

export function etiquetaModalidad(modalidad) {
  switch (String(modalidad || '').toUpperCase()) {
    case 'ONLINE':    return 'Virtual';
    case 'DOMICILIO': return 'A domicilio';
    case 'AMBOS':     return 'A domicilio o virtual';
    default:          return 'No especificada';
  }
}

export function iconoModalidad(modalidad) {
  switch (String(modalidad || '').toUpperCase()) {
    case 'ONLINE':    return '📹';
    case 'DOMICILIO': return '🏠';
    default:          return '📍';
  }
}
