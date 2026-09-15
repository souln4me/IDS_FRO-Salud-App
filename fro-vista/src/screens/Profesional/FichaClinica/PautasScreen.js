// Ruta: fro-vista/src/screens/Profesional/FichaClinica/PautasScreen.js
//
// Pestaña de pautas de ejercicio dentro de la Ficha Clínica.
// CU46: biblioteca centralizada con buscador de material terapéutico.
// CU47: prescripción de pautas con series, repeticiones y frecuencia.

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

const COLOR_ESTADO = { VIGENTE: colores.exito, PROGRAMADA: colores.primario, EXPIRADA: colores.textoDeshabilitado };

function fechaMasDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export default function PautasScreen({ route }) {
  const { pacienteId } = route?.params || {};

  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).

  const [aviso, setAviso] = useState(null);

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

  // ── CU46: buscador de la biblioteca ────────────────────────────────────────
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
      { nombre_ejercicio: '', series: '3', repeticiones: '10', frecuencia: 'DIARIA', material_terapeutico_id: '' },
    ]);
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
    try {
      await apiClient.post('/clinica/pautas', {
        episodio_clinico_id: Number(episodioId),
        nombre: nombrePauta.trim(),
        fecha_inicio: fechaInicio,
        fecha_expiracion: fechaFin,
        ejercicios: ejercicios.map((e) => ({
          nombre_ejercicio: e.nombre_ejercicio.trim(),
          series: Number(e.series),
          repeticiones: Number(e.repeticiones),
          frecuencia: e.frecuencia,
          material_terapeutico_id: e.material_terapeutico_id ? Number(e.material_terapeutico_id) : null,
        })),
      });

      setAviso({ tono: 'info', titulo: 'Pauta prescrita', mensaje: 'El paciente ya puede verla en su aplicación.' });
      setFormVisible(false);
      setNombrePauta('');
      setEjercicios([]);
      cargarTodo();
    } catch (err) {
      const respuesta = err.response?.data;
      setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
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

      {/* ── Pautas existentes ── */}
      <Text style={estilos.seccion}>Pautas del paciente</Text>
      {pautas.length === 0 ? (
        <Text style={estilos.sinResultados}>Aún no hay pautas prescritas.</Text>
      ) : (
        pautas.map((pauta) => (
          <View key={pauta.pauta_tratamiento_id} style={estilos.tarjeta}>
            <View style={estilos.filaPauta}>
              <Text style={estilos.pautaNombre}>{pauta.nombre}</Text>
              <EtiquetaEstado estado={pauta.estado} tamano="sm" />
            </View>
            <Text style={estilos.pautaDetalle}>
              {pauta.fecha_inicio} → {pauta.fecha_expiracion} · Episodio #{pauta.episodio_clinico_id}
            </Text>
            {pauta.ejercicios.map((ejercicio) => (
              <Text key={ejercicio.pauta_ejercicio_id} style={estilos.ejercicioLinea}>
                • {ejercicio.nombre_ejercicio} — {ejercicio.series}×{ejercicio.repeticiones} ({ejercicio.frecuencia.toLowerCase()})
                {ejercicio.material_nombre ? `  📚 ${ejercicio.material_nombre}` : ''}
                {`  ✅ ${ejercicio.dias_cumplidos} día(s)`}
              </Text>
            ))}
          </View>
        ))
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
              <View style={estilos.selector}>
                <Picker
                  selectedValue={ejercicio.frecuencia}
                  onValueChange={(v) => actualizarEjercicio(indice, 'frecuencia', v)}
                  dropdownIconColor={colores.primario}
                  style={estilos.picker}
                >
                  <Picker.Item label="Diaria" value="DIARIA" />
                  <Picker.Item label="Semanal" value="SEMANAL" />
                </Picker>
              </View>

              <Text style={estilos.label}>Material de apoyo</Text>
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
              <TouchableOpacity onPress={() => quitarEjercicio(indice)}>
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
              <ActivityIndicator color={colores.superficie} />
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
