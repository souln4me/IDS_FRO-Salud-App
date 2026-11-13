/**
 * Componente: Cliente Móvil — Vista "Mis ejercicios"
 * Casos de uso: CU48, CU49, CU44, CU54, CU35.
 */
// Ruta: fro-vista/src/screens/Paciente/MisPautasScreen.js
//
// CU48: el paciente marca a diario los ejercicios que completó.
// CU49: las pautas expiradas quedan cerradas y su material deja de mostrarse.
// Un ejercicio puede ir en días fijos de la semana: los otros días no se marca.
// Cada ejercicio muestra su material de apoyo, que se abre en el visor.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import apiClient from '../../api/client';
import { formatearFecha, formatearFechaHora } from '../../utils/fechas';
import ErrorRetry from '../../components/ErrorRetry';
import VistaConTeclado from '../../components/VistaConTeclado';
import { colores, radio, espacio, tipografia } from '../../theme';
import EtiquetaEstado from '../../components/EtiquetaEstado';
import DialogoAviso from '../../components/DialogoAviso';
import Icono from '../../components/Icono';
import MaterialApoyo from '../../components/MaterialApoyo';
import { diaSemanaHoy } from '../../components/SelectorDiasSemana';

// CU48 — Excepción 2: última pauta que cargó bien, para mostrarla sin señal.
const CLAVE_CACHE = 'cu48_cache_pautas';

/** "lunes, miércoles y viernes" → "Lunes, miércoles y viernes". */
function conMayuscula(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
}

/** Frecuencia legible (los ejercicios en días fijos muestran sus días aparte). */
function textoFrecuencia(ejercicio) {
  return ejercicio.frecuencia === 'SEMANAL' ? 'semanal' : 'diaria';
}

/**
 * ¿Toca hacer el ejercicio hoy? Con datos en vivo manda el servidor. Con la
 * copia sin señal se calcula con la fecha del teléfono, porque la copia
 * puede ser de otro día. Las copias antiguas no traen el dato: corresponde.
 */
function correspondeHoy(ejercicio, desdeCache) {
  const dias = Array.isArray(ejercicio.dias_semana) ? ejercicio.dias_semana : [];
  if (desdeCache) return dias.length === 0 || dias.includes(diaSemanaHoy());
  return ejercicio.corresponde_hoy !== false;
}

