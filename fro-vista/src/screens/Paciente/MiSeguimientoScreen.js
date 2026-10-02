// Ruta: fro-vista/src/screens/Paciente/MiSeguimientoScreen.js
//
// CU50 — El paciente reporta cómo va entre sesiones: dolor y limitación
// funcional en escala de 0 a 10, más un comentario opcional. El sistema compara
// el reporte con sus umbrales y con el anterior; si detecta deterioro, levanta
// una bandera roja en el panel de su profesional tratante.
//
// El envío es a prueba de cortes (Excepciones 3 y 4): antes de salir a la red,
// el reporte se guarda en el teléfono con una clave propia. Si la app se cierra
// o no hay señal, queda pendiente y se reenvía solo al volver a esta pantalla;
// la clave impide que el mismo reporte se registre dos veces.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { enviarReporteSintomas, getMisSintomas } from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import DialogoAviso from '../../components/DialogoAviso';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const CLAVE_PENDIENTE = 'cu50_reporte_pendiente';
// Dos filas (0–5 y 6–10) para que cada botón sea grande y fácil de tocar.
const FILAS_NIVELES = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
];

/** Identificador único del envío: es lo que evita reportes duplicados. */
function nuevaClave() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Color de la escala: verde abajo, ámbar al medio, rojo arriba. */
function colorNivel(valor) {
  if (valor >= 8) return colores.error;
  if (valor >= 5) return colores.advertencia;
  return colores.exito;
}

