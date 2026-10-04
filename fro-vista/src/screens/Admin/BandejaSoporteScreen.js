// Ruta: fro-vista/src/screens/Admin/BandejaSoporteScreen.js
//
// CU61 — Bandeja del operador de soporte.
//
// Los tickets llegan ya enrutados por área. Los que no encontraron operador
// aparecen marcados como supervisión general: son el desborde que el caso de
// uso pide alertar, y desde aquí se pueden tomar.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, StyleSheet, Image, Modal, Linking, Pressable,
} from 'react-native';

import {
  getBandejaSoporte,
  actualizarTicketSoporte,
  getMisAreasSoporte,
  guardarMisAreasSoporte,
} from '../../api/client';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoMotivo from '../../components/DialogoMotivo';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const FILTROS = [
  { clave: '', etiqueta: 'Todos' },
  { clave: 'ABIERTO', etiqueta: 'Abiertos' },
  { clave: 'EN_PROCESO', etiqueta: 'En proceso' },
  { clave: 'RESUELTO', etiqueta: 'Resueltos' },
];

export default function BandejaSoporteScreen() {
  const [tickets, setTickets] = useState([]);
  const [resumen, setResumen] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [porResolver, setPorResolver] = useState(null);

  const [verAreas, setVerAreas] = useState(false);
  // Captura adjunta abierta a pantalla completa.
  const [imagenAbierta, setImagenAbierta] = useState(null);
  const [misAreas, setMisAreas] = useState([]);

  const cargar = useCallback(
    async (cual = filtro, esRefresco = false) => {
      if (esRefresco) setRefrescando(true);
      else setCargando(true);
      setError(false);
      try {
        const datos = await getBandejaSoporte({ estado: cual });
        setTickets(datos.tickets || []);
        setResumen(datos.resumen || {});
        setCategorias(datos.categorias || []);
      } catch {
        setError(true);
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [filtro]
  );

  useEffect(() => {
    cargar(filtro);
    getMisAreasSoporte()
      .then((d) => setMisAreas(d.areas || []))
      .catch(() => {});
  }, [cargar, filtro]);

  const alternarArea = async (clave) => {
    const nuevas = misAreas.includes(clave)
      ? misAreas.filter((a) => a !== clave)
      : [...misAreas, clave];
    setMisAreas(nuevas);
    try {
      const datos = await guardarMisAreasSoporte(nuevas);
      setAviso({ tono: 'ok', titulo: 'Áreas actualizadas', mensaje: datos.mensaje });
      await cargar(filtro, true);
    } catch {
      setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: 'Intenta nuevamente.' });
    }
  };

  const actualizar = async (ticket, payload) => {
    setPorResolver(null);
    setProcesando(ticket.ticket_soporte_id);
    try {
      await actualizarTicketSoporte(ticket.ticket_soporte_id, payload);
      await cargar(filtro, true);
    } catch (err) {
      // Excepción 3 del CU61: otro operador lo tomó mientras tanto.
      setAviso({
        tono: err.response?.data?.error === 'TICKET_REASIGNADO' ? 'alerta' : 'error',
        titulo: err.response?.data?.error === 'TICKET_REASIGNADO' ? 'Ticket reasignado' : 'No se pudo actualizar',
        mensaje: err.response?.data?.mensaje || 'Intenta nuevamente.',
      });
      await cargar(filtro, true);
    } finally {
      setProcesando(null);
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
    <View style={estilos.fondo}>
      <View style={estilos.filtros}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.clave || 'todos'}
            style={[estilos.filtro, filtro === f.clave && estilos.filtroActivo]}
            onPress={() => setFiltro(f.clave)}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={[estilos.filtroTexto, filtro === f.clave && estilos.filtroTextoActivo]}>
              {f.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={estilos.centrado}>
          <ErrorRetry mensaje="No se pudo cargar la bandeja." onRetry={() => cargar(filtro)} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={estilos.contenido}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={() => cargar(filtro, true)}
              colors={[colores.primario]}
            />
          }
        >
          <View style={estilos.resumen}>
            <Text style={estilos.resumenTexto}>
              {resumen.abiertos || 0} abiertos · {resumen.en_proceso || 0} en proceso
              {resumen.sin_operador > 0 ? ` · ${resumen.sin_operador} sin operador` : ''}
            </Text>
            <TouchableOpacity onPress={() => setVerAreas((v) => !v)}>
              <Text style={estilos.enlace}>{verAreas ? 'Ocultar' : '⚙️ Mis áreas'}</Text>
            </TouchableOpacity>
          </View>

          {verAreas && (
            <View style={estilos.tarjetaAreas}>
              <Text style={estilos.etiqueta}>Áreas que atiendo</Text>
              <Text style={estilos.ayuda}>
                Los tickets de estas áreas se te asignan solos. Un área sin operador queda en
                la bandeja de supervisión general.
              </Text>
              <View style={estilos.categorias}>
                {categorias.map((c) => (
                  <TouchableOpacity
                    key={c.clave}
                    style={[estilos.categoria, misAreas.includes(c.clave) && estilos.categoriaElegida]}
                    onPress={() => alternarArea(c.clave)}
                    activeOpacity={interaccion.opacidadActiva}
                  >
                    <Text
                      style={[
                        estilos.categoriaTexto,
                        misAreas.includes(c.clave) && estilos.categoriaTextoElegida,
                      ]}
                    >
                      {misAreas.includes(c.clave) ? '✓ ' : ''}
                      {c.clave}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {tickets.length === 0 ? (
            <View style={estilos.vacio}>
              <Text style={estilos.vacioIcono}>🎫</Text>
              <Text style={estilos.vacioTitulo}>Sin tickets en este filtro</Text>
            </View>
          ) : (
            tickets.map((t) => (
              <View
                key={t.ticket_soporte_id}
                style={[estilos.ticket, !t.asignado_a && estilos.ticketSinOperador]}
              >
                <View style={estilos.cabecera}>
                  <Text style={estilos.numero}>#{t.ticket_soporte_id} · {t.categoria}</Text>
                  <Text style={estilos.estado}>{t.estado}</Text>
                </View>

                <Text style={estilos.descripcion}>{t.descripcion}</Text>

                {/* Captura que adjuntó quien reportó: se amplía al tocarla. */}
                {t.adjunto_url ? (
                  <TouchableOpacity
                    onPress={() => setImagenAbierta(t.adjunto_url)}
                    activeOpacity={interaccion.opacidadActiva}
                    style={estilos.adjunto}
                  >
                    <Image source={{ uri: t.adjunto_url }} style={estilos.miniatura} resizeMode="cover" />
                    <Text style={estilos.adjuntoTexto}>📎 Captura adjunta · toca para ampliar</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Quién lo reportó y cómo contactarlo. */}
                <View style={estilos.contacto}>
                  <Text style={estilos.contactoNombre}>
                    {t.solicitante} · {t.rol_solicitante || 'usuario'}
                    {t.rut_solicitante ? ` · RUT ${t.rut_solicitante}` : ''}
                  </Text>
                  {t.telefono_solicitante ? (
                    <Text
                      style={estilos.contactoDato}
                      onPress={() =>
                        Linking.openURL(`tel:${String(t.telefono_solicitante).split(',')[0].replace(/\s/g, '')}`).catch(() => {})
                      }
                    >
                      📞 {t.telefono_solicitante}
                    </Text>
                  ) : (
                    <Text style={estilos.meta}>📞 Sin teléfono registrado</Text>
                  )}
                  {t.email_solicitante ? (
                    <Text
                      style={estilos.contactoDato}
                      onPress={() =>
                        Linking.openURL(
                          `mailto:${t.email_solicitante}?subject=${encodeURIComponent(`Ticket de soporte #${t.ticket_soporte_id}`)}`
                        ).catch(() => {})
                      }
                    >
                      ✉️ {t.email_solicitante}
                    </Text>
                  ) : null}
                </View>

                <Text style={estilos.meta}>
                  Creado {formatearFechaHora(t.momento_creacion)} · hace {t.horas_abierto}h
                </Text>
                <Text style={estilos.meta}>
                  {t.asignado_a ? `Operador: ${t.operador}` : '⚠️ Sin operador · supervisión general'}
                </Text>

                {t.resolucion ? <Text style={estilos.resolucion}>{t.resolucion}</Text> : null}

                {!['RESUELTO', 'CERRADO'].includes(t.estado) && (
                  <View style={estilos.acciones}>
                    {t.estado === 'ABIERTO' && (
                      <TouchableOpacity
                        style={estilos.botonTomar}
                        onPress={() => actualizar(t, { estado: 'EN_PROCESO', tomar: true })}
                        disabled={procesando === t.ticket_soporte_id}
                        activeOpacity={interaccion.opacidadActiva}
                      >
                        <Text style={estilos.botonTomarTexto}>Tomar</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={estilos.botonResolver}
                      onPress={() => setPorResolver(t)}
                      disabled={procesando === t.ticket_soporte_id}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <Text style={estilos.botonResolverTexto}>Resolver</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* La resolución se escribe: es lo que el solicitante verá en su
          seguimiento, así que no puede cerrarse en silencio. */}
      <DialogoMotivo
        visible={porResolver !== null}
        titulo={`Resolver ticket #${porResolver?.ticket_soporte_id || ''}`}
        descripcion="Escribe la respuesta que verá quien lo reportó:"
        etiquetaConfirmar="Marcar resuelto"
        colorConfirmar={colores.primario}
        onConfirmar={(texto) => actualizar(porResolver, { estado: 'RESUELTO', resolucion: texto, tomar: true })}
        onCancelar={() => setPorResolver(null)}
      />

      <Modal
        visible={imagenAbierta !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setImagenAbierta(null)}
      >
        <Pressable style={estilos.visor} onPress={() => setImagenAbierta(null)}>
          {imagenAbierta ? (
            <Image source={{ uri: imagenAbierta }} style={estilos.visorImagen} resizeMode="contain" />
          ) : null}
          <Text style={estilos.visorCerrar}>Toca para cerrar</Text>
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
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl },

  filtros: {
    flexDirection: 'row',
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
  },
  filtro: { flex: 1, paddingVertical: espacio.md, alignItems: 'center' },
  filtroActivo: { borderBottomWidth: 2, borderBottomColor: colores.primario },
  filtroTexto: { ...tipografia.meta, color: colores.textoSuave },
  filtroTextoActivo: { ...tipografia.metaFuerte, color: colores.primario },

  resumen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espacio.md,
  },
  resumenTexto: { ...tipografia.meta, color: colores.textoSuave, flex: 1 },
  enlace: { ...tipografia.metaFuerte, color: colores.primario },

  tarjetaAreas: { ...piezas.tarjeta, marginBottom: espacio.base },
  etiqueta: { ...piezas.etiqueta },
  ayuda: { ...tipografia.meta, color: colores.textoTenue, marginBottom: espacio.sm },
  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  categoria: {
    paddingVertical: espacio.xs,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
  },
  categoriaElegida: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  categoriaTexto: { ...tipografia.micro, color: colores.textoSuave },
  categoriaTextoElegida: { color: colores.primario },

  ticket: { ...piezas.tarjeta, marginBottom: espacio.md },
  // El ticket sin operador se ve distinto: es el desborde que hay que atender.
  ticketSinOperador: { borderColor: colores.advertenciaBorde, backgroundColor: colores.advertenciaSuave },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  estado: { ...tipografia.micro, color: colores.primario },
  descripcion: { ...tipografia.meta, color: colores.texto, marginTop: espacio.sm },
  meta: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.xs },
  resolucion: { ...tipografia.meta, color: colores.exito, marginTop: espacio.sm },

  adjunto: { marginTop: espacio.md },
  miniatura: {
    width: '100%',
    height: 160,
    borderRadius: radio.md,
    backgroundColor: colores.superficieSuave,
  },
  adjuntoTexto: { ...tipografia.micro, color: colores.primario, marginTop: espacio.xs },

  contacto: {
    marginTop: espacio.md,
    padding: espacio.md,
    borderRadius: radio.md,
    backgroundColor: colores.superficieSuave,
    gap: 2,
  },
  contactoNombre: { ...tipografia.metaFuerte, color: colores.textoTitulo },
  contactoDato: { ...tipografia.meta, color: colores.primario, paddingVertical: 2 },

  visor: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: espacio.base,
  },
  visorImagen: { width: '100%', height: '80%' },
  visorCerrar: { ...tipografia.meta, color: colores.textoInverso, marginTop: espacio.md },

  acciones: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.md },
  botonTomar: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espacio.sm,
    alignItems: 'center',
  },
  botonTomarTexto: { ...tipografia.metaFuerte, color: colores.primario },
  botonResolver: {
    flex: 1,
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espacio.sm,
    alignItems: 'center',
  },
  botonResolverTexto: { ...tipografia.metaFuerte, color: colores.textoInverso },

  vacio: { alignItems: 'center', paddingTop: espacio.xxl },
  vacioIcono: { fontSize: 40, marginBottom: espacio.sm },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo },
});
