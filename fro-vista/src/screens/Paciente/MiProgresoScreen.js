// Ruta: fro-vista/src/screens/Paciente/MiProgresoScreen.js
//
// CU45 — Panel de progreso del paciente: adherencia, curva de síntomas y
// recuento de asistencia, con control de rango de fechas.
//
// CU44 se ve acá también: al entrar, el servidor recalcula el índice de
// adherencia, que es justo lo que pide el caso de uso cuando el paciente
// navega a su perfil.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, useWindowDimensions, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { getMiProgreso } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import GraficoLinea from '../../components/GraficoLinea';
import { formatearFecha } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

// Rangos rápidos: cubren el 95% de las consultas sin abrir un calendario.
const ATAJOS = [
  { clave: '30', etiqueta: '30 días', dias: 30 },
  { clave: '90', etiqueta: '3 meses', dias: 90 },
  { clave: 'todo', etiqueta: 'Todo', dias: null },
];

function aTexto(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

function haceDias(dias) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return aTexto(f);
}

/** "22/09" — etiqueta corta para el eje del gráfico. */
function diaMes(valor) {
  const texto = String(valor || '');
  const fecha = texto.includes('T') || texto.includes(' ') ? texto.slice(0, 10) : texto;
  const partes = fecha.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : fecha;
}

