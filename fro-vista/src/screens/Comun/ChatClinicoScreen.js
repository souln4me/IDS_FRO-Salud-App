/**
 * Componente: Cliente Móvil — Vista "Mensajes"
 * Casos de uso: CU53, CU57, CU35.
 */
// Ruta: fro-vista/src/screens/Comun/ChatClinicoScreen.js
//
// CU53 — Conversación clínica entre el paciente y su profesional. Hay UNA
// conversación por pareja paciente–profesional (antes había una por episodio):
// sigue abierta para escribir mientras exista un episodio abierto o una cita
// vigente entre ambos; si no, queda como historial de solo lectura.
// CU57 — cada envío pasa antes por el filtro de contenido.
//
// La pantalla llega con { pacienteId, profesionalId, nombreOtro }. Por
// compatibilidad también acepta { episodioId } (avisos antiguos) o, para el
// profesional, solo { pacienteId } (desde la ficha): en esos casos primero
// averigua la pareja y luego usa las rutas por pareja.
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
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Pressable,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import apiClient from '../../api/client';
import Avatar from '../../components/Avatar';
import Icono from '../../components/Icono';
import AdjuntoChat from '../../components/AdjuntoChat';
import DialogoAviso from '../../components/DialogoAviso';
import useEspacioInferior from '../../utils/useEspacioInferior';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFecha, formatearHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion, sombra } from '../../theme';

const SEGUNDOS_ENTRE_CONSULTAS = 6;
const clavePendientes = (pacienteId, profesionalId) => `cu53_pendientes_${pacienteId}_${profesionalId}`;
// Clave de la versión anterior (un chat por episodio): lo que haya quedado
// retenido ahí se traslada a la clave de la pareja.
const claveAntigua = (episodioId) => `cu53_pendientes_${episodioId}`;

// Mismos formatos que acepta el servidor para los adjuntos del chat.
const TIPOS_ARCHIVO = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/*',
  'video/mp4',
  'video/quicktime',
];

/** "Hoy", "Ayer" o la fecha, para separar la conversación por día (hora de Chile). */
function etiquetaDia(momento) {
  const dia = formatearFecha(momento, '');
  if (!dia) return '';
  if (dia === formatearFecha(new Date())) return 'Hoy';
  if (dia === formatearFecha(new Date(Date.now() - 24 * 60 * 60 * 1000))) return 'Ayer';
  return dia;
}

/** La galería no siempre informa el nombre del archivo: se arma uno con su extensión. */
function nombreDeImagen(activo) {
  if (activo.fileName) return activo.fileName;
  const subtipo = (activo.mimeType || 'image/jpeg').split('/')[1] || 'jpg';
  return `imagen_${Date.now()}.${subtipo === 'jpeg' ? 'jpg' : subtipo}`;
}

/** Sin respuesta del servidor o error interno: vale la pena reintentar solo. */
const esFalloDeConexion = (err) => !err.response || err.response.status >= 500;

