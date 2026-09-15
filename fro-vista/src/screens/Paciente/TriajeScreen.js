// Ruta: fro-vista/src/screens/Paciente/TriajeScreen.js
//
// CU27 → CU23 → CU24 en un solo flujo:
// 1. Disclaimer legal (aceptar habilita; rechazar devuelve al inicio).
// 2. Entrevista guiada por el árbol de decisión (cada respuesta se guarda,
//    así que cerrar la app no pierde el avance).
// 3. Al terminar, las respuestas se estructuran y quedan en la ficha clínica.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';

import apiClient from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import VistaConTeclado from '../../components/VistaConTeclado';
import { formatearFecha } from '../../utils/fechas';
import { colores, espacio, radio, tipografia } from '../../theme';
import DialogoAviso from '../../components/DialogoAviso';

/**
 * El servidor devuelve el resumen como un bloque de texto plano. Aquí se
 * separa en piezas para pintarlo legible: encabezados de sección, pares
 * "etiqueta: valor" y líneas sueltas. Antes se mostraba tal cual, en
 * monoespaciada, y parecía un archivo de registro más que la ficha del
 * paciente.
 */
function desglosarResumen(texto) {
  return String(texto || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      // "── TRIAJE AUTOMATIZADO (05/09/2026) ──" y sus cierres.
      if (/^─+/.test(linea) || /^──/.test(linea)) {
        const limpio = linea.replace(/[─-]/g, '').trim();
        return limpio ? { tipo: 'encabezado', texto: limpio } : null;
      }
      const corte = linea.indexOf(':');
      if (corte > 0 && corte < 60) {
        const valor = linea.slice(corte + 1).trim().replace(/\.$/, '');
        // "Sección:" sin valor es un subtítulo, no un dato vacío.
        if (!valor) return { tipo: 'encabezado', texto: linea.slice(0, corte).trim() };
        return { tipo: 'dato', etiqueta: linea.slice(0, corte).trim().replace(/^-\s*/, ''), valor };
      }
      return { tipo: 'suelto', texto: linea.replace(/^-\s*/, '• ') };
    })
    .filter(Boolean);
}

