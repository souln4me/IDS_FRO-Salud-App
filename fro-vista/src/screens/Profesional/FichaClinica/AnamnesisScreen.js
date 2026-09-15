import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import apiClient, { getFichaClinica, guardarAnamnesis } from '../../../api/client';
import VistaConTeclado from '../../../components/VistaConTeclado';
import { colores, espacio, piezas, radio, tipografia } from '../../../theme';
import DialogoAviso from '../../../components/DialogoAviso';

// CU77: el bloque estructurado de la evaluación viaja dentro de la anamnesis
// delimitado por estas marcas, para poder reconstruir los campos al cargar.
const MARCA_INICIO = '═══ EVALUACIÓN ESTRUCTURADA ═══';
const MARCA_FIN = '═══ FIN EVALUACIÓN ═══';

const claveBorrador = (pacienteId) => `cu77_borrador_${pacienteId}`;

// CU24: el triaje del paciente se anexa a la anamnesis entre estas marcas.
// Antes quedaba mezclado dentro del cuadro de texto editable y se leía como
// un bloque confuso; ahora se separa y se muestra como tarjeta de lectura.
const TRIAJE_INICIO = '── TRIAJE AUTOMATIZADO';
const TRIAJE_FIN = '── FIN TRIAJE ──';

/** Extrae los bloques de triaje del texto y devuelve el resto editable. */
function separarTriajes(texto) {
  const bloques = [];
  let resto = texto;
  for (;;) {
    const inicio = resto.indexOf(TRIAJE_INICIO);
    if (inicio === -1) break;
    const fin = resto.indexOf(TRIAJE_FIN, inicio);
    if (fin === -1) break;
    bloques.push(resto.slice(inicio, fin + TRIAJE_FIN.length).trim());
    resto = (resto.slice(0, inicio) + resto.slice(fin + TRIAJE_FIN.length)).trim();
  }
  return { bloques, resto };
}

/** Líneas legibles de un bloque de triaje (sin las marcas). */
function lineasDeTriaje(bloque) {
  return bloque
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(TRIAJE_INICIO) && l !== TRIAJE_FIN);
}

/** Fecha del bloque, si el encabezado la trae: "── TRIAJE AUTOMATIZADO (05/09/2026) ──" */
function fechaDeTriaje(bloque) {
  return bloque.match(/\(([^)]+)\)/)?.[1] || '';
}

// Valores del triaje que corresponden a campos de la plantilla de evaluación.
// Solo se proponen si el campo está vacío; el profesional siempre puede
// corregirlos.
const PRELLENADO_DESDE_TRIAJE = [
  { campoId: 'dolor_eva', prefijo: 'Intensidad reportada: ', limpiar: (v) => v.replace('/10', '').replace('.', '').trim() },
  { campoId: 'habitos', prefijo: 'Hábitos alimentarios declarados: ', limpiar: (v) => v.replace(/\.$/, '').trim() },
];

/** Separa el bloque estructurado del texto libre de la anamnesis. */
function separarBloque(texto) {
  const inicio = texto.indexOf(MARCA_INICIO);
  const fin = texto.indexOf(MARCA_FIN);
  if (inicio === -1 || fin === -1 || fin < inicio) {
    return { lineasBloque: [], libre: texto };
  }
  const dentro = texto.slice(inicio + MARCA_INICIO.length, fin).trim();
  const libre = (texto.slice(0, inicio) + texto.slice(fin + MARCA_FIN.length)).trim();
  return { lineasBloque: dentro.split('\n').filter(Boolean), libre };
}

const LIMITE_ANAMNESIS = 2000;

