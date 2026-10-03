// Ruta: fro-vista/src/screens/Paciente/PerfilProfesionalScreen.js
//
// CU10/CU14 — Perfil público del profesional, de solo lectura: foto,
// especialidad, calificación (al tocar las estrellas se abren sus
// valoraciones, CU58), modalidad en píldoras, reseña curricular, áreas de
// experticia y comunas donde atiende. Se abre al tocar su nombre en Buscar y
// agendar cita.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';
import { getPerfilPublicoProfesional } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

// Una píldora por modalidad: "AMBOS" muestra las dos.
const PILDORAS_MODALIDAD = {
  DOMICILIO: [{ icono: 'home-outline', texto: 'A domicilio' }],
  ONLINE: [{ icono: 'videocam-outline', texto: 'Virtual' }],
  AMBOS: [
    { icono: 'home-outline', texto: 'A domicilio' },
    { icono: 'videocam-outline', texto: 'Virtual' },
  ],
};

// Título de sección con su símbolo.
function Etiqueta({ icono, children }) {
  return (
    <View style={estilos.filaEtiqueta}>
      <Ionicons name={icono} size={16} color={colores.primario} />
      <Text style={estilos.etiqueta}>{children}</Text>
    </View>
  );
}

export default function PerfilProfesionalScreen({ route, navigation }) {
  const { profesionalId, nombre } = route?.params || {};
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (nombre) navigation.setOptions?.({ title: nombre });
  }, [navigation, nombre]);

  const cargar = useCallback(async () => {
    setError(false);
    setPerfil(null);
    try {
      setPerfil(await getPerfilPublicoProfesional(profesionalId));
    } catch {
      setError(true);
    }
  }, [profesionalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No pudimos cargar el perfil del profesional." onRetry={cargar} />
      </View>
    );
  }
  if (!perfil) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  const nombreCompleto = [perfil.nombres, perfil.apellido_paterno, perfil.apellido_materno]
    .filter(Boolean)
    .join(' ');
  const iniciales = `${perfil.nombres?.[0] || ''}${perfil.apellido_paterno?.[0] || ''}`.toUpperCase();
  const promedio = Number(perfil.calificacion_promedio || 0);
  const pildoras = PILDORAS_MODALIDAD[perfil.tipo_sede] || [];

  const verEvaluaciones = () =>
    navigation.navigate('ResenasProfesional', { profesionalId, nombre: nombreCompleto });

  return (
    <ScrollView style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      {/* Fotografía, especialidad y calificación */}
      <View style={estilos.bloqueFoto}>
        {perfil.foto_url ? (
          <Image source={{ uri: perfil.foto_url }} style={estilos.foto} />
        ) : (
          <View style={[estilos.foto, estilos.fotoVacia]}>
            <Text style={estilos.iniciales}>{iniciales || '👤'}</Text>
          </View>
        )}
        <View style={estilos.fotoTexto}>
          <Text style={estilos.nombre}>{nombreCompleto}</Text>
          <Text style={estilos.meta}>{perfil.especialidad || 'Sin especialidad'}</Text>
          {/* CU58: las valoraciones se abren tocando las estrellas. */}
          {perfil.total_evaluaciones > 0 ? (
            <TouchableOpacity
              onPress={verEvaluaciones}
              activeOpacity={interaccion.opacidadActiva}
              accessibilityRole="button"
              accessibilityLabel={`Calificación ${promedio.toFixed(1)} de 5. Ver valoraciones`}
            >
              <Text style={estilos.calificacion}>
                {'★'.repeat(Math.round(promedio))}
                {'☆'.repeat(5 - Math.round(promedio))}{'  '}
                {promedio.toFixed(1)} ({perfil.total_evaluaciones})
              </Text>
              <Text style={estilos.verValoraciones}>Ver valoraciones ›</Text>
            </TouchableOpacity>
          ) : (
            <Text style={estilos.ayuda}>Perfil nuevo · sin evaluaciones aún</Text>
          )}
        </View>
      </View>

      {/* Modalidad: una píldora por forma de atención. */}
      {pildoras.length > 0 && (
        <View style={estilos.pildoras}>
          {pildoras.map((p) => (
            <View key={p.texto} style={estilos.pildora}>
              <Ionicons name={p.icono} size={15} color={colores.primario} />
              <Text style={estilos.pildoraTexto}>{p.texto}</Text>
            </View>
          ))}
        </View>
      )}

      <Etiqueta icono="document-text-outline">Reseña curricular</Etiqueta>
      <Text style={[estilos.valor, !perfil.resena_curricular && estilos.valorVacio]}>
        {perfil.resena_curricular || 'El profesional aún no escribe su reseña.'}
      </Text>

      <Etiqueta icono="ribbon-outline">Áreas de experticia</Etiqueta>
      <Text style={[estilos.valor, !perfil.areas_experticia && estilos.valorVacio]}>
        {perfil.areas_experticia || 'Sin áreas informadas.'}
      </Text>

      <Etiqueta icono="location-outline">Comunas donde atiende a domicilio</Etiqueta>
      {perfil.tipo_sede === 'ONLINE' ? (
        <Text style={[estilos.valor, estilos.valorVacio]}>Atiende solo de forma virtual.</Text>
      ) : (perfil.comunas || []).length === 0 ? (
        // Sin comunas declaradas aparece en las búsquedas de todas las comunas.
        <Text style={[estilos.valor, estilos.valorVacio]}>No ha limitado sus comunas de atención.</Text>
      ) : (
        <View style={estilos.comunas}>
          {perfil.comunas.map((c) => (
            <View key={c.comuna_id} style={estilos.comuna}>
              <Text style={estilos.comunaTexto}>{c.nombre}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },

  // Mismas piezas que "Mi perfil público" del profesional, sin campos editables.
  bloqueFoto: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', marginBottom: espacio.sm },
  foto: { width: 84, height: 84, borderRadius: 42, backgroundColor: colores.primarioSuave },
  fotoVacia: { justifyContent: 'center', alignItems: 'center' },
  iniciales: { ...tipografia.titulo, color: colores.primario },
  fotoTexto: { flex: 1, marginLeft: espacio.base },
  nombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.sm },
  calificacion: { ...tipografia.meta, color: colores.secundarioFuerte },
  ayuda: { ...tipografia.meta, color: colores.textoTenue },

  verValoraciones: { ...tipografia.micro, color: colores.primario, marginTop: 2 },
  pildoras: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, marginTop: espacio.xs },
  pildora: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingVertical: espacio.xs + 2,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.primarioBorde,
    backgroundColor: colores.superficie,
  },
  pildoraTexto: { ...tipografia.metaFuerte, color: colores.primario },
  filaEtiqueta: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs + 2, marginTop: espacio.lg, marginBottom: espacio.sm },
  etiqueta: { ...piezas.etiqueta, marginBottom: 0 },
  valor: { ...piezas.tarjeta, ...tipografia.cuerpo, color: colores.texto },
  valorVacio: { color: colores.textoTenue, fontStyle: 'italic' },

  comunas: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  comuna: {
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.primario,
    backgroundColor: colores.primarioSuave,
  },
  comunaTexto: { ...tipografia.meta, color: colores.primario, fontWeight: '600' },
});
