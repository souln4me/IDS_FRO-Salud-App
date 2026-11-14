/**
 * Componente: Cliente Móvil — Vista "Bonos por contingencia"
 * Casos de uso: CU72, CU66.
 */
// Ruta: fro-vista/src/screens/Comun/ContingenciaBonosScreen.js
//
// CU72 — Ingreso de bonos por contingencia (Profesional y Administrador).
//
// Cuando el financiador no responde (o un administrador fuerza el modo), aquí
// se transcribe el bono a mano: la cita queda habilitada de forma provisoria
// sin esperar al tercero. Con el financiador operativo, la pantalla no carga
// el formulario (Exc. 1) y solo muestra los bonos provisorios pendientes, que
// el administrador regulariza con la validación real.

import React, { useCallback, useContext, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, ActivityIndicator, RefreshControl, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AuthContext } from '../../context/AuthContext';
import {
  getContingenciaBonos, registrarBonoContingencia, cambiarModoContingencia, regularizarBono,
} from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import { formatearFechaHora } from '../../utils/fechas';
import { etiquetaEstado } from '../../utils/estados';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const pesos = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const soloDigitos = (t) => String(t || '').replace(/\D/g, '').slice(0, 9);
const FORMULARIO_VACIO = { folio: '', financiador_id: null, financiador_nombre: '', monto_cobertura: '', copago: '' };

