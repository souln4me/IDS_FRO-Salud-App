/**
 * Componente: Cliente Móvil — Vista "Términos restringidos"
 * Casos de uso: CU57, CU62.
 */
// Ruta: fro-vista/src/screens/Admin/PalabrasRestringidasScreen.js
//
// CU57 — Diccionario de términos restringidos. Es la precondición del caso de
// uso: el filtro solo bloquea lo que el administrador declare acá.
//
// Un término se puede desactivar sin borrarlo, que es lo habitual cuando se
// duda de si genera falsos positivos: queda registrado pero deja de filtrar.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, RefreshControl,
  Switch, ActivityIndicator, StyleSheet,
} from 'react-native';

import {
  getPalabrasRestringidas,
  agregarPalabraRestringida,
  alternarPalabraRestringida,
  eliminarPalabraRestringida,
} from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';
import ErrorRetry from '../../components/ErrorRetry';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

// CU62: CRITICO no bloquea el texto; lo escala a la bandeja de eventos críticos.
const CATEGORIAS = ['GENERAL', 'OFENSA', 'DESCALIFICACION', 'DATOS_SENSIBLES', 'CRITICO'];

export default function PalabrasRestringidasScreen() {
  const [palabras, setPalabras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);

  const [termino, setTermino] = useState('');
  const [categoria, setCategoria] = useState('GENERAL');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [porEliminar, setPorEliminar] = useState(null);

  // CU57 — Filtrando automáticamente contenido restringido: cargar el diccionario
  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setError(false);
    try {
      const { palabras: recibidas } = await getPalabrasRestringidas();
      setPalabras(recibidas || []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // CU57 — agregar un término al diccionario
  const agregar = async () => {
    const limpio = termino.trim();
    if (limpio.length < 2) {
      setAviso({
        tono: 'info',
        titulo: 'Término muy corto',
        mensaje: 'Escribe al menos dos caracteres.',
      });
      return;
    }
    setGuardando(true);
    try {
      const datos = await agregarPalabraRestringida(limpio, categoria);
      setTermino('');
      setAviso({ tono: 'ok', titulo: 'Diccionario actualizado', mensaje: datos.mensaje });
      await cargar(true);
    } catch (err) {
      setAviso({
        tono: 'error',
        titulo: 'No se pudo agregar',
        mensaje: err.response?.data?.mensaje || 'Intenta nuevamente.',
      });
    } finally {
      setGuardando(false);
    }
  };

  // CU57 — activar o desactivar un término sin borrarlo
  const alternar = async (palabra, activa) => {
    setPalabras((previas) =>
      previas.map((p) =>
        p.palabra_restringida_id === palabra.palabra_restringida_id ? { ...p, activa } : p
      )
    );
    try {
      await alternarPalabraRestringida(palabra.palabra_restringida_id, activa);
    } catch {
      await cargar(true);
    }
  };

  // CU57 — quitar un término del diccionario
  const eliminar = async (palabra) => {
    setPorEliminar(null);
    try {
      await eliminarPalabraRestringida(palabra.palabra_restringida_id);
      await cargar(true);
    } catch {
      setAviso({ tono: 'error', titulo: 'No se pudo eliminar', mensaje: 'Intenta nuevamente.' });
    }
  };

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje="No se pudo cargar el diccionario." onRetry={() => cargar()} />
      </View>
    );
  }

  const activas = palabras.filter((p) => p.activa).length;

  return (
    <VistaConTeclado
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />
      }
    >
      <Text style={estilos.intro}>
        Los términos activos bloquean el envío de mensajes en el chat clínico. El texto
        bloqueado no se guarda: el autor tiene que reescribirlo.
      </Text>

      <View style={estilos.tarjeta}>
        <Text style={estilos.etiqueta}>Agregar término</Text>
        <TextInput
          style={estilos.campo}
          placeholder="Palabra o expresión"
          placeholderTextColor={colores.textoTenue}
          value={termino}
          onChangeText={setTermino}
          autoCapitalize="none"
          maxLength={80}
        />

        <View style={estilos.filaCategorias}>
          {CATEGORIAS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[estilos.categoria, categoria === c && estilos.categoriaElegida]}
              onPress={() => setCategoria(c)}
              activeOpacity={interaccion.opacidadActiva}
            >
              <Text style={[estilos.categoriaTexto, categoria === c && estilos.categoriaTextoElegida]}>
                {c.replace('_', ' ').toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CU62: explicación de los términos críticos que se escalan */}
        {categoria === 'CRITICO' && (
          <Text style={estilos.ayudaCritico}>
            Los términos críticos no bloquean el texto: se guarda igual y el caso se escala a la bandeja de
            Eventos críticos, avisando a los administradores con sesión activa. Se revisan los reportes de
            síntomas, las reseñas y los tickets; el chat no, porque es privado entre paciente y profesional.
          </Text>
        )}

        <TouchableOpacity
          style={[estilos.boton, guardando && estilos.deshabilitado]}
          onPress={agregar}
          disabled={guardando}
          activeOpacity={interaccion.opacidadActiva}
        >
          <Text style={estilos.botonTexto}>{guardando ? 'Guardando…' : 'Agregar al diccionario'}</Text>
        </TouchableOpacity>

        <Text style={estilos.ayuda}>
          La comparación ignora mayúsculas, acentos y letras repetidas, y respeta los límites
          de palabra: "casa" no bloquea "casado".
        </Text>
      </View>

      <Text style={estilos.seccion}>
        {activas} término(s) activo(s) de {palabras.length}
      </Text>

      {palabras.map((p) => (
        <View key={p.palabra_restringida_id} style={estilos.fila}>
          <View style={estilos.filaTexto}>
            <Text style={[estilos.termino, !p.activa && estilos.terminoInactivo]}>{p.termino}</Text>
            <Text style={estilos.categoriaEtiqueta}>{String(p.categoria).toLowerCase()}</Text>
          </View>
          <Switch
            value={Boolean(p.activa)}
            onValueChange={(v) => alternar(p, v)}
            trackColor={{ false: colores.borde, true: colores.azul[300] }}
            thumbColor={p.activa ? colores.primario : colores.superficie}
          />
          <TouchableOpacity onPress={() => setPorEliminar(p)} activeOpacity={interaccion.opacidadActiva}>
            <Text style={estilos.eliminar}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      ))}

      <DialogoConfirmacion
        visible={porEliminar !== null}
        titulo="Eliminar término"
        mensaje={
          porEliminar
            ? `"${porEliminar.termino}" saldrá del diccionario y dejará de bloquear mensajes. Si solo quieres pausarlo, usa el interruptor.`
            : ''
        }
        etiquetaConfirmar="Eliminar"
        tono="peligro"
        onConfirmar={() => eliminar(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
      />

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </VistaConTeclado>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.lg },
  etiqueta: { ...piezas.etiqueta },
  campo: { ...piezas.campo },
  ayuda: { ...tipografia.meta, color: colores.textoTenue, marginTop: espacio.md },
  ayudaCritico: { ...tipografia.meta, color: colores.error, marginTop: espacio.sm },

  filaCategorias: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, marginTop: espacio.md },
  categoria: {
    paddingVertical: espacio.xs,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
  },
  categoriaElegida: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  categoriaTexto: { ...tipografia.micro, color: colores.textoSuave },
  categoriaTextoElegida: { color: colores.primario },

  boton: { ...piezas.botonPrimario, marginTop: espacio.base },
  botonTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
  deshabilitado: { opacity: 0.6 },

  seccion: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.md },
  fila: {
    ...piezas.tarjeta,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.md,
    marginBottom: espacio.sm,
  },
  filaTexto: { flex: 1 },
  termino: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  // El inactivo se ve tachado: sigue en la lista pero no filtra.
  terminoInactivo: { color: colores.textoTenue, textDecorationLine: 'line-through' },
  categoriaEtiqueta: { ...tipografia.micro, color: colores.textoTenue },
  eliminar: { ...tipografia.meta, color: colores.error },
});
