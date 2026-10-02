/**
 * Tareas de agenda que no las dispara ningún usuario.
 *
 *   · CU21 — pedir confirmación de asistencia cuando la cita entra en la
 *            ventana de anticipación.
 *   · CU19 — vencer el turno del primero de la lista de espera y ofrecer el
 *            cupo al siguiente.
 *
 * Importante para el plan gratuito de Render: el servicio se duerme cuando no
 * recibe tráfico, y mientras duerme este temporizador NO corre. Por eso las
 * mismas dos rutinas se ejecutan también de forma oportunista cuando alguien
 * consulta sus citas o sus listas: al despertar, el sistema se pone al día.
 */

const { despacharSolicitudesPendientes } = require('./confirmacionService');
const { revisarVencimientosListaEspera } = require('./agendaService');

const MINUTOS_ENTRE_PASADAS = 5;
// Al arrancar se espera un poco: primero que el servidor quede escuchando.
const RETRASO_PRIMERA_PASADA_MS = 20000;

let enCurso = false;

/** Una pasada completa. Nunca lanza: un fallo no puede tumbar el servidor. */
async function repasarAgenda(pool) {
  if (enCurso) return { omitida: true };
  enCurso = true;
  try {
    const solicitudes = await despacharSolicitudesPendientes(pool);
    const espera = await revisarVencimientosListaEspera(pool);

    if (solicitudes > 0 || espera.vencidos > 0) {
      console.log(
        `⏰ Agenda al día: ${solicitudes} solicitud(es) de confirmación, ` +
        `${espera.vencidos} turno(s) vencido(s), ${espera.ofrecidos} cupo(s) ofrecido(s).`
      );
    }
    return { solicitudes, ...espera };
  } catch (error) {
    console.error('[programador] pasada fallida:', error.message);
    return { error: error.message };
  } finally {
    enCurso = false;
  }
}

function iniciarProgramador(pool) {
  setTimeout(() => repasarAgenda(pool), RETRASO_PRIMERA_PASADA_MS).unref?.();
  const reloj = setInterval(() => repasarAgenda(pool), MINUTOS_ENTRE_PASADAS * 60 * 1000);
  // No mantiene vivo el proceso por sí solo (importante para los scripts).
  reloj.unref?.();
  console.log(`⏰ Programador de agenda activo (cada ${MINUTOS_ENTRE_PASADAS} minutos).`);
  return reloj;
}

module.exports = { iniciarProgramador, repasarAgenda };
