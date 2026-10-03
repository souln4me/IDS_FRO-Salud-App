// Ruta: fro-vista/src/screens/Comun/ChatClinicoScreen.js
//
// CU53 — Conversación clínica entre el paciente y su profesional, colgada del
// episodio. CU57 — cada envío pasa antes por el filtro de contenido.
//
// No usa WebSockets: la pantalla vuelve a preguntar por los mensajes
// posteriores al último que ya tiene, cada pocos segundos. Se decidió así
// porque el servidor se duerme en el plan gratuito y una conexión permanente
// se cae todo el tiempo, mientras que la consulta incremental se recupera
// sola y pesa muy poco.
//
// Excepción 2 del CU53: si el envío falla, el mensaje NO se pierde. Queda
// retenido en el teléfono, se muestra en gris con su marca de pendiente y se
// reintenta solo.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { getMensajes, enviarMensajeClinico } from '../../api/client';
import DialogoAviso from '../../components/DialogoAviso';
import useEspacioInferior from '../../utils/useEspacioInferior';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFecha, formatearFechaHora, formatearHora } from '../../utils/fechas';
import { colores, espacio, radio, tipografia, interaccion } from '../../theme';

const SEGUNDOS_ENTRE_CONSULTAS = 6;
const clavePendientes = (episodioId) => `cu53_pendientes_${episodioId}`;

/** "Hoy", "Ayer" o la fecha, para separar la conversación por día (hora de Chile). */
function etiquetaDia(momento) {
  const dia = formatearFecha(momento, '');
  if (!dia) return '';
  if (dia === formatearFecha(new Date())) return 'Hoy';
  if (dia === formatearFecha(new Date(Date.now() - 24 * 60 * 60 * 1000))) return 'Ayer';
  return dia;
}

