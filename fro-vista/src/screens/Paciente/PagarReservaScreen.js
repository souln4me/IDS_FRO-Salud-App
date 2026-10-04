// Ruta: fro-vista/src/screens/Paciente/PagarReservaScreen.js
//
// CU73 — Comercialización con restricción de cobro anticipado.
//
// La hora queda reservada de forma temporal al elegir el bloque. Con el pago
// completo queda pagada y el profesional la confirma (no puede confirmar una
// hora sin pago). Si el cobro se rechaza, la reserva se revoca y el bloque
// vuelve a estar disponible para otros pacientes.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';

import { getOpcionesDeCompra, comprarPrestacion } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import { formatearFechaHora } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';
import { irAPestana } from '../../navigation/rutasBarra';

// La pasarela es simulada y determinista, igual que en el Incremento 2: cada
// método provoca un desenlace distinto, y así se pueden probar las excepciones.
const METODOS = [
  { clave: 'TARJETA_OK', etiqueta: 'Tarjeta (pago exitoso)' },
  { clave: 'TARJETA_RECHAZADA', etiqueta: 'Tarjeta rechazada' },
  { clave: 'TARJETA_LENTA', etiqueta: 'Tarjeta con confirmación lenta' },
];

const pesos = (valor) => `$${Number(valor || 0).toLocaleString('es-CL')}`;

