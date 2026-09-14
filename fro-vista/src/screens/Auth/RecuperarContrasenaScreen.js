// Ruta: fro-vista/src/screens/Auth/RecuperarContrasenaScreen.js
//
// CU06 + CU07: recuperación de contraseña olvidada.
// Paso 1 (CU06): se pide el correo y se envía un código OTP.
// Paso 2 (CU07): se verifica el código y recién entonces se pide la
// contraseña nueva (ver CambioContrasenaOTP).

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

import apiClient from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import { colores, radio, sombra } from '../../theme';
import CambioContrasenaOTP from '../../components/CambioContrasenaOTP';
import DialogoAviso from '../../components/DialogoAviso';

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecuperarContrasenaScreen({ navigation }) {
  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).
  const [aviso, setAviso] = useState(null);
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const correo = email.trim().toLowerCase();

  // ── Paso 1: solicitar el código ────────────────────────────────────────────
  const solicitarCodigo = async () => {
    // CU06 — Excepción 3: formato inválido se bloquea antes de enviar.
    if (!FORMATO_CORREO.test(correo)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }

    setCargando(true);
    setError('');
    try {
      const { data } = await apiClient.post('/auth/recuperar/solicitar', { email: correo });
      setAviso({ tono: 'info', titulo: 'Revisa tu correo', mensaje: data?.mensaje || 'Si el correo está registrado, recibirás un código.' });
      setPaso(2);
    } catch (err) {
      const respuesta = err.response?.data;
      setError(respuesta?.mensaje || 'No se pudo procesar la solicitud. Revisa tu conexión.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <VistaConTeclado style={estilos.fondo} contentContainerStyle={estilos.contenedor}>
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>Recuperar contraseña</Text>

        {paso === 1 ? (
          <>
            <Text style={estilos.subtitulo}>
              Ingresa el correo de tu cuenta y te enviaremos un código de verificación.
            </Text>
            <TextInput
              style={estilos.input}
              placeholder="correo@ejemplo.cl"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!cargando}
            />

            {error ? <Text style={estilos.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[estilos.boton, cargando && estilos.botonDeshabilitado]}
              onPress={solicitarCodigo}
              disabled={cargando}
            >
              {cargando ? (
                <ActivityIndicator color={colores.superficie} />
              ) : (
                <Text style={estilos.botonTexto}>Enviar código</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <CambioContrasenaOTP
            destino={correo}
            verificarCodigo={(codigo) =>
              apiClient.post('/auth/recuperar/verificar', { email: correo, codigo })
            }
            confirmarContrasena={async (codigo, nuevaContrasena) => {
              const { data } = await apiClient.post('/auth/recuperar/confirmar', {
                email: correo,
                codigo,
                nueva_contrasena: nuevaContrasena,
              });
              return data;
            }}
            reenviarCodigo={() => apiClient.post('/auth/recuperar/solicitar', { email: correo })}
            onExito={(data) =>
              setAviso({
                tono: 'ok',
                titulo: 'Contraseña actualizada',
                mensaje: data?.mensaje || 'Ya puedes iniciar sesión.',
                alCerrar: () => navigation.replace('Login'),
              })
            }
          />
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} disabled={cargando}>
          <Text style={estilos.enlace}>Volver al inicio de sesión</Text>
        </TouchableOpacity>
      </View>
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
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenedor: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: 24,
    ...sombra.suave,
  },
  titulo: { fontSize: 22, fontWeight: 'bold', color: colores.primario, marginBottom: 8 },
  subtitulo: { color: colores.textoSuave, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    backgroundColor: colores.fondo,
    borderRadius: radio.md,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  error: { color: colores.error, marginTop: 4, fontSize: 13 },
  boton: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    padding: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonTexto: { color: colores.superficie, fontWeight: 'bold', fontSize: 15 },
  enlace: { color: colores.primario, textAlign: 'center', marginTop: 16, fontWeight: '600' },
});
