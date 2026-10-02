// Ruta: fro-vista/src/screens/Profesional/MiJornadaScreen.js
//
// La agenda del profesional, día por día: arriba los siete días de la semana y
// abajo las citas de ese día, de la más temprana a la más tarde. Al entrar se
// abre en el día de hoy.
//
// Antes esta pantalla mostraba TODAS las citas seguidas, ordenadas por estado:
// con la agenda de varios días encima no había forma de responder "¿qué tengo
// el jueves?" sin recorrer la lista completa.
//
// Antes también se llamaba "Marcas Temporales" y traía sus propios botones de
// iniciar y finalizar atención — los mismos que ya existían dentro de la ficha
// de cada paciente, sobre los mismos datos. Ahora la jornada solo muestra y
// lleva: al tocar una cita se abre la ficha clínica de ese paciente, que es
// donde se marca la atención y se registra el trabajo.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
} from 'react-native';

import { getCitasMarcasTemporales } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import EtiquetaEstado from '../../components/EtiquetaEstado';
import { formatearHora, claveDia } from '../../utils/fechas';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colores, espacio, piezas, radio, sombra, tipografia, interaccion } from '../../theme';
import BarraAtencionEnCurso from '../../components/BarraAtencionEnCurso';

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function normalizar(estado) {
  return String(estado || '').trim().toUpperCase().replace(/\s+/g, '_');
}

