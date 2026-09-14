// Ruta: fro-vista/src/components/CambioContrasenaOTP.js
//
// CU07: cambio de contraseña en dos etapas. Lo usan la recuperación pública y
// la pantalla de Seguridad; cada una pasa sus propias llamadas al servidor.
// 1. Código: solo dígitos (Exc. 1). "Verificar código" consulta al servidor y
//    solo si el código está vigente se habilita la contraseña nueva (Exc. 2).
// 2. Contraseña: los requisitos se marcan mientras se escribe y "Confirmar
//    contraseña" sigue deshabilitado hasta cumplirlos todos (Exc. 3). Si el
//    guardado falla, el formulario se conserva para reintentar (Exc. 4).

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

import CodigoOTP from './CodigoOTP';
import DialogoAviso from './DialogoAviso';
import { REQUISITOS_CONTRASENA } from '../utils/contrasena';
import { colores, espacio, radio, tipografia, interaccion } from '../theme';

const LARGO_CODIGO = 6;

/**
 * @param {string}   destino              correo al que llegó el código (para el texto)
 * @param {Function} verificarCodigo      (codigo) => Promise
 * @param {Function} confirmarContrasena  (codigo, nuevaContrasena) => Promise<data>
 * @param {Function} reenviarCodigo       () => Promise
 * @param {Function} onExito              (data) => void
 */
