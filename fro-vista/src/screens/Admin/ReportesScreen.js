// Ruta: fro-vista/src/screens/Admin/ReportesScreen.js
//
// CU63 — Generación y exportación de informes operativos.
//
// El archivo lo arma el servidor y el teléfono lo descarga con su token de
// sesión; después se abre la hoja de compartir del sistema, que es lo que
// permite guardarlo, mandarlo por correo o abrirlo en otra app.

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
// Se usa la entrada 'legacy' a propósito: es la única que devuelve el código
// de estado y las cabeceras de la respuesta, y aquí hacen falta las dos (el
// servidor contesta JSON cuando no hay datos, y manda el total de tomos en
// una cabecera propia).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';

import { getTiposDeInforme, urlInforme } from '../../api/client';
import DialogoAviso from '../../components/DialogoAviso';
import { formatearFecha } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const FORMATOS = [
  { clave: 'XLSX', etiqueta: 'Excel', extension: 'xlsx' },
  { clave: 'PDF', etiqueta: 'PDF', extension: 'pdf' },
  { clave: 'CSV', etiqueta: 'CSV', extension: 'csv' },
];

function aTexto(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

export default function ReportesScreen() {
  const [informes, setInformes] = useState([]);
  const [tipo, setTipo] = useState('ASISTENCIA');
  const [formato, setFormato] = useState('XLSX');
  const [desde, setDesde] = useState(null);
  const [hasta, setHasta] = useState(null);
  const [calendario, setCalendario] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState(null);
  // Excepción 4: cuando el informe viene partido, aquí quedan sus tomos.
  const [tomosPendientes, setTomosPendientes] = useState(null);

  useEffect(() => {
    getTiposDeInforme()
      .then((d) => setInformes(d.informes || []))
      .catch(() => setInformes([]));
  }, []);

  const fijarFecha = (cual, fecha) => {
    const texto = aTexto(fecha);
    // Excepción 1: el rango invertido se detiene antes de pedir el informe.
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
    if (cual === 'desde') setDesde(texto);
    else setHasta(texto);
  };

  const descargar = async (tomo = 1) => {
    setGenerando(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const extension = FORMATOS.find((f) => f.clave === formato)?.extension || 'xlsx';
      const destino = `${FileSystem.cacheDirectory}informe_${tipo.toLowerCase()}_${Date.now()}.${extension}`;

      const respuesta = await FileSystem.downloadAsync(
        urlInforme(tipo, { desde, hasta, formato, tomo }),
        destino,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // El servidor responde JSON cuando algo impide generar el archivo.
      if (respuesta.status !== 200) {
        const texto = await FileSystem.readAsStringAsync(respuesta.uri).catch(() => '');
        let detalle = {};
        try {
          detalle = JSON.parse(texto);
        } catch {
          detalle = {};
        }
        setAviso({
          tono: detalle.error === 'SIN_DATOS' ? 'info' : 'alerta',
          titulo:
            detalle.error === 'SIN_DATOS'
              ? 'Sin registros'
              : detalle.error === 'PDF_NO_DISPONIBLE'
                ? 'PDF no disponible'
                : 'No se pudo generar',
          mensaje: detalle.mensaje || 'Revisa los filtros e inténtalo otra vez.',
        });
        return;
      }

      // Excepción 4: si el informe vino partido, se avisa cuántos tomos hay.
      const tomos = Number(respuesta.headers?.['x-total-tomos'] || respuesta.headers?.['X-Total-Tomos'] || 1);
      const registros = respuesta.headers?.['x-total-registros'] || respuesta.headers?.['X-Total-Registros'];

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(respuesta.uri);
      }

      if (tomos > 1) {
        setAviso({
          tono: 'info',
          titulo: `Tomo ${tomo} de ${tomos}`,
          mensaje:
            `El informe tiene ${registros} registros y se dividió en ${tomos} tomos. ` +
            `Descarga los siguientes con los botones de abajo.`,
          alCerrar: () => setTomosPendientes({ total: tomos, actual: tomo }),
        });
      }
    } catch (error) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo descargar',
        mensaje: 'Revisa tu conexión e inténtalo nuevamente.',
      });
    } finally {
      setGenerando(false);
    }
  };


  return (
    <ScrollView style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.intro}>
        Elige el informe, el periodo y el formato. El archivo se genera en el servidor y se
        abre para que lo guardes o lo compartas.
      </Text>

      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>Informe</Text>
        {informes.map((i) => (
          <TouchableOpacity
            key={i.clave}
            style={[estilos.opcion, tipo === i.clave && estilos.opcionElegida]}
            onPress={() => setTipo(i.clave)}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={[estilos.opcionTitulo, tipo === i.clave && estilos.opcionTituloElegido]}>
              {tipo === i.clave ? '● ' : '○ '}
              {i.titulo}
            </Text>
            <Text style={estilos.opcionColumnas}>{i.columnas.join(' · ')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>Periodo</Text>
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
        {(desde || hasta) && (
          <TouchableOpacity onPress={() => { setDesde(null); setHasta(null); }}>
            <Text style={estilos.enlace}>Quitar el filtro de fechas</Text>
          </TouchableOpacity>
        )}
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

      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>Formato</Text>
        <View style={estilos.filaFormatos}>
          {FORMATOS.map((f) => (
            <TouchableOpacity
              key={f.clave}
              style={[estilos.formato, formato === f.clave && estilos.formatoElegido]}
              onPress={() => setFormato(f.clave)}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={[estilos.formatoTexto, formato === f.clave && estilos.formatoTextoElegido]}>
                {f.etiqueta}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[estilos.boton, generando && estilos.deshabilitado]}
        onPress={() => descargar(1)}
        disabled={generando}
        activeOpacity={interaccion.opacidadActiva}
      >
        {generando ? (
          <ActivityIndicator color={colores.textoInverso} />
        ) : (
          <Text style={estilos.botonTexto}>Generar y descargar</Text>
        )}
      </TouchableOpacity>

      {/* Excepción 4: los tomos siguientes se descargan uno a uno. */}
      {tomosPendientes && tomosPendientes.total > 1 && (
        <View style={estilos.tarjeta}>
          <Text style={estilos.etiqueta}>Tomos del informe</Text>
          <View style={estilos.filaFormatos}>
            {Array.from({ length: tomosPendientes.total }, (_, i) => i + 1).map((n) => (
              <TouchableOpacity
                key={n}
                style={estilos.tomo}
                onPress={() => descargar(n)}
                disabled={generando}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={estilos.tomoTexto}>Tomo {n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Text style={estilos.nota}>
        Cada descarga queda registrada en la bitácora de auditoría con el usuario, el informe y
        el periodo consultado.
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
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  etiqueta: { ...piezas.etiqueta },
  enlace: { ...tipografia.metaFuerte, color: colores.primario, marginTop: espacio.sm },

  opcion: {
    paddingVertical: espacio.md,
    borderTopWidth: 1,
    borderTopColor: colores.bordeSuave,
  },
  opcionElegida: {},
  opcionTitulo: { ...tipografia.cuerpo, color: colores.textoSuave },
  opcionTituloElegido: { ...tipografia.cuerpoFuerte, color: colores.primario },
  opcionColumnas: { ...tipografia.micro, color: colores.textoTenue, marginTop: 2 },

  filaFechas: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.sm },
  campoFecha: {
    flex: 1,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: radio.md,
    backgroundColor: colores.superficieSuave,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
  },
  campoFechaTexto: { ...tipografia.meta, color: colores.texto },

  filaFormatos: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, marginTop: espacio.sm },
  formato: {
    flex: 1,
    paddingVertical: espacio.md,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    alignItems: 'center',
  },
  formatoElegido: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  formatoTexto: { ...tipografia.meta, color: colores.textoSuave },
  formatoTextoElegido: { ...tipografia.cuerpoFuerte, color: colores.primario },

  tomo: {
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.base,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.primario,
  },
  tomoTexto: { ...tipografia.meta, color: colores.primario },

  boton: { ...piezas.botonPrimario, alignItems: 'center' },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.6 },

  nota: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.lg, textAlign: 'center' },
});
