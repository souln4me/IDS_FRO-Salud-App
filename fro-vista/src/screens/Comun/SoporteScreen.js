// Ruta: fro-vista/src/screens/Comun/SoporteScreen.js
//
// CU60 — Registro y seguimiento de solicitudes de soporte, común al paciente y
// al profesional.
//
// El ticket se identifica con un número correlativo que el usuario puede citar,
// y abajo queda el seguimiento: en qué estado va cada solicitud y cómo se
// resolvió.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, RefreshControl,
  ActivityIndicator, Image, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { getCategoriasSoporte, getMisTickets, crearTicketSoporte } from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import DialogoAviso from '../../components/DialogoAviso';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const COLOR_ESTADO = {
  ABIERTO: colores.advertencia,
  EN_PROCESO: colores.primario,
  RESUELTO: colores.exito,
  CERRADO: colores.textoTenue,
};

const ETIQUETA_ESTADO = {
  ABIERTO: 'Abierto',
  EN_PROCESO: 'En proceso',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
};

export default function SoporteScreen() {
  const [categorias, setCategorias] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const [categoria, setCategoria] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [adjunto, setAdjunto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState([]);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    try {
      const datos = await getMisTickets();
      setTickets(datos.tickets || []);
      setCategorias(datos.categorias || []);
    } catch {
      // Excepción 2 del CU60: si el servicio no responde, el formulario queda
      // deshabilitado y se explica, en vez de aceptar algo que no se guardará.
      setCategorias([]);
      setAviso({
        tono: 'error',
        titulo: 'Servicio no disponible',
        mensaje: 'No pudimos conectar con soporte. Vuelve a intentarlo en unos minutos.',
      });
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    getCategoriasSoporte()
      .then((d) => setCategorias((previas) => (previas.length ? previas : d.categorias || [])))
      .catch(() => {});
  }, [cargar]);

  const elegirImagen = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setAviso({
        tono: 'info',
        titulo: 'Permiso necesario',
        mensaje: 'Autoriza el acceso a tus fotos para adjuntar una captura.',
      });
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (resultado.canceled || !resultado.assets?.length) return;
    const elegida = resultado.assets[0];
    setAdjunto({
      uri: elegida.uri,
      nombre: elegida.fileName || `captura-${Date.now()}.jpg`,
      tipo: elegida.mimeType || 'image/jpeg',
    });
  };

  const enviar = async () => {
    // Excepción 3: validación estricta antes de salir a la red.
    const faltantes = [];
    if (!categoria) faltantes.push('categoria');
    if (descripcion.trim().length < 10) faltantes.push('descripcion');
    setErrores(faltantes);
    if (faltantes.length > 0) {
      setAviso({
        tono: 'info',
        titulo: 'Faltan datos',
        mensaje: 'Elige el área del problema y cuéntanos qué pasó (al menos 10 caracteres).',
      });
      return;
    }

    setEnviando(true);
    try {
      const datos = await crearTicketSoporte({
        categoria,
        descripcion: descripcion.trim(),
        adjunto,
      });
      setCategoria('');
      setDescripcion('');
      setAdjunto(null);
      setAviso({
        tono: 'ok',
        titulo: `Solicitud #${datos.ticket_soporte_id}`,
        mensaje: `${datos.mensaje} ${
          datos.enrutado
            ? 'Ya está asignada a un operador.'
            : 'Quedó en la bandeja general y un supervisor la tomará.'
        }`,
      });
      await cargar(true);
    } catch (error) {
      const respuesta = error.response?.data;
      if (respuesta?.campos) setErrores(respuesta.campos);
      setAviso({
        tono: respuesta?.error === 'ADJUNTO_MUY_PESADO' ? 'alerta' : 'error',
        titulo: respuesta?.error === 'ADJUNTO_MUY_PESADO' ? 'Imagen muy pesada' : 'No se pudo enviar',
        mensaje:
          respuesta?.mensaje ||
          'No pudimos registrar tu solicitud. Revisa tu conexión e inténtalo otra vez.',
      });
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

  return (
    <VistaConTeclado
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
      }
    >
      <Text style={estilos.intro}>
        Cuéntanos qué necesitas. Cada solicitud recibe un número de seguimiento y se enruta
        al área que corresponde.
      </Text>

      <View style={[estilos.tarjeta, errores.includes('categoria') && estilos.tarjetaError]}>
        <Text style={estilos.etiqueta}>¿Con qué tiene que ver?</Text>
        <View style={estilos.categorias}>
          {categorias.map((c) => (
            <TouchableOpacity
              key={c.clave}
              style={[estilos.categoria, categoria === c.clave && estilos.categoriaElegida]}
              onPress={() => setCategoria(c.clave)}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text
                style={[
                  estilos.categoriaTexto,
                  categoria === c.clave && estilos.categoriaTextoElegida,
                ]}
              >
                {c.etiqueta}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[estilos.tarjeta, errores.includes('descripcion') && estilos.tarjetaError]}>
        <Text style={estilos.etiqueta}>¿Qué pasó?</Text>
        <TextInput
          style={estilos.campo}
          placeholder="Describe el problema con el mayor detalle posible"
          placeholderTextColor={colores.textoTenue}
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
          maxLength={1500}
        />

        {adjunto ? (
          <View style={estilos.adjunto}>
            <Image source={{ uri: adjunto.uri }} style={estilos.miniatura} />
            <TouchableOpacity onPress={() => setAdjunto(null)}>
              <Text style={estilos.quitarAdjunto}>Quitar imagen</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={elegirImagen} activeOpacity={interaccion.opacidadActiva}>
            <Text style={estilos.enlace}>📎 Adjuntar una captura (opcional)</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[estilos.boton, enviando && estilos.deshabilitado]}
        onPress={enviar}
        disabled={enviando}
        activeOpacity={interaccion.opacidadActiva}
      >
        {enviando ? (
          <ActivityIndicator color={colores.textoInverso} />
        ) : (
          <Text style={estilos.botonTexto}>Enviar solicitud</Text>
        )}
      </TouchableOpacity>

      <Text style={estilos.seccion}>Mis solicitudes</Text>

      {tickets.length === 0 ? (
        <Text style={estilos.vacio}>Todavía no has enviado solicitudes de soporte.</Text>
      ) : (
        tickets.map((t) => (
          <View key={t.ticket_soporte_id} style={estilos.ticket}>
            <View style={estilos.cabeceraTicket}>
              <Text style={estilos.numero}>#{t.ticket_soporte_id}</Text>
              <Text style={[estilos.estado, { color: COLOR_ESTADO[t.estado] || colores.textoSuave }]}>
                {ETIQUETA_ESTADO[t.estado] || t.estado}
              </Text>
            </View>
            <Text style={estilos.categoriaTicket}>{t.categoria}</Text>
            <Text style={estilos.descripcionTicket}>{t.descripcion}</Text>
            {t.adjunto_url ? (
              <Image source={{ uri: t.adjunto_url }} style={estilos.capturaTicket} resizeMode="cover" />
            ) : null}
            <Text style={estilos.momento}>{formatearFechaHora(t.momento_creacion)}</Text>
            {t.resolucion ? (
              <Text style={estilos.resolucion}>Respuesta: {t.resolucion}</Text>
            ) : null}
          </View>
        ))
      )}

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colores.fondo },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  tarjetaError: { borderColor: colores.error },
  etiqueta: { ...piezas.etiqueta },
  campo: { ...piezas.campo, minHeight: 110, textAlignVertical: 'top' },

  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  categoria: {
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
  },
  categoriaElegida: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  categoriaTexto: { ...tipografia.meta, color: colores.textoSuave, fontWeight: '600' },
  categoriaTextoElegida: { color: colores.primario },

  enlace: { ...tipografia.metaFuerte, color: colores.primario, marginTop: espacio.md },
  adjunto: { flexDirection: 'row', alignItems: 'center', gap: espacio.md, marginTop: espacio.md },
  miniatura: { width: 56, height: 56, borderRadius: radio.sm, backgroundColor: colores.superficieSuave },
  capturaTicket: { width: '100%', height: 140, borderRadius: radio.md, marginTop: espacio.sm, backgroundColor: colores.superficieSuave },
  quitarAdjunto: { ...tipografia.meta, color: colores.error },

  boton: { ...piezas.botonPrimario, alignItems: 'center' },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.6 },

  seccion: { ...tipografia.subtitulo, color: colores.textoTitulo, marginTop: espacio.xl, marginBottom: espacio.md },
  vacio: { ...tipografia.meta, color: colores.textoTenue },

  ticket: { ...piezas.tarjeta, marginBottom: espacio.md },
  cabeceraTicket: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  estado: { ...tipografia.metaFuerte },
  categoriaTicket: { ...tipografia.micro, color: colores.textoTenue, marginTop: 2 },
  descripcionTicket: { ...tipografia.meta, color: colores.texto, marginTop: espacio.sm },
  momento: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.sm },
  resolucion: {
    ...tipografia.meta,
    color: colores.exito,
    marginTop: espacio.sm,
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
    paddingTop: espacio.sm,
  },
});
