/**
 * Componente: Cliente Móvil — Vista "Prevención y alta"
 * Casos de uso: CU51, CU37, CU32.
 */
// Ruta: fro-vista/src/screens/Paciente/PreparacionAltaScreen.js
//
// CU51 — Pestaña "Prevención y alta" de Mi Tratamiento. Muestra cuánto falta
// para el umbral de egreso y, una vez alcanzado, los contenidos de prevención
// y mantenimiento. Cuando el profesional emite el alta (CU37), aquí quedan el
// informe y las pautas de continuidad.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator, RefreshControl, Linking, StyleSheet,
} from 'react-native';

import { getMiAlta } from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import Icono from '../../components/Icono';
import { formatearFecha } from '../../utils/fechas';
import { colores, espacio, piezas, radio, tipografia, interaccion } from '../../theme';

const ICONO_TIPO = { VIDEO: 'videocam-outline', GUIA: 'document-text-outline', PLANTILLA: 'document-text-outline' };

export default function PreparacionAltaScreen({ navigation }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState(false);
  const [aviso, setAviso] = useState(null);
  // Exc. 4: las imágenes que no cargan se reemplazan por un marcador.
  const [imagenesRotas, setImagenesRotas] = useState({});

  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    else setCargando(true);
    setError(false);
    try {
      const recibido = await getMiAlta();
      setDatos(recibido);
      if (recibido?.recien_habilitada) {
        setAviso({
          tono: 'ok',
          titulo: '¡Alcanzaste el umbral!',
          mensaje: 'Tus metas llegaron al nivel de egreso. Ya puedes ver tus contenidos de prevención y mantenimiento.',
        });
      }
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

  // CU51: abre un contenido de prevención habilitado
  const abrirRecurso = async (recurso) => {
    try {
      const soportado = await Linking.canOpenURL(recurso.url_archivo);
      if (!soportado) throw new Error('no soportado');
      await Linking.openURL(recurso.url_archivo);
    } catch {
      setAviso({ tono: 'error', titulo: 'No se pudo abrir', mensaje: 'El contenido no está disponible en este momento. Intenta más tarde.' });
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
        <ErrorRetry mensaje="No pudimos cargar tu preparación para el alta." onRetry={() => cargar()} />
      </View>
    );
  }

  const porcentaje = datos?.porcentaje;
  const umbral = datos?.umbral ?? 80;
  const habilitada = Boolean(datos?.habilitada);
  const episodio = datos?.episodio;
  const informe = episodio?.informe;

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} colors={[colores.primario]} />}
    >
      {!datos?.hay_episodio ? (
        <View style={estilos.vacio}>
          <Text style={estilos.vacioIcono}>🌱</Text>
          <Text style={estilos.vacioTitulo}>Todavía no tienes un tratamiento en curso</Text>
          <Text style={estilos.vacioTexto}>
            Cuando tu profesional abra un episodio clínico y defina tus metas, aquí verás tu avance hacia el alta.
          </Text>
        </View>
      ) : (
        <>
          {/* Avance hacia el umbral de egreso */}
          <View style={estilos.tarjeta}>
            <Text style={estilos.titulo}>Tu avance hacia el alta</Text>
            <Text style={estilos.meta}>Episodio: {episodio.motivo_consulta}</Text>
            {porcentaje === null ? (
              <Text style={estilos.ayuda}>Tu profesional aún no define metas medibles para este episodio.</Text>
            ) : (
              <>
                <View style={estilos.barraFondo}>
                  <View style={[estilos.barraAvance, { width: `${Math.min(100, porcentaje)}%` }]} />
                  <View style={[estilos.marcaUmbral, { left: `${Math.min(100, umbral)}%` }]} />
                </View>
                <View style={estilos.filaCifras}>
                  <Text style={estilos.cifra}>{porcentaje} % de tus metas</Text>
                  <Text style={estilos.cifraSuave}>umbral de egreso {umbral} %</Text>
                </View>
                <Text style={estilos.ayuda}>
                  {habilitada
                    ? `Alcanzaste el umbral${episodio.preparacion_alta_en ? ` el ${formatearFecha(episodio.preparacion_alta_en)}` : ''}. Tus contenidos de prevención están habilitados.`
                    : `Te faltan ${Math.max(0, umbral - porcentaje)} puntos para habilitar tus contenidos de prevención y mantenimiento.`}
                </Text>
              </>
            )}
            {datos.contradicciones?.length > 0 && (
              <View style={estilos.avisoAmbar}>
                <Text style={estilos.avisoAmbarTitulo}>Hay metas que no se pueden medir</Text>
                <Text style={estilos.avisoAmbarTexto}>
                  Tu profesional debe revisarlas antes de que se habilite la preparación para el alta.
                </Text>
              </View>
            )}
          </View>

          {/* Metas */}
          {/* CU32: metas terapéuticas definidas por el profesional */}
          {datos.metas?.length > 0 && (
            <View style={estilos.tarjeta}>
              <Text style={estilos.titulo}>Tus metas</Text>
              {datos.metas.map((m) => (
                <View key={m.objetivo_terapeutico_id} style={estilos.filaMeta}>
                  <Text style={estilos.metaTexto} numberOfLines={2}>{m.descripcion}</Text>
                  <Text style={estilos.metaCifra}>
                    {m.porcentaje === null ? '—' : `${m.porcentaje} %`}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* CU37: informe de alta ya emitido */}
          {informe && (
            <View style={[estilos.tarjeta, estilos.tarjetaInforme]}>
              <Text style={estilos.titulo}>Tu informe de alta</Text>
              <Text style={estilos.meta}>Emitido el {formatearFecha(informe.emitido_en || informe.fecha)}</Text>
              {episodio.pautas_continuidad ? (
                <>
                  <Text style={estilos.subtitulo}>Pautas de continuidad</Text>
                  <Text style={estilos.parrafo}>{episodio.pautas_continuidad}</Text>
                </>
              ) : null}
              <TouchableOpacity
                style={estilos.botonPrimario}
                onPress={() => navigation.navigate('VisorDocumento', { documentoId: informe.documento_id, nombre: informe.nombre })}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={estilos.botonPrimarioTexto}>Ver informe de alta</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Contenidos de prevención */}
          {habilitada && (
            <>
              <Text style={estilos.seccion}>Prevención y mantenimiento</Text>
              <Text style={estilos.ayudaSeccion}>
                Contenidos para cuidar lo que lograste en tu tratamiento.
              </Text>
              {datos.recursos.length === 0 ? (
                <Text style={estilos.ayuda}>Todavía no hay contenidos publicados para tu especialidad.</Text>
              ) : (
                datos.recursos.map((r) => {
                  const conImagen = r.imagen_url && !imagenesRotas[r.material_terapeutico_id];
                  return (
                    <TouchableOpacity
                      key={r.material_terapeutico_id}
                      style={estilos.recurso}
                      onPress={() => abrirRecurso(r)}
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      {conImagen ? (
                        <Image
                          source={{ uri: r.imagen_url }}
                          style={estilos.imagen}
                          onError={() => setImagenesRotas((previas) => ({ ...previas, [r.material_terapeutico_id]: true }))}
                        />
                      ) : (
                        <View style={[estilos.imagen, estilos.imagenMarcador]}>
                          <Icono name={ICONO_TIPO[r.tipo] || 'document-text-outline'} size={34} color={colores.primario} />
                        </View>
                      )}
                      <View style={estilos.recursoTextos}>
                        <Text style={estilos.recursoNombre}>{r.nombre}</Text>
                        <Text style={estilos.recursoMeta}>{r.categoria} · {r.tipo} · {r.formato}</Text>
                        <Text style={estilos.recursoAbrir}>Abrir ›</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </>
      )}

      <DialogoAviso
        visible={aviso !== null}
        titulo={aviso?.titulo || ''}
        mensaje={aviso?.mensaje}
        tono={aviso?.tono}
        onCerrar={() => setAviso(null)}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.xl, backgroundColor: colores.fondo },

  tarjeta: { ...piezas.tarjeta, marginBottom: espacio.md },
  tarjetaInforme: { backgroundColor: colores.secundarioSuave, borderColor: colores.secundarioBorde },
  titulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs },
  subtitulo: { ...tipografia.metaFuerte, color: colores.textoSuave, marginTop: espacio.md, marginBottom: espacio.xs },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.md },
  parrafo: { ...tipografia.cuerpo, color: colores.texto },
  ayuda: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.sm },

  barraFondo: { height: 12, borderRadius: radio.completo, backgroundColor: colores.superficieSuave, overflow: 'visible' },
  barraAvance: { height: 12, borderRadius: radio.completo, backgroundColor: colores.primario },
  marcaUmbral: { position: 'absolute', top: -4, width: 2, height: 20, backgroundColor: colores.secundarioFuerte },
  filaCifras: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espacio.sm },
  cifra: { ...tipografia.cuerpoFuerte, color: colores.primario },
  cifraSuave: { ...tipografia.meta, color: colores.secundarioFuerte },

  avisoAmbar: {
    marginTop: espacio.md, padding: espacio.md, borderRadius: radio.md,
    backgroundColor: colores.advertenciaSuave, borderWidth: 1, borderColor: colores.advertenciaBorde,
  },
  avisoAmbarTitulo: { ...tipografia.metaFuerte, color: colores.advertencia },
  avisoAmbarTexto: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },

  filaMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: espacio.sm, borderTopWidth: 1, borderTopColor: colores.bordeSuave },
  metaTexto: { ...tipografia.cuerpo, color: colores.texto, flex: 1, paddingRight: espacio.md },
  metaCifra: { ...tipografia.cuerpoFuerte, color: colores.primario },

  seccion: { ...tipografia.subtitulo, color: colores.textoTitulo, marginTop: espacio.lg },
  ayudaSeccion: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.md },
  recurso: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', padding: espacio.md, marginBottom: espacio.md },
  imagen: { width: 84, height: 64, borderRadius: radio.md, backgroundColor: colores.primarioSuave, marginRight: espacio.md },
  imagenMarcador: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colores.primarioBorde },
  recursoTextos: { flex: 1 },
  recursoNombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  recursoMeta: { ...tipografia.meta, color: colores.textoSuave, marginTop: 2 },
  recursoAbrir: { ...tipografia.metaFuerte, color: colores.primario, marginTop: espacio.xs },

  botonPrimario: { ...piezas.botonPrimario, marginTop: espacio.md },
  botonPrimarioTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },

  vacio: { alignItems: 'center', paddingTop: espacio.xxxl },
  vacioIcono: { fontSize: 44, marginBottom: espacio.md },
  vacioTitulo: { ...tipografia.subtitulo, color: colores.textoTitulo, marginBottom: espacio.xs, textAlign: 'center' },
  vacioTexto: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center', paddingHorizontal: espacio.xl },
});