export default function MiProgresoScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const anchoGrafico = width - espacio.lg * 2 - espacio.base * 2;

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);

  const [atajo, setAtajo] = useState('30');
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(null);
  const [calendario, setCalendario] = useState(null); // 'desde' | 'hasta'

  const cargar = useCallback(
    async (rango, esRefresco = false) => {
      if (esRefresco) setRefrescando(true);
      else setCargando(true);
      setError(false);
      try {
        const respuesta = await getMiProgreso(rango);
        setDatos(respuesta);
      } catch (err) {
        // Excepción 3: el servidor rechaza un rango al revés y lo explica.
        if (err.response?.data?.error === 'RANGO_INVALIDO') {
          setAviso({
            tono: 'info',
            titulo: 'Rango inválido',
            mensaje: err.response.data.mensaje,
          });
        } else {
          setError(true);
        }
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    []
  );

  useEffect(() => {
    cargar({ desde, hasta });
  }, [cargar, desde, hasta]);

  const elegirAtajo = (opcion) => {
    setAtajo(opcion.clave);
    setDesde(opcion.dias ? haceDias(opcion.dias) : null);
    setHasta(null);
  };

  const fijarFecha = (cual, fecha) => {
    const texto = aTexto(fecha);
    // La comprobación también se hace acá para no gastar una llamada en un
    // rango que ya se ve mal (el servidor igual la repite, Excepción 3).
    if (cual === 'desde' && hasta && texto > hasta) {
      setAviso({
        tono: 'info',
        titulo: 'Rango inválido',
        mensaje: 'La fecha de inicio no puede ser posterior a la de término.',
      });
      return;
    }
    if (cual === 'hasta' && desde && texto < desde) {
      setAviso({
        tono: 'info',
        titulo: 'Rango inválido',
        mensaje: 'La fecha de término no puede ser anterior a la de inicio.',
      });
      return;
    }
    setAtajo('personalizado');
    if (cual === 'desde') setDesde(texto);
    else setHasta(texto);
  };

  if (cargando) {
    // Excepción 4: mientras el servidor arma la línea de tiempo, el indicador
    // circular deja claro que el panel está trabajando.
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
        <Text style={estilos.cargandoTexto}>Calculando tu progreso…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry
          mensaje="No pudimos cargar tu progreso."
          onRetry={() => cargar({ desde, hasta })}
        />
      </View>
    );
  }

  // Excepción 1: sin historial, vista introductoria en vez de gráficos vacíos.
  if (datos && !datos.hay_historial) {
    return (
      <ScrollView style={estilos.fondo} contentContainerStyle={estilos.centrado}>
        <Text style={estilos.iconoGrande}>📊</Text>
        <Text style={estilos.tituloVacio}>Tu progreso empieza con tu primera atención</Text>
        <Text style={estilos.textoVacio}>
          Cuando tengas sesiones y empieces a reportar cómo te sientes, aquí vas a ver
          tu evolución: cuánto baja tu dolor, cuánto cumples de tus ejercicios y
          cuántas sesiones llevas.
        </Text>
        <TouchableOpacity
          style={estilos.botonVacio}
          onPress={() => navigation.navigate('BuscarCita')}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.botonVacioTexto}>Agendar mi primera evaluación</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const adherencia = datos?.adherencia || {};
  const sintomas = datos?.sintomas || [];
  const asistencia = datos?.asistencia || {};

  const serieDolor = sintomas.map((s) => ({
    etiqueta: diaMes(s.momento_registro),
    valor: Number(s.nivel_dolor),
  }));
  const serieLimitacion = sintomas.map((s) => ({
    etiqueta: diaMes(s.momento_registro),
    valor: Number(s.limitacion_funcional),
  }));
  const serieAdherencia = (datos?.serie_adherencia || []).map((p) => ({
    etiqueta: diaMes(p.fecha),
    valor: Number(p.porcentaje),
  }));

  const porcentaje = adherencia.porcentaje;
  const colorAdherencia =
    porcentaje === null || porcentaje === undefined
      ? colores.textoTenue
      : porcentaje >= 80
        ? colores.exito
        : porcentaje >= 50
          ? colores.advertencia
          : colores.error;

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl
          refreshing={refrescando}
          onRefresh={() => cargar({ desde, hasta }, true)}
          colors={[colores.primario]}
        />
      }
    >
      {/* ── Rango de fechas ── */}
      <View style={estilos.filaAtajos}>
        {ATAJOS.map((opcion) => (
          <TouchableOpacity
            key={opcion.clave}
            style={[estilos.atajo, atajo === opcion.clave && estilos.atajoElegido]}
            onPress={() => elegirAtajo(opcion)}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={[estilos.atajoTexto, atajo === opcion.clave && estilos.atajoTextoElegido]}>
              {opcion.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={estilos.filaFechas}>
        <TouchableOpacity style={estilos.campoFecha} onPress={() => setCalendario('desde')}>
          <Text style={estilos.campoFechaTexto}>
            Desde: {desde ? formatearFecha(desde) : 'el inicio'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.campoFecha} onPress={() => setCalendario('hasta')}>
          <Text style={estilos.campoFechaTexto}>
            Hasta: {hasta ? formatearFecha(hasta) : 'hoy'}
          </Text>
        </TouchableOpacity>
      </View>

      {calendario && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          maximumDate={new Date()}
          accentColor={colores.primario}
          textColor={colores.texto}
          positiveButton={{ label: 'Aceptar', textColor: colores.primario }}
          negativeButton={{ label: 'Cancelar', textColor: colores.textoSuave }}
          onChange={(evento, fecha) => {
            const cual = calendario;
            setCalendario(null);
            if (fecha) fijarFecha(cual, fecha);
          }}
        />
      )}

      {/* ── Adherencia ── */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloTarjeta}>Índice de adherencia</Text>

        {adherencia.suspendido && (
          // Excepción 2 del CU44: el cálculo no se pudo rehacer, se muestra el
          // último valor conocido en vez de un cero que no es verdad.
          <Text style={estilos.avisoSuspendido}>
            No pudimos recalcularlo ahora. Este es tu último porcentaje registrado.
          </Text>
        )}

        {porcentaje === null || porcentaje === undefined ? (
          <Text style={estilos.ayuda}>
            Todavía no tienes ejercicios asignados. Cuando tu profesional te entregue una
            pauta, acá vas a ver cuánto cumples.
          </Text>
        ) : (
          <>
            <Text style={[estilos.numeroGrande, { color: colorAdherencia }]}>{porcentaje}%</Text>
            <Text style={estilos.ayuda}>
              Cumpliste {adherencia.cumplidas} de {adherencia.programadas} tareas programadas
              {datos?.rango?.desde ? ' en toda tu historia' : ''}.
            </Text>
            {adherencia.porcentaje_rango !== null && adherencia.porcentaje_rango !== undefined && (
              <Text style={estilos.ayuda}>
                En el periodo elegido: {adherencia.porcentaje_rango}%.
              </Text>
            )}
            <View style={estilos.barra}>
              <View
                style={[estilos.barraLlena, { width: `${porcentaje}%`, backgroundColor: colorAdherencia }]}
              />
            </View>

            {serieAdherencia.length > 1 && (
              <View style={estilos.grafico}>
                <GraficoLinea
                  ancho={anchoGrafico}
                  maximo={100}
                  etiquetas={['Adherencia (%)']}
                  series={[{ puntos: serieAdherencia, color: colores.primario }]}
                />
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Curva de síntomas ── */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloTarjeta}>Cómo han evolucionado tus síntomas</Text>
        {sintomas.length === 0 ? (
          <>
            <Text style={estilos.ayuda}>
              Aún no has enviado reportes en este periodo. Cada reporte agrega un punto a
              esta curva.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('MiSeguimiento')}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.enlace}>Enviar un reporte ahora →</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={estilos.grafico}>
            <GraficoLinea
              ancho={anchoGrafico}
              maximo={10}
              etiquetas={['Dolor', 'Limitación']}
              series={[
                { puntos: serieDolor, color: colores.error },
                { puntos: serieLimitacion, color: colores.advertencia },
              ]}
            />
          </View>
        )}
      </View>

      {/* ── Asistencia ── */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloTarjeta}>Tus sesiones</Text>
        <View style={estilos.filaRecuento}>
          <View style={estilos.recuento}>
            <Text style={[estilos.recuentoNumero, { color: colores.exito }]}>
              {asistencia.realizadas || 0}
            </Text>
            <Text style={estilos.recuentoEtiqueta}>realizadas</Text>
          </View>
          <View style={estilos.recuento}>
            <Text style={[estilos.recuentoNumero, { color: colores.error }]}>
              {asistencia.inasistencias || 0}
            </Text>
            <Text style={estilos.recuentoEtiqueta}>inasistencias</Text>
          </View>
          <View style={estilos.recuento}>
            <Text style={[estilos.recuentoNumero, { color: colores.primario }]}>
              {asistencia.proximas || 0}
            </Text>
            <Text style={estilos.recuentoEtiqueta}>por venir</Text>
          </View>
        </View>
      </View>

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
  centrado: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: espacio.xl,
    backgroundColor: colores.fondo,
  },
  cargandoTexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.md },

  filaAtajos: { flexDirection: 'row', gap: espacio.sm, marginBottom: espacio.md },
  atajo: {
    flex: 1,
    paddingVertical: espacio.sm,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    alignItems: 'center',
  },
  atajoElegido: { backgroundColor: colores.primario, borderColor: colores.primario },
  atajoTexto: { ...tipografia.meta, color: colores.textoSuave, fontWeight: '600' },
  atajoTextoElegido: { color: colores.textoInverso },

  filaFechas: { flexDirection: 'row', gap: espacio.sm, marginBottom: espacio.base },
  campoFecha: {
    flex: 1,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: radio.md,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
  },
  campoFechaTexto: { ...tipografia.meta, color: colores.texto },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.base },
  tituloTarjeta: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginBottom: espacio.sm },
  ayuda: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  enlace: { ...tipografia.metaFuerte, color: colores.primario, marginTop: espacio.sm },
  avisoSuspendido: { ...tipografia.meta, color: colores.advertencia, marginBottom: espacio.sm },

  numeroGrande: { ...tipografia.display, fontSize: 40, lineHeight: 46 },
  barra: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colores.superficieSuave,
    overflow: 'hidden',
    marginTop: espacio.md,
  },
  barraLlena: { height: '100%', borderRadius: 4 },
  grafico: { marginTop: espacio.base },

  filaRecuento: { flexDirection: 'row', justifyContent: 'space-around' },
  recuento: { alignItems: 'center' },
  recuentoNumero: { ...tipografia.titulo },
  recuentoEtiqueta: { ...tipografia.micro, color: colores.textoSuave, marginTop: 2 },

  iconoGrande: { fontSize: 48, marginBottom: espacio.md },
  tituloVacio: { ...tipografia.subtitulo, color: colores.textoTitulo, textAlign: 'center' },
  textoVacio: {
    ...tipografia.meta,
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.sm,
  },
  botonVacio: { ...piezas.botonPrimario, marginTop: espacio.xl },
  botonVacioTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
});
