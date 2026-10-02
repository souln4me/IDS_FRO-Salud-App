// Ruta: fro-vista/src/screens/Comun/CentroNotificacionesScreen.js
//
// CU52 — Centro de notificaciones, común a los tres roles.
//
// Hasta ahora el sistema guardaba cada aviso en la base de datos y ahí moría:
// no había ninguna pantalla que los leyera. Esta es esa pantalla, y además es
// donde el usuario decide por qué canales quiere recibirlos.
//
// Al tocar un aviso se marca como leído y se salta a la pantalla que
// corresponde (Excepción 3 y 4 del CU: la redirección profunda al módulo).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl, Switch,
  ActivityIndicator, StyleSheet,
} from 'react-native';

import {
  getNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  getPreferenciasNotificacion,
  guardarPreferenciasNotificacion,
} from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import { registrarPush } from '../../utils/push';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';
import { resolverDestino } from '../../navigation/rutasBarra';

// Ícono por tipo de aviso: reconocer de un vistazo de qué se trata.
const ICONOS = {
  SOLICITUD_CONFIRMACION: '📅',
  CITA_CONFIRMADA: '✅',
  CAMBIO_ESTADO_CITA: '🔄',
  CUPO_DISPONIBLE: '🎟️',
  CUPO_CEDIDO: '⌛',
  LISTA_ESPERA_INSCRITO: '📝',
  SESION_SUSPENDIDA: '⚠️',
  PAUTA_ASIGNADA: '🏋️',
};

