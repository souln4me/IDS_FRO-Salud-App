// Ruta: fro-vista/src/screens/Profesional/DashboardProfesional.js
//
// Panel principal del profesional. La lista de pacientes asignados es el núcleo
// de la vista: al entrar se ve de inmediato, y desde cada paciente se abre su
// ficha clínica completa. Las herramientas transversales (trazabilidad del
// documento y disponibilidad) quedan como accesos secundarios.

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
import apiClient from '../../api/client';
import { colores, espacio, radio, tipografia, piezas, interaccion } from '../../theme';
import BarraAtencionEnCurso from '../../components/BarraAtencionEnCurso';

export default function DashboardProfesional({ navigation }) {
  const { userData, confirmarCierreSesion } = useContext(AuthContext);

  const [pacientes, setPacientes] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    cargarPacientes();
  }, []);

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

  const PieDeLista = (
    <View style={styles.pie}>
      <Text style={styles.seccion}>Herramientas</Text>

      <TouchableOpacity
        style={styles.herramienta}
        onPress={() => navigation.navigate('MiJornada')}
      >
        <Text style={styles.herramientaIcono}>📅</Text>
        <View style={styles.herramientaTexto}>
          <Text style={styles.herramientaTitulo}>Mi Jornada</Text>
          <Text style={styles.herramientaSub}>Tus citas del día, con acceso directo a cada ficha.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.herramienta}
        onPress={() => navigation.navigate('GestionDisponibilidad')}
      >
        <Text style={styles.herramientaIcono}>📅</Text>
        <View style={styles.herramientaTexto}>
          <Text style={styles.herramientaTitulo}>Gestionar Disponibilidad</Text>
          <Text style={styles.herramientaSub}>Bloquear horarios por vacaciones o licencias.</Text>
        </View>
      </TouchableOpacity>

      {/* CU10: catálogo público del profesional (foto, reseña, áreas, modalidad) */}
      <TouchableOpacity
        style={styles.herramienta}
        onPress={() => navigation.navigate('MiPerfil')}
      >
        <Text style={styles.herramientaIcono}>🪪</Text>
        <View style={styles.herramientaTexto}>
          <Text style={styles.herramientaTitulo}>Mi perfil público</Text>
          <Text style={styles.herramientaSub}>Foto, reseña, áreas de experticia y modalidad que ven los pacientes.</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.herramienta}
        onPress={() => navigation.navigate('Seguridad')}
      >
        <Text style={styles.herramientaIcono}>🔐</Text>
        <View style={styles.herramientaTexto}>
          <Text style={styles.herramientaTitulo}>Seguridad de la Cuenta</Text>
          <Text style={styles.herramientaSub}>Contraseña y sesiones activas.</Text>
        </View>
      </TouchableOpacity>

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
        ListFooterComponent={PieDeLista}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => cargarPacientes(true)}
            colors={[colores.primario]}
          />
        }
      />

      {/* Fijo al borde inferior, igual que en la vista de Paciente. */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={confirmarCierreSesion}
        activeOpacity={interaccion.opacidadActiva}
      >
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
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
  // Botón delineado: el texto va en verde, no en blanco (quedaba invisible).
  boton: { ...piezas.botonSecundario, marginTop: espacio.md, paddingVertical: espacio.md },
  botonSecundarioTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },

  pie: { marginTop: espacio.lg },
  seccion: {
    ...tipografia.micro,
    color: colores.textoTenue,
    marginBottom: espacio.md,
    marginTop: espacio.sm,
  },

  // Herramientas: mismas fichas que el resto, con el ícono en pastilla verde.
  herramienta: {
    ...piezas.tarjeta,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espacio.md,
  },
  herramientaIcono: {
    fontSize: 22,
    marginRight: espacio.base,
    width: 46,
    height: 46,
    borderRadius: radio.md,
    backgroundColor: colores.primarioSuave,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 46,
    overflow: 'hidden',
  },
  herramientaTexto: { flex: 1 },
  herramientaTitulo: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginBottom: 2 },
  herramientaSub: { ...tipografia.meta, color: colores.textoSuave },

  pantalla: { flex: 1, backgroundColor: colores.fondo },
  logoutBtn: {
    marginHorizontal: espacio.lg,
    marginBottom: espacio.lg,
    paddingVertical: espacio.md,
    borderRadius: radio.md,
    borderWidth: 1.5,
    borderColor: colores.error,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  logoutText: { ...tipografia.cuerpoFuerte, color: colores.error },
});