/** "AAAA-MM-DD" de una fecha, en la hora local del teléfono. */
function aClave(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** El lunes de la semana a la que pertenece la fecha. */
function lunesDe(fecha) {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  // getDay(): 0 es domingo. La semana laboral parte el lunes.
  const desplazamiento = copia.getDay() === 0 ? -6 : 1 - copia.getDay();
  copia.setDate(copia.getDate() + desplazamiento);
  return copia;
}

function sumarDias(fecha, dias) {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  copia.setDate(copia.getDate() + dias);
  return copia;
}

export default function MiJornadaScreen({ navigation }) {
  const hoy = useMemo(() => new Date(), []);
  const claveHoy = aClave(hoy);

  const [lunes, setLunes] = useState(() => lunesDe(new Date()));
  const [diaElegido, setDiaElegido] = useState(claveHoy);
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  const semana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)),
    [lunes]
  );

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setErrorCarga(false);
    try {
      // Se pide la semana completa de una vez: cambiar de día es instantáneo y
      // el contador de cada día puede mostrarse desde el primer momento.
      const datos = await getCitasMarcasTemporales({
        desde: aClave(semana[0]),
        hasta: aClave(semana[6]),
      });
      setCitas(datos.citas || []);
    } catch (error) {
      setErrorCarga(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [semana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al volver de la ficha, la jornada se actualiza sola: puede que el
  // profesional haya iniciado o cerrado una atención allá.
  useEffect(() => {
    const quitar = navigation.addListener('focus', () => cargar(true));
    return quitar;
  }, [navigation, cargar]);

  // Cuántas citas tiene cada día, para la marca del selector.
  const porDia = useMemo(() => {
    const mapa = {};
    for (const cita of citas) {
      const dia = claveDia(cita.fecha_hora_inicio);
      if (!dia) continue;
      mapa[dia] = (mapa[dia] || 0) + 1;
    }
    return mapa;
  }, [citas]);

  const citasDelDia = useMemo(
    () =>
      citas
        .filter((cita) => claveDia(cita.fecha_hora_inicio) === diaElegido)
        // De la más temprana a la más tarde: la jornada se lee en el orden en
        // que va a ocurrir, no por estado.
        .sort((a, b) =>
          String(a.fecha_hora_inicio || '').localeCompare(String(b.fecha_hora_inicio || ''))
        ),
    [citas, diaElegido]
  );

  const fechaElegida = semana.find((d) => aClave(d) === diaElegido) || null;
  const enSemanaDeHoy = semana.some((d) => aClave(d) === claveHoy);

  const irAHoy = () => {
    setLunes(lunesDe(new Date()));
    setDiaElegido(claveHoy);
  };

  const cambiarSemana = (delta) => {
    const nuevoLunes = sumarDias(lunes, delta * 7);
    setLunes(nuevoLunes);
    // Al cambiar de semana se mantiene el mismo día de la semana.
    const indice = semana.findIndex((d) => aClave(d) === diaElegido);
    setDiaElegido(aClave(sumarDias(nuevoLunes, indice === -1 ? 0 : indice)));
  };

  const abrirFicha = (cita) => {
    navigation.navigate('FichaClinica', {
      pacienteId: cita.paciente_id,
      nombrePaciente: cita.paciente,
    });
  };

  const selectorSemana = (
    <View style={estilos.cabecera}>
      <View style={estilos.filaSemana}>
        <TouchableOpacity
          onPress={() => cambiarSemana(-1)}
          activeOpacity={interaccion.opacidadActiva}
          style={estilos.flecha}
        >
          <Text style={estilos.flechaTexto}>‹</Text>
        </TouchableOpacity>

        <Text style={estilos.tituloSemana}>
          {semana[0].getDate()} – {semana[6].getDate()} de {MESES[semana[6].getMonth()]}
        </Text>

        <TouchableOpacity
          onPress={() => cambiarSemana(1)}
          activeOpacity={interaccion.opacidadActiva}
          style={estilos.flecha}
        >
          <Text style={estilos.flechaTexto}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={estilos.dias}>
        {semana.map((dia, indice) => {
          const clave = aClave(dia);
          const elegido = clave === diaElegido;
          const esHoy = clave === claveHoy;
          const total = porDia[clave] || 0;

          return (
            <TouchableOpacity
              key={clave}
              style={[estilos.dia, elegido && estilos.diaElegido, esHoy && !elegido && estilos.diaHoy]}
              onPress={() => setDiaElegido(clave)}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={[estilos.diaNombre, elegido && estilos.diaTextoElegido]}>
                {DIAS_CORTOS[indice]}
              </Text>
              <Text style={[estilos.diaNumero, elegido && estilos.diaTextoElegido]}>
                {dia.getDate()}
              </Text>
              {/* El punto dice que ese día tiene citas sin tener que abrirlo. */}
              <View style={[estilos.marca, total > 0 && (elegido ? estilos.marcaElegida : estilos.marcaLlena)]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {!(enSemanaDeHoy && diaElegido === claveHoy) && (
        <TouchableOpacity onPress={irAHoy} activeOpacity={interaccion.opacidadActiva}>
          <Text style={estilos.enlaceHoy}>Volver a hoy</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Bloquear horarios (vacaciones, licencias) se hace desde la jornada.
  const botonDisponibilidad = (
    <TouchableOpacity
      style={estilos.fab}
      onPress={() => navigation.navigate('GestionDisponibilidad')}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name="calendar-outline" size={18} color={colores.textoInverso} />
      <Text style={estilos.fabTexto}>Gestionar disponibilidad</Text>
    </TouchableOpacity>
  );

  if (errorCarga) {
    return (
      <View style={estilos.fondo}>
        {selectorSemana}
        <View style={estilos.centrado}>
          <ErrorRetry mensaje="No se pudo cargar tu jornada." onRetry={() => cargar(false)} />
        </View>
        {botonDisponibilidad}
      </View>
    );
  }

  return (
    <View style={estilos.fondo}>
      <BarraAtencionEnCurso navigation={navigation} />

      {selectorSemana}

      <ScrollView
        style={estilos.fondo}
        contentContainerStyle={estilos.contenido}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
        }
      >
        <Text style={estilos.intro}>
          {fechaElegida
            ? `${DIAS_LARGOS[(fechaElegida.getDay() + 6) % 7]} ${fechaElegida.getDate()} de ${MESES[fechaElegida.getMonth()]}`
            : 'Día seleccionado'}
          {diaElegido === claveHoy ? ' · hoy' : ''}
          {citasDelDia.length > 0 ? ` · ${citasDelDia.length} cita(s)` : ''}
        </Text>

        {cargando ? (
          <ActivityIndicator size="large" color={colores.primario} style={estilos.cargando} />
        ) : citasDelDia.length === 0 ? (
          <View style={estilos.vacio}>
            <Text style={estilos.vacioIcono}>📅</Text>
            <Text style={estilos.vacioTitulo}>Sin citas este día</Text>
            <Text style={estilos.vacioTexto}>
              Elige otro día arriba o desliza hacia abajo para actualizar.
            </Text>
          </View>
        ) : (
          citasDelDia.map((cita) => {
            const estado = normalizar(cita.estado);
            const enCurso = estado === 'EN_CURSO';

            return (
              <TouchableOpacity
                key={cita.cita_id}
                style={[estilos.tarjeta, enCurso && estilos.tarjetaEnCurso]}
                onPress={() => abrirFicha(cita)}
                activeOpacity={interaccion.opacidadActiva}
              >
                <View style={estilos.hora}>
                  <Text style={estilos.horaTexto}>{formatearHora(cita.fecha_hora_inicio)}</Text>
                  <Text style={estilos.horaFin}>{formatearHora(cita.fecha_hora_fin)}</Text>
                </View>

                <View style={estilos.info}>
                  <Text style={estilos.paciente} numberOfLines={1}>{cita.paciente}</Text>
                  {cita.checkin_profesional ? (
                    <Text style={estilos.detalle}>
                      Atención iniciada a las {formatearHora(cita.checkin_profesional)}
                    </Text>
                  ) : null}
                  {estado === 'REALIZADA' && cita.duracion_minutos ? (
                    <Text style={estilos.detalle}>Duró {cita.duracion_minutos} minutos</Text>
                  ) : null}
                  <EtiquetaEstado estado={estado} tamano="sm" style={estilos.etiqueta} />
                </View>

                <Text style={estilos.chevron}>›</Text>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={estilos.pie}>
          Toca una cita para abrir la ficha del paciente y registrar la atención.
        </Text>
      </ScrollView>

      {botonDisponibilidad}
    </View>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  // Espacio al final para que el botón flotante no tape la última cita.
  contenido: { padding: espacio.lg, paddingBottom: 96 },

  fab: {
    position: 'absolute',
    right: espacio.lg,
    bottom: espacio.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    backgroundColor: colores.primario,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.lg,
    borderRadius: radio.completo,
    ...sombra.media,
  },
  fabTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl },
  cargando: { marginTop: espacio.xxl },

  cabecera: {
    backgroundColor: colores.superficie,
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.md,
    paddingBottom: espacio.sm,
    borderBottomWidth: 1,
    borderBottomColor: colores.bordeSuave,
  },
  filaSemana: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flecha: { paddingHorizontal: espacio.md, paddingVertical: espacio.xs },
  flechaTexto: { fontSize: 26, color: colores.primario, lineHeight: 28 },
  tituloSemana: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },

  dias: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espacio.sm },
  dia: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: espacio.sm,
    marginHorizontal: 2,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  diaElegido: { backgroundColor: colores.primario },
  // Hoy se reconoce aunque se esté mirando otro día.
  diaHoy: { borderColor: colores.primario },
  diaNombre: { ...tipografia.micro, color: colores.textoSuave },
  diaNumero: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginTop: 2 },
  diaTextoElegido: { color: colores.textoInverso },
  marca: { width: 5, height: 5, borderRadius: 3, marginTop: 4, backgroundColor: 'transparent' },
  marcaLlena: { backgroundColor: colores.primario },
  marcaElegida: { backgroundColor: colores.textoInverso },

  enlaceHoy: {
    ...tipografia.metaFuerte,
    color: colores.primario,
    textAlign: 'center',
    marginTop: espacio.sm,
  },

  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },
  pie: { ...tipografia.meta, color: colores.textoTenue, marginTop: espacio.base },

  tarjeta: {
    ...piezas.tarjeta,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espacio.md,
  },
  // La cita en curso se distingue sin depender solo del color de la etiqueta.
  tarjetaEnCurso: { borderColor: colores.advertencia, borderWidth: 1.5 },

  hora: {
    width: 62,
    alignItems: 'center',
    marginRight: espacio.base,
    paddingRight: espacio.base,
    borderRightWidth: 1,
    borderRightColor: colores.bordeSuave,
  },
  horaTexto: { ...tipografia.subtitulo, color: colores.primario },
  horaFin: { ...tipografia.micro, color: colores.textoTenue, marginTop: 2 },

  info: { flex: 1 },
  paciente: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  detalle: { ...tipografia.meta, color: colores.textoSuave, marginTop: 1 },
  etiqueta: { marginTop: espacio.sm },

  chevron: { fontSize: 26, color: colores.textoDeshabilitado, marginLeft: espacio.sm },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', paddingHorizontal: espacio.xl },
});
