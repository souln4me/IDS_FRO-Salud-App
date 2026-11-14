/**
 * Componente: Cliente Móvil — Vista "Derivación interna"
 * Casos de uso: CU65, CU60.
 */
// Ruta: fro-vista/src/screens/Profesional/DerivacionInternaScreen.js
//
// CU65 — Derivar un episodio a otra especialidad. Se abre desde la cabecera de
// la ficha (episodio propio y abierto). Arriba están las derivaciones que el
// episodio ya tiene; abajo, el formulario: especialidad → profesional →
// justificación. Derivar es traspasar: mientras está pendiente, el receptor
// lee la ficha para decidir; al aceptar, el episodio pasa a su cargo y quien
// derivó lo conserva en solo lectura.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

import {
  getOpcionesDerivacion, getDerivacionesEpisodio, crearDerivacion, cerrarDerivacion,
} from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';
import { formatearFechaHora } from '../../utils/fechas';
import { datosEstado } from '../../utils/estados';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const MAX_JUSTIFICACION = 255;
const MIN_JUSTIFICACION = 10;

export default function DerivacionInternaScreen({ route, navigation }) {
  const { episodioId, nombrePaciente, motivoEpisodio } = route?.params || {};

  const [especialidades, setEspecialidades] = useState([]);
  const [derivaciones, setDerivaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);       // { mensaje, sinEspecialidades }
  const [especialidadId, setEspecialidadId] = useState(null);
  const [destinoId, setDestinoId] = useState(null);
  const [justificacion, setJustificacion] = useState('');
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);

  // CU65 — cargar especialidades disponibles y derivaciones del episodio
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [opciones, actuales] = await Promise.all([
        getOpcionesDerivacion(episodioId),
        getDerivacionesEpisodio(episodioId),
      ]);
      setEspecialidades(opciones.especialidades || []);
      setDerivaciones(actuales.derivaciones || []);
    } catch (e) {
      const datos = e.response?.data;
      setError({
        mensaje: datos?.mensaje || datos?.error || 'No se pudieron cargar las especialidades disponibles.',
        sinEspecialidades: datos?.error === 'SIN_ESPECIALIDADES_DISPONIBLES',
        inalterable: datos?.error === 'EPISODIO_INALTERABLE',
      });
    } finally {
      setCargando(false);
    }
  }, [episodioId]);

  useEffect(() => {
    navigation.setOptions({ title: 'Derivación interna' });
    cargar();
  }, [navigation, cargar]);

  const especialidad = especialidades.find((e) => e.especialidad_id === especialidadId);

  // CU65 — elegir la especialidad de destino
  const elegirEspecialidad = (e) => {
    // Excepción 2: la especialidad existe pero nadie puede recibir la derivación.
    if (e.profesionales.length === 0) {
      setAviso({
        tono: 'alerta',
        titulo: `${e.nombre} no está disponible`,
        mensaje: 'No hay profesionales activos de esta especialidad para recibir la derivación. Puedes pedir su alta al administrador con un ticket de soporte.',
        ticket: true,
      });
      return;
    }
    setEspecialidadId(e.especialidad_id);
    setDestinoId(e.profesionales.length === 1 ? e.profesionales[0].profesional_id : null);
    setErrores((previos) => ({ ...previos, destino: null }));
  };

  // CU65 — Registrando y Siguiendo Derivaciones Internas
  const enviar = async () => {
    const texto = justificacion.trim();
    const nuevos = {};
    if (!destinoId) nuevos.destino = 'Elige la especialidad y el profesional que recibirá al paciente.';
    // Excepción 3: el motivo es obligatorio.
    if (texto.length < MIN_JUSTIFICACION) nuevos.justificacion = `Escribe el motivo clínico (al menos ${MIN_JUSTIFICACION} caracteres).`;
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setEnviando(true);
    try {
      const datos = await crearDerivacion(episodioId, { profesional_destino_id: destinoId, justificacion: texto });
      setJustificacion('');
      setEspecialidadId(null);
      setDestinoId(null);
      await cargar();
      setAviso({ tono: 'ok', titulo: 'Derivación enviada', mensaje: datos.mensaje });
    } catch (e) {
      const datos = e.response?.data;
      if (datos?.campo === 'justificacion') {
        setErrores({ justificacion: datos.mensaje });
      } else {
        // Excepción 4: el servidor revirtió todo; se puede repetir tal cual.
        setAviso({
          tono: 'error',
          titulo: datos?.error === 'DERIVACION_REVERTIDA' ? 'La derivación no se registró' : 'No se pudo derivar',
          mensaje: datos?.mensaje || 'Revisa tu conexión y vuelve a intentarlo. Lo que escribiste sigue en el formulario.',
        });
      }
    } finally {
      setEnviando(false);
    }
  };

  // CU65 — cancelar una derivación pendiente
  const cerrar = async (d) => {
    try {
      const datos = await cerrarDerivacion(d.derivacion_interna_id);
      await cargar();
      setAviso({ tono: 'ok', titulo: 'Derivación cancelada', mensaje: datos.mensaje });
    } catch (e) {
      setAviso({ tono: 'error', titulo: 'No se pudo cancelar', mensaje: e.response?.data?.mensaje || 'Intenta nuevamente.' });
    }
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        {error.sinEspecialidades || error.inalterable ? (
          <View style={estilos.bloqueo}>
            <Text style={estilos.bloqueoTitulo}>
              {error.inalterable ? 'Episodio inalterable' : 'Sin especialidades disponibles'}
            </Text>
            <Text style={estilos.bloqueoTexto}>{error.mensaje}</Text>
            {/* CU60: sin especialidades, se ofrece abrir un ticket de soporte */}
            {error.sinEspecialidades && (
              <TouchableOpacity
                style={estilos.boton}
                onPress={() => navigation.navigate('Soporte')}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={estilos.botonTexto}>Crear ticket de soporte</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ErrorRetry mensaje={error.mensaje} onRetry={cargar} />
        )}
      </View>
    );
  }

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.contexto}>
        {nombrePaciente ? `${nombrePaciente} · ` : ''}episodio #{episodioId}
        {motivoEpisodio ? ` · ${motivoEpisodio}` : ''}
      </Text>

      {derivaciones.length > 0 && (
        <View style={estilos.seccion}>
          <Text style={estilos.titulo}>Derivaciones de este episodio</Text>
          {derivaciones.map((d) => {
            const estado = datosEstado(d.estado);
            const pendiente = d.estado === 'PENDIENTE';
            return (
              <View key={d.derivacion_interna_id} style={estilos.tarjeta}>
                <View style={estilos.filaEntre}>
                  <Text style={estilos.nombre}>{d.profesional_destino}</Text>
                  <Text style={[estilos.estado, { color: estado.color }]}>{estado.etiqueta}</Text>
                </View>
                <Text style={estilos.meta}>{d.especialidad_destino} · {formatearFechaHora(d.momento_creacion)}</Text>
                <Text style={estilos.justificacion}>“{d.justificacion}”</Text>
                {d.comentario_respuesta ? (
                  <Text style={estilos.meta}>Respuesta: {d.comentario_respuesta}</Text>
                ) : null}
                {d.estado === 'ACEPTADA' && (
                  <Text style={estilos.meta}>El episodio quedó a cargo de {d.profesional_destino}.</Text>
                )}
                {pendiente && (
                  <TouchableOpacity
                    onPress={() => setConfirmacion(d)}
                    activeOpacity={interaccion.opacidadActiva}
                  >
                    <Text style={estilos.enlace}>Cancelar derivación</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={estilos.seccion}>
        <Text style={estilos.titulo}>Nueva derivación</Text>

        <Text style={piezas.etiqueta}>Especialidad</Text>
        <View style={[estilos.chips, errores.destino && !especialidadId && estilos.grupoError]}>
          {especialidades.map((e) => {
            const elegida = e.especialidad_id === especialidadId;
            const vacia = e.profesionales.length === 0;
            return (
              <TouchableOpacity
                key={e.especialidad_id}
                style={[estilos.chip, elegida && estilos.chipElegido, vacia && estilos.chipVacio]}
                onPress={() => elegirEspecialidad(e)}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={[estilos.chipTexto, elegida && estilos.chipTextoElegido, vacia && estilos.chipTextoVacio]}>
                  {e.nombre}{vacia ? ' · sin profesionales' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {especialidad && (
          <>
            <Text style={[piezas.etiqueta, estilos.separado]}>Profesional que recibe</Text>
            <View style={[estilos.chips, errores.destino && estilos.grupoError]}>
              {especialidad.profesionales.map((p) => {
                const elegido = p.profesional_id === destinoId;
                return (
                  <TouchableOpacity
                    key={p.profesional_id}
                    style={[estilos.chip, elegido && estilos.chipElegido]}
                    onPress={() => {
                      setDestinoId(p.profesional_id);
                      setErrores((previos) => ({ ...previos, destino: null }));
                    }}
                    activeOpacity={interaccion.opacidadActiva}
                  >
                    <Text style={[estilos.chipTexto, elegido && estilos.chipTextoElegido]}>{p.nombre}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        {errores.destino ? <Text style={estilos.error}>{errores.destino}</Text> : null}

        <Text style={[piezas.etiqueta, estilos.separado]}>Justificación clínica</Text>
        <TextInput
          style={[piezas.campo, estilos.area, errores.justificacion && piezas.campoError]}
          value={justificacion}
          onChangeText={(t) => {
            setJustificacion(t.slice(0, MAX_JUSTIFICACION));
            if (errores.justificacion) setErrores((previos) => ({ ...previos, justificacion: null }));
          }}
          placeholder="Ej.: Dolor lumbar persistente con sospecha de origen postural; requiere evaluación de kinesiología."
          placeholderTextColor={colores.textoTenue}
          multiline
          textAlignVertical="top"
        />
        <View style={estilos.filaEntre}>
          <Text style={estilos.error}>{errores.justificacion || ''}</Text>
          <Text style={estilos.contador}>{justificacion.length}/{MAX_JUSTIFICACION}</Text>
        </View>

        <Text style={estilos.ayuda}>
          Mientras la derivación esté pendiente, el profesional podrá leer la ficha para decidir. Al aceptarla, el episodio pasa a su cargo y tú lo conservas en solo lectura.
        </Text>

        <TouchableOpacity
          style={[estilos.boton, enviando && estilos.deshabilitado]}
          onPress={enviar}
          disabled={enviando}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.botonTexto}>{enviando ? 'Enviando…' : 'Enviar derivación'}</Text>
        </TouchableOpacity>
      </View>

      <DialogoConfirmacion
        visible={confirmacion !== null}
        titulo="Cancelar la derivación"
        mensaje={confirmacion ? `${confirmacion.profesional_destino} dejará de ver la ficha y el episodio sigue a tu cargo.` : ''}
        etiquetaConfirmar="Cancelar derivación"
        tono="peligro"
        onConfirmar={() => {
          const d = confirmacion;
          setConfirmacion(null);
          if (d) cerrar(d);
        }}
        onCancelar={() => setConfirmacion(null)}
      />
      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        etiquetaCerrar={aviso?.ticket ? 'Crear ticket de soporte' : 'Entendido'}
        onCerrar={() => {
          const ticket = aviso?.ticket;
          setAviso(null);
          if (ticket) navigation.navigate('Soporte');
        }}
      />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  contexto: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },
  seccion: { marginBottom: espacio.xl },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.md },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.sm },
  nombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, flex: 1 },
  estado: { ...tipografia.metaFuerte },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  justificacion: { ...tipografia.cuerpo, color: colores.texto, fontStyle: 'italic', marginTop: espacio.sm },
  enlace: { ...tipografia.metaFuerte, color: colores.error, marginTop: espacio.md },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, borderRadius: radio.md },
  grupoError: { padding: espacio.xs, borderWidth: 1, borderColor: colores.errorBorde, backgroundColor: colores.errorSuave },
  chip: { paddingVertical: espacio.sm, paddingHorizontal: espacio.md, borderRadius: radio.completo, borderWidth: 1, borderColor: colores.bordeCampo, backgroundColor: colores.superficie },
  chipElegido: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  chipVacio: { borderStyle: 'dashed', backgroundColor: colores.superficieSuave },
  chipTexto: { ...tipografia.meta, color: colores.texto, fontWeight: '600' },
  chipTextoElegido: { color: colores.primario },
  chipTextoVacio: { color: colores.textoTenue },
  separado: { marginTop: espacio.base },

  area: { minHeight: 110 },
  contador: { ...tipografia.meta, color: colores.textoTenue, marginTop: espacio.xs, fontVariant: ['tabular-nums'] },
  error: { ...tipografia.meta, color: colores.error, marginTop: espacio.xs, flex: 1 },
  ayuda: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.md },

  boton: { ...piezas.botonPrimario, marginTop: espacio.lg },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },

  bloqueo: { ...piezas.tarjeta, alignSelf: 'stretch', borderColor: colores.advertenciaBorde, backgroundColor: colores.advertenciaSuave },
  bloqueoTitulo: { ...tipografia.subtitulo, color: colores.advertencia, marginBottom: espacio.sm },
  bloqueoTexto: { ...tipografia.cuerpo, color: colores.texto },
});