export default function ChatClinicoScreen({ route, navigation }) {
  const episodioId = route?.params?.episodioId;
  const nombreOtro = route?.params?.nombreOtro;
  const espacioInferior = useEspacioInferior();

  const [mensajes, setMensajes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [conversacion, setConversacion] = useState(null);
  const [puedeEscribir, setPuedeEscribir] = useState(true);
  const [motivoBloqueo, setMotivoBloqueo] = useState(null);

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);

  const refScroll = useRef(null);
  const ultimoId = useRef(0);

  useEffect(() => {
    navigation.setOptions?.({ title: nombreOtro ? `Chat con ${nombreOtro}` : 'Mensajes' });
  }, [navigation, nombreOtro]);

  // Barra del episodio con un acceso a la derecha: el profesional va a la
  // ficha clínica del paciente; el paciente, al perfil del profesional.
  const esProfesional = conversacion?.papel === 'PROFESIONAL' && Boolean(conversacion?.paciente_id);
  const esPaciente = conversacion?.papel === 'PACIENTE' && Boolean(conversacion?.profesional_id);
  const conBarraEpisodio = esProfesional || esPaciente;

  const abrirAcceso = () => {
    if (esProfesional) {
      navigation.navigate('FichaClinica', {
        pacienteId: conversacion.paciente_id,
        nombrePaciente: conversacion.con || nombreOtro,
        episodioId: String(conversacion.episodio_clinico_id),
      });
    } else if (esPaciente) {
      navigation.navigate('PerfilProfesional', {
        profesionalId: conversacion.profesional_id,
        nombre: conversacion.con || nombreOtro,
      });
    }
  };

  /** Trae lo nuevo desde el último mensaje conocido. */
  const consultar = useCallback(
    async (primeraVez = false) => {
      if (!episodioId) return;
      try {
        const datos = await getMensajes(episodioId, primeraVez ? 0 : ultimoId.current);
        setConversacion(datos.conversacion || null);
        setPuedeEscribir(datos.puede_escribir !== false);
        setMotivoBloqueo(datos.motivo_bloqueo || null);
        setError(false);

        const llegaron = datos.mensajes || [];
        if (llegaron.length > 0) {
          ultimoId.current = llegaron[llegaron.length - 1].mensaje_id;
          setMensajes((previos) => (primeraVez ? llegaron : [...previos, ...llegaron]));
        }
      } catch (err) {
        // Un fallo puntual de la consulta no vacía la conversación: se marca
        // el error solo si todavía no hay nada que mostrar.
        if (primeraVez) setError(true);
      } finally {
        if (primeraVez) setCargando(false);
      }
    },
    [episodioId]
  );

  /** Reintenta lo que quedó retenido en el teléfono (Excepción 2). */
  const reintentarPendientes = useCallback(async () => {
    let cola = [];
    try {
      const guardado = await SecureStore.getItemAsync(clavePendientes(episodioId));
      cola = guardado ? JSON.parse(guardado) : [];
    } catch {
      cola = [];
    }
    if (cola.length === 0) return;

    const quedan = [];
    for (const pendiente of cola) {
      try {
        await enviarMensajeClinico(episodioId, pendiente.contenido);
      } catch {
        quedan.push(pendiente);
      }
    }

    setPendientes(quedan);
    await SecureStore.setItemAsync(clavePendientes(episodioId), JSON.stringify(quedan)).catch(
      () => {}
    );
    if (quedan.length < cola.length) await consultar();
  }, [episodioId, consultar]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      await consultar(true);
      if (vivo) await reintentarPendientes();
    })();

    const reloj = setInterval(() => {
      consultar();
    }, SEGUNDOS_ENTRE_CONSULTAS * 1000);

    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [consultar, reintentarPendientes]);

  const enviar = async () => {
    const contenido = texto.trim();
    // Excepción 1 del CU57: sin texto imprimible no se llama al servidor.
    if (!contenido) return;

    setEnviando(true);
    setTexto('');
    try {
      await enviarMensajeClinico(episodioId, contenido);
      await consultar();
    } catch (err) {
      const respuesta = err.response?.data;

      // CU57: el filtro rechazó el texto. No se reintenta: hay que reescribirlo.
      if (respuesta?.error === 'CONTENIDO_RESTRINGIDO' || respuesta?.error === 'VACIO') {
        setTexto(contenido);
        setAviso({
          tono: 'alerta',
          titulo: 'Mensaje no permitido',
          mensaje: respuesta.mensaje,
        });
      } else if (respuesta?.error === 'EPISODIO_CERRADO') {
        setPuedeEscribir(false);
        setMotivoBloqueo(respuesta.mensaje);
        setAviso({ tono: 'info', titulo: 'Conversación cerrada', mensaje: respuesta.mensaje });
      } else {
        // Excepción 2 del CU53: el mensaje queda retenido y se reintenta solo.
        const pendiente = { contenido, momento: new Date().toISOString() };
        const cola = [...pendientes, pendiente];
        setPendientes(cola);
        await SecureStore.setItemAsync(clavePendientes(episodioId), JSON.stringify(cola)).catch(
          () => {}
        );
        setAviso({
          tono: 'alerta',
          titulo: 'Mensaje retenido',
          mensaje: 'No hay conexión con el servidor. Tu mensaje queda guardado y se envía solo.',
        });
      }
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (error && mensajes.length === 0) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry
          mensaje="No pudimos abrir la conversación."
          onRetry={() => {
            setCargando(true);
            consultar(true);
          }}
        />
      </View>
    );
  }

  return (
    // La barra de envío sube hasta el borde del teclado y, con el teclado
    // cerrado, queda por encima de los botones del celular.
    <View style={[estilos.fondo, { paddingBottom: espacioInferior }]}>
      {conBarraEpisodio ? (
        <View style={[estilos.cintaContexto, estilos.cintaEpisodio]}>
          <Text style={[estilos.contextoTexto, estilos.episodioTexto]} numberOfLines={1}>
            Episodio #{conversacion.episodio_clinico_id} · {conversacion.motivo_consulta || 'tratamiento'}
          </Text>
          <TouchableOpacity
            style={estilos.botonFicha}
            onPress={abrirAcceso}
            activeOpacity={interaccion.opacidadActiva}
            accessibilityRole="button"
          >
            <Text style={estilos.botonFichaTexto}>{esProfesional ? 'Ficha clínica ›' : 'Ver perfil ›'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={estilos.cintaContexto}>
          <Text style={estilos.contextoTexto} numberOfLines={1}>
            🔒 Conversación cifrada · {conversacion?.motivo_consulta || 'tratamiento'}
          </Text>
        </View>
      )}

      <View style={estilos.lista}>
        <ScrollView
          ref={refScroll}
          style={estilos.lista}
          contentContainerStyle={estilos.listaContenido}
          onContentSizeChange={() => refScroll.current?.scrollToEnd({ animated: true })}
          onLayout={() => refScroll.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          {/* Aviso de cifrado: encabeza la conversación y se va al desplazarse. */}
        {conBarraEpisodio && (
          <View style={estilos.avisoCifrado}>
            <Text style={estilos.avisoCifradoTexto}>🔒 Conversación cifrada</Text>
          </View>
        )}

        {mensajes.length === 0 && pendientes.length === 0 && (
            <Text style={estilos.vacio}>
              Todavía no hay mensajes. Escribe el primero: este canal es solo entre ustedes dos.
            </Text>
          )}

          {mensajes.map((m, i) => {
            // Separador cada vez que cambia el día: "Hoy", "Ayer" o la fecha.
            const dia = etiquetaDia(m.momento_envio);
            const cambiaDia = dia && (i === 0 || etiquetaDia(mensajes[i - 1].momento_envio) !== dia);
            return (
              <React.Fragment key={m.mensaje_id}>
                {cambiaDia ? (
                  <View style={estilos.separadorDia}>
                    <View style={estilos.lineaDia} />
                    <Text style={estilos.textoDia}>{dia}</Text>
                    <View style={estilos.lineaDia} />
                  </View>
                ) : null}
                <View style={[estilos.burbuja, m.mio ? estilos.burbujaMia : estilos.burbujaOtro]}>
                  <Text style={[estilos.texto, m.mio && estilos.textoMio, m.ilegible && estilos.ilegible]}>
                    {m.contenido}
                  </Text>
                  <Text style={[estilos.hora, m.mio && estilos.horaMia]}>
                    {formatearHora(m.momento_envio)}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}

          {/* Lo retenido se ve en gris: el autor sabe que aún no salió. */}
          {pendientes.map((p, i) => (
            <View key={`pendiente-${i}`} style={[estilos.burbuja, estilos.burbujaPendiente]}>
              <Text style={estilos.texto}>{p.contenido}</Text>
              <Text style={estilos.hora}>⏳ pendiente de envío</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {puedeEscribir ? (
        <View style={estilos.barraEnvio}>
          <TextInput
            style={estilos.campo}
            placeholder="Escribe tu mensaje…"
            placeholderTextColor={colores.textoTenue}
            value={texto}
            onChangeText={setTexto}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[estilos.botonEnviar, (!texto.trim() || enviando) && estilos.deshabilitado]}
            onPress={enviar}
            disabled={!texto.trim() || enviando}
            activeOpacity={interaccion.opacidadActiva}
          >
            {enviando ? (
              <ActivityIndicator color={colores.textoInverso} size="small" />
            ) : (
              <Text style={estilos.botonEnviarTexto}>Enviar</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        // Excepción 3 del CU53: episodio cerrado, lectura pasiva del historial.
        <View style={estilos.barraCerrada}>
          <Text style={estilos.textoCerrada}>
            {motivoBloqueo || 'Esta conversación quedó como historial de solo lectura.'}
          </Text>
        </View>
      )}

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },

  cintaContexto: {
    backgroundColor: colores.primarioSuave,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.lg,
    borderBottomWidth: 1,
    borderBottomColor: colores.primarioBorde,
  },
  contextoTexto: { ...tipografia.micro, color: colores.primario },
  cintaEpisodio: { flexDirection: 'row', alignItems: 'center', gap: espacio.md },
  episodioTexto: { ...tipografia.metaFuerte, flex: 1 },
  botonFicha: {
    paddingVertical: espacio.xs + 2,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    backgroundColor: colores.primario,
  },
  botonFichaTexto: { ...tipografia.metaFuerte, color: colores.textoInverso },

  // Aviso de cifrado al inicio de la conversación (se desplaza con ella).
  avisoCifrado: {
    alignSelf: 'center',
    paddingVertical: espacio.xs,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    marginBottom: espacio.base,
  },
  avisoCifradoTexto: { ...tipografia.micro, color: colores.textoSuave, letterSpacing: 0.3 },

  lista: { flex: 1 },
  listaContenido: { padding: espacio.lg, paddingBottom: espacio.base },
  vacio: { ...tipografia.meta, color: colores.textoTenue, textAlign: 'center', marginTop: espacio.xxl },

  burbuja: {
    maxWidth: '82%',
    borderRadius: radio.lg,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    marginBottom: espacio.sm,
  },
  // Lo propio a la derecha en color de marca; lo del otro a la izquierda en
  // blanco: la conversación se lee de un vistazo sin leer los nombres.
  burbujaMia: { alignSelf: 'flex-end', backgroundColor: colores.primario, borderBottomRightRadius: radio.sm },
  burbujaOtro: {
    alignSelf: 'flex-start',
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderBottomLeftRadius: radio.sm,
  },
  burbujaPendiente: {
    alignSelf: 'flex-end',
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.borde,
    borderStyle: 'dashed',
  },
  texto: { ...tipografia.cuerpo, color: colores.texto },
  textoMio: { color: colores.textoInverso },
  ilegible: { fontStyle: 'italic', color: colores.advertencia },
  hora: { ...tipografia.micro, color: colores.textoTenue, marginTop: 4, alignSelf: 'flex-end' },
  horaMia: { color: colores.primarioBorde },

  separadorDia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    marginVertical: espacio.md,
  },
  lineaDia: { flex: 1, height: 1, backgroundColor: colores.bordeSuave },
  textoDia: {
    ...tipografia.micro,
    color: colores.textoSuave,
    backgroundColor: colores.superficieSuave,
    paddingHorizontal: espacio.md,
    paddingVertical: 3,
    borderRadius: radio.completo,
    overflow: 'hidden',
  },

  barraEnvio: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espacio.sm,
    padding: espacio.md,
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
    backgroundColor: colores.superficie,
  },
  campo: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: colores.superficieSuave,
    borderRadius: radio.lg,
    paddingHorizontal: espacio.base,
    paddingVertical: espacio.md,
    ...tipografia.cuerpo,
    color: colores.texto,
  },
  botonEnviar: {
    backgroundColor: colores.primario,
    borderRadius: radio.lg,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.lg,
  },
  botonEnviarTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.5 },

  barraCerrada: {
    padding: espacio.base,
    backgroundColor: colores.superficieSuave,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
  },
  textoCerrada: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center' },
});