export default function CambioContrasenaOTP({
  destino,
  verificarCodigo,
  confirmarContrasena,
  reenviarCodigo,
  onExito,
}) {
  const [etapa, setEtapa] = useState('codigo');
  const [codigo, setCodigo] = useState('');
  const [codigoRechazado, setCodigoRechazado] = useState(false);
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const requisitos = [
    ...REQUISITOS_CONTRASENA.map((requisito) => ({
      etiqueta: requisito.etiqueta,
      cumple: requisito.cumple(nuevaContrasena),
    })),
    { etiqueta: 'Las dos contraseñas coinciden', cumple: nuevaContrasena !== '' && nuevaContrasena === confirmacion },
  ];
  const contrasenaValida = requisitos.every((requisito) => requisito.cumple);

  const rechazarCodigo = (mensaje) => {
    setEtapa('codigo');
    setCodigo('');
    setCodigoRechazado(true);
    setAviso({
      tono: 'error',
      titulo: 'Código inválido',
      mensaje: mensaje || 'El código no es válido. Revisa e intenta de nuevo.',
    });
  };

  // ── Etapa 1: el servidor comprueba integridad y vigencia del código ────────
  const verificar = async () => {
    setCargando(true);
    try {
      await verificarCodigo(codigo);
      setCodigoRechazado(false);
      setEtapa('contrasena');
    } catch (err) {
      const respuesta = err.response?.data;
      if (respuesta?.error === 'CODIGO_INVALIDO') {
        rechazarCodigo(respuesta.mensaje);
      } else {
        setAviso({
          tono: 'error',
          titulo: 'No se pudo verificar el código',
          mensaje: respuesta?.mensaje || 'No hubo respuesta del servidor. Revisa tu conexión e intenta nuevamente.',
        });
      }
    } finally {
      setCargando(false);
    }
  };

  // ── Etapa 2: guardar la contraseña nueva ───────────────────────────────────
  const confirmar = async () => {
    setCargando(true);
    try {
      const data = await confirmarContrasena(codigo, nuevaContrasena);
      onExito(data);
    } catch (err) {
      const respuesta = err.response?.data;
      if (respuesta?.error === 'CODIGO_INVALIDO') {
        // El código venció mientras se escribía la contraseña.
        rechazarCodigo(respuesta.mensaje);
      } else if (respuesta?.error === 'CONTRASENA_DEBIL') {
        setAviso({
          tono: 'error',
          titulo: 'Contraseña insegura',
          mensaje: respuesta.mensaje,
          lista: (respuesta.requisitos || []).map((titulo) => ({ titulo })),
        });
      } else {
        // Excepción 4: no se borra nada, basta con volver a presionar.
        setAviso({
          tono: 'error',
          titulo: 'No se pudo completar la operación',
          mensaje: respuesta?.mensaje || 'No hubo respuesta del servidor. Revisa tu conexión y vuelve a presionar "Confirmar contraseña".',
        });
      }
    } finally {
      setCargando(false);
    }
  };

  const reenviar = async () => {
    setReenviando(true);
    try {
      await reenviarCodigo();
      setCodigo('');
      setCodigoRechazado(false);
      setAviso({
        tono: 'info',
        titulo: 'Código reenviado',
        mensaje: 'Revisa tu correo: el código anterior ya no sirve.',
      });
    } catch (err) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo reenviar el código',
        mensaje: err.response?.data?.mensaje || 'Intenta nuevamente en unos momentos.',
      });
    } finally {
      setReenviando(false);
    }
  };

  return (
    <View>
      {etapa === 'codigo' ? (
        <>
          <Text style={estilos.instruccion}>
            Ingresa el código de 6 dígitos que enviamos a {destino}.
          </Text>
          <CodigoOTP
            valor={codigo}
            onCambiar={(valor) => {
              setCodigo(valor);
              setCodigoRechazado(false);
            }}
            largo={LARGO_CODIGO}
            error={codigoRechazado}
            editable={!cargando}
          />
          <Boton
            etiqueta="Verificar código"
            onPress={verificar}
            habilitado={codigo.length === LARGO_CODIGO}
            cargando={cargando}
          />
          <TouchableOpacity onPress={reenviar} disabled={cargando || reenviando}>
            {reenviando ? (
              <ActivityIndicator size="small" color={colores.primario} style={estilos.enlaceCargando} />
            ) : (
              <Text style={estilos.enlace}>Reenviar código</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={estilos.verificado}>✓ Código verificado</Text>
          <Text style={estilos.instruccion}>Escribe tu contraseña nueva.</Text>
          <TextInput
            style={estilos.input}
            placeholder="Contraseña nueva"
            secureTextEntry
            value={nuevaContrasena}
            onChangeText={setNuevaContrasena}
            editable={!cargando}
            autoFocus
          />
          <TextInput
            style={estilos.input}
            placeholder="Confirmar contraseña nueva"
            secureTextEntry
            value={confirmacion}
            onChangeText={setConfirmacion}
            editable={!cargando}
          />

          <View style={estilos.requisitos}>
            {requisitos.map((requisito) => (
              <Text
                key={requisito.etiqueta}
                style={[
                  estilos.requisito,
                  requisito.cumple
                    ? estilos.requisitoCumplido
                    : nuevaContrasena !== '' && estilos.requisitoIncumplido,
                ]}
              >
                {requisito.cumple ? '✓' : '✗'}  {requisito.etiqueta}
              </Text>
            ))}
          </View>

          <Boton
            etiqueta="Confirmar contraseña"
            onPress={confirmar}
            habilitado={contrasenaValida}
            cargando={cargando}
          />
        </>
      )}

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        lista={aviso?.lista}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </View>
  );
}

function Boton({ etiqueta, onPress, habilitado, cargando }) {
  const deshabilitado = !habilitado || cargando;
  return (
    <TouchableOpacity
      style={[estilos.boton, deshabilitado && estilos.botonDeshabilitado]}
      onPress={onPress}
      disabled={deshabilitado}
      activeOpacity={interaccion.opacidadActiva}
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado }}
    >
      {cargando ? (
        <ActivityIndicator color={colores.superficie} />
      ) : (
        <Text style={estilos.botonTexto}>{etiqueta}</Text>
      )}
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  instruccion: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.md },
  verificado: { ...tipografia.metaFuerte, color: colores.exito, marginBottom: espacio.xs },
  input: {
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    backgroundColor: colores.fondo,
    borderRadius: radio.md,
    padding: espacio.md,
    marginBottom: espacio.md,
    fontSize: 15,
  },
  requisitos: { marginBottom: espacio.xs },
  requisito: { ...tipografia.meta, color: colores.textoTenue, marginBottom: 2 },
  requisitoCumplido: { color: colores.exito },
  requisitoIncumplido: { color: colores.error },
  boton: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    padding: 14,
    alignItems: 'center',
    marginTop: espacio.md,
  },
  botonDeshabilitado: { opacity: interaccion.opacidadDeshabilitada },
  botonTexto: { color: colores.superficie, fontWeight: 'bold', fontSize: 15 },
  enlace: { color: colores.primario, textAlign: 'center', marginTop: espacio.base, fontWeight: '600' },
  enlaceCargando: { marginTop: espacio.base },
});
