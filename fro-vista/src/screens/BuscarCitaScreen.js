import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';

import apiClient from '../api/client';

export default function BuscarCitaScreen() {
  const [especialidades, setEspecialidades] = useState([]);
  const [especialidadId, setEspecialidadId] = useState('');
  const [tipoSede, setTipoSede] = useState('ONLINE');
  const [fechaSeleccionada, setFechaSeleccionada] = useState('');
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    cargarEspecialidades();
  }, []);

  const formatearFecha = (fecha) => {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const cargarEspecialidades = async () => {
    try {
      const response = await apiClient.get('/citas/especialidades');
      const data = response.data.data || [];

      setEspecialidades(data);

      if (data.length > 0) {
        setEspecialidadId(String(data[0].especialidad_id));
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las especialidades.');
    }
  };

  const buscarDisponibilidad = async () => {
    if (!especialidadId || !tipoSede || !fechaSeleccionada) {
      Alert.alert('Error', 'Debe seleccionar especialidad, modalidad y fecha.');
      return;
    }

    try {
      setCargando(true);

      const response = await apiClient.get('/citas/disponibilidad', {
        params: {
          especialidad_id: especialidadId,
          tipo_sede: tipoSede,
          fecha: fechaSeleccionada,
        },
      });

      setDisponibilidad(response.data.data || []);
    } catch (error) {
      Alert.alert(
        'Error',
        error.response?.data?.error || 'No se pudo obtener la disponibilidad.'
      );
    } finally {
      setCargando(false);
    }
  };

  const seleccionarBloque = async (item) => {
    try {
      const fecha_hora_inicio = `${item.fecha} ${item.hora_inicio}`;

      const response = await apiClient.post('/citas/validar-bloque', {
        profesional_id: item.profesional_id,
        fecha_hora_inicio,
        paciente_id: 999,
      });

      if (response.data.disponible) {
        Alert.alert(
          'Bloque disponible',
          'El bloque fue validado correctamente. Puede continuar al CU15.'
        );
      } else {
        Alert.alert(
          'Bloque no disponible',
          'El horario seleccionado ya fue reservado.'
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error.response?.data?.error || 'No se pudo validar el bloque.'
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Motor de búsqueda de citas</Text>

      <Text style={styles.label}>Especialidad</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={especialidadId}
          onValueChange={(value) => setEspecialidadId(String(value))}
        >
          {especialidades.map((item) => (
            <Picker.Item
              key={item.especialidad_id}
              label={item.nombre}
              value={String(item.especialidad_id)}
            />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Modalidad de atención</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={tipoSede}
          onValueChange={(value) => setTipoSede(value)}
        >
          <Picker.Item label="Atención Domiciliaria" value="DOMICILIO" />
          <Picker.Item label="Teleconsulta Online" value="ONLINE" />
          <Picker.Item label="Ambas Modalidades" value="AMBOS" />
        </Picker>
      </View>

      <Text style={styles.label}>Fecha</Text>
      <Button
        title={fechaSeleccionada ? fechaSeleccionada : 'Seleccionar fecha'}
        onPress={() => setMostrarCalendario(true)}
      />

      {mostrarCalendario && (
        <DateTimePicker
          value={
            fechaSeleccionada
              ? new Date(`${fechaSeleccionada}T00:00:00`)
              : new Date()
          }
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setMostrarCalendario(false);

            if (selectedDate) {
              setFechaSeleccionada(formatearFecha(selectedDate));
            }
          }}
        />
      )}

      <View style={styles.space} />

      <Button
        title={cargando ? 'Buscando...' : 'Buscar disponibilidad'}
        onPress={buscarDisponibilidad}
        disabled={cargando}
      />

      <FlatList
        data={disponibilidad}
        keyExtractor={(item, index) =>
          `${item.profesional_id}-${item.hora_inicio}-${index}`
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => seleccionarBloque(item)}
          >
            <Text style={styles.nombre}>
              {item.nombres} {item.apellido_paterno} {item.apellido_materno}
            </Text>

            <Text>Especialidad: {item.especialidad}</Text>
            <Text>Modalidad: {item.tipo_sede}</Text>
            <Text>Fecha: {item.fecha}</Text>
            <Text>
              Bloque disponible: {item.hora_inicio} - {item.hora_fin}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No hay disponibilidad cargada.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 21,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginBottom: 12,
  },
  space: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  nombre: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 5,
  },
  empty: {
    marginTop: 20,
    textAlign: 'center',
    color: '#666',
  },
});