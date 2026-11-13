/**
 * Componente: Cliente Móvil — Vista "Pautas de ejercicio" (Ficha Clínica)
 * Casos de uso: CU46, CU47, CU49, CU35.
 */
// Ruta: fro-vista/src/screens/Profesional/FichaClinica/PautasScreen.js
//
// Pestaña de pautas de ejercicio dentro de la Ficha Clínica.
// CU46: biblioteca centralizada con buscador de material terapéutico.
// CU47: prescripción de pautas con series, repeticiones y frecuencia.
// Cada ejercicio puede ir en días fijos de la semana y llevar su propio
// material de apoyo (fotos, videos, PDF o Word), que se sube al guardar.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import apiClient from '../../../api/client';
import ErrorRetry from '../../../components/ErrorRetry';
import VistaConTeclado from '../../../components/VistaConTeclado';
import { colores, espacio, piezas, radio, tipografia } from '../../../theme';
import { textoLegible } from '../../../utils/estados';
import EtiquetaEstado from '../../../components/EtiquetaEstado';
import DialogoAviso from '../../../components/DialogoAviso';
import DialogoConfirmacion from '../../../components/DialogoConfirmacion';
import Icono from '../../../components/Icono';
import SelectorDiasSemana, { textoDias } from '../../../components/SelectorDiasSemana';
import AdjuntarMaterial from '../../../components/AdjuntarMaterial';
import MaterialApoyo from '../../../components/MaterialApoyo';
import { formatearFecha } from '../../../utils/fechas';

const COLOR_ESTADO = { VIGENTE: colores.exito, PROGRAMADA: colores.primario, EXPIRADA: colores.textoDeshabilitado };

function fechaMasDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** Cómo se repite un ejercicio: sus días, o diaria/semanal si no los tiene. */
function textoFrecuencia(ejercicio) {
  if (ejercicio.dias_texto) return ejercicio.dias_texto;
  return ejercicio.frecuencia === 'SEMANAL' ? 'semanal' : 'diaria';
}

/**
 * CU47 — Prescribiendo pautas de ejercicio técnico
 * Asocia cada ejercicio del formulario con el id que le dio el servidor.
 * Se empareja por nombre; si hay dos con el mismo nombre se usan en orden,
 * y como respaldo se toma el de la misma posición (el servidor los crea en
 * el orden en que llegan).
 */
function emparejarEjercicios(locales, creados) {
  const usados = new Set();
  return locales.map((local, indice) => {
    const nombre = local.nombre_ejercicio.trim();
    let posicion = creados.findIndex((c, i) => !usados.has(i) && c.nombre_ejercicio === nombre);
    if (posicion === -1 && creados[indice] && !usados.has(indice)) posicion = indice;
    if (posicion === -1) return null;
    usados.add(posicion);
    return creados[posicion].pauta_ejercicio_id;
  });
}

/** Lista legible de los archivos que no se pudieron subir. */
function listaFallidos(fallidos) {
  return fallidos.map((f) => `• ${f.nombre}: ${f.motivo}`).join('\n');
}

