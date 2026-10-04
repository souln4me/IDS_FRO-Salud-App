// Ruta: fro-vista/src/screens/Admin/PanelAdminScreen.js
//
// CU64 — Dashboard de monitoreo de KPIs. Es la pantalla de inicio del
// administrador: lo primero que ve al entrar, como pide la ficha ("tras la
// resolución exitosa del inicio de sesión gerencial").
//
// Antes el administrador aterrizaba en Parámetros Globales, que es una
// herramienta de configuración, no una vista de gestión.

import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, useWindowDimensions, StyleSheet,
} from 'react-native';

import { AuthContext } from '../../context/AuthContext';
import { getKPIs } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import GraficoLinea from '../../components/GraficoLinea';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

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

const pesos = (valor) => `$${Number(valor || 0).toLocaleString('es-CL')}`;

export default function PanelAdminScreen({ navigation }) {
  const { userData, confirmarCierreSesion } = useContext(AuthContext);
  // El botón de salir va al final: se deja el margen de los botones del sistema.
  const bordes = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [atajo, setAtajo] = useState('30');
  // Excepción 1: respaldo en tablas numéricas si el gráfico no sirve.
  const [verTabla, setVerTabla] = useState(false);

  const cargar = useCallback(
    async (dias, esRefresco = false) => {
      if (esRefresco) setRefrescando(true);
      else setCargando(true);
      setError(false);
      try {
        setDatos(await getKPIs(dias ? { desde: haceDias(dias) } : {}));
      } catch {
        setError(true);
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    []
  );

  useEffect(() => {
    const opcion = ATAJOS.find((a) => a.clave === atajo);
    cargar(opcion?.dias);
  }, [cargar, atajo]);

  useEffect(() => {
    const quitar = navigation.addListener('focus', () => {
      const opcion = ATAJOS.find((a) => a.clave === atajo);
      cargar(opcion?.dias, true);
    });
    return quitar;
  }, [navigation, cargar, atajo]);

  if (cargando) {
    // Excepción 4: mientras el servidor computa, el indicador de carga explica
    // qué está pasando.
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
        <Text style={estilos.cargandoTexto}>Calculando indicadores…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No se pudieron cargar los indicadores." onRetry={() => cargar()} />
      </View>
    );
  }

  const serie = (datos?.serie_citas || []).map((p) => ({
    etiqueta: p.fecha.slice(8) + '/' + p.fecha.slice(5, 7),
    valor: p.total,
  }));
  const serieRealizadas = (datos?.serie_citas || []).map((p) => ({
    etiqueta: p.fecha.slice(8) + '/' + p.fecha.slice(5, 7),
    valor: p.realizadas,
  }));

  const Indicador = ({ titulo, valor, detalle, color }) => (
    <View style={estilos.indicador}>
      <Text style={[estilos.indicadorValor, color && { color }]}>{valor}</Text>
      <Text style={estilos.indicadorTitulo}>{titulo}</Text>
      {detalle ? <Text style={estilos.indicadorDetalle}>{detalle}</Text> : null}
    </View>
  );

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={[estilos.contenido, { paddingBottom: espacio.xxl + bordes.bottom }]}
      refreshControl={
        <RefreshControl
          refreshing={refrescando}
          onRefresh={() => cargar(ATAJOS.find((a) => a.clave === atajo)?.dias, true)}
          colors={[colores.primario]}
        />
      }
    >
      <Text style={estilos.saludo}>Panel de gestión</Text>
      <Text style={estilos.nombre}>{userData?.nombres || 'Administrador'}</Text>

      {/* Excepción 2: los datos vienen de la caché porque el cálculo falló. */}
      {datos?.desde_cache && (
        <View style={estilos.avisoCache}>
          <Text style={estilos.avisoCacheTexto}>
            ⚠️ Mostrando datos diferidos de hace {datos.antiguedad_minutos || 0} minuto(s): el
            cálculo en vivo no respondió. Desliza para reintentar.
          </Text>
        </View>
      )}

      <View style={estilos.filaAtajos}>
        {ATAJOS.map((opcion) => (
          <TouchableOpacity
            key={opcion.clave}
            style={[estilos.atajo, atajo === opcion.clave && estilos.atajoElegido]}
            onPress={() => setAtajo(opcion.clave)}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={[estilos.atajoTexto, atajo === opcion.clave && estilos.atajoTextoElegido]}>
              {opcion.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={estilos.rejilla}>
        <Indicador
          titulo="Pacientes activos"
          valor={datos?.pacientes?.activos ?? 0}
          detalle={`${datos?.pacientes?.registrados ?? 0} registrados`}
          color={colores.primario}
        />
        <Indicador
          titulo="Atenciones realizadas"
          valor={datos?.citas?.realizadas ?? 0}
          detalle={`${datos?.citas?.total ?? 0} citas en el periodo`}
          color={colores.exito}
        />
        <Indicador
          titulo="Tasa de asistencia"
          valor={datos?.citas?.tasa_asistencia === null ? '—' : `${datos?.citas?.tasa_asistencia}%`}
          detalle={`${datos?.citas?.inasistencias ?? 0} inasistencias`}
          color={colores.secundarioFuerte}
        />
        <Indicador
          titulo="Satisfacción"
          valor={
            datos?.satisfaccion?.evaluaciones > 0
              ? `${datos.satisfaccion.promedio} ★`
              : 'Sin datos'
          }
          detalle={`${datos?.satisfaccion?.evaluaciones ?? 0} evaluaciones`}
          color={colores.secundario}
        />
        <Indicador
          titulo="Adherencia media"
          valor={
            datos?.adherencia?.pacientes_medidos > 0 ? `${datos.adherencia.promedio}%` : 'Sin datos'
          }
          detalle={`${datos?.adherencia?.pacientes_medidos ?? 0} pacientes medidos`}
          color={colores.primario}
        />
        <Indicador
          titulo="Recaudación"
          valor={pesos(datos?.recaudacion?.total)}
          detalle={`${datos?.recaudacion?.transacciones ?? 0} transacciones`}
          color={colores.exito}
        />
      </View>

      {/* Lo que exige atención: son enlaces, no solo números. */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloTarjeta}>Pendientes de gestión</Text>

        <TouchableOpacity
          style={estilos.pendiente}
          onPress={() => navigation.navigate('BandejaSoporte')}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.pendienteTexto}>🎫 Tickets de soporte abiertos</Text>
          <Text style={estilos.pendienteNumero}>{datos?.operacion?.tickets_abiertos ?? 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={estilos.pendiente}
          onPress={() => navigation.navigate('ModeracionResenas')}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.pendienteTexto}>📝 Testimonios por moderar</Text>
          <Text style={estilos.pendienteNumero}>{datos?.operacion?.testimonios_pendientes ?? 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={estilos.pendiente}
          onPress={() => navigation.navigate('SesionesSuspendidas')}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.pendienteTexto}>⚠️ Sesiones suspendidas</Text>
          <Text style={estilos.pendienteNumero}>—</Text>
        </TouchableOpacity>

        <View style={estilos.pendiente}>
          <Text style={estilos.pendienteTexto}>🚩 Alertas clínicas abiertas</Text>
          <Text style={estilos.pendienteNumero}>{datos?.operacion?.alertas_abiertas ?? 0}</Text>
        </View>
      </View>

      {/* Gráfico de la operación, con su respaldo en tabla (Excepción 1). */}
      <View style={estilos.tarjeta}>
        <View style={estilos.cabeceraGrafico}>
          <Text style={estilos.tituloTarjeta}>Citas de los últimos 30 días</Text>
          <TouchableOpacity onPress={() => setVerTabla((v) => !v)}>
            <Text style={estilos.enlace}>{verTabla ? 'Ver gráfico' : 'Ver tabla'}</Text>
          </TouchableOpacity>
        </View>

        {serie.length === 0 ? (
          <Text style={estilos.ayuda}>Sin citas registradas en el periodo.</Text>
        ) : verTabla ? (
          <View>
            {datos.serie_citas.map((p) => (
              <Text key={p.fecha} style={estilos.filaTabla}>
                {p.fecha} · {p.total} cita(s), {p.realizadas} realizada(s)
              </Text>
            ))}
          </View>
        ) : (
          <GraficoLinea
            ancho={width - espacio.lg * 2 - espacio.base * 2}
            maximo={Math.max(5, ...serie.map((p) => p.valor))}
            etiquetas={['Citas', 'Realizadas']}
            series={[
              { puntos: serie, color: colores.primario },
              { puntos: serieRealizadas, color: colores.exito },
            ]}
          />
        )}
      </View>

      <Text style={estilos.seccion}>Herramientas</Text>

      {[
        { titulo: 'Liquidaciones', icono: '💼', destino: 'Liquidaciones', sub: 'Ganancias mensuales de cada profesional.' },
        { titulo: 'Informes operativos', icono: '📊', destino: 'Reportes', sub: 'Asistencia, recaudación y adherencia, exportables.' },
        { titulo: 'Parámetros globales', icono: '⚙️', destino: 'Parametros', sub: 'Plazos, umbrales, aranceles y disponibilidad.' },
        { titulo: 'Moderar testimonios', icono: '📝', destino: 'ModeracionResenas', sub: 'Qué comentarios se publican en los perfiles.' },
        { titulo: 'Términos restringidos', icono: '🚫', destino: 'PalabrasRestringidas', sub: 'Diccionario que filtra el chat y las reseñas.' },
        { titulo: 'Seguridad de la cuenta', icono: '🔐', destino: 'Seguridad', sub: 'Contraseña y sesiones activas.' },
      ].map((h) => (
        <TouchableOpacity
          key={h.destino}
          style={estilos.herramienta}
          onPress={() => navigation.navigate(h.destino)}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.herramientaIcono}>{h.icono}</Text>
          <View style={estilos.herramientaTexto}>
            <Text style={estilos.herramientaTitulo}>{h.titulo}</Text>
            <Text style={estilos.herramientaSub}>{h.sub}</Text>
          </View>
          <Text style={estilos.chevron}>›</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={estilos.botonSalir} onPress={confirmarCierreSesion}>
        <Text style={estilos.botonSalirTexto}>CERRAR SESIÓN</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  cargandoTexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.md },

  saludo: { ...tipografia.meta, color: colores.textoSuave },
  nombre: { ...tipografia.display, color: colores.textoTitulo, marginBottom: espacio.base },

  avisoCache: {
    backgroundColor: colores.advertenciaSuave,
    borderWidth: 1,
    borderColor: colores.advertenciaBorde,
    borderRadius: radio.md,
    padding: espacio.md,
    marginBottom: espacio.base,
  },
  avisoCacheTexto: { ...tipografia.meta, color: colores.advertencia },

  filaAtajos: { flexDirection: 'row', gap: espacio.sm, marginBottom: espacio.base },
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

  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md, marginBottom: espacio.base },
  indicador: {
    ...piezas.tarjeta,
    flexGrow: 1,
    flexBasis: '45%',
    paddingVertical: espacio.base,
  },
  indicadorValor: { ...tipografia.titulo, color: colores.textoTitulo },
  indicadorTitulo: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  indicadorDetalle: { ...tipografia.micro, color: colores.textoTenue, marginTop: 2 },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.base },
  tituloTarjeta: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  cabeceraGrafico: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.sm },
  enlace: { ...tipografia.metaFuerte, color: colores.primario },
  ayuda: { ...tipografia.meta, color: colores.textoTenue, marginTop: espacio.sm },
  filaTabla: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },

  pendiente: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacio.md,
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
  },
  pendienteTexto: { ...tipografia.meta, color: colores.texto },
  pendienteNumero: { ...tipografia.cuerpoFuerte, color: colores.primario },

  seccion: { ...tipografia.subtitulo, color: colores.textoTitulo, marginTop: espacio.lg, marginBottom: espacio.md },
  herramienta: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', marginBottom: espacio.md },
  herramientaIcono: { fontSize: 22, marginRight: espacio.base },
  herramientaTexto: { flex: 1 },
  herramientaTitulo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  herramientaSub: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  chevron: { fontSize: 24, color: colores.textoDeshabilitado },

  botonSalir: {
    borderWidth: 1.5,
    borderColor: colores.error,
    borderRadius: radio.md,
    paddingVertical: espacio.base,
    alignItems: 'center',
    marginTop: espacio.lg,
  },
  botonSalirTexto: { ...tipografia.cuerpoFuerte, color: colores.error },
});