export default function ContingenciaBonosScreen() {
  const { userData } = useContext(AuthContext);
  const esAdmin = userData?.rol === 'Administrador';

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [citaElegida, setCitaElegida] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [textoLibre, setTextoLibre] = useState(false);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [cambiandoModo, setCambiandoModo] = useState(false);
  const [regularizando, setRegularizando] = useState(null);
  const [financiadorRegularizar, setFinanciadorRegularizar] = useState({});
  const [aviso, setAviso] = useState(null);

  // CU72 — cargar el estado del financiador, las citas sin bono y los provisorios
  const cargar = useCallback(async (refresco = false) => {
    if (refresco) setRefrescando(true);
    try {
      const respuesta = await getContingenciaBonos();
      setDatos(respuesta);
      // Excepción 2: sin catálogo de financiadores, el campo pasa a texto libre.
      if (respuesta.formulario && !respuesta.catalogo_disponible) setTextoLibre(true);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const actualizar = (campo, valor) => {
    setFormulario((previo) => ({ ...previo, [campo]: valor }));
    if (errores[campo] || (campo.startsWith('financiador') && errores.financiador)) {
      setErrores((previos) => ({ ...previos, [campo]: null, ...(campo.startsWith('financiador') ? { financiador: null } : {}) }));
    }
  };

  const elegirCita = (cita) => {
    setCitaElegida(cita);
    setFormulario(FORMULARIO_VACIO);
    setErrores({});
  };

  // CU72 — Ingresando Datos mediante Interfaz de Contingencia: registrar el bono provisorio
  const enviar = async () => {
    // Excepción 3: se marcan en la vista los campos que faltan antes de enviar.
    const nuevos = {};
    const folio = formulario.folio.trim().toUpperCase();
    if (!folio) nuevos.folio = 'Ingresa el folio del bono.';
    else if (!/^BON-\d{6}$/.test(folio)) nuevos.folio = 'Formato BON-XXXXXX (6 dígitos).';
    if (textoLibre ? formulario.financiador_nombre.trim().length < 3 : !formulario.financiador_id) {
      nuevos.financiador = 'Indica el financiador del bono.';
    }
    if (formulario.monto_cobertura === '') nuevos.monto_cobertura = 'Ingresa el monto de cobertura.';
    if (formulario.copago === '') nuevos.copago = 'Ingresa el copago.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setEnviando(true);
    try {
      const respuesta = await registrarBonoContingencia(citaElegida.cita_id, {
        folio,
        ...(textoLibre
          ? { financiador_nombre: formulario.financiador_nombre.trim() }
          : { financiador_id: formulario.financiador_id }),
        monto_cobertura: Number(formulario.monto_cobertura),
        copago: Number(formulario.copago),
      });
      setCitaElegida(null);
      setFormulario(FORMULARIO_VACIO);
      await cargar();
      setAviso({ tono: 'ok', titulo: 'Bono registrado', mensaje: respuesta.mensaje });
    } catch (e) {
      const r = e.response?.data;
      if (r?.campos) {
        setErrores(r.campos);
      } else if (r?.error === 'ADAPTADOR_OPERATIVO') {
        setCitaElegida(null);
        await cargar();
        setAviso({ tono: 'info', titulo: 'El financiador volvió a responder', mensaje: r.mensaje });
      } else {
        // Excepción 4: los datos quedan en el formulario para reintentar.
        setAviso({
          tono: 'error',
          titulo: 'No se pudo procesar',
          mensaje: r?.mensaje || 'Sin respuesta del servidor. Tus datos siguen en el formulario: reintenta el envío.',
        });
      }
    } finally {
      setEnviando(false);
    }
  };

  // CU72 — el administrador fuerza o apaga el modo contingencia
  const cambiarModo = async (activo) => {
    setCambiandoModo(true);
    try {
      const respuesta = await cambiarModoContingencia(activo);
      await cargar();
      setAviso({ tono: 'ok', titulo: activo ? 'Contingencia activada' : 'Contingencia desactivada', mensaje: respuesta.mensaje });
    } catch (e) {
      setAviso({ tono: 'error', titulo: 'No se pudo cambiar el modo', mensaje: e.response?.data?.error || 'Intenta nuevamente.' });
    } finally {
      setCambiandoModo(false);
    }
  };

  // CU72, CU66 — regularizar el bono provisorio validándolo con el financiador
  const regularizar = async (bono) => {
    setRegularizando(bono.bono_id);
    try {
      const respuesta = await regularizarBono(bono.bono_id, financiadorRegularizar[bono.bono_id]);
      await cargar();
      setAviso({ tono: respuesta.estado_validacion === 'VALIDADO' ? 'ok' : 'alerta', titulo: 'Bono regularizado', mensaje: respuesta.mensaje });
    } catch (e) {
      setAviso({ tono: 'error', titulo: 'No se pudo regularizar', mensaje: e.response?.data?.mensaje || 'Intenta nuevamente.' });
    } finally {
      setRegularizando(null);
    }
  };

  if (cargando) {
    return <View style={estilos.centrado}><ActivityIndicator size="large" color={colores.primario} /></View>;
  }
  if (error || !datos) {
    return <View style={estilos.centrado}><ErrorRetry mensaje="No se pudo consultar el estado del financiador." onRetry={() => cargar()} /></View>;
  }

  const { contingencia } = datos;

  return (
    <VistaConTeclado
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />}
    >
      {/* Estado del financiador */}
      <View style={[estilos.estado, contingencia.activa ? estilos.estadoActivo : estilos.estadoNormal]}>
        <Text style={[estilos.estadoTitulo, { color: contingencia.activa ? colores.advertencia : colores.exito }]}>
          {contingencia.activa ? 'Contingencia activa' : 'Financiador operativo'}
        </Text>
        <Text style={estilos.estadoTexto}>{contingencia.motivo}</Text>
        {contingencia.activa && contingencia.desde ? (
          <Text style={estilos.meta}>
            {contingencia.origen === 'MANUAL' ? 'Activada' : 'Última falla'}: {formatearFechaHora(contingencia.desde)}
            {contingencia.origen === 'AUTOMATICA' ? ` · dura ${contingencia.ventana_minutos} min si no vuelve a fallar` : ''}
          </Text>
        ) : null}
        {!contingencia.activa && (
          <Text style={estilos.meta}>
            El paciente registra su bono desde Pagos y bonos y se valida en línea. Este formulario se habilita solo si el financiador deja de responder.
          </Text>
        )}
      </View>

      {esAdmin && (
        <View style={[estilos.tarjeta, estilos.filaEntre]}>
          <View style={estilos.flex}>
            <Text style={estilos.nombre}>Forzar modo contingencia</Text>
            <Text style={estilos.meta}>Habilita el ingreso manual aunque el financiador responda.</Text>
          </View>
          <Switch
            value={Boolean(contingencia.forzada)}
            onValueChange={cambiarModo}
            disabled={cambiandoModo}
            trackColor={{ false: colores.borde, true: colores.azul[300] }}
            thumbColor={contingencia.forzada ? colores.primario : colores.superficie}
          />
        </View>
      )}

      {/* Formulario de contingencia */}
      {datos.formulario && (
        <View style={estilos.seccion}>
          <Text style={estilos.titulo}>Citas sin bono validado</Text>
          {datos.citas.length === 0 ? (
            <Text style={estilos.meta}>No hay citas cercanas pendientes de bono.</Text>
          ) : (
            datos.citas.map((c) => {
              const elegida = citaElegida?.cita_id === c.cita_id;
              return (
                <View key={c.cita_id} style={[estilos.tarjeta, elegida && estilos.tarjetaElegida]}>
                  <TouchableOpacity onPress={() => elegirCita(elegida ? null : c)} activeOpacity={interaccion.opacidadActiva}>
                    <View style={estilos.filaEntre}>
                      <Text style={estilos.nombre}>{c.paciente}</Text>
                      <Text style={estilos.meta}>{etiquetaEstado(c.estado)}</Text>
                    </View>
                    <Text style={estilos.meta}>
                      {formatearFechaHora(c.fecha_hora_inicio)}{esAdmin ? ` · ${c.profesional}` : ''}
                    </Text>
                    {c.folio ? <Text style={estilos.meta}>Bono {c.folio}: {etiquetaEstado(c.estado_validacion)}</Text> : null}
                    {!elegida && <Text style={estilos.enlace}>Ingresar bono</Text>}
                  </TouchableOpacity>

                  {elegida && (
                    <View style={estilos.formulario}>
                      <Text style={piezas.etiqueta}>Folio</Text>
                      <TextInput
                        style={[piezas.campo, errores.folio && piezas.campoError]}
                        value={formulario.folio}
                        onChangeText={(t) => actualizar('folio', t.toUpperCase())}
                        placeholder="BON-123456"
                        placeholderTextColor={colores.textoTenue}
                        autoCapitalize="characters"
                      />
                      {errores.folio ? <Text style={estilos.error}>{errores.folio}</Text> : null}

                      <Text style={[piezas.etiqueta, estilos.separado]}>Financiador</Text>
                      {textoLibre ? (
                        <>
                          {!datos.catalogo_disponible && (
                            <Text style={estilos.nota}>El catálogo de financiadores no está disponible: escribe el nombre.</Text>
                          )}
                          <TextInput
                            style={[piezas.campo, errores.financiador && piezas.campoError]}
                            value={formulario.financiador_nombre}
                            onChangeText={(t) => actualizar('financiador_nombre', t.slice(0, 100))}
                            placeholder="Nombre de la institución"
                            placeholderTextColor={colores.textoTenue}
                          />
                        </>
                      ) : (
                        <View style={[estilos.chips, errores.financiador && estilos.grupoError]}>
                          {datos.financiadores.map((f) => {
                            const activo = formulario.financiador_id === f.financiador_id;
                            return (
                              <TouchableOpacity
                                key={f.financiador_id}
                                style={[estilos.chip, activo && estilos.chipElegido]}
                                onPress={() => actualizar('financiador_id', f.financiador_id)}
                                activeOpacity={interaccion.opacidadActiva}
                              >
                                <Text style={[estilos.chipTexto, activo && estilos.chipTextoElegido]}>{f.nombre_institucion}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      {errores.financiador ? <Text style={estilos.error}>{errores.financiador}</Text> : null}
                      {datos.catalogo_disponible && (
                        <TouchableOpacity onPress={() => { setTextoLibre(!textoLibre); setErrores((p) => ({ ...p, financiador: null })); }}>
                          <Text style={estilos.enlace}>{textoLibre ? 'Elegir de la lista' : '¿No aparece? Escríbelo'}</Text>
                        </TouchableOpacity>
                      )}

                      <View style={estilos.filaMontos}>
                        <View style={estilos.flex}>
                          <Text style={[piezas.etiqueta, estilos.separado]}>Cobertura ($)</Text>
                          <TextInput
                            style={[piezas.campo, errores.monto_cobertura && piezas.campoError]}
                            value={formulario.monto_cobertura}
                            onChangeText={(t) => actualizar('monto_cobertura', soloDigitos(t))}
                            keyboardType="number-pad"
                            placeholder="24000"
                            placeholderTextColor={colores.textoTenue}
                          />
                          {errores.monto_cobertura ? <Text style={estilos.error}>{errores.monto_cobertura}</Text> : null}
                        </View>
                        <View style={estilos.flex}>
                          <Text style={[piezas.etiqueta, estilos.separado]}>Copago ($)</Text>
                          <TextInput
                            style={[piezas.campo, errores.copago && piezas.campoError]}
                            value={formulario.copago}
                            onChangeText={(t) => actualizar('copago', soloDigitos(t))}
                            keyboardType="number-pad"
                            placeholder="16000"
                            placeholderTextColor={colores.textoTenue}
                          />
                          {errores.copago ? <Text style={estilos.error}>{errores.copago}</Text> : null}
                        </View>
                      </View>
                      {datos.arancel ? <Text style={estilos.nota}>Arancel vigente de la prestación: {pesos(datos.arancel)}.</Text> : null}

                      <TouchableOpacity
                        style={[estilos.boton, enviando && estilos.deshabilitado]}
                        onPress={enviar}
                        disabled={enviando}
                        activeOpacity={interaccion.opacidadActiva}
                      >
                        <Text style={estilos.botonTexto}>{enviando ? 'Registrando…' : 'Registrar bono provisorio'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Bonos provisorios */}
      <View style={estilos.seccion}>
        <Text style={estilos.titulo}>Bonos provisorios ({datos.provisorios.length})</Text>
        {datos.provisorios.length === 0 ? (
          <Text style={estilos.meta}>No hay bonos ingresados por contingencia pendientes de validar.</Text>
        ) : (
          datos.provisorios.map((b) => (
            <View key={b.bono_id} style={estilos.tarjeta}>
              <View style={estilos.filaEntre}>
                <Text style={estilos.nombre}>{b.folio}</Text>
                <Text style={[estilos.meta, { color: colores.advertencia, fontWeight: '700' }]}>Provisorio</Text>
              </View>
              <Text style={estilos.meta}>{b.paciente} · {formatearFechaHora(b.fecha_hora_inicio)}{esAdmin ? ` · ${b.profesional}` : ''}</Text>
              <Text style={estilos.meta}>
                {b.financiador}{b.financiador_fuera_de_catalogo ? ' (escrito a mano)' : ''} · cobertura {pesos(b.monto_cobertura)} · copago {pesos(b.copago)}
              </Text>
              <Text style={estilos.meta}>Registrado por {b.registrado_por || '—'} el {formatearFechaHora(b.momento_registro_manual)}</Text>

              {esAdmin && !contingencia.activa && (
                <>
                  {Boolean(b.financiador_fuera_de_catalogo) && (
                    <View style={[estilos.chips, estilos.separado]}>
                      {datos.financiadores.map((f) => {
                        const activo = financiadorRegularizar[b.bono_id] === f.financiador_id;
                        return (
                          <TouchableOpacity
                            key={f.financiador_id}
                            style={[estilos.chip, activo && estilos.chipElegido]}
                            onPress={() => setFinanciadorRegularizar((p) => ({ ...p, [b.bono_id]: f.financiador_id }))}
                          >
                            <Text style={[estilos.chipTexto, activo && estilos.chipTextoElegido]}>{f.nombre_institucion}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <TouchableOpacity
                    style={[estilos.botonSecundario, regularizando === b.bono_id && estilos.deshabilitado]}
                    onPress={() => regularizar(b)}
                    disabled={regularizando === b.bono_id}
                    activeOpacity={interaccion.opacidadActiva}
                  >
                    <Text style={estilos.botonSecundarioTexto}>
                      {regularizando === b.bono_id ? 'Validando…' : 'Validar con el financiador'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))
        )}
      </View>

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
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  flex: { flex: 1 },

  estado: { borderRadius: radio.lg, borderWidth: 1, padding: espacio.base, marginBottom: espacio.base },
  estadoActivo: { backgroundColor: colores.advertenciaSuave, borderColor: colores.advertenciaBorde },
  estadoNormal: { backgroundColor: colores.exitoSuave, borderColor: colores.exitoBorde },
  estadoTitulo: { ...tipografia.subtitulo, marginBottom: espacio.xs },
  estadoTexto: { ...tipografia.cuerpo, color: colores.texto },

  seccion: { marginTop: espacio.base },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.md },
  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  tarjetaElegida: { borderColor: colores.primario },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espacio.sm },
  nombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  enlace: { ...tipografia.metaFuerte, color: colores.primario, marginTop: espacio.sm },
  nota: { ...tipografia.meta, color: colores.advertencia, marginBottom: espacio.xs },

  formulario: { marginTop: espacio.md, paddingTop: espacio.md, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  separado: { marginTop: espacio.base },
  filaMontos: { flexDirection: 'row', gap: espacio.md },
  error: { ...tipografia.meta, color: colores.error, marginTop: espacio.xs },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, borderRadius: radio.md },
  grupoError: { padding: espacio.xs, borderWidth: 1, borderColor: colores.errorBorde, backgroundColor: colores.errorSuave },
  chip: { paddingVertical: espacio.sm, paddingHorizontal: espacio.md, borderRadius: radio.completo, borderWidth: 1, borderColor: colores.bordeCampo, backgroundColor: colores.superficie },
  chipElegido: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  chipTexto: { ...tipografia.meta, color: colores.texto, fontWeight: '600' },
  chipTextoElegido: { color: colores.primario },

  boton: { ...piezas.botonPrimario, marginTop: espacio.lg },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  botonSecundario: { ...piezas.botonSecundario, paddingVertical: espacio.sm, marginTop: espacio.md },
  botonSecundarioTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },
  deshabilitado: { opacity: interaccion.opacidadDeshabilitada },
});
