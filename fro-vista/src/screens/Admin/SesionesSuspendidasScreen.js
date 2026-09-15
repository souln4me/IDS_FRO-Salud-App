// Ruta: fro-vista/src/screens/Admin/SesionesSuspendidasScreen.js
//
// CU41 Excepción 2 (decisión D11): cuando la validación multi-factor de una
// sesión detecta discrepancias, la sesión queda suspendida y se deriva al
// Administrador. Esta bandeja muestra cada caso con los datos de contacto
// del paciente y del profesional, para resolverlo fuera del sistema. El
// mismo aviso llega por correo a cada administrador.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  StyleSheet,
} from 'react-native';

import apiClient from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFechaHora } from '../../utils/fechas';
import { etiquetaModalidad } from '../../utils/modalidad';
import { colores, espacio, radio, tipografia, piezas } from '../../theme';

export default function SesionesSuspendidasScreen() {
  const [sesiones, setSesiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError('');
    try {
      const { data } = await apiClient.get('/citas/sesiones-suspendidas');
      setSesiones(data.sesiones || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la bandeja. Revisa tu conexión.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = (url) => Linking.openURL(url).catch(() => {});

  const Contacto = ({ rotulo, nombre, rut, email, telefono }) => (
    <View style={estilos.contacto}>
      <Text style={estilos.contactoRotulo}>{rotulo}</Text>
      <Text style={estilos.contactoNombre}>{nombre}</Text>
      <Text style={estilos.contactoDato}>RUT {rut}</Text>
      {email ? (
        <TouchableOpacity onPress={() => abrir(`mailto:${email}`)}>
          <Text style={estilos.enlace}>✉️ {email}</Text>
        </TouchableOpacity>
      ) : null}
      {telefono ? (
        <TouchableOpacity onPress={() => abrir(`tel:${String(telefono).split('/')[0].trim()}`)}>
          <Text style={estilos.enlace}>📞 {telefono}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={estilos.contactoDato}>Sin teléfono registrado</Text>
      )}
    </View>
  );

  const renderSesion = ({ item }) => {
    const factores = item.motivo_suspension?.factores || [];
    return (
      <View style={[estilos.tarjeta, item.resuelta && estilos.tarjetaResuelta]}>
        <View style={estilos.cabecera}>
          <Text style={estilos.titulo}>Sesión #{item.cita_id}</Text>
          <Text style={[estilos.pastilla, item.resuelta ? estilos.pastillaOk : estilos.pastillaAlerta]}>
            {item.resuelta ? 'Resuelta' : 'Pendiente'}
          </Text>
        </View>
        <Text style={estilos.meta}>
          {formatearFechaHora(item.fecha_hora_inicio)} · {etiquetaModalidad(item.modalidad)}
          {item.especialidad ? ` · ${item.especialidad}` : ''}
        </Text>
        <Text style={estilos.meta}>Suspendida el {formatearFechaHora(item.sesion_suspendida_en)}</Text>

        <Text style={estilos.subtitulo}>Discrepancias detectadas</Text>
        {factores.length === 0 ? (
          <Text style={estilos.factor}>Sin detalle registrado.</Text>
        ) : (
          factores.map((factor) => (
            <Text key={factor} style={estilos.factor}>• {factor}</Text>
          ))
        )}

        <View style={estilos.contactos}>
          <Contacto
            rotulo="Paciente"
            nombre={item.paciente_nombre}
            rut={item.paciente_rut}
            email={item.paciente_email}
            telefono={item.paciente_telefono}
          />
          <Contacto
            rotulo="Profesional"
            nombre={item.profesional_nombre}
            rut={item.profesional_rut}
            email={item.profesional_email}
            telefono={item.profesional_telefono}
          />
        </View>

        {item.resuelta ? (
          <Text style={estilos.notaResuelta}>
            Certificada el {formatearFechaHora(item.sesion_certificada_en)}
            {item.certificacion_tipo === 'MANUAL' ? ' mediante cierre manual justificado' : ''}.
          </Text>
        ) : (
          <Text style={estilos.notaPendiente}>
            Coordina con ambas partes y, una vez aclarado, el profesional puede certificar la sesión con un cierre manual justificado.
          </Text>
        )}
      </View>
    );
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
        <ErrorRetry mensaje={error} onRetry={() => cargar()} />
      </View>
    );
  }

  return (
    <FlatList
      style={estilos.pantalla}
      contentContainerStyle={estilos.contenido}
      data={sesiones}
      keyExtractor={(item) => String(item.cita_id)}
      renderItem={renderSesion}
      ListHeaderComponent={
        <Text style={estilos.intro}>
          Sesiones cuya validación multi-factor detectó discrepancias (marcas de tiempo, presencia o GPS). Cada caso llega también por correo a los administradores.
        </Text>
      }
      ListEmptyComponent={
        <Text style={estilos.vacio}>No hay sesiones suspendidas. Todo en orden.</Text>
      }
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
      }
    />
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.lg, backgroundColor: colores.fondo },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },
  vacio: { ...tipografia.cuerpo, color: colores.textoTenue, textAlign: 'center', marginTop: espacio.xl },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md, borderLeftWidth: 4, borderLeftColor: colores.advertencia },
  tarjetaResuelta: { borderLeftColor: colores.exito, opacity: 0.85 },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo },
  pastilla: { ...tipografia.micro, paddingHorizontal: espacio.sm, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  pastillaAlerta: { backgroundColor: colores.advertenciaSuave, color: colores.advertencia },
  pastillaOk: { backgroundColor: colores.exitoSuave, color: colores.exito },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  subtitulo: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.md, marginBottom: espacio.xs },
  factor: { ...tipografia.meta, color: colores.error },

  contactos: { marginTop: espacio.md, gap: espacio.sm },
  contacto: { backgroundColor: colores.fondo, borderRadius: radio.md, padding: espacio.md },
  contactoRotulo: { ...tipografia.micro, color: colores.textoTenue, marginBottom: 2 },
  contactoNombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  contactoDato: { ...tipografia.meta, color: colores.textoSuave },
  enlace: { ...tipografia.meta, color: colores.primario, marginTop: 2 },

  notaPendiente: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.md, fontStyle: 'italic' },
  notaResuelta: { ...tipografia.meta, color: colores.exito, marginTop: espacio.md },
});
