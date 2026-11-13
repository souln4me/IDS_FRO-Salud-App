/**
 * Componente: Cliente Móvil — Vista "Informe de alta"
 * Casos de uso: CU37, CU78, CU32.
 */
// Ruta: fro-vista/src/screens/Profesional/InformeAltaScreen.js
//
// CU37 — Informe de alta y cierre del episodio. Se abre desde la pestaña
// Episodios de la ficha. Consolida las metas y la evolución, pide las pautas
// de continuidad y, al emitir, guarda el PDF en los documentos del paciente
// y cierra el episodio. También permite cerrar sin informe (abandono del
// tratamiento), con las mismas validaciones.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

import apiClient, { getInformeAlta, emitirInformeAlta } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import VistaConTeclado from '../../components/VistaConTeclado';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';
import { formatearFecha, formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const MENSAJES_ERROR = {
  EPISODIO_CERRADO: 'Este episodio ya está cerrado.',
  EVOLUCIONES_PENDIENTES: 'Hay evoluciones sin cerrar ni firmar. Regularízalas en la Sesión Clínica antes de emitir el alta.',
  CITAS_FUTURAS: 'El episodio tiene citas agendadas a futuro. Cancélalas antes de cerrar.',
  UMBRAL_NO_ALCANZADO: 'El paciente todavía no alcanza el umbral de egreso.',
  EPISODIO_AJENO: 'Solo el profesional a cargo del episodio puede emitir el alta.',
  REPOSITORIO_NO_DISPONIBLE: 'El repositorio de documentos no está disponible. El episodio sigue abierto.',
  CARGA_INTERRUMPIDA: 'No se pudo guardar el informe en el repositorio. El episodio sigue abierto: reintenta.',
};

export default function InformeAltaScreen({ route, navigation }) {
  const { episodioId, nombrePaciente } = route?.params || {};
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [pautas, setPautas] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);
  const [aviso, setAviso] = useState(null);

  // CU37 — cargar el resumen del episodio antes de emitir el alta
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const datos = await getInformeAlta(episodioId);
      setResumen(datos);
      if (datos?.episodio?.pautas_continuidad) setPautas(datos.episodio.pautas_continuidad);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [episodioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const mostrarError = (err, titulo) => {
    const codigo = err?.error;
    const detalle = codigo === 'CITAS_FUTURAS' && err.citas?.length
      ? `\n\n${err.citas.map((c) => `• ${formatearFechaHora(c.fecha_hora_inicio)} (${c.estado})`).join('\n')}`
      : codigo === 'EVOLUCIONES_PENDIENTES' && err.evoluciones?.length
        ? `\n\nEvoluciones: ${err.evoluciones.map((id) => `#${id}`).join(', ')}`
        : '';
    setAviso({ tono: 'error', titulo, mensaje: (err?.mensaje || MENSAJES_ERROR[codigo] || 'Intenta nuevamente.') + detalle });
  };

  // CU37 — Emitiendo informe de alta y cierre de episodio
  const emitir = async () => {
    setProcesando(true);
    try {
      const data = await emitirInformeAlta(episodioId, pautas);
      setAviso({
        tono: 'ok',
        titulo: 'Informe de alta emitido',
        mensaje: `${data.mensaje}\n\nEl paciente recibió el aviso y puede ver el informe en Mis Documentos.`,
        alCerrar: () => navigation.goBack(),
      });
    } catch (e) {
      mostrarError(e.response?.data, 'No se pudo emitir el alta');
      // Las validaciones pueden haber cambiado (una cita nueva, por ejemplo).
      cargar();
    } finally {
      setProcesando(false);
    }
  };

  // Cierre sin informe (CU78): mismas validaciones de evoluciones y citas.
  const cerrarSinInforme = async () => {
    setProcesando(true);
    try {
      const { data } = await apiClient.put(`/clinica/episodio/${episodioId}`, { estado: 'CERRADO' });
      setAviso({ tono: 'ok', titulo: 'Episodio cerrado', mensaje: data.mensaje, alCerrar: () => navigation.goBack() });
    } catch (e) {
      mostrarError(e.response?.data, 'No se pudo cerrar');
      cargar();
    } finally {
      setProcesando(false);
    }
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }
  if (error || !resumen) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No se pudo preparar el informe de alta." onRetry={cargar} />
      </View>
    );
  }

  const { episodio, metas, porcentaje, umbral, umbral_alcanzado, evoluciones, evoluciones_pendientes, citas_futuras, contradicciones, impedimento, limite_pautas } = resumen;
  const cerrado = String(episodio.estado || '').toUpperCase() === 'CERRADO';
  const limite = limite_pautas || 1000;
  const puedeEmitir = !cerrado && !impedimento && umbral_alcanzado && contradicciones.length === 0 && !procesando;
  const puedeCerrar = !cerrado && !impedimento && !procesando;

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>{nombrePaciente || episodio.paciente}</Text>
        <Text style={estilos.meta}>Episodio #{episodio.episodio_clinico_id} · {episodio.motivo_consulta}</Text>
        <Text style={estilos.meta}>Inicio: {formatearFecha(episodio.fecha_inicio)}</Text>
        {cerrado && (
          <View style={estilos.avisoInfo}>
            <Text style={estilos.avisoInfoTexto}>
              Episodio cerrado{episodio.fecha_terminado ? ` el ${formatearFecha(episodio.fecha_terminado)}` : ''}
              {episodio.informe_alta_emitido_en ? ' con informe de alta.' : ' sin informe de alta.'}
            </Text>
          </View>
        )}
      </View>

      {/* CU32 — Estado final de las metas */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.seccion}>Cumplimiento de metas</Text>
        {porcentaje === null ? (
          <Text style={estilos.ayuda}>El episodio no tiene metas medibles.</Text>
        ) : (
          <>
            <View style={estilos.barraFondo}>
              <View style={[estilos.barraAvance, { width: `${Math.min(100, porcentaje)}%` }, umbral_alcanzado && estilos.barraOk]} />
            </View>
            <Text style={[estilos.cifra, umbral_alcanzado ? estilos.cifraOk : estilos.cifraPendiente]}>
              {porcentaje} % · umbral de egreso {umbral} % {umbral_alcanzado ? '✓ alcanzado' : '· no alcanzado'}
            </Text>
          </>
        )}
        {metas.map((m) => (
          <View key={m.objetivo_terapeutico_id} style={estilos.filaMeta}>
            <Text style={estilos.metaTexto}>{m.descripcion}</Text>
            <Text style={estilos.metaCifra}>{m.valor_actual} / {m.meta_valor} {m.unidad} · {m.porcentaje === null ? '—' : `${m.porcentaje} %`}</Text>
          </View>
        ))}
        {contradicciones.length > 0 && (
          <View style={estilos.avisoAmbar}>
            <Text style={estilos.avisoAmbarTitulo}>Metas que no se pueden medir</Text>
            {contradicciones.map((c, i) => <Text key={i} style={estilos.avisoAmbarTexto}>• {c}</Text>)}
          </View>
        )}
      </View>

      {/* Evoluciones y citas: lo que puede impedir el cierre */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.seccion}>Evolución clínica</Text>
        <Text style={estilos.ayuda}>
          {evoluciones.length} sesión(es) registrada(s) · {evoluciones.length - evoluciones_pendientes.length} firmada(s)
        </Text>
        {evoluciones_pendientes.length > 0 && (
          <View style={estilos.avisoError}>
            <Text style={estilos.avisoErrorTitulo}>Evoluciones sin cerrar ni firmar</Text>
            <Text style={estilos.avisoErrorTexto}>
              {evoluciones_pendientes.map((e) => `#${e.evolucion_clinica_id}`).join(', ')}. Ciérralas y fírmalas en la Sesión Clínica antes de emitir el alta.
            </Text>
          </View>
        )}
        {citas_futuras.length > 0 && (
          <View style={estilos.avisoError}>
            <Text style={estilos.avisoErrorTitulo}>Citas agendadas a futuro</Text>
            {citas_futuras.map((c) => (
              <Text key={c.cita_id} style={estilos.avisoErrorTexto}>• {formatearFechaHora(c.fecha_hora_inicio)} · {c.estado}</Text>
            ))}
            <Text style={estilos.avisoErrorTexto}>Cancélalas desde el historial antes de cerrar el episodio.</Text>
          </View>
        )}
      </View>

      {/* Pautas de continuidad */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.seccion}>Pautas de continuidad terapéutica</Text>
        <Text style={estilos.ayuda}>Indicaciones para que el paciente mantenga lo logrado. Quedan en el informe y en su pestaña de alta.</Text>
        <TextInput
          style={[estilos.campo, cerrado && estilos.campoBloqueado]}
          placeholder="Ej: continuar con la rutina de mantenimiento 3 veces por semana…"
          placeholderTextColor={colores.textoTenue}
          multiline
          maxLength={limite}
          editable={!cerrado}
          value={pautas}
          onChangeText={setPautas}
        />
        <Text style={[estilos.contador, pautas.length >= limite && estilos.contadorTope]}>{pautas.length}/{limite}</Text>
      </View>

      <TouchableOpacity
        style={[estilos.botonPrimario, !puedeEmitir && estilos.deshabilitado]}
        onPress={() => setConfirmacion({
          titulo: 'Emitir informe de alta',
          mensaje: `Se generará el informe en PDF, quedará en los documentos de ${nombrePaciente || 'el paciente'} y el episodio #${episodio.episodio_clinico_id} se cerrará. Después no admitirá nuevos registros.`,
          etiqueta: 'Emitir y cerrar',
          tono: 'normal',
          accion: emitir,
        })}
        disabled={!puedeEmitir}
        activeOpacity={interaccion.opacidadActiva}
      >
        {procesando ? <ActivityIndicator color={colores.textoInverso} /> : (
          <Text style={estilos.botonPrimarioTexto}>Emitir informe de alta y cerrar episodio</Text>
        )}
      </TouchableOpacity>
      {!cerrado && !umbral_alcanzado && !impedimento && (
        <Text style={estilos.notaBoton}>
          Para emitir el informe el paciente debe alcanzar el {umbral} % de sus metas. Actualiza las metas en la Sesión Clínica.
        </Text>
      )}

      {/* CU78: cierre del episodio sin informe */}
      {!cerrado && (
        <TouchableOpacity
          style={[estilos.botonSecundario, !puedeCerrar && estilos.deshabilitado]}
          onPress={() => setConfirmacion({
            titulo: 'Cerrar sin informe de alta',
            mensaje: `El episodio #${episodio.episodio_clinico_id} se cerrará sin emitir el informe (por ejemplo, por abandono del tratamiento). No admitirá nuevos registros.`,
            etiqueta: 'Cerrar episodio',
            tono: 'peligro',
            accion: cerrarSinInforme,
          })}
          disabled={!puedeCerrar}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.botonSecundarioTexto}>Cerrar sin informe de alta</Text>
        </TouchableOpacity>
      )}

      <DialogoConfirmacion
        visible={confirmacion !== null}
        titulo={confirmacion?.titulo || ''}
        mensaje={confirmacion?.mensaje}
        etiquetaConfirmar={confirmacion?.etiqueta || 'Confirmar'}
        tono={confirmacion?.tono}
        onConfirmar={() => {
          const accion = confirmacion?.accion;
          setConfirmacion(null);
          if (accion) accion();
        }}
        onCancelar={() => setConfirmacion(null)}
      />
      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => {
          const seguir = aviso?.alCerrar;
          setAviso(null);
          if (seguir) seguir();
        }}
      />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo },
  seccion: { ...tipografia.cuerpoFuerte, color: colores.primario, marginBottom: espacio.xs },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  ayuda: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.sm },

  barraFondo: { height: 10, borderRadius: radio.completo, backgroundColor: colores.superficieSuave, marginTop: espacio.xs },
  barraAvance: { height: 10, borderRadius: radio.completo, backgroundColor: colores.advertencia },
  barraOk: { backgroundColor: colores.primario },
  cifra: { ...tipografia.metaFuerte, marginTop: espacio.sm, marginBottom: espacio.sm },
  cifraOk: { color: colores.primario },
  cifraPendiente: { color: colores.advertencia },
  filaMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: espacio.sm, borderTopWidth: 1, borderTopColor: colores.bordeSuave, gap: espacio.md },
  metaTexto: { ...tipografia.cuerpo, color: colores.texto, flex: 1 },
  metaCifra: { ...tipografia.meta, color: colores.textoSuave },

  avisoInfo: { marginTop: espacio.md, padding: espacio.md, borderRadius: radio.md, backgroundColor: colores.infoSuave, borderWidth: 1, borderColor: colores.infoBorde },
  avisoInfoTexto: { ...tipografia.meta, color: colores.info },
  avisoAmbar: { marginTop: espacio.md, padding: espacio.md, borderRadius: radio.md, backgroundColor: colores.advertenciaSuave, borderWidth: 1, borderColor: colores.advertenciaBorde },
  avisoAmbarTitulo: { ...tipografia.metaFuerte, color: colores.advertencia, marginBottom: 2 },
  avisoAmbarTexto: { ...tipografia.meta, color: colores.textoSuave },
  avisoError: { marginTop: espacio.sm, padding: espacio.md, borderRadius: radio.md, backgroundColor: colores.errorSuave, borderWidth: 1, borderColor: colores.errorBorde },
  avisoErrorTitulo: { ...tipografia.metaFuerte, color: colores.error, marginBottom: 2 },
  avisoErrorTexto: { ...tipografia.meta, color: colores.texto },

  campo: { ...piezas.campo, minHeight: 120, textAlignVertical: 'top', marginTop: espacio.xs },
  campoBloqueado: { backgroundColor: colores.superficieSuave, color: colores.textoSuave },
  contador: { ...tipografia.micro, color: colores.textoTenue, textAlign: 'right', marginTop: 4, letterSpacing: 0 },
  contadorTope: { color: colores.advertencia },

  botonPrimario: { ...piezas.botonPrimario, marginTop: espacio.sm },
  botonPrimarioTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  notaBoton: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.sm },
  botonSecundario: { ...piezas.botonSecundario, borderColor: colores.error, marginTop: espacio.lg },
  botonSecundarioTexto: { ...tipografia.cuerpoFuerte, color: colores.error },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },
});