export default function PagarReservaScreen({ route, navigation }) {
  const citaId = route?.params?.citaId;

  const [opciones, setOpciones] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [modalidad, setModalidad] = useState(null);
  const [sesiones, setSesiones] = useState(null);
  const [metodo, setMetodo] = useState('TARJETA_OK');
  const [pagando, setPagando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await getOpcionesDeCompra(citaId);
      setOpciones(datos);
      // Con sesiones disponibles en un plan, esa es la opción natural.
      if (datos.paquete_activo?.disponibles > 0) setModalidad('USAR_PAQUETE');
    } catch (err) {
      // Excepción 2: el servicio de cálculo no respondió.
      setError(
        err.response?.data?.mensaje ||
          'No pudimos calcular el valor de la prestación. Inténtalo nuevamente en unos minutos.'
      );
    } finally {
      setCargando(false);
    }
  }, [citaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const pagar = async () => {
    // Excepción 1: sin modalidad elegida no se avanza de pantalla.
    if (!modalidad) {
      setAviso({
        tono: 'info',
        titulo: 'Falta elegir',
        mensaje: 'Indica si pagas esta sesión o compras un plan antes de continuar.',
      });
      return;
    }
    if (modalidad === 'PAQUETE' && !sesiones) {
      setAviso({
        tono: 'info',
        titulo: 'Elige un plan',
        mensaje: 'Selecciona de cuántas sesiones es el plan que quieres comprar.',
      });
      return;
    }

    setPagando(true);
    try {
      const datos = await comprarPrestacion(citaId, { modalidad, sesiones, metodo_pago: metodo });
      setAviso({
        tono: datos.estado === 'EN_TRANSITO' ? 'alerta' : 'ok',
        titulo: datos.estado === 'EN_TRANSITO' ? 'Pago en tránsito' : '¡Pago recibido!',
        mensaje: datos.mensaje,
        alCerrar: () => irAPestana(navigation, 'MisCitas'),
      });
    } catch (err) {
      const respuesta = err.response?.data;
      setAviso({
        tono: 'error',
        titulo: respuesta?.reserva_revocada ? 'Reserva revocada' : 'No se pudo pagar',
        mensaje: respuesta?.mensaje || 'Inténtalo nuevamente.',
        // Excepciones 3 y 4: si la reserva se revocó, el paciente vuelve a
        // buscar hora, que es lo único que puede hacer.
        alCerrar: respuesta?.reserva_revocada
          ? () => navigation.navigate('BuscarCita')
          : undefined,
      });
    } finally {
      setPagando(false);
    }
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
        <Text style={estilos.cargandoTexto}>Calculando el valor de tu hora…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje={error} onRetry={cargar} />
      </View>
    );
  }

  if (opciones?.ya_pagada) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.iconoGrande}>✅</Text>
        <Text style={estilos.tituloOk}>Esta hora ya está pagada</Text>
        <Text style={estilos.textoOk}>
          Pagaste {pesos(opciones.monto_pagado)}. Falta que el profesional confirme la cita.
        </Text>
        <TouchableOpacity
          style={estilos.botonPrimario}
          onPress={() => irAPestana(navigation, 'MisCitas')}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.botonPrimarioTexto}>Ver mis citas</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const Opcion = ({ clave, titulo, detalle, monto, elegida, alElegir }) => (
    <TouchableOpacity
      style={[estilos.opcion, elegida && estilos.opcionElegida]}
      onPress={alElegir}
      activeOpacity={interaccion.opacidadActiva}
    >
      <View style={estilos.opcionTexto}>
        <Text style={[estilos.opcionTitulo, elegida && estilos.opcionTituloElegido]}>
          {elegida ? '● ' : '○ '}
          {titulo}
        </Text>
        <Text style={estilos.opcionDetalle}>{detalle}</Text>
      </View>
      <Text style={[estilos.opcionMonto, elegida && estilos.opcionTituloElegido]}>{monto}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={estilos.fondo} contentContainerStyle={estilos.contenido}>
      <View style={estilos.cintaReserva}>
        <Text style={estilos.cintaTexto}>
          ⏳ Tu hora del {formatearFechaHora(opciones?.cita?.fecha_hora_inicio)} está reservada de
          forma temporal. Se confirma al recibir el pago completo.
        </Text>
      </View>

      <Text style={estilos.seccion}>¿Cómo quieres pagarla?</Text>

      {opciones?.paquete_activo?.disponibles > 0 && (
        <Opcion
          clave="USAR_PAQUETE"
          titulo="Usar una sesión de mi plan"
          detalle={`Te quedan ${opciones.paquete_activo.disponibles} de ${opciones.paquete_activo.total} sesiones`}
          monto="Sin costo"
          elegida={modalidad === 'USAR_PAQUETE'}
          alElegir={() => setModalidad('USAR_PAQUETE')}
        />
      )}

      <Opcion
        clave="UNITARIA"
        titulo="Pagar solo esta sesión"
        detalle="Una prestación, sin compromiso"
        monto={pesos(opciones?.arancel)}
        elegida={modalidad === 'UNITARIA'}
        alElegir={() => {
          setModalidad('UNITARIA');
          setSesiones(null);
        }}
      />

      <Text style={estilos.seccion}>
        O compra un plan y ahorra {opciones?.descuento_paquete}%
      </Text>

      {opciones?.planes?.map((plan) => (
        <Opcion
          key={plan.sesiones}
          clave={`PAQUETE_${plan.sesiones}`}
          titulo={`Plan de ${plan.sesiones} sesiones`}
          detalle={`En vez de ${pesos(plan.precio_sin_descuento)} · ${pesos(
            Math.round(plan.precio / plan.sesiones)
          )} por sesión`}
          monto={pesos(plan.precio)}
          elegida={modalidad === 'PAQUETE' && sesiones === plan.sesiones}
          alElegir={() => {
            setModalidad('PAQUETE');
            setSesiones(plan.sesiones);
          }}
        />
      ))}

      {modalidad !== 'USAR_PAQUETE' && (
        <>
          <Text style={estilos.seccion}>Método de pago</Text>
          {METODOS.map((m) => (
            <TouchableOpacity
              key={m.clave}
              style={[estilos.metodo, metodo === m.clave && estilos.metodoElegido]}
              onPress={() => setMetodo(m.clave)}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={[estilos.metodoTexto, metodo === m.clave && estilos.metodoTextoElegido]}>
                {metodo === m.clave ? '● ' : '○ '}
                {m.etiqueta}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      <TouchableOpacity
        style={[estilos.botonPrimario, pagando && estilos.deshabilitado]}
        onPress={pagar}
        disabled={pagando}
        activeOpacity={interaccion.opacidadActiva}
      >
        {pagando ? (
          <ActivityIndicator color={colores.textoInverso} />
        ) : (
          <Text style={estilos.botonPrimarioTexto}>
            {modalidad === 'USAR_PAQUETE' ? 'Usar una sesión de mi plan' : 'Pagar la hora'}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={estilos.nota}>
        Si cancelas con al menos 24 horas de anticipación, te devolvemos el pago completo.
      </Text>

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
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  cargandoTexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.md },

  cintaReserva: {
    backgroundColor: colores.advertenciaSuave,
    borderWidth: 1,
    borderColor: colores.advertenciaBorde,
    borderRadius: radio.md,
    padding: espacio.md,
    marginBottom: espacio.base,
  },
  cintaTexto: { ...tipografia.meta, color: colores.advertencia },

  seccion: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginTop: espacio.base, marginBottom: espacio.sm },

  opcion: {
    ...piezas.tarjeta,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: espacio.sm,
  },
  // La opción elegida cambia de borde y de color, no solo de viñeta.
  opcionElegida: { borderColor: colores.primario, borderWidth: 1.5, backgroundColor: colores.primarioSuave },
  opcionTexto: { flex: 1 },
  opcionTitulo: { ...tipografia.cuerpo, color: colores.texto },
  opcionTituloElegido: { ...tipografia.cuerpoFuerte, color: colores.primario },
  opcionDetalle: { ...tipografia.micro, color: colores.textoTenue, marginTop: 2 },
  opcionMonto: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },

  metodo: {
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.base,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    marginBottom: espacio.sm,
    backgroundColor: colores.superficie,
  },
  metodoElegido: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  metodoTexto: { ...tipografia.meta, color: colores.textoSuave },
  metodoTextoElegido: { ...tipografia.cuerpoFuerte, color: colores.primario },

  botonPrimario: { ...piezas.botonPrimario, alignItems: 'center', marginTop: espacio.lg },
  botonPrimarioTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.6 },
  nota: { ...tipografia.micro, color: colores.textoTenue, textAlign: 'center', marginTop: espacio.base },

  iconoGrande: { fontSize: 48, marginBottom: espacio.md },
  tituloOk: { ...tipografia.subtitulo, color: colores.textoTitulo, textAlign: 'center' },
  textoOk: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.sm },
});
