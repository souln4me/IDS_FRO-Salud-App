// Ruta: fro-vista/src/screens/Profesional/FichaClinica/SesionClinicaScreen.js
//
// Registro clínico de la sesión. Reúne lo que antes estaban en dos pestañas
// separadas —"Evolución" e "Intervención"— que en realidad escribían la MISMA
// fila de Evolucion_Clinica, cada una llenando la mitad de los campos: nada
// le decía al profesional que había que completar ambas.
//
// Aquí se hace todo lo de una sesión, en el orden en que ocurre:
//   1. Qué se hizo        → técnicas aplicadas y respuesta del paciente
//   2. Cómo va el objetivo → metas del episodio y avance medido
//   3. Cerrar             → firma que vuelve el registro inalterable
//
// El episodio ya no se escribe a mano: llega desde el selector fijo de la
// ficha clínica, así que esta pantalla siempre trabaja sobre el paciente que
// está abierto arriba.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';

import apiClient, { getIntervencion, guardarIntervencion } from '../../../api/client';
import VistaConTeclado from '../../../components/VistaConTeclado';
import ErrorRetry from '../../../components/ErrorRetry';
import DialogoAviso from '../../../components/DialogoAviso';
import DialogoConfirmacion from '../../../components/DialogoConfirmacion';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../../theme';

// Expresiones que obligan a una revisión clínica prioritaria antes de guardar.
const PATRON_ALERTA_PRIORITARIA =
  /\b(dolor\s+(intenso|severo|insoportable)|dificultad\s+respiratoria|p[eé]rdida\s+de\s+conciencia|desmayo|convulsi[oó]n|deterioro\s+(grave|severo)|signos?\s+vitales?\s+inestables?)\b/i;

// Metas escritas en términos subjetivos: se sugiere cuantificarlas.
const PALABRAS_SUBJETIVAS =
  /\b(mejorar|mejor[íi]a|sentirse?\s+bien|bienestar|aliviar|alivio|fortalecer|avanzar|progresar|recuperar|estar\s+mejor)/i;

const claveBorrador = (episodioId) => `cu40_borrador_${episodioId}`;

