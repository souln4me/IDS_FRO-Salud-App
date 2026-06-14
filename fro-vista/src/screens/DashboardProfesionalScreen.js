import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

import { getPacientesProfesional } from "../api/client";

export default function DashboardProfesionalScreen({ navigation }) {
  const [pacientes, setPacientes] = useState([]);
  const [buscar, setBuscar] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Temporal para pruebas.
  // Después esto debería salir del usuario logueado.
  const profesionalId = 6;

  const cargarPacientes = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getPacientesProfesional(profesionalId, buscar);

      if (data.ok) {
        setPacientes(data.pacientes);
      } else {
        setError(data.message || "Error al recuperar registros clínicos");
      }
    } catch (err) {
      console.error(err);
      setError("Error al recuperar registros clínicos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPacientes();
  }, []);

  const renderPaciente = ({ item }) => (
  <View style={styles.card}>
    <Text style={styles.nombre}>{item.nombre_completo}</Text>

    <Text>RUT: {item.rut}</Text>
    <Text>Sexo clínico: {item.sexo_clinico || "No informado"}</Text>

    <Text>
      Dirección: {item.calle} {item.numero_calle}
    </Text>

    <Text>Total atenciones: {item.total_atenciones}</Text>

    <Text>
      Última atención: {item.ultima_atencion || "Sin registros"}
    </Text>

    <TouchableOpacity
      style={styles.boton}
      onPress={() =>
        navigation.navigate("HistorialPaciente", {
          pacienteId: item.paciente_id,
          nombrePaciente: item.nombre_completo,
        })
      }
    >
      <Text style={styles.botonTexto}>Ver historial</Text>
    </TouchableOpacity>
  </View>
);

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Panel profesional</Text>

      <TextInput
        style={styles.input}
        placeholder="Buscar por nombre o RUT"
        value={buscar}
        onChangeText={setBuscar}
      />

      <TouchableOpacity style={styles.botonBuscar} onPress={cargarPacientes}>
        <Text style={styles.botonTexto}>Buscar</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator size="large" />}

      {error !== "" && (
        <View>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.botonBuscar} onPress={cargarPacientes}>
            <Text style={styles.botonTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && pacientes.length === 0 && (
        <Text style={styles.sinResultados}>Sin resultados encontrados</Text>
      )}

      <FlatList
        data={pacientes}
        keyExtractor={(item) => item.paciente_id.toString()}
        renderItem={renderPaciente}
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
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  botonBuscar: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  card: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#f9f9f9",
  },
  nombre: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 6,
  },
  boton: {
    backgroundColor: "#16a34a",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  botonTexto: {
    color: "#fff",
    fontWeight: "bold",
  },
  error: {
    color: "red",
    marginBottom: 10,
  },
  sinResultados: {
    textAlign: "center",
    marginTop: 20,
    color: "#666",
  },
});