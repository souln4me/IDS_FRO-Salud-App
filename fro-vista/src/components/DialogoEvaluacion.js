/**
 * Componente: Cliente Móvil
 * Casos de uso: CU55.
 */
// Ruta: fro-vista/src/components/DialogoEvaluacion.js
//
// CU55 — Formularios de evaluación (correcciones Inc 4), en dos modos:
//   - 'SESION' (después de cada cita): solo si el paciente quedó satisfecho
//     con la atención (Sí / No) y un comentario opcional.
//   - 'TRATAMIENTO' (al cerrarse el episodio): la calificación general del
//     profesional en estrellas de 1 a 5 y una reseña opcional.
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

// CU55 — Evaluando satisfacción post-sesión
export default function DialogoEvaluacion({
  visible,
  profesional,
  modo = 'SESION',
  detalle,
  enviando = false,
  onEnviar,
  onCancelar,
}) {
  const esTratamiento = modo === 'TRATAMIENTO';
  const [puntuacion, setPuntuacion] = useState(0);
  const [satisfecho, setSatisfecho] = useState(null);
  const [resena, setResena] = useState('');

  // Cada apertura empieza en blanco: si no, la evaluación anterior quedaría
  // escrita sobre la siguiente.
  useEffect(() => {
    if (visible) {
      setPuntuacion(0);
      setSatisfecho(null);
      setResena('');
    }
  }, [visible]);

  const listo = esTratamiento ? puntuacion > 0 : satisfecho !== null;
  const enviar = () =>
    onEnviar(esTratamiento ? { puntuacion, resena: resena.trim() } : { satisfecho, resena: resena.trim() });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={estilos.velo}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>
            {esTratamiento ? '¿Cómo calificarías tu tratamiento?' : '¿Quedaste satisfecho con la atención?'}
          </Text>
          {profesional ? <Text style={estilos.subtitulo}>con {profesional}{detalle ? ` · ${detalle}` : ''}</Text> : null}

          {!esTratamiento && (
            <View style={estilos.opciones}>
              {[{ valor: true, texto: 'Sí' }, { valor: false, texto: 'No' }].map((o) => (
                <TouchableOpacity
                  key={o.texto}
                  style={[estilos.opcion, satisfecho === o.valor && estilos.opcionElegida]}
                  onPress={() => setSatisfecho(o.valor)}
                  activeOpacity={interaccion.opacidadActiva}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.opcionTexto, satisfecho === o.valor && estilos.opcionTextoElegida]}>{o.texto}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {esTratamiento && (
          <>
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
          </>
          )}

          <TextInput
            style={estilos.campo}
            placeholder={esTratamiento ? 'Cuéntales a otros pacientes cómo fue (opcional)' : '¿Quieres dejar un comentario? (opcional)'}
            placeholderTextColor={colores.textoTenue}
            value={resena}
            onChangeText={setResena}
            multiline
            maxLength={300}
          />
          <Text style={estilos.ayuda}>
            {esTratamiento
              ? 'Tu reseña se revisa antes de publicarse. Tu calificación entra al promedio del profesional.'
              : 'Tu comentario se revisa antes de publicarse. La calificación en estrellas se pide al terminar el tratamiento.'}
          </Text>

          <TouchableOpacity
            style={[estilos.botonPrimario, (!listo || enviando) && estilos.deshabilitado]}
            onPress={enviar}
            disabled={!listo || enviando}
            activeOpacity={interaccion.opacidadActiva}
          >
            {enviando ? (
              <ActivityIndicator color={colores.textoInverso} />
            ) : (
              <Text style={estilos.botonPrimarioTexto}>{esTratamiento ? 'Enviar calificación' : 'Enviar respuesta'}</Text>
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

  opciones: { flexDirection: 'row', gap: espacio.md, marginTop: espacio.lg, marginBottom: espacio.base },
  opcion: {
    flex: 1,
    paddingVertical: espacio.md,
    borderRadius: radio.md,
    borderWidth: 1.5,
    borderColor: colores.bordeCampo,
    alignItems: 'center',
    backgroundColor: colores.superficie,
  },
  opcionElegida: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  opcionTexto: { ...tipografia.cuerpoFuerte, color: colores.textoSuave },
  opcionTextoElegida: { color: colores.primario },
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
