import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';

import apiClient from '../../api/client'; 
import ErrorRetry from '../../components/ErrorRetry';
import VistaConTeclado from '../../components/VistaConTeclado'; 
import { formatearFechaHora } from '../../utils/fechas';
import { colores, radio, sombra } from '../../theme';
import DialogoAviso from '../../components/DialogoAviso';

/** Texto sin tildes, en minúsculas y con espacios en vez de guiones bajos. */
const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase();

/** ¿El parámetro calza con lo buscado? Cada palabra debe aparecer. */
function coincide(parametro, busqueda) {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const texto = normalizar(`${parametro.clave} ${parametro.descripcion}`);
  return palabras.every((p) => texto.includes(p));
}

export default function ParametrosScreen({ navigation }) {
  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).

  const [aviso, setAviso] = useState(null);

  const [parametros, setParametros] = useState([]);
  // Filtro por nombre o descripción del parámetro.
  const [busqueda, setBusqueda] = useState('');
  const [erroresLocales, setErroresLocales] = useState({}); 
  const [isLoading, setIsLoading] = useState(true);
  const [errorRed, setErrorRed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorExcepcion, setErrorExcepcion] = useState(null); 

  const [inicio, setInicio] = useState(''); 
  const [fin, setFin] = useState('');      
  const [profesionalId, setProfesionalId] = useState('');

  const [date, setDate] = useState(new Date());
  const [show, setShow] = useState(false);
  const [modo, setModo] = useState('inicio');

  const onChange = (event, selectedDate) => {
      setShow(false);
      if (selectedDate) {
          // Convertir a formato DD/MM/AAAA
          const day = String(selectedDate.getDate()).padStart(2, '0');
          const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
          const year = selectedDate.getFullYear();
          const fechaFormateada = `${day}/${month}/${year}`;
          
          if (modo === 'inicio') setInicio(fechaFormateada);
          else setFin(fechaFormateada);
      }
  };

  const cargarParametros = async () => {
    setIsLoading(true);
    setErrorRed(false);
    setErrorExcepcion(null); 
    try {
      const response = await apiClient.get('/parametros');
      setParametros(response.data);
      setIsLoading(false);
    } catch (error) {
      console.error("Error al cargar parámetros:", error);
      setErrorRed(true);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarParametros();
  }, []);

  const handleValorChange = (index, textoNuevo) => {
    const nuevosParametros = [...parametros];
    nuevosParametros[index].valor = textoNuevo;
    setParametros(nuevosParametros);

    if (!/^\d+$/.test(textoNuevo) && textoNuevo !== '') {
      setErroresLocales({ ...erroresLocales, [index]: '⚠️ Formato inválido. Ingrese solo números enteros.' });
    } else {
      const nuevosErrores = { ...erroresLocales };
      delete nuevosErrores[index];
      setErroresLocales(nuevosErrores);
    }
  };

  const guardarCambio = async (parametro) => {
    setIsSaving(true);
    setErrorExcepcion(null); 

    try {
      await apiClient.put('/parametros/update', {
        clave: parametro.clave,
        valor: parametro.valor,
        ultima_modificacion: parametro.ultima_modificacion
      });
      
      setIsSaving(false);
      setAviso({ tono: 'info', titulo: "Cambio Aplicado", mensaje: "La modificación arancelaria ya está activa en la red." });
      cargarParametros();

    } catch (error) {
      setIsSaving(false);
      
      if (error.response) {
        if (error.response.status === 409) {
          setErrorExcepcion({
            mensaje: "Conflicto de Concurrencia\n\nOtro administrador ha modificado este arancel hace unos instantes. Por seguridad, la transacción fue bloqueada para no sobreescribir datos recientes.",
            accionReintento: cargarParametros 
          });
        } else if (error.response.status === 500) {
          setErrorExcepcion({
            mensaje: "Fallo de Transacción\n\nEl sistema falló al intentar sincronizar con la réplica de base de datos. Se ha realizado un rollback automático por seguridad.",
            accionReintento: () => guardarCambio(parametro) 
          });
        } else {
          setAviso({ tono: 'error', titulo: "Error", mensaje: error.response.data.error || "Error desconocido al procesar." });
        }
      } else {
        setErrorExcepcion({
          mensaje: "Error de Red\n\nSe perdió la conexión con el servidor al intentar emitir la actualización.",
          accionReintento: () => guardarCambio(parametro)
        });
      }
    }
  };

