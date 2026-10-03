// Ruta: fro-vista/src/components/DialogoEvaluacion.js
//
// CU55 — Formulario de satisfacción post-sesión: estrellas de 1 a 5 y un
// comentario opcional.
//
// Se usa en los dos caminos que acordamos: el profesional le pasa el teléfono
// al paciente al cerrar la atención, y el paciente también puede calificar
// después desde Mis Citas (Excepción 2: si el modal no alcanzó a mostrarse, la
// evaluación sigue accesible).

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';

import { colores, espacio, radio, sombra, tipografia, interaccion } from '../theme';

const ETIQUETAS = ['', 'Muy mala', 'Mala', 'Aceptable', 'Buena', 'Excelente'];

export default function DialogoEvaluacion({
  visible,
  profesional,
  enviando = false,
  onEnviar,
  onCancelar,
}) {
  const [puntuacion, setPuntuacion] = useState(0);
  const [resena, setResena] = useState('');

  // Cada apertura empieza en blanco: si no, la evaluación anterior quedaría
  // escrita sobre la siguiente.
  useEffect(() => {
    if (visible) {
      setPuntuacion(0);
      setResena('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={estilos.velo}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>¿Cómo estuvo tu atención?</Text>
          {profesional ? <Text style={estilos.subtitulo}>con {profesional}</Text> : null}

          <View style={estilos.estrellas}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setPuntuacion(n)}
                activeOpacity={interaccion.opacidadActiva}
                accessibilityRole="button"
                accessibilityLabel={`${n} de 5 estrellas`}
              >
                <Text style={[estilos.estrella, n <= puntuacion && estilos.estrellaActiva]}>
                  {n <= puntuacion ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={estilos.etiquetaNota}>
            {puntuacion > 0 ? ETIQUETAS[puntuacion] : 'Toca las estrellas para calificar'}
          </Text>

          <TextInput
            style={estilos.campo}
            placeholder="¿Quieres contar algo más? (opcional)"
            placeholderTextColor={colores.textoTenue}
            value={resena}
            onChangeText={setResena}
            multiline
            maxLength={300}
          />
          <Text style={estilos.ayuda}>
            Tu comentario se revisa antes de publicarse. La calificación es anónima para los
            demás pacientes.
          </Text>

          <TouchableOpacity
            style={[estilos.botonPrimario, (puntuacion === 0 || enviando) && estilos.deshabilitado]}
            onPress={() => onEnviar({ puntuacion, resena: resena.trim() })}
            disabled={puntuacion === 0 || enviando}
            activeOpacity={interaccion.opacidadActiva}
          >
            {enviando ? (
              <ActivityIndicator color={colores.textoInverso} />
            ) : (
              <Text style={estilos.botonPrimarioTexto}>Enviar evaluación</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onCancelar} disabled={enviando}>
            <Text style={estilos.enlaceCancelar}>Ahora no</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  velo: {
    flex: 1,
    backgroundColor: colores.velo,
    justifyContent: 'center',
    padding: espacio.lg,
  },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.xl,
    padding: espacio.xl,
    ...sombra.elevada,
  },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo, textAlign: 'center' },
  subtitulo: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', marginTop: 2 },

  estrellas: { flexDirection: 'row', justifyContent: 'center', gap: espacio.sm, marginTop: espacio.lg },
  estrella: { fontSize: 38, color: colores.bordeCampo },
  estrellaActiva: { color: colores.secundario },
  etiquetaNota: {
    ...tipografia.metaFuerte,
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.sm,
    marginBottom: espacio.base,
  },

  campo: {
    backgroundColor: colores.superficieSuave,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    padding: espacio.md,
    minHeight: 80,
    textAlignVertical: 'top',
    ...tipografia.cuerpo,
    color: colores.texto,
  },
  ayuda: { ...tipografia.micro, color: colores.textoTenue, marginTop: espacio.sm },

  botonPrimario: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: espacio.base,
    alignItems: 'center',
    marginTop: espacio.lg,
  },
  botonPrimarioTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.5 },
  enlaceCancelar: {
    ...tipografia.meta,
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.base,
  },
});
