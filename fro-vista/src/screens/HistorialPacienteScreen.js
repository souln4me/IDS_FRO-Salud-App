import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { getHistorialPaciente } from "../api/client";

export default function HistorialPacienteScreen({ route }) {
  const { pacienteId, nombrePaciente } = route.params;

  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargarHistorial = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getHistorialPaciente(pacienteId);

      if (data.ok) {
        setHistorial(data.historial);
      } else {
        setError(data.message || "Error al recuperar historial");
      }
    } catch (err) {
      console.error("ERROR HISTORIAL:", err?.response?.data || err.message);
      setError("Error al recuperar historial");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarHistorial();
  }, []);
  
  const formatearFecha = (fecha) => {
  return new Date(fecha).toLocaleString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  };
  const renderAtencion = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.fecha}>{formatearFecha(item.fecha_hora_inicio)}</Text>
      <Text>Estado: {item.estado}</Text>
      <Text>Profesional: {item.profesional}</Text>
      <Text>Especialidad: {item.especialidad}</Text>
      <Text>Modalidad: {item.tipo_sede}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Historial de atenciones</Text>
      <Text>Paciente: {nombrePaciente}</Text>
      <Text>ID paciente: {pacienteId}</Text>

      {loading && <ActivityIndicator size="large" style={styles.loading} />}

      {error !== "" && (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.boton} onPress={cargarHistorial}>
            <Text style={styles.botonTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && historial.length === 0 && (
        <Text style={styles.sinResultados}>Sin historial registrado</Text>
      )}

      <FlatList
        data={historial}
        keyExtractor={(item) => item.cita_id.toString()}
        renderItem={renderAtencion}
        style={styles.lista}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  titulo: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
  },
  loading: {
    marginTop: 20,
  },
  lista: {
    marginTop: 16,
  },
  card: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#f9f9f9",
  },
  fecha: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  errorContainer: {
    marginTop: 20,
  },
  error: {
    color: "red",
    marginBottom: 10,
  },
  boton: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  botonTexto: {
    color: "#fff",
    fontWeight: "bold",
  },
  sinResultados: {
    marginTop: 20,
    color: "#666",
  },
});