const aplicarRestriccion = async () => {
    if (!inicio || !fin) return setAviso({ tono: 'error', titulo: "Error", mensaje: "Complete fechas (DD/MM/AAAA)" });

    try {
        // El backend recibe el ID del profesional
        await apiClient.post('/clinica/disponibilidad/restringir', {
            profesional_id: profesionalId || 1, 
            fecha_inicio: inicio, 
            fecha_fin: fin, 
            motivo: 'Inactividad administrativa'
        });
        setAviso({ tono: 'ok', titulo: "Éxito", mensaje: "Bloqueo aplicado exitosamente." });
    } catch (error) {
        // El backend devuelve el mensaje de error si hay citas confirmadas
        setAviso({ tono: 'error', titulo: "Error", mensaje: error.response?.data?.mensaje || "Error al procesar el bloqueo" });
    }
};

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colores.primario} />
          <Text style={styles.loadingText}>Sincronizando variables maestras...</Text>
        </View>
      ) : errorRed ? (
        <ErrorRetry 
          mensaje="No se pudo conectar con el motor de base de datos para leer los parámetros." 
          onRetry={cargarParametros} 
        />
      ) : errorExcepcion ? (
        <ErrorRetry 
          mensaje={errorExcepcion.mensaje} 
          onRetry={errorExcepcion.accionReintento} 
        />
      ) : (
        <VistaConTeclado contentContainerStyle={styles.scrollContent}>
          <Text style={styles.infoText}>
            Modifique los valores arancelarios o matrices de negocio con precaución. Los cambios impactan inmediatamente en la red.
          </Text>

          <View style={styles.buscador}>
            <Text style={styles.buscadorIcono}>🔍</Text>
            <TextInput
              style={styles.buscadorCampo}
              placeholder="Buscar parámetro (ej. lista de espera, arancel)"
              placeholderTextColor={colores.textoTenue}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {busqueda ? (
              <TouchableOpacity onPress={() => setBusqueda('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.buscadorLimpiar}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {busqueda.trim() && !parametros.some((p) => coincide(p, busqueda)) ? (
            <Text style={styles.sinResultados}>Ningún parámetro coincide con “{busqueda.trim()}”.</Text>
          ) : null}

          {parametros.map((param, index) => {
            // El índice original se conserva: los errores de validación van por índice.
            if (!coincide(param, busqueda)) return null;
            const tieneError = erroresLocales[index] !== undefined;
            const estaVacio = String(param.valor).trim() === '';

            return (
              <View key={param.parametro_id} style={styles.card}>
                <Text style={styles.cardTitle}>{param.clave.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={styles.cardDesc}>{param.descripcion}</Text>
                
                <Text style={styles.label}>Valor Asignado:</Text>
                
                <TextInput
                  style={[styles.input, tieneError ? styles.inputError : null]}
                  value={String(param.valor)}
                  onChangeText={(text) => handleValorChange(index, text)}
                  keyboardType="numeric"
                  editable={!isSaving}
                />
                
                {tieneError && <Text style={styles.errorText}>{erroresLocales[index]}</Text>}
                
                <TouchableOpacity 
                  style={[
                    styles.saveButton, 
                    (isSaving || tieneError || estaVacio) && styles.saveButtonDisabled
                  ]} 
                  onPress={() => guardarCambio(param)}
                  disabled={isSaving || tieneError || estaVacio}
                >
                  <Text style={[
                    styles.saveButtonText, 
                    (isSaving || tieneError || estaVacio) && styles.saveButtonTextDisabled
                  ]}>
                    {isSaving ? "PROCESANDO..." : "APLICAR CAMBIO"}
                  </Text>
                </TouchableOpacity>
                
                <Text style={styles.timestampText}>
                  Última versión: {formatearFechaHora(param.ultima_modificacion)}
                </Text>
              </View>
            );
          })}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Gestión de Disponibilidad</Text>

            <TextInput 
              style={styles.input} 
              placeholder="ID Profesional (Admin)" 
              value={profesionalId} 
              onChangeText={setProfesionalId} 
            />

            <TouchableOpacity style={styles.input} onPress={() => { setModo('inicio'); setShow(true); }}>
                <Text>{inicio || "Seleccionar Fecha Inicio (DD/MM/AAAA)"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.input} onPress={() => { setModo('fin'); setShow(true); }}>
                <Text>{fin || "Seleccionar Fecha Fin (DD/MM/AAAA)"}</Text>
              </TouchableOpacity>

              {show && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  onChange={onChange}
                />
              )}

            <TouchableOpacity style={styles.saveButton} onPress={aplicarRestriccion}>
              <Text style={styles.saveButtonText}>CONFIRMAR BLOQUEO DE AGENDA</Text>
            </TouchableOpacity>
          </View>
        </VistaConTeclado>
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, color: colores.textoSuave, fontSize: 15 },
  scrollContent: { padding: 15, paddingBottom: 40 },
  infoText: { backgroundColor: colores.primarioSuave, color: colores.primario, padding: 12, borderRadius: radio.sm, fontSize: 13, marginBottom: 20, borderWidth: 1, borderColor: colores.primarioBorde },
  card: { backgroundColor: colores.superficie, borderRadius: radio.md, padding: 18, marginBottom: 15, borderWidth: 1, borderColor: colores.borde,
    ...sombra.suave,
  },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: colores.texto, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: colores.textoSuave, marginBottom: 15, fontStyle: 'italic' },
  label: { fontSize: 13, fontWeight: '600', color: colores.textoSuave, marginBottom: 8 },
  input: { backgroundColor: colores.fondo, color: colores.textoTitulo, borderRadius: radio.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, marginBottom: 15, borderWidth: 1, borderColor: colores.bordeCampo, fontWeight: 'bold' },
  inputError: { borderColor: colores.error, backgroundColor: colores.errorSuave, marginBottom: 5 },
  errorText: { color: colores.error, fontSize: 11, marginBottom: 15, fontWeight: '500' },
  saveButton: { backgroundColor: colores.primario, paddingVertical: 12, borderRadius: radio.sm, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: colores.borde },
  saveButtonText: { color: colores.superficie, fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  saveButtonTextDisabled: { color: colores.textoTenue },
  timestampText: { fontSize: 11, color: colores.textoTenue, marginTop: 10, textAlign: 'center' },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.md,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
  buscadorIcono: { fontSize: 15, marginRight: 8 },
  buscadorCampo: { flex: 1, paddingVertical: 11, fontSize: 15, color: colores.texto },
  buscadorLimpiar: { fontSize: 15, color: colores.textoSuave, paddingHorizontal: 4 },
  sinResultados: { color: colores.textoSuave, fontStyle: 'italic', textAlign: 'center', marginBottom: 15 },
});