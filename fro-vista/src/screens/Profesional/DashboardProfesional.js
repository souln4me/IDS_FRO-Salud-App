// Ruta: fro-vista/src/screens/Profesional/DashboardProfesional.js
//
// Panel principal del profesional. La lista de pacientes asignados es el núcleo
// de la vista: al entrar se ve de inmediato, y desde cada paciente se abre su
// ficha clínica completa. El resto (jornada, mensajes, perfil, liquidaciones,
// disponibilidad, soporte y cierre de sesión) vive en la barra inferior.

import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';

import { AuthContext } from '../../context/AuthContext';
import apiClient, { getAlertasClinicas, revisarAlertaClinica } from '../../api/client';
import { colores, espacio, radio, tipografia, piezas, interaccion } from '../../theme';
import BarraAtencionEnCurso from '../../components/BarraAtencionEnCurso';

export default function DashboardProfesional({ navigation }) {
  const { userData } = useContext(AuthContext);

  const [pacientes, setPacientes] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // CU50: banderas rojas de los pacientes a cargo, lo primero que debe verse.
  const [alertas, setAlertas] = useState([]);

  const cargarPacientes = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const usuarioId = userData?.usuario_id;
      if (!usuarioId) {
        setError('No se encontró la sesión del profesional');
        return;
      }

      const response = await apiClient.get(
        `/profesionales/usuario/${usuarioId}/pacientes`,
        { params: { buscar } }
      );

      const data = response.data;
      if (data.ok) {
        setPacientes(data.pacientes);
      } else {
        setError(data.message || 'Error al recuperar registros clínicos');
      }
    } catch (err) {
      console.error('ERROR PACIENTES:', err?.response?.data || err.message);
      setError('Error al recuperar registros clínicos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const cargarAlertas = async () => {
    try {
      const { alertas: recibidas } = await getAlertasClinicas();
      setAlertas(recibidas || []);
    } catch {
      setAlertas([]);
    }
  };

  useEffect(() => {
    cargarPacientes();
    cargarAlertas();
  }, []);

  // Al volver de una ficha puede haber alertas nuevas o ya revisadas.
  useEffect(() => {
    const quitar = navigation.addListener('focus', cargarAlertas);
    return quitar;
  }, [navigation]);

  const revisar = async (alerta) => {
    setAlertas((previas) => previas.filter((a) => a.alerta_clinica_id !== alerta.alerta_clinica_id));
    try {
      await revisarAlertaClinica(alerta.alerta_clinica_id);
    } catch {
      cargarAlertas();
    }
  };

  const abrirFicha = (paciente) => {
    navigation.navigate('FichaClinica', {
      pacienteId: paciente.paciente_id,
      nombrePaciente: paciente.nombre_completo,
    });
  };

  const renderPaciente = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => abrirFicha(item)}>
      <Text style={styles.nombre}>{item.nombre_completo}</Text>
      <Text style={styles.dato}>RUT: {item.rut}</Text>
      <Text style={styles.dato}>Sexo clínico: {item.sexo_clinico || 'No informado'}</Text>
      <Text style={styles.dato}>Total atenciones: {item.total_atenciones}</Text>
      <Text style={styles.dato}>Última atención: {item.ultima_atencion || 'Sin registros'}</Text>

      <View style={styles.boton}>
        <Text style={styles.botonSecundarioTexto}>Abrir ficha clínica</Text>
      </View>
    </TouchableOpacity>
  );

  const Encabezado = (
    <View>
      <Text style={styles.title}>Dr(a). {userData?.apellido_paterno}</Text>

      {/* CU50 — Banderas rojas: deterioro reportado por los pacientes. Va
          arriba de todo porque es lo que exige atención inmediata. */}
      {alertas.length > 0 && (
        <View style={styles.panelAlertas}>
          <Text style={styles.alertasTitulo}>
            🚩 Banderas rojas ({alertas.length})
          </Text>
          {alertas.map((alerta) => (
            <View
              key={alerta.alerta_clinica_id}
              style={[styles.alerta, alerta.severidad === 'CRITICA' && styles.alertaCritica]}
            >
              <Text style={styles.alertaPaciente}>{alerta.paciente}</Text>
              <Text style={styles.alertaMotivo}>{alerta.motivo}</Text>
              <View style={styles.filaAlerta}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('FichaClinica', {
                      pacienteId: alerta.paciente_id,
                      nombrePaciente: alerta.paciente,
                    })
                  }
                  activeOpacity={interaccion.opacidadActiva}
                >
                  <Text style={styles.alertaEnlace}>Abrir ficha →</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => revisar(alerta)} activeOpacity={interaccion.opacidadActiva}>
                  <Text style={styles.alertaRevisar}>Marcar revisada</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.subtitle}>Pacientes asignados</Text>

      <View style={styles.filaBuscador}>
        <TextInput
          style={styles.input}
          placeholder="Buscar por nombre o RUT"
          placeholderTextColor={colores.textoTenue}
          value={buscar}
          onChangeText={setBuscar}
          onSubmitEditing={() => cargarPacientes(false)}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.botonBuscar}
          onPress={() => cargarPacientes(false)}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={styles.botonTexto}>Buscar</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color={colores.primario} style={styles.cargando} />}

      {error !== '' && (
        <View style={styles.errorCaja}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.botonReintentar} onPress={() => cargarPacientes(false)}>
            <Text style={styles.botonTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && pacientes.length === 0 && (
        <Text style={styles.sinResultados}>Sin resultados encontrados</Text>
      )}
    </View>
  );

  return (
    <View style={styles.pantalla}>
      {/* Opción C: si hay una atención abierta, se ve y se retoma desde aquí. */}
      <BarraAtencionEnCurso navigation={navigation} />

      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={pacientes}
        keyExtractor={(item) => item.paciente_id.toString()}
        renderItem={renderPaciente}
        ListHeaderComponent={Encabezado}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => cargarPacientes(true)}
            colors={[colores.primario]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  content: { padding: espacio.lg, paddingBottom: espacio.xxl },

  title: { ...tipografia.display, color: colores.textoTitulo },
  subtitle: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espacio.base },

  // Buscador en una sola fila: campo ancho y acción al costado.
  filaBuscador: { flexDirection: 'row', gap: espacio.sm, marginBottom: espacio.base },
  input: { ...piezas.campo, flex: 1 },
  botonBuscar: { ...piezas.botonPrimario, paddingHorizontal: espacio.lg, paddingVertical: espacio.md },
  botonReintentar: { ...piezas.botonPrimario, marginTop: espacio.sm },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },

  cargando: { marginBottom: espacio.base },
  errorCaja: {
    backgroundColor: colores.errorSuave,
    borderWidth: 1,
    borderColor: colores.errorBorde,
    borderRadius: radio.md,
    padding: espacio.base,
    marginBottom: espacio.md,
  },
  error: { ...tipografia.meta, color: colores.error, marginBottom: espacio.sm },
  sinResultados: {
    ...tipografia.meta,
    textAlign: 'center',
    marginVertical: espacio.xl,
    color: colores.textoTenue,
  },

  card: { ...piezas.tarjeta, marginBottom: espacio.md },
  nombre: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  dato: { ...tipografia.meta, color: colores.textoSuave },
  // CU50 — el bloque de banderas rojas.
  panelAlertas: { marginBottom: espacio.base },
  alertasTitulo: { ...tipografia.subtitulo, color: colores.error, marginBottom: espacio.sm },
  alerta: {
    ...piezas.tarjeta,
    backgroundColor: colores.advertenciaSuave,
    borderColor: colores.advertenciaBorde,
    marginBottom: espacio.sm,
  },
  // La crítica se distingue de la alta sin depender solo del texto.
  alertaCritica: { backgroundColor: colores.errorSuave, borderColor: colores.errorBorde },
  alertaPaciente: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  alertaMotivo: { ...tipografia.meta, color: colores.texto, marginTop: 2 },
  filaAlerta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espacio.md },
  alertaEnlace: { ...tipografia.metaFuerte, color: colores.primario },
  alertaRevisar: { ...tipografia.meta, color: colores.textoSuave },

  // Botón delineado: el texto va en el azul de marca, no en blanco (quedaba invisible).
  boton: { ...piezas.botonSecundario, marginTop: espacio.md, paddingVertical: espacio.md },
  botonSecundarioTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },

  pantalla: { flex: 1, backgroundColor: colores.fondo },
});
