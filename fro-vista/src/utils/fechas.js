// Ruta: fro-vista/src/utils/fechas.js
//
// Único formateador de fechas de la app. Cumple el requerimiento del proyecto:
//   Fechas: DD/MM/AAAA.
//   Horas: HH:MM en formato de 24 horas, en la zona horaria de Chile
//          Continental (UTC-4 en invierno, UTC-3 en verano).
//
// No usa toLocaleString: según el motor del teléfono entregaba "8:00 a. m."
// o "05-09-2026", y por eso la app mezclaba formatos de 12 y 24 horas.
//
// El servidor entrega dos cosas distintas que NO se tratan igual:
//  1. Columnas de fecha/hora de la base ("2026-09-05 08:00:00"): ya son hora
//     de pared chilena, sin huso. Se imprimen tal cual, sin convertir.
//  2. Marcas instantáneas en JSON ("2026-09-05T11:00:00.000Z"): momentos
//     absolutos en UTC (check-in GPS, sesiones). Se convierten a hora chilena
//     aunque el teléfono esté configurado en otro huso.

const ZONA_CHILE = 'America/Santiago';
const PATRON_HORA_PARED = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const PATRON_SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Interpreta el valor y dice si es un instante absoluto o una hora de pared. */
function interpretar(valor) {
  if (!valor) return null;

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : { fecha: valor, esInstante: true };
  }

  const texto = String(valor).trim();

  const pared = texto.match(PATRON_HORA_PARED);
  if (pared) {
    const [, anio, mes, dia, hora, minuto, segundo] = pared;
    return {
      fecha: new Date(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo || 0)),
      esInstante: false,
    };
  }

  const soloFecha = texto.match(PATRON_SOLO_FECHA);
  if (soloFecha) {
    const [, anio, mes, dia] = soloFecha;
    return { fecha: new Date(Number(anio), Number(mes) - 1, Number(dia)), esInstante: false };
  }

  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : { fecha, esInstante: true };
}

/** Compatibilidad: devuelve solo el Date. */
export function parsearFecha(valor) {
  return interpretar(valor)?.fecha || null;
}

const dosDigitos = (n) => String(n).padStart(2, '0');

/** Día, mes, año, hora y minuto ya en hora chilena. */
function partes({ fecha, esInstante }) {
  if (esInstante) {
    try {
      const formateador = new Intl.DateTimeFormat('es-CL', {
        timeZone: ZONA_CHILE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      });
      const mapa = {};
      for (const parte of formateador.formatToParts(fecha)) mapa[parte.type] = parte.value;
      if (mapa.year && mapa.month && mapa.day && mapa.hour && mapa.minute) {
        return {
          dia: mapa.day, mes: mapa.month, anio: mapa.year,
          hora: mapa.hour === '24' ? '00' : mapa.hour, minuto: mapa.minute,
        };
      }
    } catch {
      // Motor sin datos de zonas horarias: se cae a la hora local del teléfono.
    }
  }
  return {
    dia: dosDigitos(fecha.getDate()),
    mes: dosDigitos(fecha.getMonth() + 1),
    anio: String(fecha.getFullYear()),
    hora: dosDigitos(fecha.getHours()),
    minuto: dosDigitos(fecha.getMinutes()),
  };
}

/** "05/09/2026" */
export function formatearFecha(valor, respaldo = 'Fecha no informada') {
  const v = interpretar(valor);
  if (!v) return respaldo;
  const p = partes(v);
  return `${p.dia}/${p.mes}/${p.anio}`;
}

/** "08:00" (24 horas) */
export function formatearHora(valor, respaldo = '--:--') {
  const v = interpretar(valor);
  if (!v) return respaldo;
  const p = partes(v);
  return `${p.hora}:${p.minuto}`;
}

/** "05/09/2026 08:00" */
export function formatearFechaHora(valor, respaldo = 'Fecha no informada') {
  const v = interpretar(valor);
  if (!v) return respaldo;
  const p = partes(v);
  return `${p.dia}/${p.mes}/${p.anio} ${p.hora}:${p.minuto}`;
}

/** "08:00 a 09:00" */
export function formatearRango(inicio, fin) {
  const desde = formatearHora(inicio, null);
  const hasta = formatearHora(fin, null);
  if (!desde) return 'Horario no informado';
  return hasta ? `${desde} a ${hasta}` : desde;
}
