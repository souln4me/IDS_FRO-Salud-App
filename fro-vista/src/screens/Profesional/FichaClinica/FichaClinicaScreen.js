// Ruta: fro-vista/src/screens/Profesional/FichaClinica/FichaClinicaScreen.js
//
// Ficha clínica del paciente. Reúne en pestañas el trabajo clínico para que el
// profesional no salga del contexto del paciente.
//
// Dos decisiones de arquitectura que explican cómo está armada:
//
// 1. El EPISODIO ACTIVO se elige una sola vez, arriba, y vale para todas las
//    pestañas. Antes cada pantalla pedía que se escribiera su identificador a
//    mano —el sistema llegaba a decir "anótalo para registrar avances"— y como
//    tres pestañas no exigían paciente, se podía entrar a la ficha de alguien y
//    terminar trabajando sobre el episodio de otro sin ninguna advertencia.
//
// 2. "Evolución" e "Intervención" eran dos pestañas que escribían la MISMA fila
//    de Evolucion_Clinica, cada una con la mitad de los campos. Ahora son una
//    sola: Sesión clínica.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import TabSelector from '../../../components/TabSelector';
import HistorialPacienteScreen from './HistorialPacienteScreen';
import AnamnesisScreen from './AnamnesisScreen';
import EpisodioScreen from './EpisodioScreen';
import SesionClinicaScreen from './SesionClinicaScreen';
import PautasScreen from './PautasScreen';
import apiClient, { getHistorialPaciente } from '../../../api/client';
import DialogoAviso from '../../../components/DialogoAviso';
import DialogoConfirmacion from '../../../components/DialogoConfirmacion';
import { colores, espacio, radio, tipografia, interaccion } from '../../../theme';
import { formatearFecha } from '../../../utils/fechas';
import BarraAtencionEnCurso from '../../../components/BarraAtencionEnCurso';

const TABS = [
  { key: 'historial', titulo: 'Historial',      icono: '📋', Componente: HistorialPacienteScreen },
  { key: 'anamnesis', titulo: 'Anamnesis',      icono: '🩺', Componente: AnamnesisScreen },
  { key: 'episodios', titulo: 'Episodios',      icono: '📁', Componente: EpisodioScreen },
  { key: 'sesion',    titulo: 'Sesión clínica', icono: '📈', Componente: SesionClinicaScreen },
  { key: 'pautas',    titulo: 'Pautas',         icono: '🏋️', Componente: PautasScreen },
];

// Las pantallas internas siguen llamando a navigation.navigate con los nombres
// de ruta antiguos. Aquí se traducen a un cambio de pestaña.
const RUTA_A_TAB = {
  HistorialPaciente: 'historial',
  Anamnesis: 'anamnesis',
  Episodio: 'episodios',
  EvolucionClinica: 'sesion',
  Intervencion: 'sesion',
  SesionClinica: 'sesion',
};

