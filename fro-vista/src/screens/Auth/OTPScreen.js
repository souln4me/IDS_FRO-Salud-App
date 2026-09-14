import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import client from "../../api/client";
import VistaConTeclado from "../../components/VistaConTeclado";
import { colores, radio, sombra } from '../../theme';
import CodigoOTP from '../../components/CodigoOTP';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';

// ─────────────────────────────────────────────────────────────────────────────
// OTPScreen
// Props esperadas vía navigation.params:
//   - usuario_id  : número
//   - canal       : "EMAIL" | "SMS"
//   - destino     : string enmascarado para mostrar al usuario (ej: "j***@gmail.com")
// ─────────────────────────────────────────────────────────────────────────────

const LARGO_OTP = 6;
const SEGUNDOS_REENVIO = 60;

export default function OTPScreen({ route, navigation }) {
  const { usuario_id, canal = "EMAIL", destino = "" } = route?.params ?? {};

  // Avisos con el diálogo de la app (el Alert nativo no se estiliza).

  const [aviso, setAviso] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);

  const [digitos, setDigitos] = useState(Array(LARGO_OTP).fill(""));
  const [cargando, setCargando] = useState(false);
  const [cargandoReenvio, setCargandoReenvio] = useState(false);
  const [segundos, setSegundos] = useState(SEGUNDOS_REENVIO);
  const [error, setError] = useState(null);

  const inputs = useRef([]);

  // ── Cuenta regresiva para reenvío ──────────────────────────────────────────
  useEffect(() => {
    if (segundos <= 0) return;
    const timer = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [segundos]);

  // ── Manejo de ingreso de dígitos ───────────────────────────────────────────
  function manejarCambio(texto, indice) {
    // Solo acepta un dígito numérico
    const valor = texto.replace(/[^0-9]/g, "").slice(-1);
    const nuevos = [...digitos];
    nuevos[indice] = valor;
    setDigitos(nuevos);
    setError(null);

    // Avanzar al siguiente campo automáticamente
    if (valor && indice < LARGO_OTP - 1) {
      inputs.current[indice + 1]?.focus();
    }
  }

  function manejarRetroceso(e, indice) {
    if (e.nativeEvent.key === "Backspace" && !digitos[indice] && indice > 0) {
      inputs.current[indice - 1]?.focus();
    }
  }

  function codigoCompleto() {
    return digitos.join("");
  }

  // ── Verificar OTP ──────────────────────────────────────────────────────────
  async function verificar() {
    const codigo = codigoCompleto();
    if (codigo.length < LARGO_OTP) {
      setError("Ingresa los 6 dígitos del código.");
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const { data } = await client.post("/auth/otp/verificar", {
        usuario_id,
        codigo,
      });

      setAviso({
        tono: 'ok',
        titulo: '¡Listo!',
        mensaje: data.mensaje,
        etiqueta: 'Iniciar sesión',
        alCerrar: () => navigation.replace('Login'),
      });
    } catch (err) {
      const respuesta = err.response?.data;
      const errorCodigo = respuesta?.error;

      // Excepción 3: código incorrecto o expirado
      if (errorCodigo === "EXPIRADO" || errorCodigo === "CODIGO_INCORRECTO" || errorCodigo === "MAX_INTENTOS") {
        setError(respuesta.mensaje);
        setDigitos(Array(LARGO_OTP).fill(""));
        inputs.current[0]?.focus();
      } else if (errorCodigo === "PERSISTENCIA_FALLIDA") {
        // Excepción 4: falla de escritura en servidor
        setAviso({
          tono: 'error',
          titulo: 'Error al activar cuenta',
          mensaje: 'No se pudo activar tu cuenta. Recarga la pantalla e intenta de nuevo.',
        });
      } else {
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
      }
    } finally {
      setCargando(false);
    }
  }

  // ── Reenviar OTP ───────────────────────────────────────────────────────────
  async function reenviarCodigo() {
    if (segundos > 0) return;

    setCargandoReenvio(true);
    setError(null);

    try {
      const { data } = await client.post("/auth/otp/solicitar", {
        usuario_id,
        canal,
      });

      // El backend responde 200 con { mensaje }. Si llegamos aquí, se envió.
      setSegundos(SEGUNDOS_REENVIO);
      setDigitos(Array(LARGO_OTP).fill(""));
      inputs.current[0]?.focus();
      setAviso({ tono: 'ok', titulo: "Código reenviado", mensaje: data?.mensaje || "Revisa tu correo." });
    } catch (err) {
      const respuesta = err.response?.data;
      const errorCodigo = respuesta?.error;

      // Excepción 1: falla del servicio de comunicaciones externo
      if (errorCodigo === "ENVIO_FALLIDO") {
        // El detalle dice qué revisar en la configuración del servidor.
        setConfirmacion({
          tono: 'peligro',
          titulo: 'No se pudo enviar el código',
          mensaje: respuesta?.detalle
            ? `${respuesta.mensaje}\n\n${respuesta.detalle}`
            : respuesta?.mensaje || 'El servicio de correo no está disponible.',
          etiqueta: 'Reintentar',
          accion: reenviarCodigo,
        });
      } else {
        setAviso({ tono: 'error', titulo: "Error", mensaje: "No se pudo reenviar el código. Intenta más tarde." });
      }
    } finally {
      setCargandoReenvio(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <VistaConTeclado
      style={estilos.fondo}
      contentContainerStyle={estilos.contenedor}
    >
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>Verificación de identidad</Text>
        <Text style={estilos.subtitulo}>
          Ingresa el código de 6 dígitos enviado a{"\n"}
          <Text style={estilos.destino}>{destino}</Text>
        </Text>

        {/* Campos OTP */}
        <CodigoOTP
          valor={digitos.join('')}
          onCambiar={(v) => {
            setDigitos(Array.from({ length: LARGO_OTP }, (_, i) => v[i] || ''));
            setError(null);
          }}
          largo={LARGO_OTP}
          error={Boolean(error)}
          autoFocus
        />

        {/* Mensaje de error */}
        {error && <Text style={estilos.textoError}>{error}</Text>}

        {/* Botón verificar */}
        <TouchableOpacity
          style={[estilos.boton, cargando && estilos.botonDeshabilitado]}
          onPress={verificar}
          disabled={cargando}
        >
          {cargando ? (
            <ActivityIndicator color={colores.superficie} />
          ) : (
            <Text style={estilos.textoBoton}>Verificar código</Text>
          )}
        </TouchableOpacity>

        {/* Reenviar código */}
        <View style={estilos.filareenvio}>
          <Text style={estilos.textoGris}>¿No recibiste el código? </Text>
          {segundos > 0 ? (
            <Text style={estilos.textoGris}>Reenviar en {segundos}s</Text>
          ) : (
            <TouchableOpacity onPress={reenviarCodigo} disabled={cargandoReenvio}>
              {cargandoReenvio ? (
                <ActivityIndicator size="small" color={colores.primario} />
              ) : (
                <Text style={estilos.textoEnlace}>Reenviar ahora</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    <DialogoConfirmacion
      visible={confirmacion !== null}
      titulo={confirmacion?.titulo || ''}
      mensaje={confirmacion?.mensaje}
      etiquetaConfirmar={confirmacion?.etiqueta || 'Confirmar'}
      etiquetaCancelar={confirmacion?.etiquetaCancelar || 'Cancelar'}
      tono={confirmacion?.tono || 'normal'}
      onConfirmar={() => {
        const accion = confirmacion?.accion;
        setConfirmacion(null);
        if (accion) accion();
      }}
      onCancelar={() => setConfirmacion(null)}
    />

    <DialogoAviso
      visible={aviso !== null}
      titulo={aviso?.titulo || ''}
      mensaje={aviso?.mensaje}
      tono={aviso?.tono}
      etiquetaCerrar={aviso?.etiqueta || 'Entendido'}
      onCerrar={() => {
        const seguir = aviso?.alCerrar;
        setAviso(null);
        if (seguir) seguir();
      }}
    />
    </VistaConTeclado>
  );
}

// ─ Estilos 
const estilos = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenedor: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  tarjeta: {
    width: "100%",
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: 28,
    alignItems: "center",
    ...sombra.media,
  },
  titulo: {
    fontSize: 22,
    fontWeight: "700",
    color: colores.textoTitulo,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitulo: {
    fontSize: 15,
    color: colores.textoSuave,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 20,
  },
  destino: {
    fontWeight: "600",
    color: colores.primario,
  },
  filaOTP: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  celdaOTP: {
    width: 44,
    height: 54,
    borderWidth: 1.5,
    borderColor: colores.borde,
    borderRadius: radio.md,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colores.textoTitulo,
    backgroundColor: colores.fondo,
  },
  celdaError: {
    borderColor: colores.error,
    backgroundColor: colores.errorSuave,
  },
  textoError: {
    color: colores.error,
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  boton: {
    width: "100%",
    backgroundColor: colores.primario,
    paddingVertical: 14,
    borderRadius: radio.md,
    alignItems: "center",
    marginTop: 8,
  },
  botonDeshabilitado: {
    opacity: 0.6,
  },
  textoBoton: {
    color: colores.superficie,
    fontSize: 17,
    fontWeight: "600",
  },
  filareenvio: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  },
  textoGris: {
    color: colores.textoTenue,
    fontSize: 13,
  },
  textoEnlace: {
    color: colores.primario,
    fontSize: 13,
    fontWeight: "600",
  },
});