export default function ChatClinicoScreen({ route, navigation }) {
  const params = route?.params || {};
  const episodioId = params.episodioId;
  const espacioInferior = useEspacioInferior();

  // Pareja de la conversación. Si no llega completa, se resuelve al abrir.
  const [pareja, setPareja] = useState(
    params.pacienteId && params.profesionalId
      ? { pacienteId: params.pacienteId, profesionalId: params.profesionalId }
      : null
  );
  const [nombreOtro, setNombreOtro] = useState(params.nombreOtro || '');

  const [mensajes, setMensajes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [conversacion, setConversacion] = useState(null);
  const [puedeEscribir, setPuedeEscribir] = useState(true);
  const [motivoBloqueo, setMotivoBloqueo] = useState(null);

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Archivo que se está subiendo ({ nombre }), para la burbuja de carga.
  const [subiendo, setSubiendo] = useState(null);
  const [menuAdjunto, setMenuAdjunto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);

  const refScroll = useRef(null);
  const ultimoId = useRef(0);

  const rutaChat = pareja ? `/clinica/chat/${pareja.pacienteId}/${pareja.profesionalId}` : null;

  useEffect(() => {
    navigation.setOptions?.({ title: nombreOtro ? `Chat con ${nombreOtro}` : 'Mensajes' });
  }, [navigation, nombreOtro]);

  // Cinta superior con un acceso a la derecha: el profesional va a la ficha
  // clínica del paciente; el paciente, al perfil del profesional.
  const esProfesional = conversacion?.papel === 'PROFESIONAL' && Boolean(conversacion?.paciente_id);
  const esPaciente = conversacion?.papel === 'PACIENTE' && Boolean(conversacion?.profesional_id);

  // CU28, CU10 — ir a la ficha clínica del paciente o al perfil del profesional
  const abrirAcceso = () => {
    if (esProfesional) {
      navigation.navigate('FichaClinica', {
        pacienteId: conversacion.paciente_id,
        nombrePaciente: conversacion.con || nombreOtro,
      });
    } else if (esPaciente) {
      navigation.navigate('PerfilProfesional', {
        profesionalId: conversacion.profesional_id,
        nombre: conversacion.con || nombreOtro,
      });
    }
  };

  /**
   * CU53 — Comunicando mediante mensajería clínica cifrada
   * Averigua la pareja cuando la pantalla no la trae completa:
   *  · aviso antiguo con episodioId → la ruta del episodio la informa;
   *  · profesional con solo pacienteId → el servidor dice cuál es su chat.
   */
  const resolverPareja = useCallback(async () => {
    setError(false);
    setCargando(true);
    try {
      if (episodioId) {
        const { data } = await apiClient.get(`/clinica/episodio/${episodioId}/mensajes`, {
          params: { desde_id: 0 },
        });
        const c = data.conversacion || {};
        if (!c.paciente_id || !c.profesional_id) throw new Error('Conversación sin pareja');
        if (c.con) setNombreOtro((previo) => previo || c.con);
        setPareja({ pacienteId: c.paciente_id, profesionalId: c.profesional_id });
      } else if (params.pacienteId) {
        const { data } = await apiClient.get(`/clinica/chat/con/${params.pacienteId}`);
        if (data.con) setNombreOtro((previo) => previo || data.con);
        setPareja({ pacienteId: data.paciente_id, profesionalId: data.profesional_id });
      } else {
        throw new Error('Faltan datos para abrir la conversación');
      }
    } catch {
      setError(true);
      setCargando(false);
    }
  }, [episodioId, params.pacienteId]);

  useEffect(() => {
    if (!pareja) resolverPareja();
    // Solo al abrir: después la pareja ya queda fija.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * CU53 — Comunicando mediante mensajería clínica cifrada
   * Trae lo nuevo desde el último mensaje conocido.
   */
  const consultar = useCallback(
    async (primeraVez = false) => {
      if (!rutaChat) return;
      try {
        const { data: datos } = await apiClient.get(`${rutaChat}/mensajes`, {
          params: { desde_id: primeraVez ? 0 : ultimoId.current },
        });
        setConversacion(datos.conversacion || null);
        if (datos.conversacion?.con) setNombreOtro(datos.conversacion.con);
        setPuedeEscribir(datos.puede_escribir !== false);
        setMotivoBloqueo(datos.motivo_bloqueo || null);
        setError(false);

        const llegaron = datos.mensajes || [];
        if (llegaron.length > 0) {
          ultimoId.current = Math.max(ultimoId.current, llegaron[llegaron.length - 1].mensaje_id);
          // Dos consultas simultáneas (el reloj y un envío) pueden traer lo
          // mismo: solo se agrega lo que es más nuevo que lo ya mostrado.
          setMensajes((previos) => {
            if (primeraVez) return llegaron;
            const tope = previos.length ? previos[previos.length - 1].mensaje_id : 0;
            const nuevos = llegaron.filter((m) => m.mensaje_id > tope);
            return nuevos.length ? [...previos, ...nuevos] : previos;
          });
        }
      } catch (err) {
        // Un fallo puntual de la consulta no vacía la conversación: se marca
        // el error solo si todavía no hay nada que mostrar.
        if (primeraVez) setError(true);
      } finally {
        if (primeraVez) setCargando(false);
      }
    },
    [rutaChat]
  );

  /**
   * CU53 — reenviar los mensajes retenidos
   * Reintenta lo que quedó retenido en el teléfono (Excepción 2).
   */
  const reintentarPendientes = useCallback(async () => {
    if (!pareja) return;
    const clave = clavePendientes(pareja.pacienteId, pareja.profesionalId);
    let cola = [];
    try {
      const guardado = await SecureStore.getItemAsync(clave);
      cola = guardado ? JSON.parse(guardado) : [];
      if (episodioId) {
        const antiguo = await SecureStore.getItemAsync(claveAntigua(episodioId));
        if (antiguo) {
          cola = [...cola, ...JSON.parse(antiguo)];
          await SecureStore.deleteItemAsync(claveAntigua(episodioId)).catch(() => {});
        }
      }
    } catch {
      cola = [];
    }
    if (cola.length === 0) return;

    const quedan = [];
    for (const pendiente of cola) {
      try {
        await apiClient.post(`${rutaChat}/mensajes`, { contenido: pendiente.contenido });
      } catch {
        quedan.push(pendiente);
      }
    }

    setPendientes(quedan);
    await SecureStore.setItemAsync(clave, JSON.stringify(quedan)).catch(() => {});
    if (quedan.length < cola.length) await consultar();
  }, [pareja, rutaChat, episodioId, consultar]);

  useEffect(() => {
    if (!rutaChat) return undefined;
    let vivo = true;
    (async () => {
      await consultar(true);
      if (vivo) await reintentarPendientes();
    })();

    const reloj = setInterval(() => {
      consultar();
    }, SEGUNDOS_ENTRE_CONSULTAS * 1000);

    // Al volver de Documentos (o del visor) se consulta de inmediato, para
    // que el documento recién enviado aparezca sin esperar el reloj.
    const quitarFoco = navigation.addListener?.('focus', () => consultar());

    return () => {
      vivo = false;
      clearInterval(reloj);
      quitarFoco?.();
    };
  }, [rutaChat, consultar, reintentarPendientes, navigation]);

  /**
   * CU53, CU57 — avisar si el filtro rechazó el mensaje o el chat es de solo lectura
   * Respuestas del servidor comunes al texto y a los adjuntos.
   */
  const avisarRechazo = (respuesta, tituloPorDefecto) => {
    if (respuesta?.error === 'CONTENIDO_RESTRINGIDO' || respuesta?.error === 'VACIO') {
      setAviso({ tono: 'alerta', titulo: 'Mensaje no permitido', mensaje: respuesta.mensaje });
    } else if (
      respuesta?.error === 'CONVERSACION_SOLO_LECTURA' ||
      respuesta?.error === 'EPISODIO_CERRADO'
    ) {
      setPuedeEscribir(false);
      setMotivoBloqueo(respuesta.mensaje);
      setAviso({ tono: 'info', titulo: 'Conversación de solo lectura', mensaje: respuesta.mensaje });
    } else {
      setAviso({
        tono: 'alerta',
        titulo: tituloPorDefecto,
        mensaje: respuesta?.mensaje || 'Inténtalo de nuevo en unos momentos.',
      });
    }
  };

  // CU53, CU57 — enviar el mensaje; el servidor lo pasa por el filtro de contenido
  const enviar = async () => {
    const contenido = texto.trim();
    // Excepción 1 del CU57: sin texto imprimible no se llama al servidor.
    if (!contenido || !rutaChat) return;

    setEnviando(true);
    setTexto('');
    try {
      await apiClient.post(`${rutaChat}/mensajes`, { contenido });
      await consultar();
    } catch (err) {
      const respuesta = err.response?.data;

      if (esFalloDeConexion(err)) {
        // Excepción 2 del CU53: el mensaje queda retenido y se reintenta solo
        // (sin conexión, servidor caído o envío retenido por el servidor).
        const pendiente = { contenido, momento: new Date().toISOString() };
        const cola = [...pendientes, pendiente];
        setPendientes(cola);
        await SecureStore.setItemAsync(
          clavePendientes(pareja.pacienteId, pareja.profesionalId),
          JSON.stringify(cola)
        ).catch(() => {});
        setAviso({
          tono: 'alerta',
          titulo: 'Mensaje retenido',
          mensaje: 'No hay conexión con el servidor. Tu mensaje queda guardado y se envía solo.',
        });
      } else {
        // CU57: si el filtro rechazó el texto no se reintenta: se devuelve al
        // campo para reescribirlo.
        if (respuesta?.error === 'CONTENIDO_RESTRINGIDO' || respuesta?.error === 'VACIO') {
          setTexto(contenido);
        }
        avisarRechazo(respuesta, 'Mensaje no enviado');
      }
    } finally {
      setEnviando(false);
    }
  };

  // ── Adjuntos ──────────────────────────────────────────────────────────────
  /**
   * CU53 — enviar un archivo adjunto en el chat
   * Sube el archivo elegido; si hay texto escrito, viaja junto con él.
   */
  const subirAdjunto = async (archivo) => {
    if (!rutaChat) return;
    const contenido = texto.trim();
    setSubiendo({ nombre: archivo.name });
    try {
      const formulario = new FormData();
      formulario.append('archivo', {
        uri: archivo.uri,
        name: archivo.name,
        type: archivo.mimeType || 'application/octet-stream',
      });
      if (contenido) formulario.append('contenido', contenido);

      await apiClient.post(`${rutaChat}/adjuntos`, formulario, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (d) => d,
      });
      if (contenido) setTexto('');
      await consultar();
    } catch (err) {
      const respuesta = err.response?.data;
      const titulos = {
        ARCHIVO_MUY_GRANDE: 'Archivo muy grande',
        FORMATO_NO_PERMITIDO: 'Formato no permitido',
        CARGA_INTERRUMPIDA: 'Envío interrumpido',
      };
      if (titulos[respuesta?.error]) {
        setAviso({ tono: 'alerta', titulo: titulos[respuesta.error], mensaje: respuesta.mensaje });
      } else if (!err.response) {
        setAviso({
          tono: 'alerta',
          titulo: 'Archivo no enviado',
          mensaje: 'No hay conexión con el servidor. Revisa tu señal y vuelve a adjuntarlo.',
        });
      } else {
        avisarRechazo(respuesta, 'Archivo no enviado');
      }
    } finally {
      setSubiendo(null);
    }
  };

  // El selector del teléfono se abre cuando el menú ya terminó de cerrarse:
  // abrirlo encima del menú falla en iOS.
  const elegirOpcion = (accion) => {
    setMenuAdjunto(false);
    setTimeout(accion, 350);
  };

  const elegirImagen = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permiso.status !== 'granted') {
      setAviso({
        tono: 'alerta',
        titulo: 'Permiso denegado',
        mensaje: 'Para enviar una foto, permite el acceso a la galería en los ajustes del teléfono.',
      });
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (resultado.canceled || !resultado.assets?.length) return;
    const activo = resultado.assets[0];
    subirAdjunto({
      uri: activo.uri,
      name: nombreDeImagen(activo),
      mimeType: activo.mimeType || 'image/jpeg',
    });
  };

  const elegirArchivo = async () => {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: TIPOS_ARCHIVO,
      copyToCacheDirectory: true,
    });
    if (resultado.canceled || !resultado.assets?.length) return;
    const activo = resultado.assets[0];
    subirAdjunto({
      uri: activo.uri,
      name: activo.name,
      mimeType: activo.mimeType || 'application/octet-stream',
    });
  };

  /**
   * CU53 — compartir en el chat un documento ya guardado en la ficha
   * Documentos en modo selección: el profesional ve los del paciente.
   */
  const elegirDesdeDocumentos = () => {
    setMenuAdjunto(false);
    const enviarAChat = {
      pacienteId: pareja.pacienteId,
      profesionalId: pareja.profesionalId,
      nombreOtro,
    };
    navigation.navigate(
      'Documentos',
      esProfesional
        ? { pacienteId: pareja.pacienteId, nombrePaciente: nombreOtro, enviarAChat }
        : { enviarAChat }
    );
  };

  /**
   * CU35 — Visualizando archivos con visor embebido
   * Documento de la ficha → su visor; archivo del chat → visor del adjunto.
   */
  const abrirAdjunto = (m) => {
    const { adjunto } = m;
    if (adjunto.origen === 'FICHA' && adjunto.documento_id) {
      navigation.navigate('VisorDocumento', { documentoId: adjunto.documento_id, nombre: adjunto.nombre });
    } else {
      navigation.navigate('VisorDocumento', { mensajeId: m.mensaje_id, nombre: adjunto.nombre });
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
            if (!pareja) {
              resolverPareja();
              return;
            }
            setCargando(true);
            consultar(true);
          }}
        />
      </View>
    );
  }

  const ocupado = enviando || subiendo !== null;

  return (
    // La barra de envío sube hasta el borde del teclado y, con el teclado
    // cerrado, queda por encima de los botones del celular.
    <View style={[estilos.fondo, { paddingBottom: espacioInferior }]}>
      <View style={estilos.cinta}>
        <Avatar foto={conversacion?.foto} nombre={nombreOtro} tamano={36} />
        <Text style={estilos.cintaNombre} numberOfLines={1}>
          {nombreOtro || 'Conversación'}
        </Text>
        {(esProfesional || esPaciente) && (
          <TouchableOpacity
            style={estilos.botonFicha}
            onPress={abrirAcceso}
            activeOpacity={interaccion.opacidadActiva}
            accessibilityRole="button"
          >
            <Text style={estilos.botonFichaTexto}>{esProfesional ? 'Ficha clínica ›' : 'Ver perfil ›'}</Text>
          </TouchableOpacity>
        )}
      </View>

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
          <View style={estilos.avisoCifrado}>
            <Text style={estilos.avisoCifradoTexto}>🔒 Conversación cifrada</Text>
          </View>

          {mensajes.length === 0 && pendientes.length === 0 && !subiendo && (
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
                  {m.adjunto ? (
                    <AdjuntoChat adjunto={m.adjunto} mio={m.mio} onAbrir={() => abrirAdjunto(m)} />
                  ) : null}
                  {/* Un mensaje que es solo un adjunto llega sin texto. */}
                  {m.contenido ? (
                    <Text
                      style={[
                        estilos.texto,
                        m.mio && estilos.textoMio,
                        m.ilegible && estilos.ilegible,
                        m.adjunto && estilos.textoConAdjunto,
                      ]}
                    >
                      {m.contenido}
                    </Text>
                  ) : null}
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

          {/* Archivo en camino: se ve mientras dura la subida. */}
          {subiendo && (
            <View style={[estilos.burbuja, estilos.burbujaPendiente, estilos.burbujaSubiendo]}>
              <ActivityIndicator size="small" color={colores.primario} />
              <Text style={[estilos.texto, estilos.textoSubiendo]} numberOfLines={1}>
                Enviando {subiendo.nombre}…
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {puedeEscribir ? (
        <View style={estilos.barraEnvio}>
          <TouchableOpacity
            style={[estilos.botonAdjuntar, ocupado && estilos.deshabilitado]}
            onPress={() => setMenuAdjunto(true)}
            disabled={ocupado}
            activeOpacity={interaccion.opacidadActiva}
            accessibilityRole="button"
            accessibilityLabel="Adjuntar un archivo"
          >
            <Text style={estilos.botonAdjuntarTexto}>📎</Text>
          </TouchableOpacity>
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
            style={[estilos.botonEnviar, (!texto.trim() || ocupado) && estilos.deshabilitado]}
            onPress={enviar}
            disabled={!texto.trim() || ocupado}
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
        // Excepción 3 del CU53: sin episodio abierto ni cita vigente, la
        // conversación queda como historial de solo lectura.
        <View style={estilos.barraCerrada}>
          <Text style={estilos.textoCerrada}>
            {motivoBloqueo || 'Esta conversación quedó como historial de solo lectura.'}
          </Text>
        </View>
      )}

      {/* Menú del 📎: de dónde sale el archivo. */}
      <Modal
        visible={menuAdjunto}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuAdjunto(false)}
      >
        <Pressable style={estilos.veloMenu} onPress={() => setMenuAdjunto(false)}>
          <Pressable style={[estilos.hoja, { paddingBottom: espacio.lg + espacioInferior }]}>
            <Text style={estilos.hojaTitulo}>Enviar un archivo</Text>
            {texto.trim() ? (
              <Text style={estilos.hojaNota}>El texto que escribiste se enviará junto con el archivo.</Text>
            ) : null}

            <TouchableOpacity
              style={estilos.opcion}
              onPress={() => elegirOpcion(elegirImagen)}
              activeOpacity={interaccion.opacidadActiva}
              accessibilityRole="button"
            >
              <View style={estilos.opcionIcono}>
                <Text style={estilos.opcionEmoji}>🖼️</Text>
              </View>
              <View style={estilos.opcionCuerpo}>
                <Text style={estilos.opcionTitulo}>Foto o imagen</Text>
                <Text style={estilos.opcionDetalle}>Desde la galería del teléfono</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={estilos.opcion}
              onPress={() => elegirOpcion(elegirArchivo)}
              activeOpacity={interaccion.opacidadActiva}
              accessibilityRole="button"
            >
              <View style={estilos.opcionIcono}>
                <Icono name="document-text-outline" size={22} color={colores.primario} />
              </View>
              <View style={estilos.opcionCuerpo}>
                <Text style={estilos.opcionTitulo}>Archivo</Text>
                <Text style={estilos.opcionDetalle}>PDF, Word, imagen o video</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={estilos.opcion}
              onPress={elegirDesdeDocumentos}
              activeOpacity={interaccion.opacidadActiva}
              accessibilityRole="button"
            >
              <View style={estilos.opcionIcono}>
                <Icono name="folder-open-outline" size={22} color={colores.primario} />
              </View>
              <View style={estilos.opcionCuerpo}>
                <Text style={estilos.opcionTitulo}>Desde Documentos</Text>
                <Text style={estilos.opcionDetalle}>Un documento que ya está en la ficha clínica</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={estilos.cancelar}
              onPress={() => setMenuAdjunto(false)}
              activeOpacity={interaccion.opacidadActiva}
              accessibilityRole="button"
            >
              <Text style={estilos.cancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

  // Cinta superior: con quién es la conversación y su acceso.
  cinta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.md,
    backgroundColor: colores.primarioSuave,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.lg,
    borderBottomWidth: 1,
    borderBottomColor: colores.primarioBorde,
  },
  cintaNombre: { ...tipografia.cuerpoFuerte, color: colores.primario, flex: 1 },
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
  burbujaSubiendo: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  texto: { ...tipografia.cuerpo, color: colores.texto },
  textoMio: { color: colores.textoInverso },
  textoConAdjunto: { marginTop: espacio.sm },
  textoSubiendo: { ...tipografia.meta, color: colores.textoSuave, flexShrink: 1 },
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
  botonAdjuntar: {
    width: 44,
    height: 46,
    borderRadius: radio.lg,
    backgroundColor: colores.superficieSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonAdjuntarTexto: { fontSize: 20 },
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
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },

  barraCerrada: {
    padding: espacio.base,
    backgroundColor: colores.superficieSuave,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
  },
  textoCerrada: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center' },

  // Hoja inferior del 📎.
  veloMenu: { flex: 1, backgroundColor: colores.velo, justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: colores.superficie,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    paddingTop: espacio.lg,
    paddingHorizontal: espacio.lg,
    ...sombra.elevada,
  },
  hojaTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  hojaNota: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.xs },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.md,
    paddingVertical: espacio.md,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
  },
  opcionIcono: {
    width: 44,
    height: 44,
    borderRadius: radio.md,
    backgroundColor: colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcionEmoji: { fontSize: 20 },
  opcionCuerpo: { flex: 1 },
  opcionTitulo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  opcionDetalle: { ...tipografia.meta, color: colores.textoSuave },
  cancelar: { ...piezas.botonSecundario, paddingVertical: espacio.md, marginTop: espacio.base },
  cancelarTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },
});