export default function PautasScreen({ route, navigation }) {
  const { pacienteId } = route?.params || {};

  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).

  const [aviso, setAviso] = useState(null);

  // Material de apoyo: subida en curso ({ origen, actual, total }; origen es
  // 'formulario' o el id del ejercicio existente) y material por eliminar.
  const [progreso, setProgreso] = useState(null);
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [episodios, setEpisodios] = useState([]);
  const [pautas, setPautas] = useState([]);

  // CU46: biblioteca
  const [materiales, setMateriales] = useState([]);
  const [buscarMaterial, setBuscarMaterial] = useState('');
  const [buscandoBiblioteca, setBuscandoBiblioteca] = useState(false);
  const [resultadosBiblioteca, setResultadosBiblioteca] = useState(null);

  // CU47: formulario de nueva pauta
  const [formVisible, setFormVisible] = useState(false);
  // El episodio llega del selector fijo de la ficha; el picker de abajo
  // solo permite cambiarlo dentro de esta pantalla.
  const [episodioId, setEpisodioId] = useState(
    route?.params?.episodioId ? String(route.params.episodioId) : ''
  );
  const [nombrePauta, setNombrePauta] = useState('');
  const [fechaInicio, setFechaInicio] = useState(fechaMasDias(0));
  const [fechaFin, setFechaFin] = useState(fechaMasDias(30));
  const [ejercicios, setEjercicios] = useState([]);
  const [guardando, setGuardando] = useState(false);

  /**
   * CU46, CU47 — cargar las pautas del paciente y la biblioteca de material
   * Carga pautas y biblioteca por separado. Antes iban en un Promise.all con
   * un catch vacío: si cualquiera de las dos fallaba, la pantalla completa
   * mostraba "Servicio no disponible" y el motivo real se perdía, lo que hacía
   * imposible distinguir un problema de red de uno de permisos o de base de
   * datos. Ahora cada llamada se evalúa aparte y el error se muestra tal cual
   * lo explica el servidor.
   */
  const cargarTodo = async () => {
    setCargando(true);
    setErrorCarga('');

    const [resPautas, resBiblioteca] = await Promise.allSettled([
      apiClient.get(`/clinica/pautas/paciente/${pacienteId}`),
      apiClient.get('/clinica/materiales'),
    ]);

    if (resPautas.status === 'fulfilled') {
      const datos = resPautas.value.data;
      setEpisodios(datos?.episodios || []);
      setPautas(datos?.pautas || []);
      if (datos?.episodios?.length > 0) {
        setEpisodioId(String(datos.episodios[0].episodio_clinico_id));
      }
    } else {
      const error = resPautas.reason;
      const respuesta = error?.response?.data;
      console.error('ERROR PAUTAS:', error?.response?.status, respuesta || error?.message);
      setErrorCarga(
        respuesta?.mensaje ||
          respuesta?.error ||
          `No se pudieron cargar las pautas (${error?.response?.status || 'sin respuesta del servidor'}).`
      );
    }

    // La biblioteca es secundaria: si falla, las pautas igual se muestran.
    if (resBiblioteca.status === 'fulfilled') {
      setMateriales(resBiblioteca.value.data?.materiales || []);
    } else {
      console.error('ERROR BIBLIOTECA:', resBiblioteca.reason?.response?.data);
      setMateriales([]);
    }

    setCargando(false);
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  // CU47 — recargar las pautas del paciente
  // Recarga solo la lista de pautas, sin la pantalla de carga: se usa tras
  // agregar o quitar material para no perder la posición ni el formulario.
  const recargarPautas = async () => {
    try {
      const { data } = await apiClient.get(`/clinica/pautas/paciente/${pacienteId}`);
      setPautas(data?.pautas || []);
    } catch (error) {
      console.error('ERROR RECARGA PAUTAS:', error?.response?.status, error?.response?.data || error?.message);
    }
  };

  // ── CU47: Material de apoyo del ejercicio ──────────────────────────────────
  /**
   * CU47 — subir el material de apoyo de cada ejercicio
   * Sube los archivos uno por uno (envios: [{ pautaEjercicioId, archivo }]) y
   * devuelve los que fallaron con su motivo. Un archivo que falla no detiene
   * a los demás.
   */
  const subirMateriales = async (envios, origen) => {
    const fallidos = [];
    for (let i = 0; i < envios.length; i += 1) {
      const { pautaEjercicioId, archivo } = envios[i];
      setProgreso({ origen, actual: i + 1, total: envios.length });
      try {
        const formulario = new FormData();
        formulario.append('archivo', { uri: archivo.uri, name: archivo.name, type: archivo.type });
        await apiClient.post(`/clinica/pautas/ejercicios/${pautaEjercicioId}/material`, formulario, {
          headers: { 'Content-Type': 'multipart/form-data' },
          transformRequest: (d) => d,
        });
      } catch (err) {
        const respuesta = err.response?.data;
        fallidos.push({
          nombre: archivo.name,
          motivo: respuesta?.mensaje || (typeof respuesta?.error === 'string' ? respuesta.error : null) || 'se interrumpió la transferencia.',
        });
      }
    }
    setProgreso(null);
    return fallidos;
  };

  const textoProgreso = (origen) =>
    progreso && progreso.origen === origen
      ? `Subiendo material ${progreso.actual} de ${progreso.total}…`
      : '';

  // CU47 — Agregar material a un ejercicio de una pauta ya prescrita.
  const agregarMaterialExistente = async (ejercicio, archivos) => {
    if (progreso) return;
    const fallidos = await subirMateriales(
      archivos.map((archivo) => ({ pautaEjercicioId: ejercicio.pauta_ejercicio_id, archivo })),
      ejercicio.pauta_ejercicio_id
    );
    await recargarPautas();
    const subidos = archivos.length - fallidos.length;
    if (fallidos.length === 0) {
      setAviso({
        tono: 'ok',
        titulo: 'Material agregado',
        mensaje: `${subidos === 1 ? 'El archivo ya está' : `Los ${subidos} archivos ya están`} disponibles para el paciente en "${ejercicio.nombre_ejercicio}".`,
      });
    } else {
      setAviso({
        tono: 'error',
        titulo: subidos > 0 ? 'Algunos archivos no se subieron' : 'No se pudo subir el material',
        mensaje: `${listaFallidos(fallidos)}\n\nPuedes intentar adjuntarlos de nuevo.`,
      });
    }
  };

  // CU47 — quitar un material de apoyo del ejercicio
  const eliminarMaterial = async () => {
    const material = porEliminar;
    setPorEliminar(null);
    if (!material) return;
    setEliminandoId(material.pauta_ejercicio_material_id);
    try {
      await apiClient.delete(`/clinica/pautas/material/${material.pauta_ejercicio_material_id}`);
      await recargarPautas();
    } catch (err) {
      const respuesta = err.response?.data;
      setAviso({
        tono: 'error',
        titulo: 'No se pudo eliminar',
        mensaje: respuesta?.mensaje || (typeof respuesta?.error === 'string' ? respuesta.error : null) || 'Intenta nuevamente.',
      });
    } finally {
      setEliminandoId(null);
    }
  };

  // CU35 — Visualizando archivos con visor embebido
  const abrirMaterial = (material) => {
    navigation?.navigate('VisorDocumento', {
      materialId: material.pauta_ejercicio_material_id,
      nombre: material.nombre,
    });
  };

  // ── CU46: buscador de la biblioteca ────────────────────────────────────────
  // CU46 — Seleccionando material en biblioteca centralizada
  const ejecutarBusqueda = async () => {
    setBuscandoBiblioteca(true);
    try {
      const { data } = await apiClient.get('/clinica/materiales', {
        params: { buscar: buscarMaterial.trim() },
      });
      setResultadosBiblioteca(data?.materiales || []);
    } catch {
      // CU46 — Excepción 2: sin motor de búsqueda, catálogo completo.
      setResultadosBiblioteca(materiales);
      setAviso({ tono: 'alerta', titulo: 'Aviso', mensaje: 'El buscador no respondió; se muestra el catálogo completo.' });
    } finally {
      setBuscandoBiblioteca(false);
    }
  };

  // ── CU47: manejo del formulario ────────────────────────────────────────────
  const agregarEjercicio = () => {
    setEjercicios([
      ...ejercicios,
      {
        nombre_ejercicio: '',
        series: '3',
        repeticiones: '10',
        frecuencia: 'DIARIA',
        material_terapeutico_id: '',
        // Días fijos (1 = lunes … 7 = domingo); vacío = sigue la frecuencia.
        dias_semana: [],
        // Archivos elegidos que se suben recién al guardar la pauta.
        archivos: [],
      },
    ]);
  };

  const agregarArchivos = (indice, nuevos) => {
    setEjercicios((previos) =>
      previos.map((ejercicio, i) =>
        i === indice ? { ...ejercicio, archivos: [...ejercicio.archivos, ...nuevos] } : ejercicio
      )
    );
  };

  const quitarArchivo = (indice, posicion) => {
    setEjercicios((previos) =>
      previos.map((ejercicio, i) =>
        i === indice ? { ...ejercicio, archivos: ejercicio.archivos.filter((_, p) => p !== posicion) } : ejercicio
      )
    );
  };

  const actualizarEjercicio = (indice, campo, valor) => {
    // Se copia también el ejercicio, no solo el arreglo: modificarlo en el
    // sitio altera el objeto que React ya tenía y deja el estado anterior
    // indistinguible del nuevo.
    setEjercicios((previos) =>
      previos.map((ejercicio, i) => (i === indice ? { ...ejercicio, [campo]: valor } : ejercicio))
    );
  };

  const quitarEjercicio = (indice) => {
    setEjercicios(ejercicios.filter((_, i) => i !== indice));
  };

  // CU47 — Prescribiendo pautas de ejercicio técnico
  const guardarPauta = async () => {
    // CU47 — Excepción 4: sin episodio clínico no hay vinculación.
    if (!episodioId) {
      setAviso({ tono: 'info', titulo: 'Falta el episodio clínico', mensaje: 'Este paciente no tiene episodios. Crea primero el episodio base en la pestaña Episodios.' });
      return;
    }
    if (!nombrePauta.trim()) {
      setAviso({ tono: 'info', titulo: 'Falta el nombre', mensaje: 'Dale un nombre a la pauta (ej: "Rehabilitación rodilla semana 1-4").' });
      return;
    }
    if (ejercicios.length === 0) {
      setAviso({ tono: 'error', titulo: 'Pauta vacía', mensaje: 'Agrega al menos un ejercicio.' });
      return;
    }
    for (const ejercicio of ejercicios) {
      if (!ejercicio.nombre_ejercicio.trim()) {
        setAviso({ tono: 'alerta', titulo: 'Ejercicio sin nombre', mensaje: 'Todos los ejercicios necesitan un nombre.' });
        return;
      }
      // CU47 — Excepción 3: solo números en series y repeticiones.
      if (!/^\d+$/.test(ejercicio.series) || !/^\d+$/.test(ejercicio.repeticiones)) {
        setAviso({ tono: 'error', titulo: 'Valores inválidos', mensaje: `Series y repeticiones de "${ejercicio.nombre_ejercicio}" deben ser números.` });
        return;
      }
    }

    setGuardando(true);
    // 1) Se crea la pauta (como siempre). Si esto falla, no se sube nada.
    let creados;
    try {
      const { data } = await apiClient.post('/clinica/pautas', {
        episodio_clinico_id: Number(episodioId),
        nombre: nombrePauta.trim(),
        fecha_inicio: fechaInicio,
        fecha_expiracion: fechaFin,
        ejercicios: ejercicios.map((e) => ({
          nombre_ejercicio: e.nombre_ejercicio.trim(),
          series: Number(e.series),
          repeticiones: Number(e.repeticiones),
          // Con días marcados, mandan los días (el servidor guarda
          // DIAS_ESPECIFICOS, o DIARIA si se marcaron los siete).
          frecuencia: e.dias_semana.length ? 'DIAS_ESPECIFICOS' : e.frecuencia,
          dias_semana: e.dias_semana,
          material_terapeutico_id: e.material_terapeutico_id ? Number(e.material_terapeutico_id) : null,
        })),
      });
      creados = data?.ejercicios || [];
    } catch (err) {
      const respuesta = err.response?.data;
      setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
      setGuardando(false);
      return;
    }

    // 2) Con la pauta ya creada, se sube el material de cada ejercicio.
    const ids = emparejarEjercicios(ejercicios, creados);
    const envios = [];
    const fallidos = [];
    ejercicios.forEach((ejercicio, indice) => {
      ejercicio.archivos.forEach((archivo) => {
        if (ids[indice]) envios.push({ pautaEjercicioId: ids[indice], archivo });
        else fallidos.push({ nombre: archivo.name, motivo: 'no se encontró su ejercicio en la pauta creada.' });
      });
    });
    if (envios.length) fallidos.push(...(await subirMateriales(envios, 'formulario')));

    if (fallidos.length === 0) {
      setAviso({
        tono: 'info',
        titulo: 'Pauta prescrita',
        mensaje: envios.length
          ? `El paciente ya puede verla en su aplicación, junto con ${envios.length === 1 ? 'el archivo' : `los ${envios.length} archivos`} de apoyo.`
          : 'El paciente ya puede verla en su aplicación.',
      });
    } else {
      // La pauta ya existe: solo falta reintentar el material desde la lista.
      setAviso({
        tono: 'alerta',
        titulo: 'Pauta creada, falta material',
        mensaje:
          `La pauta quedó prescrita, pero estos archivos no se subieron:\n${listaFallidos(fallidos)}\n\n` +
          'Puedes adjuntarlos de nuevo desde la lista de pautas del paciente.',
      });
    }
    setFormVisible(false);
    setNombrePauta('');
    setEjercicios([]);
    setGuardando(false);
    cargarTodo();
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.exito} />
      </View>
    );
  }

  if (errorCarga) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje={errorCarga} onRetry={cargarTodo} />
      </View>
    );
  }

  const listaBiblioteca = resultadosBiblioteca ?? [];

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>Pautas de ejercicio</Text>

      {/* ── CU46: Biblioteca ── */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.seccion}>📚 Biblioteca de material</Text>
        <View style={estilos.filaBusqueda}>
          <TextInput
            style={estilos.inputBusqueda}
            placeholder="Buscar por nombre, categoría o tipo…"
            value={buscarMaterial}
            onChangeText={setBuscarMaterial}
            onSubmitEditing={ejecutarBusqueda}
            returnKeyType="search"
          />
          <TouchableOpacity style={estilos.botonBuscar} onPress={ejecutarBusqueda} disabled={buscandoBiblioteca}>
            <Text style={estilos.botonBuscarTexto}>{buscandoBiblioteca ? '…' : 'Buscar'}</Text>
          </TouchableOpacity>
        </View>

        {resultadosBiblioteca !== null &&
          (listaBiblioteca.length === 0 ? (
            // CU46 — Excepción 1: sin coincidencias.
            <Text style={estilos.sinResultados}>
              Sin coincidencias para "{buscarMaterial.trim()}". Limpia el filtro para ver todo.
            </Text>
          ) : (
            listaBiblioteca.map((material) => (
              <View key={material.material_terapeutico_id} style={estilos.tarjetaMaterial}>
                <Text style={estilos.materialNombre}>{material.nombre}</Text>
                <Text style={estilos.materialDetalle}>
                  {textoLegible(material.categoria)} · {textoLegible(material.tipo)} · {material.formato}
                </Text>
              </View>
            ))
          ))}
      </View>

      {/* ── CU47, CU49: Pautas existentes con su vigencia ── */}
      <Text style={estilos.seccion}>Pautas del paciente</Text>
      {pautas.length === 0 ? (
        <Text style={estilos.sinResultados}>Aún no hay pautas prescritas.</Text>
      ) : (
        pautas.map((pauta) => {
          const expirada = pauta.estado === 'EXPIRADA';
          return (
            <View key={pauta.pauta_tratamiento_id} style={estilos.tarjeta}>
              <View style={estilos.filaPauta}>
                <Text style={estilos.pautaNombre}>{pauta.nombre}</Text>
                <EtiquetaEstado estado={pauta.estado} tamano="sm" />
              </View>
              <Text style={estilos.pautaDetalle}>
                {formatearFecha(pauta.fecha_inicio)} → {formatearFecha(pauta.fecha_expiracion)} · Episodio #{pauta.episodio_clinico_id}
              </Text>
              {pauta.ejercicios.map((ejercicio, posicion) => {
                const subiendoAqui = progreso?.origen === ejercicio.pauta_ejercicio_id;
                return (
                  <View
                    key={ejercicio.pauta_ejercicio_id}
                    style={[estilos.bloqueEjercicio, posicion > 0 && estilos.bloqueEjercicioSeparado]}
                  >
                    <Text style={estilos.ejercicioLinea}>
                      • {ejercicio.nombre_ejercicio} — {ejercicio.series}×{ejercicio.repeticiones} ({textoFrecuencia(ejercicio)})
                      {ejercicio.material_nombre ? `  📚 ${ejercicio.material_nombre}` : ''}
                      {`  ✅ ${ejercicio.dias_cumplidos} día(s)`}
                    </Text>
                    {/* Material propio del ejercicio. CU49: en pautas expiradas el
                        servidor ya no lo entrega y no se puede tocar. */}
                    <MaterialApoyo
                      materiales={ejercicio.material_apoyo || []}
                      onAbrir={abrirMaterial}
                      onEliminar={expirada ? undefined : (material) => setPorEliminar(material)}
                      eliminandoId={eliminandoId}
                    />
                    {!expirada && (
                      <AdjuntarMaterial
                        etiqueta="Agregar material de apoyo"
                        deshabilitado={progreso !== null}
                        ocupado={subiendoAqui}
                        textoOcupado={textoProgreso(ejercicio.pauta_ejercicio_id)}
                        onElegidos={(archivos) => agregarMaterialExistente(ejercicio, archivos)}
                        onAviso={setAviso}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          );
        })
      )}

      {/* ── CU47: Nueva pauta ── */}
      {!formVisible ? (
        <TouchableOpacity style={estilos.botonPrimario} onPress={() => setFormVisible(true)}>
          <Text style={estilos.botonPrimarioTexto}>＋ Nueva pauta</Text>
        </TouchableOpacity>
      ) : (
        <View style={estilos.tarjeta}>
          <Text style={estilos.seccion}>Nueva pauta</Text>

          <Text style={estilos.etiqueta}>Episodio clínico</Text>
          <View style={estilos.selector}>
            <Picker selectedValue={episodioId} onValueChange={(v) => setEpisodioId(String(v))}>
              {episodios.length === 0 ? (
                <Picker.Item label="— Sin episodios: crea uno primero —" value="" />
              ) : (
                episodios.map((episodio) => (
                  <Picker.Item
                    key={episodio.episodio_clinico_id}
                    label={`#${episodio.episodio_clinico_id} · ${episodio.motivo_consulta}`}
                    value={String(episodio.episodio_clinico_id)}
                  />
                ))
              )}
            </Picker>
          </View>

          <Text style={estilos.etiqueta}>Nombre de la pauta</Text>
          <TextInput
            style={estilos.input}
            placeholder="Ej: Rehabilitación rodilla semanas 1-4"
            value={nombrePauta}
            onChangeText={setNombrePauta}
          />

          <View style={estilos.filaFechas}>
            <View style={estilos.mitad}>
              <Text style={estilos.etiqueta}>Inicio (AAAA-MM-DD)</Text>
              <TextInput style={estilos.input} value={fechaInicio} onChangeText={setFechaInicio} />
            </View>
            <View style={estilos.mitad}>
              <Text style={estilos.etiqueta}>Término (AAAA-MM-DD)</Text>
              <TextInput style={estilos.input} value={fechaFin} onChangeText={setFechaFin} />
            </View>
          </View>

          <Text style={estilos.etiqueta}>Ejercicios</Text>
          {ejercicios.map((ejercicio, indice) => (
            <View key={indice} style={estilos.tarjetaEjercicio}>
              <Text style={estilos.label}>Nombre del ejercicio</Text>
              <TextInput
                style={estilos.input}
                placeholder="Ej: elongación de isquiotibiales"
                value={ejercicio.nombre_ejercicio}
                onChangeText={(v) => actualizarEjercicio(indice, 'nombre_ejercicio', v)}
              />
              {/* Cada campo con su etiqueta encima. Antes los cinco elementos
                  compartían una sola fila: el desplegable quedaba de unos
                  ochenta píxeles, sin etiqueta y con el texto cortado. */}
              <View style={estilos.filaCampos}>
                <View style={estilos.mitad}>
                  <Text style={estilos.label}>Series</Text>
                  <TextInput
                    style={estilos.input}
                    placeholder="Ej: 3"
                    placeholderTextColor={colores.textoTenue}
                    keyboardType="numeric"
                    value={ejercicio.series}
                    onChangeText={(v) => actualizarEjercicio(indice, 'series', v.replace(/[^0-9]/g, ''))}
                  />
                </View>
                <View style={estilos.mitad}>
                  <Text style={estilos.label}>Repeticiones</Text>
                  <TextInput
                    style={estilos.input}
                    placeholder="Ej: 12"
                    placeholderTextColor={colores.textoTenue}
                    keyboardType="numeric"
                    value={ejercicio.repeticiones}
                    onChangeText={(v) => actualizarEjercicio(indice, 'repeticiones', v.replace(/[^0-9]/g, ''))}
                  />
                </View>
              </View>

              <Text style={estilos.label}>Frecuencia</Text>
              {/* Con días marcados la frecuencia no aplica: mandan los días. */}
              <View style={[estilos.selector, ejercicio.dias_semana.length > 0 && estilos.deshabilitado]}>
                <Picker
                  selectedValue={ejercicio.frecuencia}
                  onValueChange={(v) => actualizarEjercicio(indice, 'frecuencia', v)}
                  enabled={ejercicio.dias_semana.length === 0 && !guardando}
                  dropdownIconColor={colores.primario}
                  style={estilos.picker}
                >
                  <Picker.Item label="Diaria" value="DIARIA" />
                  <Picker.Item label="Semanal" value="SEMANAL" />
                </Picker>
              </View>

              <Text style={estilos.label}>Días de la semana (opcional)</Text>
              <SelectorDiasSemana
                dias={ejercicio.dias_semana}
                onCambiar={(dias) => actualizarEjercicio(indice, 'dias_semana', dias)}
                deshabilitado={guardando}
              />
              <Text style={[estilos.ayuda, ejercicio.dias_semana.length > 0 && estilos.ayudaDestacada]}>
                {ejercicio.dias_semana.length > 0
                  ? `Se realiza ${ejercicio.dias_semana.length === 7 ? '' : 'los '}${textoDias(ejercicio.dias_semana)}. Los días marcados reemplazan la frecuencia.`
                  : 'Marca días solo si el ejercicio va en días fijos.'}
              </Text>

              {/* CU46: material de la biblioteca asociado al ejercicio */}
              <Text style={estilos.label}>Material de la biblioteca</Text>
              <View style={estilos.selector}>
                <Picker
                  selectedValue={ejercicio.material_terapeutico_id}
                  onValueChange={(v) => actualizarEjercicio(indice, 'material_terapeutico_id', v)}
                  dropdownIconColor={colores.primario}
                  style={estilos.picker}
                >
                  <Picker.Item label="Sin material de apoyo" value="" />
                  {materiales.map((material) => (
                    <Picker.Item
                      key={material.material_terapeutico_id}
                      label={`${material.nombre} (${textoLegible(material.categoria)})`}
                      value={String(material.material_terapeutico_id)}
                    />
                  ))}
                </Picker>
              </View>

              {/* Archivos propios del ejercicio: se suben al prescribir la pauta. */}
              {ejercicio.archivos.map((archivo, posicion) => (
                <View key={`${archivo.uri}-${posicion}`} style={estilos.archivoFila}>
                  <Icono
                    name={archivo.type?.startsWith('video/') ? 'videocam-outline' : 'document-text-outline'}
                    size={18}
                    color={colores.primario}
                  />
                  <Text style={estilos.archivoNombre} numberOfLines={1}>{archivo.name}</Text>
                  <TouchableOpacity
                    onPress={() => quitarArchivo(indice, posicion)}
                    disabled={guardando}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${archivo.name}`}
                  >
                    <Text style={estilos.archivoQuitar}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <AdjuntarMaterial
                deshabilitado={guardando}
                onElegidos={(archivos) => agregarArchivos(indice, archivos)}
                onAviso={setAviso}
              />

              <TouchableOpacity onPress={() => quitarEjercicio(indice)} disabled={guardando} style={estilos.quitarEjercicioToque}>
                <Text style={estilos.quitarEjercicio}>Quitar ejercicio</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={estilos.botonSecundario} onPress={agregarEjercicio}>
            <Text style={estilos.botonSecundarioTexto}>＋ Agregar ejercicio</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[estilos.botonPrimario, guardando && estilos.deshabilitado]}
            onPress={guardarPauta}
            disabled={guardando}
          >
            {guardando ? (
              <View style={estilos.filaProgreso}>
                <ActivityIndicator color={colores.superficie} />
                {progreso?.origen === 'formulario' && (
                  <Text style={estilos.botonPrimarioTexto}>{textoProgreso('formulario')}</Text>
                )}
              </View>
            ) : (
              <Text style={estilos.botonPrimarioTexto}>Prescribir pauta</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFormVisible(false)} disabled={guardando}>
            <Text style={estilos.enlace}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
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
    <DialogoConfirmacion
      visible={porEliminar !== null}
      titulo="Eliminar material de apoyo"
      mensaje={`"${porEliminar?.nombre || ''}" dejará de estar disponible para el paciente. Esta acción no se puede deshacer.`}
      etiquetaConfirmar="Eliminar"
      tono="peligro"
      onConfirmar={eliminarMaterial}
      onCancelar={() => setPorEliminar(null)}
    />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  label: { ...piezas.etiqueta },
  fondo: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenido: { padding: 16, paddingBottom: 40 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  titulo: {
    ...tipografia.titulo,
    color: colores.textoTitulo,
    marginBottom: 12,
  },
  seccion: {
    ...tipografia.micro,
    color: colores.textoTenue,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  etiqueta: {
    ...piezas.etiqueta,
    marginBottom: 6,
    marginTop: 4,
  },

  tarjeta: {
    ...piezas.tarjeta,
    marginBottom: 14,
  },
  filaBusqueda: { flexDirection: 'row', gap: 8 },
  inputBusqueda: {
    ...piezas.campo,
    flex: 1,
  },
  botonBuscar: {
    ...piezas.botonPrimario,
    justifyContent: 'center',
  },
  botonBuscarTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.textoInverso,
  },
  sinResultados: { color: colores.textoSuave, fontStyle: 'italic', marginTop: 10, marginBottom: 6 },
  tarjetaMaterial: {
    ...piezas.tarjeta,
    marginTop: 8,
  },
  materialNombre: { fontWeight: 'bold', color: colores.texto },
  materialDetalle: { color: colores.textoSuave, fontSize: 13, marginTop: 2 },

  filaPauta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pautaNombre: { fontSize: 17, fontWeight: 'bold', color: colores.texto, flex: 1 },
  pautaDetalle: { color: colores.textoSuave, fontSize: 13, marginBottom: 8 },
  ejercicioLinea: { color: colores.texto, marginBottom: 4, fontSize: 13 },
  bloqueEjercicio: { paddingVertical: espacio.sm },
  bloqueEjercicioSeparado: { borderTopWidth: 1, borderTopColor: colores.bordeSuave },

  ayuda: { ...tipografia.meta, color: colores.textoTenue, marginBottom: espacio.md },
  ayudaDestacada: { color: colores.primario },
  archivoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
    marginBottom: espacio.xs,
  },
  archivoNombre: { ...tipografia.meta, color: colores.texto, flex: 1 },
  archivoQuitar: { ...tipografia.cuerpoFuerte, color: colores.error, paddingHorizontal: espacio.xs },
  quitarEjercicioToque: { marginTop: espacio.md },
  filaProgreso: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },

  input: {
    ...piezas.campo,
    marginBottom: 8,
  },
  selector: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.md,
    overflow: 'hidden',
    paddingHorizontal: espacio.sm,
    marginBottom: 8,
  },
  filaFechas: { flexDirection: 'row', gap: espacio.md },
  filaCampos: { flexDirection: 'row', gap: espacio.md },
  picker: { color: colores.texto },
  mitad: { flex: 1 },
  tercio: { flex: 1 },

  tarjetaEjercicio: {
    ...piezas.tarjeta,
    marginBottom: 10,
  },
  quitarEjercicio: { color: colores.error, fontWeight: '600', fontSize: 13, textAlign: 'right' },

  botonPrimario: {
    ...piezas.botonPrimario,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  botonPrimarioTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.textoInverso,
  },
  botonSecundario: {
    ...piezas.botonSecundario,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  botonSecundarioTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.primario,
  },
  deshabilitado: { opacity: 0.6 },
  enlace: { color: colores.textoSuave, textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