export default function AnamnesisScreen({ route, navigation }) {
  const { pacienteId, nombrePaciente } = route.params;

  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).

  const [aviso, setAviso] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [version, setVersion] = useState(null);

  const [anamnesis, setAnamnesis] = useState('');
  const [plantillaEspecialidad, setPlantillaEspecialidad] = useState('');

  // CU77: plantilla dinámica según la especialidad del profesional
  const [plantilla, setPlantilla] = useState(null);
  const [sinEspecialidad, setSinEspecialidad] = useState(false);
  const [camposValores, setCamposValores] = useState({});
  const [erroresCampos, setErroresCampos] = useState({});

  // Listas representadas como texto separado por comas para edición simple
  // CU24: bloques de la entrevista previa (solo lectura, se conservan al guardar).
  const [bloquesTriaje, setBloquesTriaje] = useState([]);
  // Por defecto solo se muestra la entrevista más reciente: con varias,
  // la pantalla se volvía una pared de texto.
  const [verTodasLasEntrevistas, setVerTodasLasEntrevistas] = useState(false);

  const [alergiasTexto, setAlergiasTexto] = useState('');
  const [quirurgicosTexto, setQuirurgicosTexto] = useState('');
  const [patologicosTexto, setPatologicosTexto] = useState('');

  // ─ Excepción 2: campos obligatorios resaltados 
  const [errores, setErrores] = useState({});

  // ─ Excepción 1: aviso de truncado 
  const [avisoTruncado, setAvisoTruncado] = useState('');
  // Tras guardar, se indica el paso siguiente del flujo clínico.
  const [guardadaOk, setGuardadaOk] = useState(false);

  const cargarFicha = async () => {
    setCargando(true);
    try {
      // CU77: la estructura del formulario depende de la especialidad
      // acreditada del profesional (Excepción 2 si no la tiene).
      let plantillaCargada = null;
      try {
        const respuesta = await apiClient.get('/clinica/plantilla-evaluacion');
        plantillaCargada = respuesta.data;
        setPlantilla(plantillaCargada);
        setPlantillaEspecialidad(respuesta.data.especialidad);
      } catch (errorPlantilla) {
        if (errorPlantilla.response?.data?.error === 'SIN_ESPECIALIDAD') {
          setSinEspecialidad(true);
        }
      }

      const data = await getFichaClinica(pacienteId);

      // Reconstruir los campos estructurados desde la anamnesis guardada.
      const { lineasBloque, libre } = separarBloque(data.anamnesis || '');
      const valores = {};
      if (plantillaCargada) {
        for (const linea of lineasBloque) {
          const separador = linea.indexOf(':');
          if (separador === -1) continue;
          const etiqueta = linea.slice(0, separador).trim();
          const campo = plantillaCargada.campos.find((c) => c.etiqueta === etiqueta);
          if (campo) valores[campo.id] = linea.slice(separador + 1).trim();
        }
      }

      // CU24: separar la entrevista del paciente del texto libre del profesional.
      const { bloques, resto } = separarTriajes(libre);
      setBloquesTriaje(bloques);

      // Lo que el paciente ya contestó se propone en la plantilla (si el
      // campo existe para esta especialidad y está vacío).
      if (plantillaCargada && bloques.length > 0) {
        const lineasUltimo = lineasDeTriaje(bloques[bloques.length - 1]);
        for (const regla of PRELLENADO_DESDE_TRIAJE) {
          const existe = plantillaCargada.campos.some((c) => c.id === regla.campoId);
          if (!existe || String(valores[regla.campoId] || '').trim()) continue;
          const linea = lineasUltimo.find((l) => l.startsWith(regla.prefijo));
          if (linea) valores[regla.campoId] = regla.limpiar(linea.slice(regla.prefijo.length));
        }
      }

      setCamposValores(valores);
      setAnamnesis(resto);
      if (!plantillaCargada) setPlantillaEspecialidad(data.plantilla_especialidad || '');
      setAlergiasTexto((data.alergias || []).join(', '));
      setQuirurgicosTexto((data.antecedentes_quirurgicos || []).join(', '));
      setPatologicosTexto((data.antecedentes_patologicos || []).join(', '));
      setVersion(data.version);
      setGuardadaOk(true);

      // CU77 — Excepción 4: si quedó un borrador local de una caída de red,
      // se ofrece recuperarlo.
      const guardado = await SecureStore.getItemAsync(claveBorrador(pacienteId));
      if (guardado) {
        const borrador = JSON.parse(guardado);
        Alert.alert(
          'Borrador recuperado',
          'Hay una evaluación sin sincronizar guardada en este dispositivo. ¿Quieres recuperarla?',
          [
            { text: 'Descartar', onPress: () => SecureStore.deleteItemAsync(claveBorrador(pacienteId)) },
            {
              text: 'Recuperar',
              onPress: () => {
                setCamposValores(borrador.camposValores || {});
                setAnamnesis(borrador.anamnesis || '');
                setAlergiasTexto(borrador.alergiasTexto || '');
                setQuirurgicosTexto(borrador.quirurgicosTexto || '');
                setPatologicosTexto(borrador.patologicosTexto || '');
              },
            },
          ]
        );
      }
    } catch (error) {
      setAviso({ tono: 'error', titulo: 'Error', mensaje: 'No se pudo cargar la ficha clínica del paciente.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarFicha();
  }, []);

  // ─ Excepción 1: truncado en tiempo real 
  // El tope de 2000 es sobre el texto completo: lo que ocupa la entrevista del
  // paciente se descuenta del espacio libre para que nada se trunque al guardar.
  const textoTriaje = bloquesTriaje.join('\n\n');
  const limiteLibre = Math.max(200, LIMITE_ANAMNESIS - (textoTriaje ? textoTriaje.length + 2 : 0));

  const manejarCambioAnamnesis = (texto) => {
    if (texto.length > limiteLibre) {
      setAnamnesis(texto.slice(0, limiteLibre));
      setAvisoTruncado(`Se alcanzó el límite de ${limiteLibre} caracteres (la entrevista del paciente ocupa el resto).`);
    } else {
      setAnamnesis(texto);
      if (avisoTruncado) setAvisoTruncado('');
    }
    if (errores.anamnesis) setErrores({ ...errores, anamnesis: false });
  };

  const parsearLista = (texto) =>
    texto.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

  // ─ Excepción 2: validación de campos obligatorios 
  const validar = () => {
    const nuevosErrores = {};
    if (!anamnesis.trim()) nuevosErrores.anamnesis = true;
    if (!plantillaEspecialidad.trim()) nuevosErrores.plantillaEspecialidad = true;

    // CU77 — Excepción 3: los campos obligatorios de la plantilla se
    // resaltan en rojo si quedaron vacíos.
    const nuevosErroresCampos = {};
    for (const campo of plantilla?.campos || []) {
      if (campo.obligatorio && !String(camposValores[campo.id] || '').trim()) {
        nuevosErroresCampos[campo.id] = true;
      }
    }
    setErroresCampos(nuevosErroresCampos);

    setErrores(nuevosErrores);

    if (Object.keys(nuevosErrores).length > 0 || Object.keys(nuevosErroresCampos).length > 0) {
      setAviso({ tono: 'error', titulo: 'Campos incompletos', mensaje: 'Existen campos obligatorios sin completar. Revisa los bloques resaltados.' });
      return false;
    }
    return true;
  };

  // ─ Guardar (CU29 flujo principal) 
  const guardar = async () => {
    if (!validar()) return;

    setGuardando(true);

    // El bloque estructurado (CU77) viaja dentro de la anamnesis, delimitado
    // para poder reconstruirlo al volver a cargar.
    let anamnesisCompleta = anamnesis;
    if (plantilla) {
      const lineas = plantilla.campos
        .filter((campo) => String(camposValores[campo.id] || '').trim())
        .map((campo) => `${campo.etiqueta}: ${String(camposValores[campo.id]).trim()}`);
      if (lineas.length > 0) {
        anamnesisCompleta = `${MARCA_INICIO}\n${lineas.join('\n')}\n${MARCA_FIN}\n\n${anamnesis}`;
      }
    }
    // CU24: la entrevista del paciente se conserva íntegra al final.
    if (textoTriaje) {
      anamnesisCompleta = `${anamnesisCompleta.trim()}\n\n${textoTriaje}`;
    }

    try {
      const data = await guardarAnamnesis({
        paciente_id: pacienteId,
        anamnesis: anamnesisCompleta,
        plantilla_especialidad: plantillaEspecialidad,
        alergias: parsearLista(alergiasTexto),
        antecedentes_quirurgicos: parsearLista(quirurgicosTexto),
        antecedentes_patologicos: parsearLista(patologicosTexto),
        version
      });

      if (data.truncado) {
        setAviso({ tono: 'info', titulo: 'Texto truncado', mensaje: `La anamnesis excedía el límite de ${data.limite_anamnesis} caracteres y fue truncada.` });
      }

      setVersion(data.version);
      setGuardadaOk(true);
      await SecureStore.deleteItemAsync(claveBorrador(pacienteId)).catch?.(() => {});
      setAviso({ tono: 'ok', titulo: 'Éxito', mensaje: data.mensaje });

    } catch (error) {
      const err = error.response?.data;

      // ─ Excepción 3: colisión de escritura 
      if (error.response?.status === 409 && err?.error === 'COLISION_ESCRITURA') {
        Alert.alert(
          'Conflicto de edición',
          err.mensaje,
          [{ text: 'Recargar', onPress: cargarFicha }]
        );
        return;
      }

      // ─ Excepción 2: backend detectó campos faltantes 
      if (error.response?.status === 400 && err?.error === 'CAMPOS_OBLIGATORIOS_FALTANTES') {
        const nuevosErrores = {};
        if (err.campos.includes('anamnesis')) nuevosErrores.anamnesis = true;
        if (err.campos.includes('plantilla_especialidad')) nuevosErrores.plantillaEspecialidad = true;
        setErrores(nuevosErrores);
        setAviso({ tono: 'error', titulo: 'Campos incompletos', mensaje: err.mensaje });
        return;
      }

      if (error.response?.status === 401) {
        setAviso({ tono: 'error', titulo: 'Sesión expirada', mensaje: 'Tu sesión ha expirado. Inicia sesión nuevamente.' });
        return;
      }

      if (error.response?.status === 403) {
        setAviso({ tono: 'error', titulo: 'Acceso denegado', mensaje: err?.error || 'No tienes permisos para esta acción.' });
        return;
      }

      if (err?.error === 'FALLO_BITACORA') {
        setAviso({ tono: 'error', titulo: 'Error de auditoría', mensaje: err.mensaje });
        return;
      }

      if (!error.response) {
        // CU77 — Excepción 4: sin conexión, la evaluación queda en caché
        // local para sincronizarla cuando vuelva la red.
        await SecureStore.setItemAsync(
          claveBorrador(pacienteId),
          JSON.stringify({ camposValores, anamnesis, alergiasTexto, quirurgicosTexto, patologicosTexto })
        );
        setAviso({ tono: 'error', titulo: 'Sin conexión', mensaje: 'La evaluación quedó guardada en este dispositivo. Cuando vuelva la señal, guarda de nuevo para sincronizarla.' });
        return;
      }

      setAviso({ tono: 'error', titulo: 'Error', mensaje: err?.error || 'No se pudo guardar la anamnesis. Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
        <Text style={styles.cargandoTexto}>Cargando ficha clínica...</Text>
      </View>
    );
  }

  return (
    <VistaConTeclado style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>Evaluación Inicial — Anamnesis</Text>
        <Text style={styles.subtitulo}>Paciente: {nombrePaciente}</Text>

        {/* ─ CU77: plantilla dinámica según la especialidad acreditada */}
        {sinEspecialidad ? (
          <View style={styles.avisoSinEspecialidad}>
            <Text style={styles.avisoSinEspecialidadTexto}>
              Tu cuenta no tiene una especialidad acreditada, así que no se puede
              generar la plantilla de evaluación. Completa tu configuración
              profesional o contacta al administrador.
            </Text>
          </View>
        ) : plantilla ? (
          <View style={styles.bloquePlantilla}>
            <Text style={styles.chipEspecialidad}>
              Plantilla: {plantilla.especialidad}
            </Text>
            {plantilla.campos.map((campo) => (
              <View key={campo.id}>
                <Text style={styles.label}>
                  {campo.etiqueta}{campo.obligatorio ? ' *' : ''}
                </Text>
                <TextInput
                  style={[styles.input, erroresCampos[campo.id] && styles.inputError]}
                  placeholder={campo.tipo === 'numero' ? 'Solo números' : 'Escribe aquí…'}
                  keyboardType={campo.tipo === 'numero' ? 'numeric' : 'default'}
                  value={String(camposValores[campo.id] || '')}
                  onChangeText={(v) => {
                    const valor = campo.tipo === 'numero' ? v.replace(/[^0-9.,]/g, '') : v;
                    setCamposValores({ ...camposValores, [campo.id]: valor });
                    if (erroresCampos[campo.id]) {
                      setErroresCampos({ ...erroresCampos, [campo.id]: false });
                    }
                  }}
                />
                {erroresCampos[campo.id] && (
                  <Text style={styles.errorTexto}>Este campo es obligatorio para tu especialidad.</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <>
            <Text style={styles.label}>Plantilla de especialidad *</Text>
            <TextInput
              style={[styles.input, errores.plantillaEspecialidad && styles.inputError]}
              placeholder="Ej: Kinesiología Respiratoria"
              value={plantillaEspecialidad}
              onChangeText={(v) => {
                setPlantillaEspecialidad(v);
                if (errores.plantillaEspecialidad) setErrores({ ...errores, plantillaEspecialidad: false });
              }}
            />
            {errores.plantillaEspecialidad && (
              <Text style={styles.errorTexto}>Este campo es obligatorio.</Text>
            )}
          </>
        )}

        {/* ─ CU24: entrevista previa del paciente (solo lectura) */}
        {bloquesTriaje.length > 1 && (
          <TouchableOpacity
            style={styles.botonHistorialTriaje}
            onPress={() => setVerTodasLasEntrevistas((v) => !v)}
          >
            <Text style={styles.botonHistorialTriajeTexto}>
              {verTodasLasEntrevistas
                ? '▲ Ver solo la última entrevista'
                : `📜 Ver entrevistas anteriores (${bloquesTriaje.length - 1})`}
            </Text>
          </TouchableOpacity>
        )}

        {(verTodasLasEntrevistas ? bloquesTriaje : bloquesTriaje.slice(-1)).map((bloque, i) => (
          <View key={i} style={styles.tarjetaTriaje}>
            <Text style={styles.tituloTriaje}>
              🩺 Entrevista previa del paciente{fechaDeTriaje(bloque) ? ` · ${fechaDeTriaje(bloque)}` : ''}
            </Text>
            {lineasDeTriaje(bloque).map((linea, j) => (
              <Text key={j} style={styles.lineaTriaje}>• {linea}</Text>
            ))}
            <Text style={styles.notaTriaje}>
              Respuestas del propio paciente. Se conservan en la ficha; corrige o completa en los campos de abajo.
            </Text>
          </View>
        ))}

        {/* ─ Anamnesis */}
        <Text style={styles.label}>Anamnesis *</Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            errores.anamnesis && styles.inputError
          ]}
          placeholder="Describe la anamnesis del paciente..."
          multiline
          numberOfLines={6}
          value={anamnesis}
          onChangeText={manejarCambioAnamnesis}
        />
        <Text style={styles.contador}>
          {anamnesis.length} / {limiteLibre}
        </Text>
        {errores.anamnesis && (
          <Text style={styles.errorTexto}>Este campo es obligatorio.</Text>
        )}
        {avisoTruncado !== '' && (
          <Text style={styles.avisoTruncado}>{avisoTruncado}</Text>
        )}

        {/* ─ Alergias  */}
        <Text style={styles.label}>Antecedentes alérgicos</Text>
        <TextInput
          style={[styles.input, styles.textAreaPeque]}
          placeholder="Separar con comas, ej: Penicilina, Polen"
          multiline
          value={alergiasTexto}
          onChangeText={setAlergiasTexto}
        />

        {/* ─ Antecedentes quirúrgicos  */}
        <Text style={styles.label}>Antecedentes quirúrgicos</Text>
        <TextInput
          style={[styles.input, styles.textAreaPeque]}
          placeholder="Separar con comas, ej: Apendicectomía 2018"
          multiline
          value={quirurgicosTexto}
          onChangeText={setQuirurgicosTexto}
        />

        {/* ─ Antecedentes patológicos */}
        <Text style={styles.label}>Antecedentes patológicos</Text>
        <TextInput
          style={[styles.input, styles.textAreaPeque]}
          placeholder="Separar con comas, ej: Hipertensión, Diabetes tipo 2"
          multiline
          value={patologicosTexto}
          onChangeText={setPatologicosTexto}
        />

        {/* ─ Guardar */}
        {guardadaOk && (
          <View style={styles.guiaSiguiente}>
            <Text style={styles.guiaTitulo}>✓ Anamnesis guardada</Text>
            <Text style={styles.guiaTexto}>
              Con la evaluación inicial lista, el paso siguiente es registrar la
              sesión de hoy.
            </Text>
            <TouchableOpacity
              style={styles.guiaBoton}
              onPress={() => navigation.navigate('SesionClinica')}
            >
              <Text style={styles.guiaBotonTexto}>Ir a la sesión clínica →</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.boton, guardando && styles.botonDeshabilitado]}
          onPress={guardar}
          disabled={guardando}
        >
          {guardando
            ? <ActivityIndicator color={colores.superficie} />
            : <Text style={styles.botonTexto}>Guardar Anamnesis</Text>}
        </TouchableOpacity>
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

const styles = StyleSheet.create({
  bloquePlantilla: {
    backgroundColor: colores.primarioSuave,
    borderWidth: 1,
    borderColor: colores.primarioBorde,
    borderRadius: radio.md,
    padding: 12,
    marginTop: 8,
  },
  chipEspecialidad: {
    alignSelf: 'flex-start',
    backgroundColor: colores.primario,
    color: colores.superficie,
    fontWeight: 'bold',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radio.completo,
    overflow: 'hidden',
  },
  avisoSinEspecialidad: {
    backgroundColor: colores.errorSuave,
    borderRadius: radio.md,
    padding: 14,
    marginTop: 8,
  },
  avisoSinEspecialidadTexto: { color: colores.error },
  guiaSiguiente: {
    backgroundColor: colores.exitoSuave,
    borderWidth: 1,
    borderColor: colores.exitoBorde,
    borderRadius: radio.md,
    padding: espacio.base,
    marginTop: espacio.xl,
  },
  guiaTitulo: { ...tipografia.cuerpoFuerte, color: colores.exito, marginBottom: espacio.xs },
  guiaTexto: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.md },
  guiaBoton: {
    backgroundColor: colores.exito,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  guiaBotonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  botonHistorialTriaje: {
    ...piezas.botonSecundario,
    paddingVertical: espacio.md,
    marginTop: espacio.base,
  },
  botonHistorialTriajeTexto: { ...tipografia.metaFuerte, color: colores.primario },
  tarjetaTriaje: {
    backgroundColor: colores.advertenciaSuave,
    borderWidth: 1,
    borderColor: colores.advertenciaBorde,
    borderRadius: radio.md,
    padding: 12,
    marginTop: 16,
  },
  tituloTriaje: { fontWeight: 'bold', color: colores.advertencia, marginBottom: 6 },
  lineaTriaje: { color: colores.texto, fontSize: 13, marginBottom: 3, lineHeight: 18 },
  notaTriaje: { color: colores.advertencia, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  container: {
    flex: 1,
    backgroundColor: colores.fondo,
    // El contenido no puede quedar al ras del borde de la pantalla.
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.base,
  },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cargandoTexto: {
    ...tipografia.meta,
    color: colores.textoSuave,
    marginTop: 10,
  },
  title: {
    ...tipografia.titulo,
    color: colores.textoTitulo,
    marginBottom: 4,
  },
  subtitulo: {
    ...tipografia.meta,
    color: colores.textoSuave,
    marginBottom: 20,
  },
  label: {
    ...piezas.etiqueta,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    ...piezas.campo,
  },
  textArea: {
    ...piezas.campo,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  textAreaPeque: {
    ...piezas.campo,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  inputError: { borderColor: colores.error, borderWidth: 2, backgroundColor: colores.errorSuave },
  errorTexto: { color: colores.error, fontSize: 13, marginTop: 4 },
  contador: { textAlign: 'right', color: colores.textoTenue, fontSize: 13, marginTop: 4 },
  avisoTruncado: { color: colores.advertencia, fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  boton: {
    ...piezas.botonPrimario,
    alignItems: 'center',
    marginTop: 28,
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.textoInverso,
  }
});