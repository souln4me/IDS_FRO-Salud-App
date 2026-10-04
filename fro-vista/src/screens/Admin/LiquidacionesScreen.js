// Ruta: fro-vista/src/screens/Admin/LiquidacionesScreen.js
//
// CU75 — Liquidación de ganancias del profesional.
//
// El monto sale de las prestaciones VALIDADAS del mes (las sesiones que
// quedaron certificadas en el CU41), más las bonificaciones que el
// administrador decida agregar. Una vez emitida, la liquidación es inalterable:
// es el respaldo del pago, y el profesional solo la lee.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, StyleSheet,
} from 'react-native';

import { getLiquidaciones, emitirLiquidacion } from '../../api/client';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const pesos = (valor) => `$${Number(valor || 0).toLocaleString('es-CL')}`;

export default function LiquidacionesScreen() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Bonificación por profesional, mientras el administrador la escribe.
  const [bonificaciones, setBonificaciones] = useState({});
  const [porEmitir, setPorEmitir] = useState(null);
  const [emitiendo, setEmitiendo] = useState(null);

  const cargar = useCallback(
    async (a = anio, m = mes, esRefresco = false) => {
      if (esRefresco) setRefrescando(true);
      else setCargando(true);
      setError(false);
      try {
        setDatos(await getLiquidaciones(a, m));
      } catch {
        setError(true);
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [anio, mes]
  );

  useEffect(() => {
    cargar(anio, mes);
  }, [cargar, anio, mes]);

  const mesAnterior = () => {
    if (mes === 1) {
      setMes(12);
      setAnio(anio - 1);
    } else {
      setMes(mes - 1);
    }
  };

  const mesSiguiente = () => {
    if (mes === 12) {
      setMes(1);
      setAnio(anio + 1);
    } else {
      setMes(mes + 1);
    }
  };

  // Excepción 3: el campo monetario no acepta letras. Se filtran al escribir.
  const escribirBonificacion = (profesionalId, texto) => {
    const soloNumeros = texto.replace(/[^0-9]/g, '');
    setBonificaciones((previas) => ({ ...previas, [profesionalId]: soloNumeros }));
  };

  const emitir = async (fila) => {
    setPorEmitir(null);
    setEmitiendo(fila.profesional_id);
    try {
      const datosEmision = await emitirLiquidacion({
        profesional_id: fila.profesional_id,
        anio,
        mes,
        bonificacion: Number(bonificaciones[fila.profesional_id] || 0),
      });
      setAviso({ tono: 'ok', titulo: 'Liquidación emitida', mensaje: datosEmision.mensaje });
      await cargar(anio, mes, true);
    } catch (err) {
      setAviso({
        tono: err.response?.data?.error === 'YA_EMITIDA' ? 'alerta' : 'error',
        titulo: err.response?.data?.error === 'YA_EMITIDA' ? 'Ya estaba emitida' : 'No se pudo emitir',
        mensaje: err.response?.data?.mensaje || 'Intenta nuevamente.',
      });
      await cargar(anio, mes, true);
    } finally {
      setEmitiendo(null);
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
        <ErrorRetry mensaje="No se pudo calcular la liquidación." onRetry={() => cargar(anio, mes)} />
      </View>
    );
  }

  const conSesiones = (datos?.liquidaciones || []).filter((l) => l.sesiones_validadas > 0);
  const sinSesiones = (datos?.liquidaciones || []).filter((l) => l.sesiones_validadas === 0);

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(anio, mes, true)} colors={[colores.primario]} />
      }
    >
      <View style={estilos.selectorMes}>
        <TouchableOpacity onPress={mesAnterior} style={estilos.flecha} activeOpacity={interaccion.opacidadActiva}>
          <Text style={estilos.flechaTexto}>‹</Text>
        </TouchableOpacity>
        <Text style={estilos.periodo}>
          {MESES[mes - 1]} {anio}
        </Text>
        <TouchableOpacity onPress={mesSiguiente} style={estilos.flecha} activeOpacity={interaccion.opacidadActiva}>
          <Text style={estilos.flechaTexto}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={estilos.formula}>
        Cada prestación validada se liquida a {pesos(datos?.valor_sesion)} ({datos?.porcentaje_honorario}%
        del arancel de {pesos(datos?.arancel)}).
      </Text>

      {/* Excepción 1: un mes futuro no tiene prestaciones que liquidar. */}
      {datos?.periodo_futuro && (
        <View style={estilos.avisoPeriodo}>
          <Text style={estilos.avisoPeriodoTexto}>
            Este mes todavía no termina o aún no llega: no hay prestaciones validadas que
            liquidar. Elige un mes operativo finalizado.
          </Text>
        </View>
      )}

      {conSesiones.length === 0 && !datos?.periodo_futuro && (
        <Text style={estilos.vacio}>
          Ningún profesional registra prestaciones validadas en este periodo.
        </Text>
      )}

      {conSesiones.map((l) => (
        <View key={l.profesional_id} style={[estilos.tarjeta, l.emitida && estilos.tarjetaEmitida]}>
          <Text style={estilos.profesional}>{l.profesional}</Text>
          <Text style={estilos.especialidad}>{l.especialidad}</Text>

          <View style={estilos.fila}>
            <Text style={estilos.concepto}>
              {l.sesiones_validadas} prestación(es) validada(s)
            </Text>
            <Text style={estilos.monto}>{pesos(l.monto_prestaciones)}</Text>
          </View>

          {l.emitida ? (
            <>
              <View style={estilos.fila}>
                <Text style={estilos.concepto}>Bonificaciones</Text>
                <Text style={estilos.monto}>{pesos(l.bonificacion)}</Text>
              </View>
              <View style={[estilos.fila, estilos.filaTotal]}>
                <Text style={estilos.total}>Total liquidado</Text>
                <Text style={estilos.totalMonto}>{pesos(l.monto_total)}</Text>
              </View>
              <Text style={estilos.emitidaNota}>
                ✅ Emitida el {formatearFechaHora(l.momento_emision)} · registro inalterable
              </Text>
            </>
          ) : (
            <>
              <View style={estilos.fila}>
                <Text style={estilos.concepto}>Bonificación adicional</Text>
                <TextInput
                  style={estilos.campoMonto}
                  placeholder="0"
                  placeholderTextColor={colores.textoTenue}
                  keyboardType="number-pad"
                  value={bonificaciones[l.profesional_id] || ''}
                  onChangeText={(t) => escribirBonificacion(l.profesional_id, t)}
                />
              </View>

              <View style={[estilos.fila, estilos.filaTotal]}>
                <Text style={estilos.total}>Total a pagar</Text>
                <Text style={estilos.totalMonto}>
                  {pesos(l.monto_prestaciones + Number(bonificaciones[l.profesional_id] || 0))}
                </Text>
              </View>

              <TouchableOpacity
                style={[estilos.boton, emitiendo === l.profesional_id && estilos.deshabilitado]}
                onPress={() => setPorEmitir(l)}
                disabled={emitiendo === l.profesional_id}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={estilos.botonTexto}>Emitir liquidación</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ))}

      {/* Excepción 2: cero prestaciones validadas se muestra como cero pesos,
          no se esconde: sirve para auditar al profesional. */}
      {sinSesiones.length > 0 && (
        <View style={estilos.tarjetaSinSesiones}>
          <Text style={estilos.tituloSinSesiones}>Sin prestaciones validadas este mes</Text>
          {sinSesiones.map((l) => (
            <Text key={l.profesional_id} style={estilos.lineaSinSesiones}>
              {l.profesional} · {pesos(0)}
            </Text>
          ))}
        </View>
      )}

      <DialogoConfirmacion
        visible={porEmitir !== null}
        titulo="Emitir liquidación"
        mensaje={
          porEmitir
            ? `Vas a emitir la liquidación de ${porEmitir.profesional} para ${MESES[mes - 1]} ${anio} por ` +
              `${pesos(porEmitir.monto_prestaciones + Number(bonificaciones[porEmitir.profesional_id] || 0))}. ` +
              'Una vez emitida no se puede modificar: queda como respaldo del pago.'
            : ''
        }
        etiquetaConfirmar="Emitir"
        onConfirmar={() => emitir(porEmitir)}
        onCancelar={() => setPorEmitir(null)}
      />

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },

  selectorMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flecha: { paddingHorizontal: espacio.base, paddingVertical: espacio.xs },
  flechaTexto: { fontSize: 26, color: colores.primario, lineHeight: 28 },
  periodo: { ...tipografia.subtitulo, color: colores.textoTitulo, textTransform: 'capitalize' },
  formula: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm, marginBottom: espacio.base },

  avisoPeriodo: {
    backgroundColor: colores.advertenciaSuave,
    borderWidth: 1,
    borderColor: colores.advertenciaBorde,
    borderRadius: radio.md,
    padding: espacio.md,
    marginBottom: espacio.base,
  },
  avisoPeriodoTexto: { ...tipografia.meta, color: colores.advertencia },
  vacio: { ...tipografia.meta, color: colores.textoTenue, marginBottom: espacio.base },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  // La emitida se distingue: ya no admite cambios.
  tarjetaEmitida: { backgroundColor: colores.exitoSuave, borderColor: colores.exitoBorde },
  profesional: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  especialidad: { ...tipografia.micro, color: colores.textoTenue, marginBottom: espacio.sm },

  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacio.sm,
  },
  filaTotal: { borderTopWidth: 1, borderTopColor: colores.bordeSuave, marginTop: espacio.xs },
  concepto: { ...tipografia.meta, color: colores.textoSuave, flex: 1 },
  monto: { ...tipografia.meta, color: colores.texto },
  total: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  totalMonto: { ...tipografia.cuerpoFuerte, color: colores.primario },
  campoMonto: {
    width: 120,
    textAlign: 'right',
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.sm,
    paddingVertical: espacio.xs,
    paddingHorizontal: espacio.sm,
    ...tipografia.meta,
    color: colores.texto,
  },

  boton: { ...piezas.botonPrimario, alignItems: 'center', marginTop: espacio.md },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.6 },
  emitidaNota: { ...tipografia.micro, color: colores.exito, marginTop: espacio.sm },

  tarjetaSinSesiones: { ...piezas.tarjeta, marginTop: espacio.base },
  tituloSinSesiones: { ...tipografia.metaFuerte, color: colores.textoSuave, marginBottom: espacio.sm },
  lineaSinSesiones: { ...tipografia.meta, color: colores.textoTenue, marginTop: 2 },
});