export default function FichaClinicaScreen({ route, navigation }) {
  const { pacienteId, nombrePaciente, episodioId: episodioInicial, irASesion } =
    route?.params || {};

  // Al llegar desde la barra de atención en curso se abre directo la sesión.
  const [tabActiva, setTabActiva] = useState(irASesion ? 'sesion' : 'historial');
  // Las pestañas ya abiertas se mantienen montadas para no perder lo escrito.
  const [visitadas, setVisitadas] = useState(
    () => new Set([irASesion ? 'sesion' : 'historial'])
  );
  const [paramsExtra, setParamsExtra] = useState({});

  // ── Episodio activo: el contexto que comparten todas las pestañas ────────
  const [episodios, setEpisodios] = useState([]);
  const [episodioActivo, setEpisodioActivo] = useState(
    episodioInicial ? String(episodioInicial) : ''
  );
  const [cargandoEpisodios, setCargandoEpisodios] = useState(false);
  // Un fallo de consulta NO es lo mismo que no tener episodios: mostrarlos
  // igual hacía creer que el paciente estaba vacío cuando el problema era otro.
  const [errorEpisodios, setErrorEpisodios] = useState('');

  // El episodio recién creado pasa a ser el activo: el aviso decía "ya quedó
  // seleccionado arriba" y no era cierto, así que había que buscarlo a mano.
  const cargarEpisodios = useCallback(async (dejarActivo) => {
    if (!pacienteId) return;
    setCargandoEpisodios(true);
    setErrorEpisodios('');
    try {
      const datos = await getHistorialPaciente(pacienteId);
      const lista = datos?.episodios || [];
      setEpisodios(lista);
      // Se preselecciona el más reciente PROPIO: en los de otros profesionales
      // no se puede registrar (CU28), así que abrir ahí sería un callejón.
      setEpisodioActivo((actual) => {
        if (dejarActivo && lista.some((e) => String(e.episodio_clinico_id) === String(dejarActivo))) {
          return String(dejarActivo);
        }
        if (actual && lista.some((e) => String(e.episodio_clinico_id) === String(actual))) {
          return actual;
        }
        const propio = lista.find((e) => e.es_propio) || lista[0];
        return propio ? String(propio.episodio_clinico_id) : '';
      });
    } catch (error) {
      setEpisodios([]);
      setErrorEpisodios(
        error.response?.data?.message ||
          error.response?.data?.error ||
          `No se pudieron cargar los episodios (${error.response?.status || 'sin respuesta del servidor'}).`
      );
    } finally {
      setCargandoEpisodios(false);
    }
  }, [pacienteId]);

  // CU78 (D12): cerrar el episodio es el alta del tratamiento. El botón vivía
  // dentro de la pestaña Episodios y solo aparecía después de teclear el número
  // del episodio y pulsar "Consultar": nadie lo encontraba. Va donde se ve el
  // episodio activo, que es donde se trabaja.
  const [cerrando, setCerrando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cerrarEpisodio = async (episodio) => {
    setCerrando(true);
    try {
      const { data } = await apiClient.put(`/clinica/episodio/${episodio.episodio_clinico_id}`, {
        estado: 'CERRADO',
      });
      await cargarEpisodios();
      setAviso({
        tono: 'ok',
        titulo: 'Episodio cerrado',
        mensaje: data?.mensaje || 'El episodio quedó cerrado y no admitirá nuevos registros.',
      });
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo cerrar',
        mensaje:
          error.response?.data?.mensaje ||
          error.response?.data?.error ||
          'Intenta nuevamente.',
      });
    } finally {
      setCerrando(false);
    }
  };

  useEffect(() => {
    cargarEpisodios();
  }, [cargarEpisodios]);

  useEffect(() => {
    navigation.setOptions({
      title: nombrePaciente ? `Ficha: ${nombrePaciente}` : 'Ficha Clínica',
    });
  }, [navigation, nombrePaciente]);

  const abrirTab = (key, params) => {
    if (params) setParamsExtra((previos) => ({ ...previos, [key]: params }));
    // Un episodio que llega desde otra pestaña pasa a ser el activo.
    if (params?.episodio_id) setEpisodioActivo(String(params.episodio_id));
    if (params?.episodioId) setEpisodioActivo(String(params.episodioId));
    setVisitadas((previas) => new Set(previas).add(key));
    setTabActiva(key);
  };

  const navegacionInterna = useMemo(
    () => ({
      ...navigation,
      navigate: (destino, params) => {
        const tabDestino = RUTA_A_TAB[destino];
        if (tabDestino) {
          abrirTab(tabDestino, params);
          return;
        }
        navigation.navigate(destino, params);
      },
      goBack: () => navigation.goBack(),
      setOptions: () => {},
    }),
    [navigation]
  );

  const episodioElegido = episodios.find(
    (e) => String(e.episodio_clinico_id) === String(episodioActivo)
  );

  return (
    <View style={styles.contenedor}>
      <BarraAtencionEnCurso
        navigation={navigation}
        recargarEn={tabActiva}
        onAbrir={(atencion) => {
          // Ya estamos en la ficha: si es el mismo paciente basta con abrir su
          // sesión; si es otro, se navega a su ficha.
          if (String(atencion.paciente_id) === String(pacienteId)) {
            if (atencion.episodio_clinico_id) {
              setEpisodioActivo(String(atencion.episodio_clinico_id));
            }
            abrirTab('sesion');
          } else {
            navigation.navigate('FichaClinica', {
              pacienteId: atencion.paciente_id,
              nombrePaciente: atencion.paciente,
              episodioId: atencion.episodio_clinico_id ? String(atencion.episodio_clinico_id) : '',
              irASesion: true,
            });
          }
        }}
      />

      <TabSelector tabs={TABS} tabActiva={tabActiva} onCambiarTab={abrirTab} />

      {/* Contexto de trabajo: vale para todas las pestañas y siempre está a la
          vista, así no hay dudas sobre en qué episodio se está escribiendo. */}
      {pacienteId && (
        <View style={[styles.contexto, errorEpisodios && styles.contextoError]}>
          {cargandoEpisodios ? (
            <ActivityIndicator size="small" color={colores.primario} />
          ) : errorEpisodios ? (
            <View style={styles.filaContexto}>
              <Text style={styles.errorContexto}>{errorEpisodios}</Text>
              <TouchableOpacity onPress={() => cargarEpisodios()} activeOpacity={interaccion.opacidadActiva}>
                <Text style={styles.enlaceCrear}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : episodios.length === 0 ? (
            <View style={styles.filaContexto}>
              <Text style={styles.sinEpisodios}>
                Este paciente no tiene episodios abiertos.
              </Text>
              <TouchableOpacity
                onPress={() => abrirTab('episodios')}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={styles.enlaceCrear}>Crear uno</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.etiquetaContexto}>Episodio en el que trabajas</Text>
              <View style={styles.selector}>
                <Picker
                  selectedValue={String(episodioActivo)}
                  onValueChange={(valor) => setEpisodioActivo(valor)}
                  dropdownIconColor={colores.primario}
                  style={styles.picker}
                >
                  {episodios.map((e) => (
                    <Picker.Item
                      key={e.episodio_clinico_id}
                      label={
                        `#${e.episodio_clinico_id} · ${e.motivo_consulta || 'Sin motivo'}` +
                        (e.es_propio ? '' : ` · de ${e.profesional_responsable} (solo consulta)`)
                      }
                      value={String(e.episodio_clinico_id)}
                    />
                  ))}
                </Picker>
              </View>
              {episodioElegido && (
                <View style={styles.filaContexto}>
                  <Text style={styles.detalleContexto}>
                    {episodioElegido.estado || 'Sin estado'} · desde{' '}
                    {formatearFecha(episodioElegido.fecha_inicio)}
                  </Text>
                  {/* CU53: el chat cuelga del episodio, así que se abre desde
                      el episodio que está activo en la ficha. */}
                  <TouchableOpacity
                    activeOpacity={interaccion.opacidadActiva}
                    onPress={() =>
                      navigation.navigate('ChatClinico', {
                        episodioId: episodioElegido.episodio_clinico_id,
                        nombreOtro: nombrePaciente,
                      })
                    }
                  >
                    <Text style={styles.enlaceCrear}>💬 Mensajes</Text>
                  </TouchableOpacity>

                  {/* es_propio llega como 0 o 1 desde la base. Sin convertirlo a
                      booleano, el 0 se cuela como texto suelto dentro de la vista
                      y React Native corta la pantalla con "Text strings must be
                      rendered within a <Text> component". */}
                  {Boolean(episodioElegido.es_propio) &&
                    String(episodioElegido.estado || '').toUpperCase() !== 'CERRADO' && (
                      <TouchableOpacity
                        disabled={cerrando}
                        activeOpacity={interaccion.opacidadActiva}
                        onPress={() =>
                          setConfirmacion({
                            titulo: 'Cerrar el episodio',
                            mensaje:
                              `Vas a cerrar el episodio #${episodioElegido.episodio_clinico_id} (${episodioElegido.motivo_consulta || 'sin motivo'}). ` +
                              'Dejará de admitir sesiones, metas, pautas y documentos. Lo que venga después necesita un episodio nuevo.',
                            etiqueta: 'Cerrar episodio',
                            accion: () => cerrarEpisodio(episodioElegido),
                          })
                        }
                      >
                        <Text style={styles.enlaceCrear}>
                          {cerrando ? 'Cerrando…' : '🔒 Cerrar episodio'}
                        </Text>
                      </TouchableOpacity>
                    )}
                </View>
              )}
              {/* CU28: los episodios de otros profesionales se consultan, no se
                  editan. El aviso va en la cabecera para que valga en todas las
                  pestañas, no solo en la sesión clínica. */}
              {episodioElegido && !episodioElegido.es_propio && (
                <View style={styles.avisoLectura}>
                  <Text style={styles.avisoLecturaTexto}>
                    🔒 Solo lectura · episodio creado por {episodioElegido.profesional_responsable}
                  </Text>
                  <Text style={styles.avisoLecturaAyuda}>
                    Puedes consultarlo para dar continuidad al tratamiento. Para registrar tu
                    atención, elige un episodio tuyo o crea uno en la pestaña Episodios.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      <View style={styles.panel}>
        {TABS.map((tab) => {
          if (!visitadas.has(tab.key)) return null;

          const activa = tab.key === tabActiva;
          const { Componente } = tab;

          // Toda la ficha exige paciente: ninguna pestaña puede trabajar sobre
          // otro sin que se note.
          if (!pacienteId) {
            return activa ? (
              <View key={tab.key} style={styles.aviso}>
                <Text style={styles.avisoTexto}>
                  Selecciona un paciente desde la lista para ver esta sección.
                </Text>
              </View>
            ) : null;
          }

          const rutaInterna = {
            key: `ficha-${tab.key}`,
            name: tab.key,
            params: {
              pacienteId,
              nombrePaciente,
              episodioId: episodioActivo,
              onEpisodiosCambiaron: cargarEpisodios,
              ...(paramsExtra[tab.key] || {}),
            },
          };

          return (
            <View
              key={tab.key}
              style={activa ? styles.panelActivo : styles.panelOculto}
              pointerEvents={activa ? 'auto' : 'none'}
            >
              <Componente route={rutaInterna} navigation={navegacionInterna} />
            </View>
          );
        })}
      </View>

      <DialogoConfirmacion
        visible={confirmacion !== null}
        titulo={confirmacion?.titulo || ''}
        mensaje={confirmacion?.mensaje}
        etiquetaConfirmar={confirmacion?.etiqueta || 'Confirmar'}
        tono="peligro"
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
        onCerrar={() => setAviso(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.fondo },

  contexto: {
    backgroundColor: colores.primarioSuave,
    borderBottomWidth: 1,
    borderBottomColor: colores.primarioBorde,
    paddingHorizontal: espacio.lg,
    paddingVertical: espacio.md,
  },
  contextoError: { backgroundColor: colores.errorSuave, borderBottomColor: colores.errorBorde },
  etiquetaContexto: {
    ...tipografia.micro,
    color: colores.primario,
    marginBottom: espacio.xs,
  },
  selector: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.primarioBorde,
    borderRadius: radio.md,
    overflow: 'hidden',
    paddingHorizontal: espacio.sm,
  },
  picker: { color: colores.texto },
  detalleContexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.xs },
  filaContexto: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm, flexWrap: 'wrap' },
  avisoLectura: {
    marginTop: espacio.sm,
    padding: espacio.sm,
    borderRadius: radio.md,
    backgroundColor: colores.infoSuave,
    borderWidth: 1,
    borderColor: colores.infoBorde,
  },
  avisoLecturaTexto: { ...tipografia.metaFuerte, color: colores.info },
  avisoLecturaAyuda: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  sinEpisodios: { ...tipografia.meta, color: colores.textoSuave, flex: 1 },
  errorContexto: { ...tipografia.meta, color: colores.error, flex: 1 },
  enlaceCrear: { ...tipografia.metaFuerte, color: colores.primario },

  panel: { flex: 1 },
  // La pestaña activa participa del layout normal (nada de posiciones
  // absolutas: en Android recortaban el contenido). Las inactivas se
  // mantienen montadas pero fuera del layout para no perder lo escrito.
  panelActivo: { flex: 1 },
  panelOculto: { display: 'none' },

  aviso: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  avisoTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', fontStyle: 'italic' },
});
