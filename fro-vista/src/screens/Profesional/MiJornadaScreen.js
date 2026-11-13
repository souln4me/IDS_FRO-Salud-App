/**
 * Componente: Cliente Móvil — Vista "Mi Jornada"
 * Casos de uso: CU38, CU40, CU16.
 */
// Ruta: fro-vista/src/screens/Profesional/MiJornadaScreen.js
//
// La agenda del profesional, en tres formas de mirarla:
//  · Semana (la de siempre, y con la que abre): arriba los siete días de la
//    semana y abajo las citas del día elegido.
//  · Día: las citas de un solo día como línea de tiempo, agrupadas por hora y
//    con los ratos libres entre una y otra.
//  · Mes: la grilla del mes con cuántas citas tiene cada día; al tocar un día
//    se abre ese día en la vista Día.
// Además, "Ir a fecha" abre un calendario para saltar directo a cualquier día
// sin recorrer la agenda con las flechas. Al entrar se abre en el día de hoy.
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
} from 'react-native';

import { getCitasMarcasTemporales } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import EtiquetaEstado from '../../components/EtiquetaEstado';
import { formatearFecha, formatearHora, claveDia, parsearFecha } from '../../utils/fechas';
import Icono from '../../components/Icono';
import { colores, espacio, piezas, radio, sombra, tipografia, interaccion } from '../../theme';
import BarraAtencionEnCurso from '../../components/BarraAtencionEnCurso';
import CalendarioMensual from '../../components/CalendarioMensual';
import SelectorFechaRapido from '../../components/SelectorFechaRapido';
import PendientesDocumentar from '../../components/PendientesDocumentar';

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const VISTAS = [
  { key: 'dia', titulo: 'Día' },
  { key: 'semana', titulo: 'Semana' },
  { key: 'mes', titulo: 'Mes' },
];

// Un rato sin citas menor a esto no se anuncia en la vista Día: sería ruido.
const MINUTOS_LIBRES_MINIMOS = 15;

function normalizar(estado) {
  return String(estado || '').trim().toUpperCase().replace(/\s+/g, '_');
}