export default function SesionClinicaScreen({ route, navigation }) {
  const episodioId = route?.params?.episodioId ? String(route.params.episodioId) : '';

  const [aviso, setAviso] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);

  // ── Contexto del episodio ────────────────────────────────────────────────
  const [contexto, setContexto] = useState(null);
  const [evolucion, setEvolucion] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  // ── 1. Qué se hizo ───────────────────────────────────────────────────────
  const [tecnicas, setTecnicas] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [guardando, setGuardando] = useState(false);

  // ── 2. Objetivos y avance ────────────────────────────────────────────────
  const [metas, setMetas] = useState([]);
  const [cargandoMetas, setCargandoMetas] = useState(false);
  const [nuevoObjetivo, setNuevoObjetivo] = useState({ descripcion: '', meta_valor: '', unidad: '' });
  const [creandoMeta, setCreandoMeta] = useState(false);
  const [avance, setAvance] = useState({ objetivo_terapeutico_id: '', valor_actual: '' });
  const [registrandoAvance, setRegistrandoAvance] = useState(false);

  // ── 3. Cierre ────────────────────────────────────────────────────────────
  const [firmando, setFirmando] = useState(false);

  const editable = contexto?.editable === true;
  const especialidad = contexto?.especialidad || 'General';
  const posibleDeterioro = useMemo(
    () => PATRON_ALERTA_PRIORITARIA.test(`${tecnicas} ${respuesta}`),
    [tecnicas, respuesta]
  );
  const objetivoSeleccionado = metas.find(
    (m) => String(m.objetivo_terapeutico_id) === String(avance.objetivo_terapeutico_id)
  );

  // Avance de la sesión: alimenta las marcas de cada paso y el botón de
  // "qué sigue". Antes no había forma de saber en qué punto se iba.
  const yaFirmada = evolucion?.inalterable === 1;
  const pasoUnoListo = Boolean(
    evolucion?.tecnicas_aplicadas?.trim() && evolucion?.respuesta_fisiologica?.trim()
  );
  const pasoDosListo = metas.some((m) => Number(m.valor_actual || 0) > 0);
  const pasoTresListo = yaFirmada;

  // ── Carga ────────────────────────────────────────────────────────────────
  const cargar = async () => {
    if (!episodioId) return;
    setCargando(true);
    setErrorCarga(false);
    try {
      const datos = await getIntervencion(episodioId);
      setContexto(datos.contexto);
      setEvolucion(datos.evolucion || null);

      // Un borrador local pendiente tiene prioridad sobre lo guardado.
      const guardado = await SecureStore.getItemAsync(claveBorrador(episodioId));
      const borrador = guardado ? JSON.parse(guardado) : null;
      setTecnicas(borrador?.tecnicas_aplicadas ?? datos.evolucion?.tecnicas_aplicadas ?? '');
      setRespuesta(borrador?.respuesta_fisiologica ?? datos.evolucion?.respuesta_fisiologica ?? '');
      if (borrador) {
        setAviso({
          tono: 'alerta',
          titulo: 'Borrador recuperado',
          mensaje: 'Se recuperó lo que quedó guardado en este dispositivo para esta sesión.',
        });
      }
      await cargarMetas();
    } catch (error) {
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  };

  const cargarMetas = async () => {
    if (!episodioId) return;
    setCargandoMetas(true);
    try {
      const { data } = await apiClient.get(`/clinica/episodio/${episodioId}/objetivos`);
      setMetas(data.objetivos || []);
    } catch (error) {
      setMetas([]);
    } finally {
      setCargandoMetas(false);
    }
  };

  useEffect(() => {
    setContexto(null);
    setEvolucion(null);
    setMetas([]);
    cargar();
  }, [episodioId]);

  // ── 1. Guardar lo que se hizo ────────────────────────────────────────────
  const guardarRegistro = async () => {
    if (!tecnicas.trim() || !respuesta.trim()) {
      setAviso({
        tono: 'info',
        titulo: 'Falta completar',
        mensaje: 'Documenta las técnicas aplicadas y la respuesta del paciente.',
      });
      return;
    }
    if (posibleDeterioro) {
      setConfirmacion({
        titulo: 'Posible deterioro clínico',
        mensaje: 'El texto contiene indicadores que requieren revisión prioritaria. Confirma la condición y activa el protocolo clínico correspondiente.',
        etiqueta: 'Confirmar y guardar',
        accion: ejecutarGuardado,
      });
      return;
    }
    await ejecutarGuardado();
  };

  const ejecutarGuardado = async () => {
    setGuardando(true);
    try {
      const datos = await guardarIntervencion(episodioId, {
        tecnicas_aplicadas: tecnicas.trim(),
        respuesta_fisiologica: respuesta.trim(),
      });
      await SecureStore.deleteItemAsync(claveBorrador(episodioId)).catch(() => {});
      setAviso({
        tono: datos.alerta_prioritaria ? 'alerta' : 'ok',
        titulo: datos.alerta_prioritaria ? 'Guardado con alerta prioritaria' : 'Sesión registrada',
        mensaje: datos.alerta_prioritaria
          ? 'El registro quedó guardado. Activa el protocolo clínico prioritario.'
          : datos.mensaje,
      });
      await cargar();
    } catch (error) {
      if (!error.response) {
        // Sin conexión el trabajo no se pierde: queda en el dispositivo.
        await SecureStore.setItemAsync(
          claveBorrador(episodioId),
          JSON.stringify({ tecnicas_aplicadas: tecnicas, respuesta_fisiologica: respuesta })
        );
        setAviso({
          tono: 'error',
          titulo: 'Sin conexión',
          mensaje: 'El registro quedó guardado en este dispositivo. Vuelve a guardar cuando haya señal.',
        });
      } else {
        setAviso({
          tono: 'error',
          titulo: 'No se pudo guardar',
          mensaje: error.response.data?.mensaje || 'Intenta nuevamente.',
        });
      }
    } finally {
      setGuardando(false);
    }
  };

  // ── 2. Objetivos ─────────────────────────────────────────────────────────
  const crearObjetivo = async () => {
    const { descripcion, meta_valor, unidad } = nuevoObjetivo;
    if (!descripcion.trim() || !String(meta_valor).trim() || !unidad.trim()) {
      setAviso({ tono: 'info', titulo: 'Falta completar', mensaje: 'La meta necesita descripción, valor y unidad.' });
      return;
    }
    const valor = Number(meta_valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      setAviso({ tono: 'error', titulo: 'Valor inválido', mensaje: 'El valor de la meta debe ser un número mayor a cero.' });
      return;
    }
    // Sugerencia, no bloqueo: una meta subjetiva no se puede medir después.
    if (PALABRAS_SUBJETIVAS.test(descripcion)) {
      setConfirmacion({
        titulo: 'Meta poco medible',
        mensaje: 'La descripción parece subjetiva. Para seguir el avance conviene expresarla en algo medible, como grados de movilidad o repeticiones. ¿Guardarla igual?',
        etiqueta: 'Guardar así',
        accion: () => enviarObjetivo(valor),
      });
      return;
    }
    await enviarObjetivo(valor);
  };

  const enviarObjetivo = async (valor) => {
    setCreandoMeta(true);
    try {
      await apiClient.post(`/clinica/episodio/${episodioId}/objetivos`, {
        descripcion: nuevoObjetivo.descripcion.trim(),
        meta_valor: valor,
        unidad: nuevoObjetivo.unidad.trim(),
      });
      setNuevoObjetivo({ descripcion: '', meta_valor: '', unidad: '' });
      setAviso({ tono: 'ok', titulo: 'Meta creada', mensaje: 'Ya puedes registrar avances sobre ella.' });
      await cargarMetas();
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo crear la meta',
        mensaje: error.response?.data?.mensaje || error.response?.data?.error || 'Intenta nuevamente.',
      });
    } finally {
      setCreandoMeta(false);
    }
  };

  const registrarAvance = async () => {
    if (!avance.objetivo_terapeutico_id) {
      setAviso({ tono: 'info', titulo: 'Elige una meta', mensaje: 'Selecciona a qué objetivo corresponde el avance.' });
      return;
    }
    const valor = Number(String(avance.valor_actual).trim());
    if (!Number.isFinite(valor) || valor < 0) {
      setAviso({ tono: 'error', titulo: 'Valor inválido', mensaje: 'El avance debe ser un número igual o mayor a cero.' });
      return;
    }
    if (objetivoSeleccionado && valor > Number(objetivoSeleccionado.meta_valor)) {
      setAviso({
        tono: 'info',
        titulo: 'Avance sobre la meta',
        mensaje: `No puede superar la meta (${objetivoSeleccionado.meta_valor} ${objetivoSeleccionado.unidad}).`,
      });
      return;
    }
    setRegistrandoAvance(true);
    try {
      const { data } = await apiClient.put(`/clinica/episodio/${episodioId}/avance`, {
        objetivo_terapeutico_id: Number(avance.objetivo_terapeutico_id),
        valor_actual: valor,
      });
      setAviso({
        tono: 'ok',
        titulo: 'Avance registrado',
        mensaje: `Cumplimiento actual: ${data.porcentaje_cumplimiento ?? '—'}%`,
      });
      setAvance({ objetivo_terapeutico_id: '', valor_actual: '' });
      await cargarMetas();
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo registrar',
        mensaje: error.response?.data?.mensaje || error.response?.data?.error || 'Intenta nuevamente.',
      });
    } finally {
      setRegistrandoAvance(false);
    }
  };

  // ── 3. Cerrar y firmar ───────────────────────────────────────────────────
  // Antes esto vivía en Trazabilidad y había que teclear el número del
  // registro que uno acababa de escribir.
  const pedirFirma = () => {
    setConfirmacion({
      titulo: 'Cerrar y firmar la sesión',
      mensaje: 'Al firmar, el registro queda sellado y no podrá modificarse. Las correcciones posteriores solo se podrán anexar como versiones aparte.',
      etiqueta: 'Firmar',
      accion: firmarRegistro,
    });
  };

  const firmarRegistro = async () => {
    setFirmando(true);
    try {
      const { data } = await apiClient.post(`/inalterabilidad/finalizar/${evolucion.evolucion_clinica_id}`);
      setAviso({
        tono: 'ok',
        titulo: 'Registro cerrado',
        mensaje: data.mensaje || 'El registro quedó firmado y protegido contra modificaciones.',
      });
      await cargar();
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo firmar',
        mensaje: error.response?.data?.mensaje || error.response?.data?.error || 'Intenta nuevamente.',
      });
    } finally {
      setFirmando(false);
    }
  };

  // ── Pantalla ─────────────────────────────────────────────────────────────
  if (!episodioId) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.vacioIcono}>📈</Text>
        <Text style={estilos.vacioTitulo}>Elige un episodio</Text>
        <Text style={estilos.vacioTexto}>
          El registro de la sesión cuelga de un episodio: es el motivo de
          consulta que agrupa el tratamiento.
        </Text>
        <TouchableOpacity
          style={estilos.botonVacio}
          onPress={() => navigation.navigate('Episodio')}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.botonVacioTexto}>Crear o elegir un episodio →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (cargando && !contexto) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (errorCarga) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No se pudo cargar la sesión de este episodio." onRetry={cargar} />
      </View>
    );
  }


  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      {/* Estado de la sesión: dice si se puede escribir y por qué */}
      {contexto && (
        editable ? (
          <View style={[estilos.estado, estilos.estadoActivo]}>
            <Text style={[estilos.estadoTexto, estilos.estadoTextoActivo]}>
              ● Atención en curso · puedes registrar
            </Text>
          </View>
        ) : (
          // Sin atención iniciada no se puede escribir. Antes esto era un
          // callejón sin salida: los campos quedaban bloqueados, el cierre
          // pedía "guarda primero" y nada decía que faltaba iniciar la
          // atención. Ahora se explica y se ofrece el camino.
          <View style={[estilos.estado, estilos.estadoInactivo]}>
            <Text style={[estilos.estadoTexto, estilos.estadoTextoInactivo]}>
              Para registrar en esta sesión, primero inicia la atención
            </Text>
            <Text style={estilos.estadoAyuda}>
              La hora de inicio queda auditada, así que se marca sobre la cita
              concreta que vas a atender.
            </Text>
            <TouchableOpacity
              style={estilos.botonGuia}
              onPress={() => navigation.navigate('HistorialPaciente')}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.botonGuiaTexto}>Ir a las citas del paciente →</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {/* ── Paso 1 ── */}
      <Text style={estilos.paso}>{pasoUnoListo ? "✓" : "1"} · Qué se hizo</Text>
      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>Técnicas y ejercicios de {especialidad}</Text>
        <Text style={estilos.ayuda}>Técnica, dosificación, duración y tolerancia.</Text>
        <TextInput
          style={[estilos.areaTexto, !editable && estilos.campoInerte]}
          multiline
          textAlignVertical="top"
          editable={editable && !guardando}
          placeholder="Ej.: movilización pasiva de rodilla, 3 series de 10, buena tolerancia"
          placeholderTextColor={colores.textoTenue}
          value={tecnicas}
          onChangeText={setTecnicas}
        />

        <Text style={[estilos.etiqueta, { marginTop: espacio.base }]}>Respuesta del paciente</Text>
        <Text style={estilos.ayuda}>Signos, síntomas y cambios observados.</Text>
        <TextInput
          style={[estilos.areaTexto, !editable && estilos.campoInerte]}
          multiline
          textAlignVertical="top"
          editable={editable && !guardando}
          placeholder="Ej.: refiere menos dolor al final de la sesión, sin signos de fatiga"
          placeholderTextColor={colores.textoTenue}
          value={respuesta}
          onChangeText={setRespuesta}
        />

        {posibleDeterioro && editable && (
          <View style={estilos.alerta}>
            <Text style={estilos.alertaTitulo}>Revisión clínica prioritaria</Text>
            <Text style={estilos.alertaTexto}>
              El texto menciona signos de posible deterioro grave. Verifica el
              registro y aplica el protocolo correspondiente.
            </Text>
          </View>
        )}

        {editable && (
          <TouchableOpacity
            style={[estilos.botonPrimario, guardando && estilos.deshabilitado]}
            onPress={guardarRegistro}
            disabled={guardando}
            activeOpacity={interaccion.opacidadActiva}
          >
            {guardando
              ? <ActivityIndicator color={colores.textoInverso} />
              : <Text style={estilos.botonPrimarioTexto}>
                  {pasoUnoListo ? 'Guardar cambios' : 'Guardar registro'}
                </Text>}
          </TouchableOpacity>
        )}

        {pasoUnoListo && !pasoDosListo && (
          <Text style={estilos.siguiente}>
            ✓ Registro guardado. Sigue con el avance del objetivo, más abajo.
          </Text>
        )}
      </View>

      {/* ── Paso 2 ── */}
      <Text style={estilos.paso}>{pasoDosListo ? "✓" : "2"} · Cómo va el objetivo</Text>
      <View style={estilos.tarjeta}>
        {cargandoMetas ? (
          <ActivityIndicator color={colores.primario} />
        ) : metas.length === 0 ? (
          <Text style={estilos.ayuda}>
            Este episodio todavía no tiene metas definidas. Crea una abajo para
            poder medir el avance sesión a sesión.
          </Text>
        ) : (
          metas.map((meta) => {
            const pct = Math.min(
              100,
              Math.round((Number(meta.valor_actual || 0) / Number(meta.meta_valor || 1)) * 100)
            );
            return (
              <View key={meta.objetivo_terapeutico_id} style={estilos.meta}>
                <Text style={estilos.metaNombre}>{meta.descripcion}</Text>
                <Text style={estilos.metaDato}>
                  {meta.valor_actual ?? 0} de {meta.meta_valor} {meta.unidad} · {pct}%
                </Text>
                <View style={estilos.barra}>
                  <View style={[estilos.barraLlena, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          })
        )}

        {metas.length > 0 && editable && (
          <>
            <Text style={[estilos.etiqueta, { marginTop: espacio.base }]}>Registrar avance de hoy</Text>
            <View style={estilos.selector}>
              <Picker
                selectedValue={avance.objetivo_terapeutico_id}
                onValueChange={(v) => setAvance((a) => ({ ...a, objetivo_terapeutico_id: v }))}
                dropdownIconColor={colores.primario}
              >
                <Picker.Item label="Elige la meta…" value="" />
                {metas.map((m) => (
                  <Picker.Item
                    key={m.objetivo_terapeutico_id}
                    label={m.descripcion}
                    value={String(m.objetivo_terapeutico_id)}
                  />
                ))}
              </Picker>
            </View>
            <TextInput
              style={estilos.campo}
              keyboardType="numeric"
              placeholder={
                objetivoSeleccionado
                  ? `Valor medido (máx ${objetivoSeleccionado.meta_valor} ${objetivoSeleccionado.unidad})`
                  : 'Valor medido'
              }
              placeholderTextColor={colores.textoTenue}
              value={String(avance.valor_actual)}
              onChangeText={(v) => setAvance((a) => ({ ...a, valor_actual: v.replace(/[^0-9.,]/g, '') }))}
            />
            <TouchableOpacity
              style={[estilos.botonSecundario, registrandoAvance && estilos.deshabilitado]}
              onPress={registrarAvance}
              disabled={registrandoAvance}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.botonSecundarioTexto}>
                {registrandoAvance ? 'Registrando…' : 'Registrar avance'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>Definir una meta nueva</Text>
        <TextInput
          style={estilos.campo}
          placeholder="Ej: aumentar rango articular de rodilla"
          placeholderTextColor={colores.textoTenue}
          value={nuevoObjetivo.descripcion}
          onChangeText={(v) => setNuevoObjetivo((o) => ({ ...o, descripcion: v }))}
        />
        <View style={estilos.fila}>
          <TextInput
            style={[estilos.campo, estilos.mitad]}
            keyboardType="numeric"
            placeholder="Valor · ej 30"
            placeholderTextColor={colores.textoTenue}
            value={String(nuevoObjetivo.meta_valor)}
            onChangeText={(v) => setNuevoObjetivo((o) => ({ ...o, meta_valor: v.replace(/[^0-9.,]/g, '') }))}
          />
          <TextInput
            style={[estilos.campo, estilos.mitad]}
            placeholder="Unidad · ej grados"
            placeholderTextColor={colores.textoTenue}
            value={nuevoObjetivo.unidad}
            onChangeText={(v) => setNuevoObjetivo((o) => ({ ...o, unidad: v }))}
          />
        </View>
        <TouchableOpacity
          style={[estilos.botonSecundario, creandoMeta && estilos.deshabilitado]}
          onPress={crearObjetivo}
          disabled={creandoMeta}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.botonSecundarioTexto}>
            {creandoMeta ? 'Creando…' : 'Crear meta'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Paso 3 ── */}
      <Text style={estilos.paso}>{pasoTresListo ? "✓" : "3"} · Cerrar la sesión</Text>
      <View style={estilos.tarjeta}>
        {yaFirmada ? (
          <Text style={estilos.cerrado}>
            🔒 Este registro ya está firmado y no puede modificarse. Las
            correcciones se anexan como versiones desde el Historial.
          </Text>
        ) : !evolucion ? (
          <Text style={estilos.ayuda}>
            Guarda primero el registro de la sesión; después podrás cerrarlo y firmarlo.
          </Text>
        ) : (
          <>
            <Text style={estilos.ayuda}>
              Al firmar, el registro queda sellado. Es lo último que se hace en la sesión.
            </Text>
            <TouchableOpacity
              style={[estilos.botonFirmar, firmando && estilos.deshabilitado]}
              onPress={pedirFirma}
              disabled={firmando}
              activeOpacity={interaccion.opacidadActiva}
            >
              {firmando
                ? <ActivityIndicator color={colores.textoInverso} />
                : <Text style={estilos.botonPrimarioTexto}>🔒 Cerrar y firmar</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>

      <DialogoConfirmacion
        visible={confirmacion !== null}
        titulo={confirmacion?.titulo || ''}
        mensaje={confirmacion?.mensaje}
        etiquetaConfirmar={confirmacion?.etiqueta || 'Confirmar'}
        tono={confirmacion?.titulo?.includes('deterioro') ? 'peligro' : 'normal'}
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
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxxl },
  centrado: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: espacio.xl, backgroundColor: colores.fondo,
  },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center' },

  botonVacio: {
    ...piezas.botonPrimario,
    marginTop: espacio.lg,
    paddingHorizontal: espacio.xl,
  },
  botonVacioTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  estado: { borderRadius: radio.md, padding: espacio.md, marginBottom: espacio.lg, borderWidth: 1 },
  estadoActivo: { backgroundColor: colores.exitoSuave, borderColor: colores.exitoBorde },
  estadoInactivo: { backgroundColor: colores.advertenciaSuave, borderColor: colores.advertenciaBorde },
  estadoTexto: { ...tipografia.metaFuerte },
  estadoTextoActivo: { color: colores.exito },
  estadoTextoInactivo: { color: colores.advertencia },

  // El rótulo de paso es lo que hace visible el orden de la sesión.
  paso: {
    ...tipografia.micro,
    color: colores.primario,
    marginBottom: espacio.sm,
    marginTop: espacio.sm,
  },
  estadoAyuda: { ...tipografia.meta, color: colores.advertencia, marginTop: espacio.xs, opacity: 0.9 },
  botonGuia: {
    marginTop: espacio.md,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.base,
    borderRadius: radio.md,
    backgroundColor: colores.advertencia,
    alignItems: 'center',
  },
  botonGuiaTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  siguiente: {
    ...tipografia.meta,
    color: colores.exito,
    marginTop: espacio.md,
    textAlign: 'center',
  },
  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.lg },
  etiqueta: { ...piezas.etiqueta },
  ayuda: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.md },

  campo: { ...piezas.campo, marginBottom: espacio.md },
  areaTexto: { ...piezas.campo, minHeight: 110, textAlignVertical: 'top' },
  campoInerte: { backgroundColor: colores.superficieSuave, color: colores.textoSuave },
  fila: { flexDirection: 'row', gap: espacio.md },
  mitad: { flex: 1 },
  selector: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.md,
    overflow: 'hidden',
    paddingHorizontal: espacio.sm,
    marginBottom: espacio.md,
  },

  meta: { marginBottom: espacio.base },
  metaNombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  metaDato: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2, marginBottom: espacio.sm },
  barra: { height: 8, borderRadius: radio.completo, backgroundColor: colores.superficieSuave, overflow: 'hidden' },
  barraLlena: { height: 8, borderRadius: radio.completo, backgroundColor: colores.primario },

  alerta: {
    backgroundColor: colores.errorSuave,
    borderWidth: 1,
    borderColor: colores.errorBorde,
    borderRadius: radio.md,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  alertaTitulo: { ...tipografia.metaFuerte, color: colores.error, marginBottom: espacio.xs },
  alertaTexto: { ...tipografia.meta, color: colores.error },

  botonPrimario: { ...piezas.botonPrimario, marginTop: espacio.base },
  botonPrimarioTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  botonSecundario: { ...piezas.botonSecundario, paddingVertical: espacio.md },
  botonSecundarioTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },
  botonFirmar: { ...piezas.botonPrimario, backgroundColor: colores.secundario, marginTop: espacio.sm },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },

  cerrado: { ...tipografia.meta, color: colores.textoSuave, lineHeight: 20 },
});