export default function TriajeScreen({ navigation }) {
  // fase: 'cargando' | 'error' | 'disclaimer' | 'entrevista' | 'completado' | 'resumen'
  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).
  const [aviso, setAviso] = useState(null);
  const [fase, setFase] = useState('cargando');
  const [disclaimer, setDisclaimer] = useState(null);
  const [arbol, setArbol] = useState(null);
  const [nodoActual, setNodoActual] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [entradaTexto, setEntradaTexto] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [fechaCompletado, setFechaCompletado] = useState(null);
  const [vistaPrevia, setVistaPrevia] = useState('');
  const respuestasRef = useRef({});

  // ── Arranque: estado del ciclo ─────────────────────────────────────────────
  const iniciar = async () => {
    setFase('cargando');
    try {
      const { data } = await apiClient.get('/clinica/triaje/estado');

      if (data.triaje?.estado === 'COMPLETADO') {
        setFechaCompletado(data.triaje.momento_completado);
        setFase('completado');
        return;
      }

      // Recuperar avance parcial si lo hay (Exc.3 del CU23).
      const previas = data.triaje?.respuestas || {};
      setRespuestas(previas);
      respuestasRef.current = previas;

      if (!data.disclaimer_aceptado) {
        const respuesta = await apiClient.get('/clinica/triaje/disclaimer');
        setDisclaimer(respuesta.data);
        setFase('disclaimer');
        return;
      }

      await cargarArbol(previas);
    } catch {
      // CU27 Exc.1 / CU23 Exc.2: sin texto legal o sin reglas, se bloquea.
      setFase('error');
    }
  };

  useEffect(() => {
    iniciar();
  }, []);

  const cargarArbol = async (previas) => {
    const { data } = await apiClient.get('/clinica/triaje/arbol');
    setArbol(data);
    setNodoActual(reanudarDesde(data, previas));
    setFase('entrevista');
  };

  /** Avanza por el árbol siguiendo las respuestas ya guardadas. */
  const reanudarDesde = (datosArbol, previas) => {
    let cursor = datosArbol.inicio;
    while (cursor && cursor !== 'FIN') {
      const nodo = datosArbol.nodos[cursor];
      if (!nodo || !(nodo.id in previas)) return cursor;

      if (nodo.tipo === 'opciones') {
        const opcion = nodo.opciones.find((o) => o.valor === previas[nodo.id]);
        cursor = opcion ? opcion.siguiente : cursor;
        if (!opcion) return cursor;
      } else {
        cursor = nodo.siguiente;
      }
    }
    return cursor; // 'FIN' si todo estaba respondido
  };

  // ── CU27: aceptación / rechazo ─────────────────────────────────────────────
  const aceptarDisclaimer = async () => {
    setProcesando(true);
    try {
      await apiClient.post('/clinica/triaje/disclaimer/aceptar');
      await cargarArbol(respuestasRef.current);
    } catch (err) {
      // Exc.3: sin marca temporal no se habilita el triaje.
      setAviso({ tono: 'error', titulo: 'No se pudo registrar', mensaje: err.response?.data?.mensaje || 'Tu consentimiento no quedó registrado. Intenta nuevamente.' });
    } finally {
      setProcesando(false);
    }
  };

  const rechazarDisclaimer = () => {
    // Exc.2: el rechazo bloquea la herramienta y devuelve al inicio.
    Alert.alert(
      'Entrevista no disponible',
      'Sin tu consentimiento no podemos usar la entrevista automatizada. Tu profesional tomará tus datos directamente en la consulta.',
      [{ text: 'Entendido', onPress: () => navigation.goBack() }]
    );
  };

  // ── CU23: responder y avanzar ──────────────────────────────────────────────
  const responder = async (valor) => {
    const nodo = arbol.nodos[nodoActual];
    const valorLimpio = typeof valor === 'string' ? valor.trim() : valor;

    if (nodo.tipo !== 'opciones' && !String(valorLimpio).length) {
      setAviso({ tono: 'error', titulo: 'Respuesta vacía', mensaje: 'Escribe una respuesta para continuar.' });
      return;
    }
    if (nodo.tipo === 'numero') {
      const numero = Number(valorLimpio);
      if (!Number.isFinite(numero) || numero < (nodo.minimo ?? 0) || numero > (nodo.maximo ?? 999)) {
        setAviso({ tono: 'info', titulo: 'Valor fuera de rango', mensaje: `Ingresa un número entre ${nodo.minimo} y ${nodo.maximo}.` });
        return;
      }
    }

    const nuevas = { ...respuestasRef.current, [nodo.id]: valorLimpio };
    respuestasRef.current = nuevas;
    setRespuestas(nuevas);
    setEntradaTexto('');

    // Guardado parcial silencioso: si falla, la entrevista continúa igual y
    // el próximo guardado lo reintenta (Exc.4 del CU23).
    apiClient.put('/clinica/triaje/respuestas', { respuestas: nuevas }).catch(() => {});

    const siguiente =
      nodo.tipo === 'opciones'
        ? nodo.opciones.find((o) => o.valor === valorLimpio)?.siguiente
        : nodo.siguiente;

    if (siguiente === 'FIN') {
      completar(nuevas);
    } else {
      setNodoActual(siguiente);
    }
  };

  // ── CU24: completar e integrar ─────────────────────────────────────────────
  const completar = async (finales) => {
    setProcesando(true);
    setFase('cargando');
    try {
      const { data } = await apiClient.post('/clinica/triaje/completar', {
        respuestas: finales,
      });
      setVistaPrevia(data?.vista_previa || '');
      setFase('resumen');
    } catch (err) {
      const respuesta = err.response?.data;
      Alert.alert(
        'No se pudo integrar',
        respuesta?.mensaje || 'Tus respuestas siguen guardadas. Reintenta en unos minutos.',
        [
          { text: 'Reintentar', onPress: () => completar(finales) },
          { text: 'Salir', onPress: () => navigation.goBack() },
        ]
      );
      setFase('entrevista');
    } finally {
      setProcesando(false);
    }
  };

  // ── CU27: un ciclo nuevo exige aceptar de nuevo ────────────────────────────
  const rehacerTriaje = async () => {
    setProcesando(true);
    try {
      const respuesta = await apiClient.get('/clinica/triaje/disclaimer');
      setDisclaimer(respuesta.data);
      respuestasRef.current = {};
      setRespuestas({});
      setFase('disclaimer');
    } catch {
      setAviso({ tono: 'error', titulo: 'Error', mensaje: 'No se pudo iniciar una nueva entrevista.' });
    } finally {
      setProcesando(false);
    }
  };

  // ── Render por fase ────────────────────────────────────────────────────────

  if (fase === 'cargando') {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (fase === 'error') {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry
          mensaje="No se pudo cargar la entrevista. Sin sus reglas no es posible continuar."
          onRetry={iniciar}
        />
      </View>
    );
  }

  if (fase === 'disclaimer') {
    return (
      <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
        <Text style={estilos.titulo}>Antes de comenzar</Text>
        <View style={estilos.tarjetaLegal}>
          <Text style={estilos.textoLegal}>{disclaimer?.texto}</Text>
          <Text style={estilos.versionLegal}>Versión {disclaimer?.version}</Text>
        </View>
        <TouchableOpacity
          style={[estilos.botonPrimario, procesando && estilos.deshabilitado]}
          onPress={aceptarDisclaimer}
          disabled={procesando}
        >
          {procesando ? (
            <ActivityIndicator color={colores.superficie} />
          ) : (
            <Text style={estilos.botonPrimarioTexto}>Acepto y quiero continuar</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={rechazarDisclaimer} disabled={procesando}>
          <Text style={estilos.enlaceRechazo}>No acepto</Text>
        </TouchableOpacity>
      </VistaConTeclado>
    );
  }

  if (fase === 'completado') {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.iconoGrande}>✅</Text>
        <Text style={estilos.tituloCentrado}>Ya completaste tu entrevista</Text>
        <Text style={estilos.textoCentrado}>
          Tus respuestas fueron integradas a tu ficha clínica
          {fechaCompletado
            ? ` el ${formatearFecha(fechaCompletado)}`
            : ''}.
          Tu profesional las revisará en la consulta.
        </Text>
        <TouchableOpacity
          style={[estilos.botonPrimario, procesando && estilos.deshabilitado]}
          onPress={rehacerTriaje}
          disabled={procesando}
        >
          <Text style={estilos.botonPrimarioTexto}>Responder una nueva entrevista</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (fase === 'resumen') {
    return (
      <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
        <Text style={estilos.iconoGrande}>🩺</Text>
        <Text style={estilos.tituloCentrado}>¡Entrevista completada!</Text>
        <Text style={estilos.textoCentrado}>
          Esto es lo que quedó registrado en tu ficha clínica:
        </Text>
        <View style={estilos.tarjetaResumen}>
          {desglosarResumen(vistaPrevia).map((linea, i) =>
            linea.tipo === 'encabezado' ? (
              <Text key={i} style={estilos.resumenEncabezado}>{linea.texto}</Text>
            ) : linea.tipo === 'dato' ? (
              <View key={i} style={estilos.resumenFila}>
                <Text style={estilos.resumenEtiqueta}>{linea.etiqueta}</Text>
                <Text style={estilos.resumenValor}>{linea.valor}</Text>
              </View>
            ) : (
              <Text key={i} style={estilos.resumenSuelto}>{linea.texto}</Text>
            )
          )}
        </View>
        <TouchableOpacity style={estilos.botonPrimario} onPress={() => navigation.goBack()}>
          <Text style={estilos.botonPrimarioTexto}>Volver al inicio</Text>
        </TouchableOpacity>
      </VistaConTeclado>
    );
  }

  // fase === 'entrevista'
  const nodo = arbol?.nodos?.[nodoActual];
  if (!nodo) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="La entrevista quedó en un estado inesperado." onRetry={iniciar} />
      </View>
    );
  }

  const totalRespondidas = Object.keys(respuestas).length;

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.progreso}>Pregunta {totalRespondidas + 1}</Text>
      <Text style={estilos.pregunta}>{nodo.pregunta}</Text>

      {nodo.tipo === 'opciones' ? (
        nodo.opciones.map((opcion) => (
          <TouchableOpacity
            key={opcion.valor}
            style={estilos.opcion}
            onPress={() => responder(opcion.valor)}
          >
            <Text style={estilos.opcionTexto}>{opcion.etiqueta}</Text>
          </TouchableOpacity>
        ))
      ) : (
        <>
          <TextInput
            style={[estilos.entrada, nodo.tipo === 'texto' && estilos.entradaLarga]}
            placeholder={nodo.tipo === 'numero' ? `${nodo.minimo} a ${nodo.maximo}` : 'Escribe tu respuesta…'}
            keyboardType={nodo.tipo === 'numero' ? 'numeric' : 'default'}
            multiline={nodo.tipo === 'texto'}
            value={entradaTexto}
            onChangeText={setEntradaTexto}
          />
          <TouchableOpacity style={estilos.botonPrimario} onPress={() => responder(entradaTexto)}>
            <Text style={estilos.botonPrimarioTexto}>Continuar</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={estilos.notaAvance}>
        Tu avance se guarda automáticamente: puedes salir y retomar cuando quieras.
      </Text>
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
  contenido: { padding: 20, paddingBottom: 40 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  titulo: { fontSize: 22, fontWeight: 'bold', color: colores.primario, marginBottom: 14 },
  tarjetaLegal: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 18,
    marginBottom: 18,
  },
  textoLegal: { color: colores.texto, lineHeight: 21 },
  versionLegal: { color: colores.textoTenue, fontSize: 13, marginTop: 12, textAlign: 'right' },
  enlaceRechazo: { color: colores.error, textAlign: 'center', marginTop: 14, fontWeight: '600' },

  iconoGrande: { fontSize: 52, marginBottom: 10, textAlign: 'center' },
  tituloCentrado: { fontSize: 22, fontWeight: 'bold', color: colores.primario, textAlign: 'center', marginBottom: 8 },
  textoCentrado: { color: colores.textoSuave, textAlign: 'center', marginBottom: 18, lineHeight: 20 },

  tarjetaResumen: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.exitoBorde,
    padding: 16,
    marginBottom: 18,
  },
  resumenEncabezado: {
    ...tipografia.micro,
    color: colores.primario,
    marginBottom: espacio.md,
    marginTop: espacio.xs,
  },
  resumenFila: {
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
    paddingVertical: espacio.md,
  },
  resumenEtiqueta: { ...tipografia.meta, color: colores.textoSuave, marginBottom: 2 },
  resumenValor: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  resumenSuelto: {
    ...tipografia.meta,
    color: colores.textoSuave,
    marginTop: espacio.sm,
    lineHeight: 20,
  },

  progreso: { color: colores.primario, fontWeight: 'bold', fontSize: 13, marginBottom: 6 },
  pregunta: { fontSize: 22, fontWeight: 'bold', color: colores.texto, marginBottom: 18, lineHeight: 26 },
  opcion: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.primario,
    borderRadius: radio.md,
    padding: 16,
    marginBottom: 10,
  },
  opcionTexto: { color: colores.primario, fontWeight: '600', fontSize: 15 },
  entrada: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.md,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  entradaLarga: { minHeight: 100, textAlignVertical: 'top' },

  botonPrimario: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    padding: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  botonPrimarioTexto: { color: colores.superficie, fontWeight: 'bold', fontSize: 15 },
  deshabilitado: { opacity: 0.6 },
  notaAvance: { color: colores.textoTenue, fontSize: 13, textAlign: 'center', marginTop: 16 },
});