/** "AAAA-MM-DD" de una fecha, en la hora local del teléfono. */
function aClave(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** El Date (a medianoche local) de una clave "AAAA-MM-DD". */
function deClave(clave) {
  const [anio, mes, dia] = clave.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
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

/**
 * El mismo número de día en otro mes. Si ese mes es más corto (31 de enero
 * → febrero) se queda en su último día, en vez de saltar a marzo como haría
 * Date por su cuenta.
 */
function sumarMeses(fecha, meses) {
  const destino = new Date(fecha.getFullYear(), fecha.getMonth() + meses, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(fecha.getDate(), ultimoDia));
  return destino;
}

/** Posición del día en la semana: 0 es lunes, 6 es domingo. */
function indiceSemana(fecha) {
  return (fecha.getDay() + 6) % 7;
}

/**
 * Las semanas completas (de lunes a domingo) que cubren el mes de la fecha:
 * entre 4 y 6 filas, con los días del mes vecino marcados como de afuera.
 */
function semanasDelMes(fecha) {
  const primero = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const ultimo = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
  const fin = aClave(sumarDias(lunesDe(ultimo), 6));

  const semanas = [];
  let dia = lunesDe(primero);
  while (aClave(dia) <= fin) {
    const semana = [];
    for (let i = 0; i < 7; i += 1) {
      semana.push({ fecha: dia, clave: aClave(dia), delMes: dia.getMonth() === primero.getMonth() });
      dia = sumarDias(dia, 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

/** "3 – 9 de noviembre", o "27 oct – 2 nov" si la semana cruza de mes. */
function tituloSemana(semana, anioActual) {
  const [inicio, fin] = [semana[0], semana[6]];
  const anio = fin.getFullYear() !== anioActual ? ` ${fin.getFullYear()}` : '';
  if (inicio.getMonth() === fin.getMonth()) {
    return `${inicio.getDate()} – ${fin.getDate()} de ${MESES[fin.getMonth()]}${anio && ` de${anio}`}`;
  }
  return `${inicio.getDate()} ${MESES_CORTOS[inicio.getMonth()]} – ${fin.getDate()} ${MESES_CORTOS[fin.getMonth()]}${anio}`;
}

/** "45 min", "1 h", "1 h 30 min". */
function duracionLegible(minutos) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Primera letra en mayúscula, para los títulos. */
function conMayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function textoCantidad(n) {
  return n === 1 ? '1 cita' : `${n} citas`;
}

export default function MiJornadaScreen({ navigation }) {
  const hoy = useMemo(() => new Date(), []);
  const claveHoy = aClave(hoy);

  // Todo cuelga del día elegido: la semana y el mes que se muestran son los
  // que contienen ese día, así las tres vistas se mueven juntas.
  const [vista, setVista] = useState('semana');
  const [diaElegido, setDiaElegido] = useState(claveHoy);
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);

  const fechaElegida = useMemo(() => deClave(diaElegido), [diaElegido]);
  const claveLunes = aClave(lunesDe(fechaElegida));

  const semana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => sumarDias(deClave(claveLunes), i)),
    [claveLunes]
  );

  const claveMes = diaElegido.slice(0, 7);
  const semanasMes = useMemo(() => semanasDelMes(deClave(`${claveMes}-01`)), [claveMes]);

  // Lo que se le pide al servidor. Día y Semana piden la semana completa:
  // cambiar de día es instantáneo y el contador de cada día se ve desde el
  // primer momento. Mes pide todas las semanas que dibuja la grilla.
  const desde = vista === 'mes' ? semanasMes[0][0].clave : aClave(semana[0]);
  const hasta = vista === 'mes' ? semanasMes[semanasMes.length - 1][6].clave : aClave(semana[6]);

  // Rango que ya está en pantalla, para no volver a pedir lo mismo al pasar
  // del mes a uno de sus días (o al revés).
  const rangoCargado = useRef(null);
  // Cada pedido lleva un número: si el profesional avanza rápido con las
  // flechas, una respuesta atrasada no pisa a la más reciente.
  const ultimoPedido = useRef(0);

  // CU38 — cargar las citas del profesional en el rango que se muestra
  const cargar = useCallback(async (esRefresco = false) => {
    const cubierto = rangoCargado.current
      && rangoCargado.current.desde <= desde
      && rangoCargado.current.hasta >= hasta;
    if (!esRefresco && cubierto) {
      ultimoPedido.current += 1;
      setCargando(false);
      return;
    }

    const pedido = ++ultimoPedido.current;
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setErrorCarga(false);
    try {
      const datos = await getCitasMarcasTemporales({ desde, hasta });
      if (pedido !== ultimoPedido.current) return;
      setCitas(datos.citas || []);
      rangoCargado.current = { desde, hasta };
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      rangoCargado.current = null;
      setErrorCarga(true);
    } finally {
      if (pedido === ultimoPedido.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al volver de la ficha, la jornada se actualiza sola: puede que el
  // profesional haya iniciado o cerrado una atención allá.
  useEffect(() => {
    const quitar = navigation.addListener('focus', () => cargar(true));
    return quitar;
  }, [navigation, cargar]);

  // Cuántas citas tiene cada día, para la marca de la semana y del mes.
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

  // La vista Día como línea de tiempo: un encabezado por cada hora con citas
  // y, entre una cita y la siguiente, el rato libre si es de 15 min o más.
  const lineaDeTiempo = useMemo(() => {
    const filas = [];
    let horaAnterior = null;
    let finAnterior = null;
    for (const cita of citasDelDia) {
      const inicio = parsearFecha(cita.fecha_hora_inicio);
      if (finAnterior && inicio) {
        const libres = Math.round((inicio - finAnterior) / 60000);
        if (libres >= MINUTOS_LIBRES_MINIMOS) {
          filas.push({ tipo: 'libre', clave: `libre-${cita.cita_id}`, minutos: libres });
        }
      }
      const hora = `${formatearHora(cita.fecha_hora_inicio).slice(0, 2)}:00`;
      if (hora !== horaAnterior) {
        filas.push({ tipo: 'hora', clave: `hora-${hora}`, hora });
        horaAnterior = hora;
      }
      filas.push({ tipo: 'cita', clave: `cita-${cita.cita_id}`, cita });
      // Si dos citas se traslapan, el rato libre se mide desde la que termina
      // más tarde.
      const fin = parsearFecha(cita.fecha_hora_fin);
      if (fin && (!finAnterior || fin > finAnterior)) finAnterior = fin;
    }
    return filas;
  }, [citasDelDia]);

  const citasDelMes = useMemo(
    () => Object.keys(porDia)
      .filter((clave) => clave.startsWith(claveMes))
      .reduce((suma, clave) => suma + porDia[clave], 0),
    [porDia, claveMes]
  );

  const anioActual = hoy.getFullYear();
  const conAnio = (fecha) => (fecha.getFullYear() !== anioActual ? ` de ${fecha.getFullYear()}` : '');
  const nombreDia = (fecha) =>
    `${DIAS_LARGOS[indiceSemana(fecha)]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;

  const irAHoy = () => setDiaElegido(claveHoy);

  // Las flechas mueven un día, una semana o un mes según la vista. Al cambiar
  // de semana se mantiene el mismo día de la semana; al cambiar de mes, el
  // mismo número de día.
  const avanzar = (delta) => {
    if (vista === 'dia') setDiaElegido(aClave(sumarDias(fechaElegida, delta)));
    else if (vista === 'semana') setDiaElegido(aClave(sumarDias(fechaElegida, delta * 7)));
    else setDiaElegido(aClave(sumarMeses(fechaElegida, delta)));
  };

  const elegirEnMes = (clave) => {
    setDiaElegido(clave);
    setVista('dia');
  };

  // CU38 — abrir la ficha del paciente para marcar y registrar la atención
  const abrirFicha = (cita) => {
    navigation.navigate('FichaClinica', {
      pacienteId: cita.paciente_id,
      nombrePaciente: cita.paciente,
    });
  };

  const titulo =
    vista === 'dia'
      ? conMayuscula(`${nombreDia(fechaElegida)}${conAnio(fechaElegida)}`)
      : vista === 'semana'
        ? tituloSemana(semana, anioActual)
        : `${conMayuscula(MESES[fechaElegida.getMonth()])} ${fechaElegida.getFullYear()}`;

  const nombresFlecha = {
    dia: ['Día anterior', 'Día siguiente'],
    semana: ['Semana anterior', 'Semana siguiente'],
    mes: ['Mes anterior', 'Mes siguiente'],
  }[vista];

  const cabecera = (
    <View style={estilos.cabecera}>
      <View style={estilos.filaControles}>
        {/* Selector de vista: Día, Semana o Mes. */}
        <View style={estilos.segmentos} accessibilityRole="tablist">
          {VISTAS.map((opcion) => {
            const activa = opcion.key === vista;
            return (
              <TouchableOpacity
                key={opcion.key}
                style={[estilos.segmento, activa && estilos.segmentoActivo]}
                onPress={() => setVista(opcion.key)}
                activeOpacity={interaccion.opacidadActiva}
                accessibilityRole="tab"
                accessibilityState={{ selected: activa }}
              >
                <Text style={[estilos.segmentoTexto, activa && estilos.segmentoTextoActivo]}>
                  {opcion.titulo}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={estilos.botonFecha}
          onPress={() => setCalendarioAbierto(true)}
          activeOpacity={interaccion.opacidadActiva}
          accessibilityRole="button"
          accessibilityLabel="Ir a una fecha del calendario"
        >
          <Icono name="calendar-outline" size={16} color={colores.primario} />
          <Text style={estilos.botonFechaTexto}>Ir a fecha</Text>
        </TouchableOpacity>
      </View>

      <View style={estilos.filaSemana}>
        <TouchableOpacity
          onPress={() => avanzar(-1)}
          activeOpacity={interaccion.opacidadActiva}
          style={estilos.flecha}
          accessibilityLabel={nombresFlecha[0]}
        >
          <Text style={estilos.flechaTexto}>‹</Text>
        </TouchableOpacity>

        {/* Tocar el título también abre el calendario. */}
        <TouchableOpacity
          onPress={() => setCalendarioAbierto(true)}
          activeOpacity={interaccion.opacidadActiva}
          style={estilos.tituloToque}
          accessibilityRole="button"
          accessibilityLabel={`${titulo}. Toca para elegir otra fecha`}
        >
          <Text style={estilos.tituloSemana} numberOfLines={1}>{titulo}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => avanzar(1)}
          activeOpacity={interaccion.opacidadActiva}
          style={estilos.flecha}
          accessibilityLabel={nombresFlecha[1]}
        >
          <Text style={estilos.flechaTexto}>›</Text>
        </TouchableOpacity>
      </View>

      {vista === 'semana' && (
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
      )}

      {diaElegido !== claveHoy && (
        <TouchableOpacity onPress={irAHoy} activeOpacity={interaccion.opacidadActiva}>
          <Text style={estilos.enlaceHoy}>Volver a hoy</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const calendario = (
    <SelectorFechaRapido
      visible={calendarioAbierto}
      fecha={fechaElegida}
      onCerrar={() => setCalendarioAbierto(false)}
      onElegir={(fecha) => setDiaElegido(aClave(fecha))}
    />
  );

  // CU16 — Restringiendo disponibilidad administrativa
  // Bloquear horarios (vacaciones, licencias) se hace desde la jornada.
  const botonDisponibilidad = (
    <TouchableOpacity
      style={estilos.fab}
      onPress={() => navigation.navigate('GestionDisponibilidad')}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Icono name="calendar-outline" size={18} color={colores.textoInverso} />
      <Text style={estilos.fabTexto}>Gestionar disponibilidad</Text>
    </TouchableOpacity>
  );

  // CU38: tarjeta de la cita con su hora de inicio y duración registradas.
  const tarjetaCita = (cita) => {
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
  };

  const sinCitas = (ayuda) => (
    <View style={estilos.vacio}>
      <Text style={estilos.vacioIcono}>📅</Text>
      <Text style={estilos.vacioTitulo}>Sin citas este día</Text>
      <Text style={estilos.vacioTexto}>{ayuda}</Text>
    </View>
  );

  const cargador = <ActivityIndicator size="large" color={colores.primario} style={estilos.cargando} />;

  // ── Contenido de cada vista ──────────────────────────────────────────────
  let contenido;
  if (vista === 'semana') {
    contenido = (
      <>
        <Text style={estilos.intro}>
          {nombreDia(fechaElegida)}
          {diaElegido === claveHoy ? ' · hoy' : ''}
          {citasDelDia.length > 0 ? ` · ${citasDelDia.length} cita(s)` : ''}
        </Text>

        {cargando
          ? cargador
          : citasDelDia.length === 0
            ? sinCitas('Elige otro día arriba o desliza hacia abajo para actualizar.')
            : citasDelDia.map(tarjetaCita)}

        <Text style={estilos.pie}>
          Toca una cita para abrir la ficha del paciente y registrar la atención.
        </Text>
      </>
    );
  } else if (vista === 'dia') {
    contenido = (
      <>
        <Text style={estilos.intro}>
          {formatearFecha(diaElegido)}
          {diaElegido === claveHoy ? ' · hoy' : ''}
          {citasDelDia.length > 0 ? ` · ${textoCantidad(citasDelDia.length)}` : ''}
        </Text>

        {cargando
          ? cargador
          : citasDelDia.length === 0
            ? sinCitas('Usa las flechas para cambiar de día o desliza hacia abajo para actualizar.')
            : lineaDeTiempo.map((fila) => {
              if (fila.tipo === 'hora') {
                return (
                  <View key={fila.clave} style={estilos.filaHora}>
                    <Text style={estilos.filaHoraTexto}>{fila.hora}</Text>
                    <View style={estilos.filaHoraLinea} />
                  </View>
                );
              }
              if (fila.tipo === 'libre') {
                return (
                  <Text key={fila.clave} style={estilos.libre}>
                    Libre {duracionLegible(fila.minutos)}
                  </Text>
                );
              }
              return tarjetaCita(fila.cita);
            })}

        <Text style={estilos.pie}>
          Toca una cita para abrir la ficha del paciente y registrar la atención.
        </Text>
      </>
    );
  } else {
    contenido = (
      <>
        <View style={estilos.tarjetaMes}>
          <CalendarioMensual
            semanas={semanasMes}
            conteos={porDia}
            diaElegido={diaElegido}
            claveHoy={claveHoy}
            onElegirDia={elegirEnMes}
          />
        </View>

        {cargando ? (
          <ActivityIndicator color={colores.primario} style={estilos.cargandoMes} />
        ) : (
          <Text style={estilos.resumenMes}>
            {citasDelMes === 0
              ? `Sin citas en ${MESES[fechaElegida.getMonth()]}.`
              : `${textoCantidad(citasDelMes)} en ${MESES[fechaElegida.getMonth()]}.`}
          </Text>
        )}

        <Text style={estilos.pie}>
          El número bajo cada día es la cantidad de citas. Toca un día para ver su detalle.
        </Text>
      </>
    );
  }

  if (errorCarga) {
    return (
      <View style={estilos.fondo}>
        {cabecera}
        <View style={estilos.centrado}>
          <ErrorRetry mensaje="No se pudo cargar tu jornada." onRetry={() => cargar(false)} />
        </View>
        {botonDisponibilidad}
        {calendario}
      </View>
    );
  }

  return (
    <View style={estilos.fondo}>
      {/* CU38 Exc.3: aviso permanente de la atención en curso. */}
      <BarraAtencionEnCurso navigation={navigation} />

      {cabecera}

      <ScrollView
        style={estilos.fondo}
        contentContainerStyle={estilos.contenido}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
        }
      >
        {/* CU40 (punto 7): sesiones que quedaron para documentar al final de la jornada. */}
        <PendientesDocumentar navigation={navigation} />
        {contenido}
      </ScrollView>

      {botonDisponibilidad}
      {calendario}
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

  filaControles: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm, marginBottom: espacio.sm },
  // Control segmentado: la vista activa queda "levantada" en blanco, sin
  // competir con el día elegido, que ya va pintado de azul.
  segmentos: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colores.superficieSuave,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: 2,
  },
  segmento: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: espacio.xs + 2,
    borderRadius: radio.sm,
  },
  segmentoActivo: { backgroundColor: colores.superficie, ...sombra.suave },
  segmentoTexto: { ...tipografia.metaFuerte, color: colores.textoSuave },
  segmentoTextoActivo: { color: colores.primario },
  botonFecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingVertical: espacio.xs + 2,
    paddingHorizontal: espacio.md,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.primarioBorde,
    backgroundColor: colores.primarioSuave,
  },
  botonFechaTexto: { ...tipografia.metaFuerte, color: colores.primario },

  filaSemana: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flecha: { paddingHorizontal: espacio.md, paddingVertical: espacio.xs },
  flechaTexto: { fontSize: 26, color: colores.primario, lineHeight: 28 },
  tituloToque: { flex: 1, alignItems: 'center' },
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

  // Vista Día: encabezado de cada hora con una línea que cruza la pantalla.
  filaHora: { flexDirection: 'row', alignItems: 'center', marginBottom: espacio.sm },
  filaHoraTexto: { ...tipografia.metaFuerte, color: colores.secundarioFuerte, marginRight: espacio.sm },
  filaHoraLinea: { flex: 1, height: 1, backgroundColor: colores.bordeSuave },
  libre: {
    ...tipografia.meta,
    color: colores.textoTenue,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: espacio.md,
  },

  // Vista Mes.
  tarjetaMes: { ...piezas.tarjeta, padding: espacio.sm },
  cargandoMes: { marginTop: espacio.base },
  resumenMes: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginTop: espacio.base },

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
