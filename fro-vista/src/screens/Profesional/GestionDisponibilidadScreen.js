import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import apiClient from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import { AuthContext } from '../../context/AuthContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colores, espacio, piezas, radio, sombra } from '../../theme';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';

export default function GestionDisponibilidadScreen() {
    // Los avisos usan el diálogo de la app: el Alert nativo no sigue el diseño.
    const [resultado, setResultado] = useState(null);
  const { userData, isLoading } = useContext(AuthContext);

  const [profId, setProfId] = useState(userData?.role === 'Admin' ? '' : String(userData?.usuario_id || ''));
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [show, setShow] = useState(false);
  const [modo, setModo] = useState('inicio');
  const [motivo, setMotivo] = useState('');

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (!userData) {
    return <Text style={styles.errorText}>No se encontró sesión activa.</Text>;
  }

  const alCambiarFecha = (event, selectedDate) => {
    if (event.type === 'dismissed') {
      setShow(false);
      return;
    }
    
    if (selectedDate) {
      setShow(false);
      const f = `${String(selectedDate.getDate()).padStart(2,'0')}/${String(selectedDate.getMonth()+1).padStart(2,'0')}/${selectedDate.getFullYear()}`;
      modo === 'inicio' ? setInicio(f) : setFin(f);
    }
  };

    const bloquearAgenda = async () => {
        if (!inicio || !fin || !motivo.trim()) {
            return setResultado({ tono: "error", titulo: "Campos incompletos", mensaje: "Indica las fechas y el motivo del bloqueo." });
        }

        if (userData?.role === 'Admin' && !profId.trim()) {
            return setResultado({ tono: "error", titulo: "Campos incompletos", mensaje: "Como administrador, debes indicar el identificador del profesional." });
        }

        const idAEnviar = userData?.role === 'Admin' ? profId : (userData?.usuario_id || profId);
        
        console.log("Enviando bloqueo para el ID:", idAEnviar);
        try {
            await apiClient.post('/clinica/disponibilidad/restringir', {
                profesional_id: parseInt(idAEnviar, 10), 
                fecha_inicio: inicio,
                fecha_fin: fin,
                motivo: motivo.trim()
            });
            
            setResultado({ tono: "ok", titulo: "Bloqueo registrado", mensaje: "El horario quedó bloqueado en tu agenda." });
            setInicio('');
            setFin('');
            setMotivo('');
            if (userData?.role === 'Admin') setProfId('');
            
        } catch (error) {
            setResultado({ tono: "error", titulo: "No se pudo bloquear", mensaje: error.response?.data?.mensaje || "Falla de red o de servidor." });
        }
    };

  return (
    <VistaConTeclado style={styles.container} contentContainerStyle={{ flexGrow: 1, padding: 20 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Gestión de Agenda</Text>
        <Text style={styles.cardSubtitle}>Configure los periodos de inactividad</Text>

        {userData?.role === 'Admin' && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>ID Profesional</Text>
            <TextInput 
              placeholder="Ej: 123" 
              value={profId} 
              onChangeText={setProfId} 
              style={styles.input}
              keyboardType="numeric"
            />
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Motivo del Bloqueo</Text>
          <TextInput 
            placeholder="Ej: Vacaciones, Licencia médica, etc." 
            value={motivo} 
            onChangeText={setMotivo} 
            style={styles.input}
            maxLength={200}
          />
        </View>

        <Text style={styles.label}>Rango de Fechas</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => { setModo('inicio'); setShow(true); }}>
          <Text style={styles.datePickerText}>{inicio || "📅 Inicio: DD/MM/AAAA"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.datePickerBtn} onPress={() => { setModo('fin'); setShow(true); }}>
          <Text style={styles.datePickerText}>{fin || "📅 Fin: DD/MM/AAAA"}</Text>
        </TouchableOpacity>

        {show && (
          <DateTimePicker 
            value={new Date()} 
            mode="date" 
          // El calendario nativo sale azul si no se le pasan los colores.
          accentColor={colores.primario}
          textColor={colores.texto}
          positiveButton={{ label: 'Aceptar', textColor: colores.primario }}
          negativeButton={{ label: 'Cancelar', textColor: colores.textoSuave }}
            onValueChange={alCambiarFecha} 
            onDismiss={() => setShow(false)} 
          />
        )}

        <TouchableOpacity style={styles.actionButton} onPress={bloquearAgenda}>
          <Text style={styles.saveButtonText}>CONFIRMAR BLOQUEO</Text>
        </TouchableOpacity>
      </View>

      <DialogoConfirmacion
        visible={resultado !== null}
        titulo={resultado?.titulo || ''}
        mensaje={resultado?.mensaje}
        etiquetaConfirmar="Entendido"
        etiquetaCancelar="Cerrar"
        tono={resultado?.tono === 'error' ? 'peligro' : 'normal'}
        onConfirmar={() => setResultado(null)}
        onCancelar={() => setResultado(null)}
      />
    </VistaConTeclado>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  card: { backgroundColor: colores.superficie, borderRadius: radio.lg, padding: 20,
    ...sombra.media,
  },
  cardTitle: { fontSize: 22, fontWeight: 'bold', color: colores.texto, marginBottom: 5 },
  cardSubtitle: { fontSize: 13, color: colores.textoSuave, marginBottom: 20 },
  inputContainer: { marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '600', color: colores.textoSuave, marginBottom: 8 },
  input: { ...piezas.campo },
  datePickerBtn: { backgroundColor: colores.superficie, borderRadius: radio.xl, paddingVertical: 15, paddingHorizontal: espacio.lg, borderWidth: 1.5, borderColor: colores.primario, marginBottom: 15, alignItems: 'center' },
  datePickerText: { color: colores.primario, fontWeight: '500' },
  actionButton: { backgroundColor: colores.error, paddingVertical: 15, borderRadius: radio.md, alignItems: 'center', marginTop: 10, ...sombra.suave },
  saveButtonText: { color: colores.superficie, fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },
  errorText: { textAlign: 'center', marginTop: 20, color: colores.error, fontSize: 17 }
});