export default function CentroNotificacionesScreen({ navigation }) {
  const [avisos, setAvisos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);

  const [verAjustes, setVerAjustes] = useState(false);
  const [preferencias, setPreferencias] = useState({ canal_push: true, canal_email: true });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setError(false);
    try {
      const datos = await getNotificaciones(0);
      setAvisos(datos.notificaciones || []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    getPreferenciasNotificacion()
      .then(setPreferencias)
      .catch(() => {});
  }, [cargar]);

  const abrir = async (item) => {
    if (!item.leida) {
      setAvisos((previos) =>
        previos.map((a) => (a.notificacion_id === item.notificacion_id ? { ...a, leida: true } : a))
      );
      marcarNotificacionLeida(item.notificacion_id).catch(() => {});
    }
    // Un mismo tipo de aviso viaja a los tres roles, pero cada rol tiene sus
    // pantallas: se salta solo si la ruta existe en este perfil. Antes esto
    // habría mostrado la pantalla de "ruta no disponible".
    const destino = item?.datos?.pantalla;
    const rutasDelRol = navigation.getState?.()?.routeNames || [];
    // Del paciente, varias pantallas ahora viven dentro de la barra inferior.
    const ruta = resolverDestino(rutasDelRol, destino, item.datos || {});
    if (ruta) navigation.navigate(...ruta);
  };

  const marcarTodas = async () => {
    try {
      await marcarTodasLeidas();
      setAvisos((previos) => previos.map((a) => ({ ...a, leida: true })));
    } catch {
      setAviso({ tono: 'error', titulo: 'No se pudo', mensaje: 'Intenta nuevamente.' });
    }
  };

  const cambiarPreferencia = async (clave, valor) => {
    const nuevas = { ...preferencias, [clave]: valor };
    setPreferencias(nuevas);
    setGuardando(true);
    try {
      await guardarPreferenciasNotificacion(nuevas);
      // Activar el push implica pedirle permiso al teléfono.
      if (clave === 'canal_push' && valor) {
        const { estado } = await registrarPush();
        if (estado === 'SIN_PERMISO') {
          setAviso({
            tono: 'alerta',
            titulo: 'Permiso denegado',
            mensaje:
              'Tu teléfono no autorizó las notificaciones. Actívalas en los ajustes del sistema para recibirlas.',
          });
        } else if (estado === 'NO_DISPONIBLE') {
          setAviso({
            tono: 'info',
            titulo: 'Aún no disponible en esta versión',
            mensaje:
              'Las alertas al teléfono necesitan la versión instalable de la app. Mientras tanto, los avisos te llegan aquí y por correo.',
          });
        }
      }
    } catch {
      setPreferencias(preferencias);
      setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: 'Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  };

  const sinLeer = avisos.filter((a) => !a.leida).length;

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
        <ErrorRetry mensaje="No se pudieron cargar tus notificaciones." onRetry={() => cargar()} />
      </View>
    );
  }

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
      }
    >
      <View style={estilos.cabecera}>
        <Text style={estilos.intro}>
          {sinLeer > 0 ? `${sinLeer} aviso(s) sin leer` : 'Estás al día'}
        </Text>
        <TouchableOpacity
          onPress={() => setVerAjustes((v) => !v)}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.enlace}>{verAjustes ? 'Ocultar ajustes' : '⚙️ Canales'}</Text>
        </TouchableOpacity>
      </View>

      {verAjustes && (
        <View style={estilos.tarjetaAjustes}>
          <Text style={estilos.ajustesTitulo}>Cómo quieres que te avisemos</Text>

          <View style={estilos.filaAjuste}>
            <View style={estilos.textoAjuste}>
              <Text style={estilos.ajusteNombre}>Alertas en el teléfono</Text>
              <Text style={estilos.ajusteAyuda}>
                Notificaciones push. Requieren la versión instalable de la app.
              </Text>
            </View>
            <Switch
              value={preferencias.canal_push}
              onValueChange={(v) => cambiarPreferencia('canal_push', v)}
              disabled={guardando}
              trackColor={{ false: colores.borde, true: colores.azul[300] }}
              thumbColor={preferencias.canal_push ? colores.primario : colores.superficie}
            />
          </View>

          <View style={estilos.filaAjuste}>
            <View style={estilos.textoAjuste}>
              <Text style={estilos.ajusteNombre}>Correo electrónico</Text>
              <Text style={estilos.ajusteAyuda}>
                Confirmaciones de cita y avisos importantes a tu correo.
              </Text>
            </View>
            <Switch
              value={preferencias.canal_email}
              onValueChange={(v) => cambiarPreferencia('canal_email', v)}
              disabled={guardando}
              trackColor={{ false: colores.borde, true: colores.azul[300] }}
              thumbColor={preferencias.canal_email ? colores.primario : colores.superficie}
            />
          </View>

          <Text style={estilos.ajusteNota}>
            Esta bandeja siempre recibe todos los avisos: es tu registro dentro de la app.
          </Text>
        </View>
      )}

      {avisos.length === 0 ? (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioIcono}>🔔</Text>
          <Text style={estilos.vacioTitulo}>Sin notificaciones</Text>
          <Text style={estilos.vacioTexto}>
            Aquí llegarán los avisos de tus citas, cupos liberados y novedades de tu tratamiento.
          </Text>
        </View>
      ) : (
        <>
          {sinLeer > 0 && (
            <TouchableOpacity onPress={marcarTodas} activeOpacity={interaccion.opacidadActiva}>
              <Text style={estilos.enlaceMarcar}>Marcar todas como leídas</Text>
            </TouchableOpacity>
          )}

          {avisos.map((item) => (
            <TouchableOpacity
              key={item.notificacion_id}
              style={[estilos.tarjeta, !item.leida && estilos.tarjetaSinLeer]}
              onPress={() => abrir(item)}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={estilos.icono}>{ICONOS[item.tipo] || '🔔'}</Text>
              <View style={estilos.cuerpo}>
                <Text style={[estilos.titulo, !item.leida && estilos.tituloSinLeer]}>
                  {item.titulo || 'Aviso'}
                </Text>
                <Text style={estilos.texto}>{item.contenido}</Text>
                <Text style={estilos.momento}>{formatearFechaHora(item.momento_envio)}</Text>
              </View>
              {!item.leida && <View style={estilos.punto} />}
            </TouchableOpacity>
          ))}
        </>
      )}

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

  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.md },
  intro: { ...tipografia.meta, color: colores.textoSuave },
  enlace: { ...tipografia.metaFuerte, color: colores.primario },
  enlaceMarcar: { ...tipografia.metaFuerte, color: colores.primario, marginBottom: espacio.md },

  tarjetaAjustes: { ...piezas.tarjeta, marginBottom: espacio.lg },
  ajustesTitulo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginBottom: espacio.md },
  filaAjuste: { flexDirection: 'row', alignItems: 'center', marginBottom: espacio.md, gap: espacio.md },
  textoAjuste: { flex: 1 },
  ajusteNombre: { ...tipografia.cuerpo, color: colores.texto },
  ajusteAyuda: { ...tipografia.meta, color: colores.textoTenue, marginTop: 2 },
  ajusteNota: { ...tipografia.meta, color: colores.textoTenue, borderTopWidth: 1, borderTopColor: colores.bordeSuave, paddingTop: espacio.sm },

  tarjeta: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'flex-start', marginBottom: espacio.md, gap: espacio.md },
  // El aviso sin leer se distingue por el fondo y el punto, no solo por el peso
  // de la letra: en pantalla chica el negrita solo no se nota.
  tarjetaSinLeer: { backgroundColor: colores.primarioSuave, borderColor: colores.primarioBorde },
  icono: { fontSize: 22 },
  cuerpo: { flex: 1 },
  titulo: { ...tipografia.cuerpo, color: colores.textoTitulo },
  tituloSinLeer: { ...tipografia.cuerpoFuerte, color: colores.primario },
  texto: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  momento: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.sm },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colores.primario, marginTop: 6 },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', paddingHorizontal: espacio.xl },
});