export default function MiSeguimientoScreen() {
  const [dolor, setDolor] = useState(null);
  const [limitacion, setLimitacion] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [errores, setErrores] = useState([]);

  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargarHistorial = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    try {
      const { reportes } = await getMisSintomas();
      setHistorial(reportes || []);
    } catch {
      setHistorial([]);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  /** Excepción 4: lo que quedó guardado en el teléfono se reenvía solo. */
  const reenviarPendiente = useCallback(async () => {
    try {
      const guardado = await SecureStore.getItemAsync(CLAVE_PENDIENTE);
      if (!guardado) return;
      const pendiente = JSON.parse(guardado);
      await enviarReporteSintomas(pendiente);
      await SecureStore.deleteItemAsync(CLAVE_PENDIENTE);
      setAviso({
        tono: 'ok',
        titulo: 'Reporte enviado',
        mensaje: 'El reporte que había quedado pendiente en tu teléfono ya se registró.',
      });
      await cargarHistorial(true);
    } catch {
      // Sigue sin señal: queda guardado para el próximo intento.
    }
  }, [cargarHistorial]);

  useEffect(() => {
    cargarHistorial();
    reenviarPendiente();
  }, [cargarHistorial, reenviarPendiente]);

  const enviar = async () => {
    // Excepción 1: sin las dos métricas no se envía nada, y se dice cuáles
    // faltan en vez de un error genérico.
    const faltantes = [];
    if (dolor === null) faltantes.push('dolor');
    if (limitacion === null) faltantes.push('limitacion');
    setErrores(faltantes);
    if (faltantes.length > 0) {
      setAviso({
        tono: 'info',
        titulo: 'Faltan datos',
        mensaje: 'Marca tu nivel de dolor y tu limitación para moverte antes de enviar.',
      });
      return;
    }

    const reporte = {
      nivel_dolor: dolor,
      limitacion_funcional: limitacion,
      comentario: comentario.trim(),
      clave_envio: nuevaClave(),
    };

    // Excepción 3: si la app se cierra antes del acuse de recibo, el reporte no
    // se pierde: ya quedó en el teléfono y se reenvía al volver.
    await SecureStore.setItemAsync(CLAVE_PENDIENTE, JSON.stringify(reporte)).catch(() => {});

    setEnviando(true);
    try {
      const datos = await enviarReporteSintomas(reporte);
      await SecureStore.deleteItemAsync(CLAVE_PENDIENTE).catch(() => {});

      setAviso({
        tono: datos.clasificacion === 'RIESGO_CRITICO' ? 'alerta' : 'ok',
        titulo: datos.clasificacion === 'RIESGO_CRITICO' ? 'Avisamos a tu profesional' : 'Reporte registrado',
        mensaje: datos.mensaje,
      });
      setDolor(null);
      setLimitacion(null);
      setComentario('');
      await cargarHistorial(true);
    } catch (error) {
      const respuesta = error.response?.data;
      if (respuesta?.campos) {
        setErrores(respuesta.campos);
      }
      setAviso({
        tono: 'error',
        titulo: 'No se pudo enviar',
        mensaje:
          respuesta?.mensaje ||
          'Tu reporte quedó guardado en el teléfono y se enviará solo cuando vuelvas a esta pantalla con señal.',
      });
    } finally {
      setEnviando(false);
    }
  };

  const Escala = ({ titulo, ayuda, valor, alElegir, conError }) => (
    <View style={[estilos.tarjeta, conError && estilos.tarjetaError]}>
      <Text style={estilos.etiqueta}>{titulo}</Text>
      <Text style={estilos.ayuda}>{ayuda}</Text>
      {FILAS_NIVELES.map((fila) => (
        <View key={fila[0]} style={estilos.escala}>
          {fila.map((n) => {
            const elegido = valor === n;
            return (
              <TouchableOpacity
                key={n}
                style={[
                  estilos.nivel,
                  elegido && { backgroundColor: colorNivel(n), borderColor: colorNivel(n) },
                ]}
                onPress={() => alElegir(n)}
                activeOpacity={interaccion.opacidadActiva}
                accessibilityRole="button"
                accessibilityLabel={`Nivel ${n}`}
                accessibilityState={{ selected: elegido }}
              >
                <Text style={[estilos.nivelTexto, elegido && estilos.nivelTextoElegido]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <View style={estilos.filaExtremos}>
        <Text style={estilos.extremo}>0 · nada</Text>
        <Text style={estilos.extremo}>10 · lo peor</Text>
      </View>
    </View>
  );

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.intro}>
        Cuéntanos cómo has estado desde tu última sesión. Tu profesional lo ve en tu ficha
        y, si algo empeora, le avisamos de inmediato.
      </Text>

      <Escala
        titulo="¿Cuánto dolor tienes hoy?"
        ayuda="Piensa en el promedio del día, no en el peor momento."
        valor={dolor}
        alElegir={setDolor}
        conError={errores.includes('dolor') || errores.includes('nivel_dolor')}
      />

      <Escala
        titulo="¿Cuánto te limita para moverte?"
        ayuda="0 si haces tu vida normal, 10 si no puedes hacer casi nada."
        valor={limitacion}
        alElegir={setLimitacion}
        conError={errores.includes('limitacion') || errores.includes('limitacion_funcional')}
      />

      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>¿Algo que quieras contarle a tu profesional?</Text>
        <TextInput
          style={estilos.campo}
          placeholder="Opcional: qué te costó más, qué te alivió, cómo dormiste…"
          placeholderTextColor={colores.textoTenue}
          multiline
          value={comentario}
          onChangeText={setComentario}
          maxLength={500}
        />
      </View>

      <TouchableOpacity
        style={[estilos.botonEnviar, enviando && estilos.deshabilitado]}
        onPress={enviar}
        disabled={enviando}
        activeOpacity={interaccion.opacidadActiva}
      >
        {enviando ? (
          <ActivityIndicator color={colores.textoInverso} />
        ) : (
          <Text style={estilos.botonEnviarTexto}>Enviar mi reporte</Text>
        )}
      </TouchableOpacity>

      <Text style={estilos.seccion}>Mis reportes anteriores</Text>

      {cargando ? (
        <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.lg }} />
      ) : historial.length === 0 ? (
        <Text style={estilos.vacio}>
          Todavía no has enviado reportes. El primero marca tu punto de partida.
        </Text>
      ) : (
        historial.map((r) => (
          <View key={r.reporte_sintoma_id} style={estilos.tarjetaHistorial}>
            <Text style={estilos.historialFecha}>{formatearFechaHora(r.momento_registro)}</Text>
            <View style={estilos.filaMetricas}>
              <View style={[estilos.pastilla, { backgroundColor: colorNivel(r.nivel_dolor) }]}>
                <Text style={estilos.pastillaTexto}>Dolor {r.nivel_dolor}</Text>
              </View>
              <View style={[estilos.pastilla, { backgroundColor: colorNivel(r.limitacion_funcional) }]}>
                <Text style={estilos.pastillaTexto}>Limitación {r.limitacion_funcional}</Text>
              </View>
            </View>
            {r.comentario ? <Text style={estilos.historialComentario}>{r.comentario}</Text> : null}
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
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  tarjetaError: { borderColor: colores.error },
  etiqueta: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  ayuda: { ...tipografia.meta, color: colores.textoTenue, marginTop: 2, marginBottom: espacio.md },

  // Dos filas centradas con botones del mismo tamaño (0–5 arriba, 6–10 abajo).
  escala: { flexDirection: 'row', justifyContent: 'center', gap: espacio.sm, marginBottom: espacio.sm },
  nivel: {
    width: '14%',
    aspectRatio: 1,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nivelTexto: { ...tipografia.subtitulo, color: colores.textoSuave, fontWeight: '600' },
  nivelTextoElegido: { color: colores.textoInverso },
  filaExtremos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espacio.sm },
  extremo: { ...tipografia.micro, color: colores.textoTenue },

  campo: { ...piezas.campo, minHeight: 90, textAlignVertical: 'top', marginTop: espacio.sm },

  botonEnviar: { ...piezas.botonPrimario, alignItems: 'center', marginTop: espacio.sm },
  botonEnviarTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.6 },

  seccion: { ...tipografia.subtitulo, color: colores.textoTitulo, marginTop: espacio.xl, marginBottom: espacio.md },
  vacio: { ...tipografia.meta, color: colores.textoTenue },

  tarjetaHistorial: { ...piezas.tarjeta, marginBottom: espacio.md },
  historialFecha: { ...tipografia.metaFuerte, color: colores.textoTitulo },
  filaMetricas: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.sm },
  pastilla: { paddingVertical: 4, paddingHorizontal: espacio.md, borderRadius: radio.completo },
  pastillaTexto: { ...tipografia.micro, color: colores.textoInverso },
  historialComentario: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm },
});
