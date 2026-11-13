/**
 * Componente: Cliente Móvil
 * Casos de uso: CU40, CU38.
 */
// Ruta: fro-vista/src/components/PendientesDocumentar.js
//
// Corrección Inc 4 (punto 7): atenciones ya finalizadas cuyo registro clínico
// el profesional dejó para el final de la jornada. Al tocar una se abre la
// sesión clínica de ese paciente para completarla y firmarla. Desaparece sola
// cuando no queda ninguna.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import apiClient from '../api/client';
import { formatearFecha, formatearHora } from '../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../theme';

export default function PendientesDocumentar({ navigation }) {
  const [citas, setCitas] = useState([]);

  // CU40: atenciones finalizadas que falta documentar
  const cargar = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/citas/documentacion-pendiente');
      setCitas(data?.citas || []);
    } catch {
      // Sin conexión no se muestra nada; vuelve a intentarlo al recibir foco.
    }
  }, []);

  useEffect(() => {
    cargar();
    const quitar = navigation.addListener('focus', cargar);
    return quitar;
  }, [navigation, cargar]);

  if (citas.length === 0) return null;

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>📝 Pendientes de documentar ({citas.length})</Text>
      <Text style={estilos.ayuda}>Atenciones ya realizadas cuyo registro clínico falta completar y firmar.</Text>
      {citas.map((c) => (
        <TouchableOpacity
          key={c.cita_id}
          style={estilos.fila}
          activeOpacity={interaccion.opacidadActiva}
          onPress={() =>
            navigation.navigate('FichaClinica', {
              pacienteId: c.paciente_id,
              nombrePaciente: c.paciente,
              episodioId: c.episodio_clinico_id ? String(c.episodio_clinico_id) : '',
              irASesion: true,
            })
          }
        >
          <View style={estilos.cuerpo}>
            <Text style={estilos.paciente}>{c.paciente}</Text>
            <Text style={estilos.meta}>
              {formatearFecha(c.fecha_hora_inicio)} · {formatearHora(c.fecha_hora_inicio)}
              {c.motivo_consulta ? ` · ${c.motivo_consulta}` : ''}
            </Text>
          </View>
          <Text style={estilos.enlace}>Documentar ›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    ...piezas.tarjeta,
    backgroundColor: colores.advertenciaSuave,
    borderColor: colores.advertenciaBorde,
    marginBottom: espacio.base,
  },
  titulo: { ...tipografia.cuerpoFuerte, color: colores.advertencia },
  ayuda: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    paddingVertical: espacio.sm,
    borderTopWidth: 1,
    borderTopColor: colores.advertenciaBorde,
  },
  cuerpo: { flex: 1 },
  paciente: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  meta: { ...tipografia.meta, color: colores.textoSuave },
  enlace: { ...tipografia.metaFuerte, color: colores.primario, paddingHorizontal: espacio.xs, borderRadius: radio.sm },
});
