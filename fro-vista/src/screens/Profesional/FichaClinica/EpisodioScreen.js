import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator
} from 'react-native';
import apiClient, { getHistorialPaciente } from '../../../api/client';
import VistaConTeclado from '../../../components/VistaConTeclado';
import DialogoAviso from '../../../components/DialogoAviso';
import { formatearFecha } from '../../../utils/fechas';
import { textoLegible } from '../../../utils/estados';
import DialogoConfirmacion from '../../../components/DialogoConfirmacion';
import { colores, espacio, piezas, radio, tipografia } from '../../../theme';

// ─────────────────────────────────────────────────────────────────────────────
// EpisodioScreen — CU13
// El token JWT se inyecta automáticamente por el interceptor de client.js
// Cada petición dispara auditarAccesoClinico en el backend
// ─────────────────────────────────────────────────────────────────────────────
export default function EpisodioScreen({ route, navigation }) {
  // La ficha entrega el paciente en contexto; antes había que saberse de
  // memoria el identificador del episodio para poder consultarlo.
  const { pacienteId, nombrePaciente, episodioId: episodioDelContexto, onEpisodiosCambiaron } =
    route?.params || {};

  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).

  const [aviso, setAviso] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);

  const [episodiosDisponibles, setEpisodiosDisponibles] = useState(null);
  const [cargandoLista, setCargandoLista] = useState(false);

  const verEpisodiosDelPaciente = async () => {
    setCargandoLista(true);
    try {
      const data = await getHistorialPaciente(pacienteId);
      const lista = (data?.episodios || []).map((ep) => ({
        id: ep.episodio_clinico_id,
        titulo: `Episodio #${ep.episodio_clinico_id}`,
        detalle: ep.motivo_consulta || 'Sin motivo registrado',
        nota: `${textoLegible(ep.estado, 'Abierto')} · desde ${formatearFecha(ep.fecha_inicio)}`,
      }));
      setEpisodiosDisponibles(lista);
    } catch (error) {
      // El motivo real, no un texto genérico: distinguir un problema de
      // permisos de uno de red cambia por completo qué hacer.
      setAviso({
        tono: 'error',
        titulo: 'No se pudo consultar',
        mensaje:
          error.response?.data?.message ||
          error.response?.data?.error ||
          `No fue posible obtener los episodios (${error.response?.status || 'sin respuesta del servidor'}).`,
      });
    } finally {
      setCargandoLista(false);
    }
  };

  // ─ Estado para BUSCAR episodio ──────────────────────────────────────────
  const [episodioId, setEpisodioId] = useState(
    episodioDelContexto ? String(episodioDelContexto) : ''
  );
  const [episodio, setEpisodio] = useState(null);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);

  // ─ Estado para el botón de iniciar atención
  const [cargandoEvolucion, setCargandoEvolucion] = useState(false);

  // ─ Estado para CREAR episodio ───────────────────────────────────────────
  // Solo el motivo: el paciente lo pone el contexto de la ficha y el
  // profesional sale de la sesión.
  const [nuevoEpisodio, setNuevoEpisodio] = useState({ motivo_consulta: '' });
  const [cargandoCreacion, setCargandoCreacion] = useState(false);
  // Tras crear un episodio, la app dice cuál es el paso siguiente en vez
  // de dejar al profesional adivinando dónde continuar.
  const [recienCreado, setRecienCreado] = useState(null);

  // ─ LECTURA: GET /api/clinica/episodio/:id ────────────────────────────────
  // ─ LECTURA_EPISODIO_CLINICO en Bitacora_Auditoria
  const buscarEpisodio = async () => {
    if (!episodioId) {
      setAviso({ tono: 'error', titulo: 'Error', mensaje: 'Ingresa el ID del episodio.' });
      return;
    }
    setCargandoBusqueda(true);
    setEpisodio(null);
    try {
      const { data } = await apiClient.get(`/clinica/episodio/${episodioId}`);
      setEpisodio(data);
    } catch (error) {
      const err = error.response?.data;
      if (error.response?.status === 401) {
        setAviso({ tono: 'error', titulo: 'Sesión inválida', mensaje: 'Tu sesión ha expirado. Inicia sesión nuevamente.' });
      } else if (error.response?.status === 403) {
        setAviso({ tono: 'error', titulo: 'Acceso denegado', mensaje: err?.error || 'No tienes permisos para esta acción.' });
      } else if (err?.error === 'FALLO_BITACORA') {
        setAviso({ tono: 'error', titulo: 'Error de auditoría', mensaje: err.mensaje });
      } else {
        setAviso({ tono: 'error', titulo: 'Error', mensaje: err?.error || 'No se pudo obtener el episodio.' });
      }
    } finally {
      setCargandoBusqueda(false);
    }
  };

  // ─ INICIAR ATENCIÓN (CREAR EVOLUCIÓN EN BLANCO) ──────────────────────────
  const iniciarAtencion = async () => {
    setCargandoEvolucion(true);
    try {
      const { data } = await apiClient.post(`/clinica/episodio/${episodio.episodio_clinico_id}/evolucion`);
      setAviso({ tono: 'ok', titulo: 'Atención Iniciada', mensaje: `${data.mensaje}\n\nEl ID de tu nueva Evolución es: ${data.evolucion_clinica_id}\n(Anótalo para registrar avances o firmarlo)` });
    } catch (error) {
      const err = error.response?.data;
      setAviso({ tono: 'error', titulo: 'Error', mensaje: err?.error || 'No se pudo iniciar la sesión clínica.' });
    } finally {
      setCargandoEvolucion(false);
    }
  };

  // ─ CIERRE (D12 / CU78): PUT /api/clinica/episodio/:id { estado: 'CERRADO' }
  // Un episodio cerrado deja de admitir sesiones, metas, pautas y documentos.
  const [cerrando, setCerrando] = useState(false);
  const episodioCerrado = String(episodio?.estado || '').toUpperCase() === 'CERRADO';

  const cerrarEpisodio = async () => {
    setCerrando(true);
    try {
      const { data } = await apiClient.put(`/clinica/episodio/${episodio.episodio_clinico_id}`, {
        estado: 'CERRADO',
      });
      setEpisodio({ ...episodio, estado: 'CERRADO' });
      if (onEpisodiosCambiaron) onEpisodiosCambiaron();
      setAviso({ tono: 'ok', titulo: 'Episodio cerrado', mensaje: data.mensaje });
    } catch (error) {
      const err = error.response?.data;
      setAviso({ tono: 'error', titulo: 'No se pudo cerrar', mensaje: err?.mensaje || err?.error || 'Intenta nuevamente.' });
    } finally {
      setCerrando(false);
    }
  };

  // ─ CREACIÓN: POST /api/clinica/episodio ──────────────────────────────────
  // Dispara: CREACION_EPISODIO_CLINICO en Bitacora_Auditoria
  const crearEpisodio = async () => {
    const { motivo_consulta } = nuevoEpisodio;
    const paciente_id = pacienteId;
    if (!motivo_consulta || !paciente_id) {
      setAviso({ tono: 'info', titulo: 'Falta el motivo', mensaje: 'Escribe el motivo de consulta del nuevo episodio.' });
      return;
    }
    setCargandoCreacion(true);
    try {
      // El profesional lo resuelve el servidor desde la sesión.
      const { data } = await apiClient.post('/clinica/episodio', {
        motivo_consulta,
        paciente_id: parseInt(paciente_id, 10),
      });
      if (onEpisodiosCambiaron) onEpisodiosCambiaron();
      setRecienCreado({
        id: data.episodio_clinico_id,
        motivo: motivo_consulta,
      });
      setAviso({ tono: 'ok', titulo: 'Episodio creado', mensaje: data.mensaje });
      setNuevoEpisodio({ motivo_consulta: '' });
    } catch (error) {
      const err = error.response?.data;
      if (error.response?.status === 401) {
        setAviso({ tono: 'error', titulo: 'Sesión inválida', mensaje: 'Tu sesión ha expirado. Inicia sesión nuevamente.' });
      } else if (error.response?.status === 403) {
        setAviso({ tono: 'error', titulo: 'Acceso denegado', mensaje: err?.error || 'No tienes permisos para esta acción.' });
      } else if (err?.error === 'FALLO_BITACORA') {
        setAviso({ tono: 'error', titulo: 'Error de auditoría', mensaje: err.mensaje });
      } else {
        setAviso({ tono: 'error', titulo: 'Error', mensaje: err?.error || 'No se pudo crear el episodio.' });
      }
    } finally {
      setCargandoCreacion(false);
    }
  };

  return (
    <VistaConTeclado style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>Episodios Clínicos</Text>
        <Text style={styles.subtitulo}>Cada acción queda registrada en la bitácora de auditoría.</Text>

        {/* ── BUSCAR EPISODIO ─────────────────────────────────────────────── */}
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Consultar Episodio</Text>
          <Text style={styles.label}>ID del episodio</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 12"
            keyboardType="numeric"
            value={episodioId}
            onChangeText={setEpisodioId}
          />
          {pacienteId ? (
            <TouchableOpacity
              style={styles.botonVerEpisodios}
              onPress={verEpisodiosDelPaciente}
              disabled={cargandoLista}
            >
              <Text style={styles.botonVerEpisodiosTexto}>
                {cargandoLista ? 'Buscando…' : '📁 Ver episodios de este paciente'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.boton} onPress={buscarEpisodio} disabled={cargandoBusqueda}>
            {cargandoBusqueda
              ? <ActivityIndicator color={colores.superficie} />
              : <Text style={styles.botonTexto}>Buscar</Text>}
          </TouchableOpacity>
          
          {episodio && (
            <View style={styles.resultado}>
              <Text style={styles.resultadoTitulo}>Episodio #{episodio.episodio_clinico_id}</Text>
              <Text style={styles.resultadoCampo}>Motivo: {episodio.motivo_consulta}</Text>
              <Text style={styles.resultadoCampo}>Estado: {textoLegible(episodio.estado, 'Abierto')}</Text>
              <Text style={styles.resultadoCampo}>Inicio: {formatearFecha(episodio.fecha_inicio)}</Text>
              {episodioCerrado && (
                <Text style={styles.resultadoCampo}>Cierre: {formatearFecha(episodio.fecha_terminado)}</Text>
              )}

              {episodioCerrado ? (
                <Text style={styles.notaCerrado}>
                  🔒 Episodio cerrado: no admite nuevas sesiones, metas, pautas ni documentos.
                  Para seguir atendiendo este motivo, crea un episodio nuevo.
                </Text>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.boton, { backgroundColor: colores.advertencia, marginTop: 15 }]}
                    onPress={iniciarAtencion}
                    disabled={cargandoEvolucion}
                  >
                    {cargandoEvolucion
                      ? <ActivityIndicator color={colores.superficie} />
                      : <Text style={styles.botonTexto}>+ Iniciar Nueva Atención</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.botonCerrar}
                    onPress={() =>
                      setConfirmacion({
                        titulo: 'Cerrar episodio',
                        mensaje: `El episodio #${episodio.episodio_clinico_id} quedará cerrado y no admitirá nuevos registros clínicos. ¿Confirmas el cierre?`,
                        etiqueta: 'Cerrar episodio',
                        accion: cerrarEpisodio,
                      })
                    }
                    disabled={cerrando}
                  >
                    <Text style={styles.botonCerrarTexto}>
                      {cerrando ? 'Cerrando…' : '🔒 Cerrar episodio (alta del tratamiento)'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

            </View>
          )}
        </View>

        {/* ── CREAR EPISODIO ──────────────────────────────────────────────── */}
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Crear Episodio</Text>
          <Text style={styles.label}>Motivo de consulta</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: dolor lumbar"
            value={nuevoEpisodio.motivo_consulta}
            onChangeText={(v) => setNuevoEpisodio({ ...nuevoEpisodio, motivo_consulta: v })}
          />
          <Text style={styles.notaContexto}>
            Se creará para {nombrePaciente || 'este paciente'} a tu nombre.
          </Text>
          {recienCreado && (
            <View style={styles.guiaSiguiente}>
              <Text style={styles.guiaTitulo}>
                ✓ Episodio #{recienCreado.id} creado
              </Text>
              <Text style={styles.guiaTexto}>
                Ya quedó seleccionado arriba. El paso siguiente es registrar la
                sesión de hoy.
              </Text>
              <TouchableOpacity
                style={styles.guiaBoton}
                onPress={() =>
                  navigation.navigate('SesionClinica', { episodioId: String(recienCreado.id) })
                }
              >
                <Text style={styles.guiaBotonTexto}>Continuar a la sesión clínica →</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.boton, { backgroundColor: colores.exito }]}
            onPress={crearEpisodio}
            disabled={cargandoCreacion}
          >
            {cargandoCreacion
              ? <ActivityIndicator color={colores.superficie} />
              : <Text style={styles.botonTexto}>Crear Episodio</Text>}
          </TouchableOpacity>
        </View>
        <DialogoAviso
        visible={episodiosDisponibles !== null}
        titulo="Episodios del paciente"
        mensaje={
          episodiosDisponibles?.length
            ? 'Toca uno para consultarlo.'
            : 'Este paciente todavía no tiene episodios registrados.'
        }
        lista={episodiosDisponibles || []}
        tono="info"
        etiquetaCerrar="Cerrar"
        onSeleccionarFila={
          episodiosDisponibles?.length
            ? (fila) => {
                setEpisodioId(String(fila.id));
                setEpisodiosDisponibles(null);
              }
            : undefined
        }
        onCerrar={() => setEpisodiosDisponibles(null)}
      />
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
  label: { ...piezas.etiqueta },
  container: {
    flex: 1,
    backgroundColor: colores.fondo,
    // El contenido no puede quedar al ras del borde de la pantalla.
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.base,
  },
  title: {
    ...tipografia.titulo,
    color: colores.textoTitulo,
    marginBottom: 4,
  },
  subtitulo: {
    ...tipografia.meta,
    color: colores.textoSuave,
    marginBottom: 24,
  },
  seccion: {
    ...tipografia.micro,
    color: colores.textoTenue,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  seccionTitulo: {
    ...tipografia.micro,
    color: colores.textoTenue,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  input: {
    ...piezas.campo,
    marginBottom: 12,
  },
  boton: {
    ...piezas.botonPrimario,
    alignItems: 'center',
  },
  botonTexto: {
    ...tipografia.cuerpoFuerte,
    color: colores.textoInverso,
  },
  resultado: {
    ...piezas.tarjeta,
    marginTop: 16,
  },
  // Bloque de "qué sigue": aparece tras completar una acción.
  guiaSiguiente: {
    backgroundColor: colores.exitoSuave,
    borderWidth: 1,
    borderColor: colores.exitoBorde,
    borderRadius: radio.md,
    padding: espacio.base,
    marginBottom: espacio.base,
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
  notaContexto: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.md },
  botonVerEpisodios: {
    ...piezas.botonSecundario,
    paddingVertical: espacio.md,
    marginBottom: espacio.md,
  },
  botonVerEpisodiosTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },
  botonCerrar: {
    ...piezas.botonSecundario,
    marginTop: espacio.md,
    paddingVertical: espacio.md,
    borderColor: colores.error,
  },
  botonCerrarTexto: { ...tipografia.cuerpoFuerte, color: colores.error },
  notaCerrado: {
    ...tipografia.meta,
    color: colores.textoSuave,
    backgroundColor: colores.fondo,
    borderRadius: radio.md,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  resultadoTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: 8 },
  resultadoCampo: { ...tipografia.cuerpo, color: colores.texto, marginBottom: 4 }
});