export default function MisPautasScreen({ navigation }) {
  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).
  const [aviso, setAviso] = useState(null);
  // CU44: porcentaje de adherencia, que el servidor devuelve al marcar.
  const [adherencia, setAdherencia] = useState(null);
  const [pautas, setPautas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [errorRed, setErrorRed] = useState(false);
  const [marcandoId, setMarcandoId] = useState(null);
  // Fecha en que se guardó la copia local que se está mostrando (null = datos en vivo).
  const [desdeCache, setDesdeCache] = useState(null);

  // CU48, CU49 — carga las pautas con su vigencia; sin señal usa la copia local
  const cargarPautas = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setErrorRed(false);

    try {
      const { data } = await apiClient.get('/clinica/pautas/mis-pautas');
      const lista = data?.pautas || [];
      setPautas(lista);
      setDesdeCache(null);
      // Cada carga exitosa deja una copia local: es lo que se muestra sin señal.
      AsyncStorage.setItem(
        CLAVE_CACHE,
        JSON.stringify({ pautas: lista, guardadoEn: new Date().toISOString() })
      ).catch(() => {});
    } catch {
      // CU48 — Excepción 2: falla de comunicación → se activa la caché local.
      // Si hay copia, se muestra (solo lectura) con la fecha en que se guardó;
      // si no la hay, se ofrece recargar.
      try {
        const copia = await AsyncStorage.getItem(CLAVE_CACHE);
        if (copia) {
          const { pautas: guardadas, guardadoEn } = JSON.parse(copia);
          setPautas(guardadas || []);
          setDesdeCache(guardadoEn || 'desconocida');
          return;
        }
      } catch {
        // caché ilegible: se cae al aviso de recarga
      }
      setErrorRed(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargarPautas();
  }, [cargarPautas]);

  // ── CU48: marcar / desmarcar el día de hoy ─────────────────────────────────
  const alternarCumplimiento = async (ejercicio) => {
    // Sin conexión no se puede registrar: la marca necesita llegar al servidor.
    if (desdeCache) {
      setAviso({ tono: 'error', titulo: 'Sin conexión', mensaje: 'Estás viendo tu pauta guardada. Recarga la lista cuando vuelva la señal para marcar ejercicios.' });
      return;
    }
    // Ejercicio en días fijos y hoy no es uno de ellos: ni se llama al servidor.
    if (!correspondeHoy(ejercicio, desdeCache)) return;
    // Anti-rebote local: mientras hay una marca en vuelo se ignoran más toques.
    if (marcandoId !== null) return;
    setMarcandoId(ejercicio.pauta_ejercicio_id);

    try {
      // CU44: el servidor recalcula el índice de adherencia con cada marca y lo
      // devuelve, así el paciente ve el efecto de lo que acaba de hacer.
      const { data } = ejercicio.cumplido_hoy
        ? await apiClient.delete(`/clinica/pautas/ejercicios/${ejercicio.pauta_ejercicio_id}/cumplimiento`)
        : await apiClient.post(`/clinica/pautas/ejercicios/${ejercicio.pauta_ejercicio_id}/cumplimiento`);
      if (data?.adherencia !== null && data?.adherencia !== undefined) {
        setAdherencia(data.adherencia);
        // CU54: el refuerzo también se muestra al instante, además de llegar a la campana.
        if (data.refuerzo) setAviso({ tono: 'ok', titulo: '¡Sigue así!', mensaje: data.refuerzo });
      }
      await cargarPautas(true);
    } catch (err) {
      const respuesta = err.response?.data;
      if (err.response?.status === 409 && respuesta?.error === 'NO_CORRESPONDE_HOY') {
        // La lista estaba desactualizada (p. ej. quedó abierta desde ayer):
        // se explica y se recarga para mostrar los días correctos.
        setAviso({ tono: 'info', titulo: 'Hoy no corresponde', mensaje: respuesta.mensaje || 'Este ejercicio no toca hoy.' });
        cargarPautas(true);
      } else {
        setAviso({ tono: 'error', titulo: 'No se pudo registrar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
      }
    } finally {
      setMarcandoId(null);
    }
  };

  // El material se abre en el visor, que lo pide al servidor: sin señal no se puede.
  // CU35 — Visualizando archivos con visor embebido
  const abrirMaterial = (material) => {
    if (desdeCache) {
      setAviso({ tono: 'error', titulo: 'Sin conexión', mensaje: 'Para ver el material de apoyo necesitas conexión. Recarga la lista cuando vuelva la señal.' });
      return;
    }
    navigation?.navigate('VisorDocumento', {
      materialId: material.pauta_ejercicio_material_id,
      nombre: material.nombre,
    });
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (errorRed) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry
          mensaje="No pudimos cargar tus ejercicios. Revisa tu conexión y recarga la lista."
          onRetry={() => cargarPautas(false)}
        />
      </View>
    );
  }

  return (
    <VistaConTeclado
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargarPautas(true)} colors={[colores.primario]} />
      }
    >
      {desdeCache && (
        <View style={estilos.avisoCache}>
          <Text style={estilos.avisoCacheTexto}>
            📴 Sin conexión. Mostrando tu pauta guardada el {formatearFechaHora(desdeCache, 'fecha desconocida')}.
            Desliza hacia abajo para recargar cuando vuelva la señal.
          </Text>
        </View>
      )}

      {/* CU44: el índice se mueve con cada marca, así que se muestra acá mismo
          en vez de obligar a ir al panel de progreso para verlo. */}
      {adherencia !== null && (
        <View style={estilos.cintaAdherencia}>
          <Text style={estilos.cintaAdherenciaTexto}>
            Tu adherencia va en {adherencia}%
          </Text>
        </View>
      )}

      {pautas.length === 0 ? (
        // CU48 — Excepción 1: sin rutinas en el rango actual.
        <View style={estilos.vacio}>
          <Text style={estilos.vacioIcono}>🏋️</Text>
          <Text style={estilos.vacioTitulo}>No tienes ejercicios asignados</Text>
          <Text style={estilos.vacioTexto}>
            Cuando tu profesional te prescriba una pauta, aparecerá aquí.
          </Text>
        </View>
      ) : (
        pautas.map((pauta) => {
          const expirada = pauta.estado === 'EXPIRADA';
          const programada = pauta.estado === 'PROGRAMADA';

          return (
            <View key={pauta.pauta_tratamiento_id} style={[estilos.tarjeta, expirada && estilos.tarjetaExpirada]}>
              <View style={estilos.filaTitulo}>
                <Text style={estilos.pautaNombre}>
                  {expirada ? '🔒 ' : ''}{pauta.nombre}
                </Text>
                <EtiquetaEstado estado={pauta.estado} tamano="sm" />
              </View>
              <Text style={estilos.pautaFechas}>
                {formatearFecha(pauta.fecha_inicio)} → {formatearFecha(pauta.fecha_expiracion)}
              </Text>

              {expirada ? (
                // CU49: el contenido de una pauta vencida queda resguardado.
                <Text style={estilos.textoExpirada}>
                  Esta pauta terminó y su contenido quedó cerrado. Si necesitas continuar,
                  pídele a tu profesional una pauta nueva.
                </Text>
              ) : programada ? (
                <Text style={estilos.textoProgramada}>
                  Esta pauta comienza el {formatearFecha(pauta.fecha_inicio)}. Aún no puedes marcar ejercicios.
                </Text>
              ) : (
                pauta.ejercicios.map((ejercicio) => {
                  const tocaHoy = correspondeHoy(ejercicio, desdeCache);
                  const info = (
                    <View style={estilos.ejercicioInfo}>
                      <Text style={estilos.ejercicioNombre}>{ejercicio.nombre_ejercicio}</Text>
                      <Text style={estilos.ejercicioDetalle}>
                        {ejercicio.series} series × {ejercicio.repeticiones} repeticiones
                        {ejercicio.dias_texto ? '' : ` · ${textoFrecuencia(ejercicio)}`}
                        {ejercicio.material_nombre ? `\n📚 ${ejercicio.material_nombre}` : ''}
                      </Text>
                      {ejercicio.dias_texto ? (
                        <View style={estilos.filaDias}>
                          <Icono name="calendar-outline" size={14} color={colores.primario} />
                          <Text style={estilos.diasTexto}>{conMayuscula(ejercicio.dias_texto)}</Text>
                        </View>
                      ) : null}
                      <Text style={estilos.adherencia}>
                        Llevas {ejercicio.dias_cumplidos} día(s) registrado(s)
                      </Text>
                      {!tocaHoy && <Text style={estilos.noCorresponde}>Hoy no corresponde</Text>}
                    </View>
                  );

                  return (
                    <View
                      key={ejercicio.pauta_ejercicio_id}
                      style={[
                        estilos.filaEjercicio,
                        ejercicio.cumplido_hoy && estilos.filaCumplida,
                        !tocaHoy && estilos.filaSinTurno,
                      ]}
                    >
                      {tocaHoy ? (
                        <TouchableOpacity
                          style={estilos.filaMarcado}
                          onPress={() => alternarCumplimiento(ejercicio)}
                          disabled={marcandoId !== null || desdeCache !== null}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: Boolean(ejercicio.cumplido_hoy) }}
                        >
                          <Text style={estilos.checkbox}>
                            {marcandoId === ejercicio.pauta_ejercicio_id
                              ? '⏳'
                              : ejercicio.cumplido_hoy
                                ? '✅'
                                : '⬜'}
                          </Text>
                          {info}
                        </TouchableOpacity>
                      ) : (
                        // Hoy no toca: sin casilla, para que no parezca pendiente.
                        <View style={estilos.filaMarcado}>
                          <View style={estilos.checkboxVacio}>
                            <Icono name="calendar-outline" size={20} color={colores.textoDeshabilitado} />
                          </View>
                          {info}
                        </View>
                      )}

                      <MaterialApoyo materiales={ejercicio.material_apoyo || []} onAbrir={abrirMaterial} />
                    </View>
                  );
                })
              )}
            </View>
          );
        })
      )}

      <Text style={estilos.notaPie}>
        Marca cada ejercicio el día que lo completes. Solo puedes registrar el día de hoy
        y, si tu ejercicio tiene días fijos, solo en esos días.
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
  contenido: { padding: 16, paddingBottom: 40 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  cintaAdherencia: {
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.md,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    marginBottom: espacio.base,
    alignItems: 'center',
  },
  cintaAdherenciaTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },

  avisoCache: {
    backgroundColor: colores.advertenciaSuave,
    borderWidth: 1,
    borderColor: colores.advertenciaBorde,
    borderRadius: radio.md,
    padding: 12,
    marginBottom: 12,
  },
  avisoCacheTexto: { color: colores.advertencia, fontSize: 13, lineHeight: 18 },
  vacio: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  vacioIcono: { fontSize: 48, marginBottom: 12 },
  vacioTitulo: { fontSize: 17, fontWeight: 'bold', color: colores.texto, marginBottom: 6 },
  vacioTexto: { color: colores.textoSuave, textAlign: 'center' },

  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 14,
    marginBottom: 14,
  },
  tarjetaExpirada: { backgroundColor: colores.superficieSuave },
  filaTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pautaNombre: { fontSize: 17, fontWeight: 'bold', color: colores.texto, flex: 1 },
  pautaFechas: { color: colores.textoSuave, fontSize: 13, marginBottom: 10 },

  textoExpirada: { color: colores.textoTenue, fontStyle: 'italic' },
  textoProgramada: { color: colores.primario, fontStyle: 'italic' },

  filaEjercicio: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    padding: 12,
    marginBottom: 8,
  },
  filaCumplida: { backgroundColor: colores.exitoSuave, borderColor: colores.exitoBorde },
  filaSinTurno: { backgroundColor: colores.superficieSuave },
  filaMarcado: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { fontSize: 22, marginRight: 12 },
  checkboxVacio: { width: 26, alignItems: 'center', marginRight: 12 },
  filaDias: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs, marginTop: espacio.xs },
  diasTexto: { ...tipografia.metaFuerte, color: colores.primario },
  noCorresponde: { ...tipografia.meta, color: colores.textoTenue, fontStyle: 'italic', marginTop: espacio.xs },
  ejercicioInfo: { flex: 1 },
  ejercicioNombre: { fontWeight: 'bold', color: colores.texto },
  ejercicioDetalle: { color: colores.textoSuave, fontSize: 13, marginTop: 2 },
  adherencia: { color: colores.exito, fontSize: 13, marginTop: 4, fontWeight: '600' },

  notaPie: { color: colores.textoTenue, fontSize: 13, textAlign: 'center', marginTop: 8 },
});
