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

import apiClient, { getMiDerivacion } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import VistaConTeclado from '../../components/VistaConTeclado';
import { formatearFecha } from '../../utils/fechas';
import { colores, espacio, radio, tipografia, piezas } from '../../theme';
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
        // "FIN TRIAJE" es un marcador interno (la ficha lo usa para separar
        // el bloque del triaje); al paciente no le dice nada.
        if (/^FIN TRIAJE$/i.test(limpio)) return null;
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
  // CU26: a qué especialidad orienta la entrevista recién completada.
  const [derivacion, setDerivacion] = useState(null);
  const [fase, setFase] = useState('cargando');
  const [disclaimer, setDisclaimer] = useState(null);
  const [arbol, setArbol] = useState(null);
  const [nodoActual, setNodoActual] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [entradaTexto, setEntradaTexto] = useState('');
  // Al volver atrás, la opción que se había elegido queda marcada.
  const [respuestaPrevia, setRespuestaPrevia] = useState(null);
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
        const vigente = await getMiDerivacion().catch(() => null);
        setDerivacion(vigente?.hay_triaje ? vigente.derivacion || null : null);
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
    setRespuestaPrevia(null);

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

  /** Preguntas ya respondidas que llevan hasta `destino`, en orden. */
  const caminoHasta = (datosArbol, previas, destino) => {
    const camino = [];
    const vistos = new Set();
    let cursor = datosArbol.inicio;
    while (cursor && cursor !== 'FIN' && cursor !== destino && !vistos.has(cursor)) {
      vistos.add(cursor);
      const nodo = datosArbol.nodos[cursor];
      if (!nodo || !(nodo.id in previas)) break;
      camino.push(cursor);
      cursor =
        nodo.tipo === 'opciones'
          ? nodo.opciones.find((o) => o.valor === previas[nodo.id])?.siguiente
          : nodo.siguiente;
    }
    return camino;
  };

  // ── Volver a la pregunta anterior ──────────────────────────────────────────
  // Se reabre la pregunta previa con su respuesta a la vista (en las de texto
  // o número queda escrita para corregirla). Se descartan esa respuesta y las
  // que venían después: al cambiarla, el camino del árbol puede ser otro.
  const volverAtras = () => {
    const camino = caminoHasta(arbol, respuestasRef.current, nodoActual);
    if (camino.length === 0) return;
    const anterior = camino[camino.length - 1];
    const nodoAnterior = arbol.nodos[anterior];
    const respuestaAnterior = respuestasRef.current[nodoAnterior.id];

    const conservadas = {};
    camino.slice(0, -1).forEach((clave) => {
      const id = arbol.nodos[clave].id;
      conservadas[id] = respuestasRef.current[id];
    });
    respuestasRef.current = conservadas;
    setRespuestas(conservadas);
    apiClient.put('/clinica/triaje/respuestas', { respuestas: conservadas }).catch(() => {});

    setEntradaTexto(
      nodoAnterior.tipo !== 'opciones' && respuestaAnterior != null ? String(respuestaAnterior) : ''
    );
    setRespuestaPrevia(nodoAnterior.tipo === 'opciones' ? respuestaAnterior : null);
    setNodoActual(anterior);
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
      // CU26: la sugerencia de especialidad sale del mismo análisis que el
      // reporte pre-clínico, y se muestra al cerrar la entrevista.
      setDerivacion(data?.derivacion || null);
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
  // CU26 — Sugerencia de derivación por especialidad clínica: aparece al
  // terminar la entrevista y queda a la vista mientras siga vigente.
  const tarjetaDerivacion = derivacion ? (
    <View style={estilos.tarjetaDerivacion}>
      <Text style={estilos.derivacionTitulo}>
        {derivacion.general
          ? '🧭 Tu entrevista no apunta a una especialidad concreta'
          : `🎯 Te sugerimos ${derivacion.nombre}`}
      </Text>
      <Text style={estilos.derivacionTexto}>
        {derivacion.general
          ? 'Contáctate con nosotros para poder guiarte hacia el profesional adecuado.'
          : derivacion.disponible_en_comuna
            ? `Es la especialidad que mejor calza con tu motivo de consulta, y hay profesionales que atienden a domicilio en ${derivacion.comuna || 'tu comuna'}.`
            : derivacion.disponible_online
              ? 'Es la especialidad que mejor calza con tu motivo de consulta. En tu comuna no hay atención a domicilio, pero sí teleconsulta.'
              : 'Es la especialidad que mejor calza con tu motivo de consulta, pero por ahora no tenemos profesionales disponibles para tu comuna.'}
      </Text>
      {derivacion.alternativas?.length > 0 && (
        <Text style={estilos.derivacionAlternativas}>
          Disponibles ahora: {derivacion.alternativas.map((a) => a.nombre).join(', ')}.
        </Text>
      )}
      {/* Sin especialidad clara, el paso útil es hablar con el equipo. */}
      <TouchableOpacity
        style={estilos.botonDerivacion}
        onPress={() => navigation.navigate(derivacion.general ? 'Soporte' : 'BuscarCita')}
      >
        <Text style={estilos.botonDerivacionTexto}>
          {derivacion.general ? 'Contactarnos' : 'Buscar hora ahora'}
        </Text>
      </TouchableOpacity>
    </View>
  ) : null;


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
      <VistaConTeclado style={estilos.fondo} contentContainerStyle={[estilos.contenido, estilos.contenidoCentrado]}>
        <Text style={estilos.iconoGrande}>✅</Text>
        <Text style={estilos.tituloCentrado}>Ya completaste tu entrevista</Text>
        <Text style={estilos.textoCentrado}>
          Tus respuestas fueron integradas a tu ficha clínica
          {fechaCompletado
            ? ` el ${formatearFecha(fechaCompletado)}`
            : ''}.
          Tu profesional las revisará en la consulta.
        </Text>
        {tarjetaDerivacion}
        <TouchableOpacity
          style={[estilos.botonPrimario, procesando && estilos.deshabilitado]}
          onPress={rehacerTriaje}
          disabled={procesando}
        >
          <Text style={estilos.botonPrimarioTexto}>Responder una nueva entrevista</Text>
        </TouchableOpacity>
      </VistaConTeclado>
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
        {tarjetaDerivacion}

        {/* La pestaña queda en "entrevista completada" (con la sugerencia) para
            cuando el paciente vuelva a ella. */}
        <TouchableOpacity
          style={estilos.botonPrimario}
          onPress={() => {
            iniciar();
            navigation.goBack();
          }}
        >
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
            style={[estilos.opcion, opcion.valor === respuestaPrevia && estilos.opcionElegida]}
            onPress={() => responder(opcion.valor)}
          >
            <Text style={estilos.opcionTexto}>
              {opcion.valor === respuestaPrevia ? '✓  ' : ''}
              {opcion.etiqueta}
            </Text>
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

      {caminoHasta(arbol, respuestas, nodoActual).length > 0 && (
        <TouchableOpacity
          style={estilos.botonAtras}
          onPress={volverAtras}
          accessibilityRole="button"
        >
          <Text style={estilos.botonAtrasTexto}>‹  Pregunta anterior</Text>
        </TouchableOpacity>
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
  contenidoCentrado: { flexGrow: 1, justifyContent: 'center' },

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

  // CU26 — la orientación por especialidad, al cerrar la entrevista.
  tarjetaDerivacion: {
    ...piezas.tarjeta,
    width: '100%',
    backgroundColor: colores.secundarioSuave,
    borderColor: colores.secundarioBorde,
    marginBottom: espacio.base,
  },
  derivacionTitulo: { ...tipografia.cuerpoFuerte, color: colores.secundarioFuerte },
  derivacionTexto: { ...tipografia.meta, color: colores.texto, marginTop: espacio.xs },
  derivacionAlternativas: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm },
  botonDerivacion: {
    marginTop: espacio.md,
    borderWidth: 1.5,
    borderColor: colores.secundarioFuerte,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonDerivacionTexto: { ...tipografia.cuerpoFuerte, color: colores.secundarioFuerte },

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
  // Misma fuente en ambos estados: en Android cambiar el grosor del texto de
  // una opción marcada lo hace desaparecer.
  opcionElegida: { backgroundColor: colores.primarioSuave, borderWidth: 2, padding: 15 },
  opcionTexto: { color: colores.primario, fontWeight: '600', fontSize: 15 },
  // Relleno con el azul de la marca.
  botonAtras: { ...piezas.botonPrimario, marginTop: espacio.md },
  botonAtrasTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
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
