// Ruta: fro-vista/src/screens/Profesional/MiPerfilScreen.js
//
// CU10 — Administrando catálogo de perfil profesional (decisión D1).
// El profesional edita lo que el paciente ve al buscar hora: fotografía,
// reseña curricular, áreas de experticia y modalidad general de atención.
// La foto viaja al repositorio en la nube (misma infraestructura del CU33).

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';

import apiClient, { getComunas } from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import ErrorRetry from '../../components/ErrorRetry';
import DialogoAviso from '../../components/DialogoAviso';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PieDePerfil } from '../Comun/SeguridadScreen';
import { colores, espacio, radio, sombra, tipografia, piezas, interaccion } from '../../theme';

const MODALIDADES = [
  { valor: 'DOMICILIO', etiqueta: 'A domicilio' },
  { valor: 'ONLINE', etiqueta: 'Virtual' },
  { valor: 'AMBOS', etiqueta: 'A domicilio y virtual' },
];

// comoPestana: la pestaña "Perfil" de la barra del profesional. Bajo "Guardar
// cambios" suma la seguridad de la cuenta, Ayuda y soporte y Cerrar sesión, y
// arriba a la derecha el acceso a Mis liquidaciones.
export default function MiPerfilScreen({ navigation, comoPestana = false }) {
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null);

  const [resena, setResena] = useState('');
  const [areas, setAreas] = useState('');
  const [modalidad, setModalidad] = useState('DOMICILIO');
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [erroresCampo, setErroresCampo] = useState({});
  // CU14: comunas donde atiende a domicilio. Sin ninguna elegida aparece en
  // todas, así que conviene decirlo en pantalla.
  const [comunas, setComunas] = useState([]);
  const [comunasElegidas, setComunasElegidas] = useState([]);

  const cargar = async () => {
    setError('');
    try {
      const { data } = await apiClient.get('/profesionales/mi-perfil');
      setPerfil(data);
      setResena(data.resena_curricular || '');
      setAreas(data.areas_experticia || '');
      setModalidad(data.tipo_sede || 'DOMICILIO');
      setComunasElegidas((data.comunas || []).map((c) => c.comuna_id));
      try {
        setComunas(await getComunas());
      } catch {
        // El catálogo de comunas es secundario: el resto del perfil sigue útil.
        setComunas([]);
      }
    } catch (err) {
      // CU10 Exc.1: el módulo no carga.
      setError(err.response?.data?.error || 'No se pudo cargar tu perfil. Revisa tu conexión.');
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const limiteResena = perfil?.limites?.resena || 1000;
  const limiteAreas = perfil?.limites?.areas || 255;

  const guardar = async () => {
    // CU10 Exc.4 y Exc.5: largo de la reseña y modalidad obligatoria.
    const errores = {};
    if (resena.length > limiteResena) errores.resena = `Máximo ${limiteResena} caracteres.`;
    if (areas.length > limiteAreas) errores.areas = `Máximo ${limiteAreas} caracteres.`;
    if (!modalidad) errores.modalidad = 'Indica la modalidad de atención.';
    setErroresCampo(errores);
    if (Object.keys(errores).length > 0) return;

    setGuardando(true);
    try {
      const { data } = await apiClient.put('/profesionales/mi-perfil', {
        resena_curricular: resena,
        areas_experticia: areas,
        tipo_sede: modalidad,
        comunas: comunasElegidas,
      });
      setAviso({ tono: 'ok', titulo: 'Perfil actualizado', mensaje: data.mensaje });
    } catch (err) {
      const respuesta = err.response?.data;
      // CU10 Exc.6: fallo de persistencia.
      setAviso({ tono: 'error', titulo: 'No se pudo guardar', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  };

  const elegirFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setAviso({ tono: 'info', titulo: 'Permiso necesario', mensaje: 'Autoriza el acceso a tus fotos para cambiar la imagen de perfil.' });
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (resultado.canceled || !resultado.assets?.length) return;

    const activo = resultado.assets[0];
    const nombre = activo.fileName || `perfil-${Date.now()}.jpg`;

    setSubiendoFoto(true);
    try {
      const formulario = new FormData();
      formulario.append('foto', {
        uri: activo.uri,
        name: nombre,
        type: activo.mimeType || 'image/jpeg',
      });
      const { data } = await apiClient.post('/profesionales/mi-perfil/foto', formulario, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPerfil((previo) => ({ ...previo, foto_url: data.foto_url }));
      setAviso({ tono: 'ok', titulo: 'Fotografía actualizada', mensaje: data.mensaje });
    } catch (err) {
      const respuesta = err.response?.data;
      // CU10 Exc.3: formato o peso no permitidos, o repositorio no disponible.
      setAviso({ tono: 'error', titulo: 'No se pudo subir la foto', mensaje: respuesta?.mensaje || respuesta?.error || 'Intenta nuevamente.' });
    } finally {
      setSubiendoFoto(false);
    }
  };

  // Fuera de la pestaña, la pantalla sin perfil es solo el error o la carga.
  // En la pestaña se sigue mostrando el resto (cerrar sesión debe estar siempre).
  if (!comoPestana && error) {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje={error} onRetry={cargar} />
      </View>
    );
  }
  if (!comoPestana && !perfil) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  const iniciales = perfil
    ? `${perfil.nombres?.[0] || ''}${perfil.apellido_paterno?.[0] || ''}`.toUpperCase()
    : '';

  return (
    <VistaConTeclado style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={estilos.filaIntro}>
        <Text style={[estilos.intro, estilos.introTexto]}>
          Así te ven los pacientes al buscar una hora. Los cambios se publican de inmediato.
        </Text>
        {comoPestana && (
          <TouchableOpacity
            style={estilos.botonLiquidaciones}
            onPress={() => navigation.navigate('MisLiquidaciones')}
            activeOpacity={interaccion.opacidadActiva}
            accessibilityRole="button"
          >
            <Ionicons name="wallet-outline" size={18} color={colores.primario} />
            <Text style={estilos.botonLiquidacionesTexto}>Mis liquidaciones</Text>
          </TouchableOpacity>
        )}
      </View>

      {error ? (
        <View style={estilos.estadoEnLinea}>
          <ErrorRetry mensaje={error} onRetry={cargar} />
        </View>
      ) : !perfil ? (
        <ActivityIndicator size="large" color={colores.primario} style={estilos.estadoEnLinea} />
      ) : (
        <>
          {/* Fotografía */}
          <View style={estilos.bloqueFoto}>
            {perfil.foto_url ? (
              <Image source={{ uri: perfil.foto_url }} style={estilos.foto} />
            ) : (
              <View style={[estilos.foto, estilos.fotoVacia]}>
                <Text style={estilos.iniciales}>{iniciales || '👤'}</Text>
              </View>
            )}
            <View style={estilos.fotoTexto}>
              <Text style={estilos.nombre}>
                {perfil.nombres} {perfil.apellido_paterno} {perfil.apellido_materno}
              </Text>
              <Text style={estilos.meta}>{perfil.especialidad || 'Sin especialidad'} · Reg. {perfil.num_registro_salud}</Text>
              {/* CU58: la misma calificación que ven los pacientes al buscar hora */}
              {perfil.total_evaluaciones > 0 ? (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('ResenasProfesional', {
                      profesionalId: perfil.profesional_id,
                      nombre: 'Mis evaluaciones',
                    })
                  }
                  activeOpacity={interaccion.opacidadActiva}
                >
                  <Text style={estilos.calificacion}>
                    {'★'.repeat(Math.round(perfil.calificacion_promedio))}
                    {'☆'.repeat(5 - Math.round(perfil.calificacion_promedio))}{'  '}
                    {perfil.calificacion_promedio.toFixed(1)} ({perfil.total_evaluaciones})
                  </Text>
                  <Text style={estilos.verEvaluaciones}>Ver evaluaciones ›</Text>
                </TouchableOpacity>
              ) : (
                <Text style={estilos.ayuda}>Perfil nuevo · sin evaluaciones aún</Text>
              )}
              <TouchableOpacity
                style={estilos.botonFoto}
                onPress={elegirFoto}
                disabled={subiendoFoto}
                activeOpacity={interaccion.opacidadActiva}
              >
                <Text style={estilos.botonFotoTexto}>
                  {subiendoFoto ? 'Subiendo…' : perfil.foto_url ? 'Cambiar fotografía' : 'Agregar fotografía'}
                </Text>
              </TouchableOpacity>
              <Text style={estilos.ayuda}>JPG, PNG o WEBP · hasta {perfil.limites?.foto_mb || 5} MB</Text>
            </View>
          </View>

          {/* Reseña */}
          <Text style={estilos.etiqueta}>Reseña curricular</Text>
          <TextInput
            style={[estilos.campo, estilos.campoLargo, erroresCampo.resena && estilos.campoError]}
            placeholder="Formación, experiencia y enfoque de atención"
            placeholderTextColor={colores.textoTenue}
            multiline
            value={resena}
            onChangeText={setResena}
          />
          <Text style={[estilos.contador, resena.length > limiteResena && estilos.contadorError]}>
            {resena.length}/{limiteResena}
          </Text>
          {erroresCampo.resena ? <Text style={estilos.textoError}>{erroresCampo.resena}</Text> : null}

          {/* Áreas de experticia */}
          <Text style={estilos.etiqueta}>Áreas de experticia</Text>
          <TextInput
            style={[estilos.campo, erroresCampo.areas && estilos.campoError]}
            placeholder="Ej: rehabilitación deportiva, columna, adulto mayor"
            placeholderTextColor={colores.textoTenue}
            value={areas}
            onChangeText={setAreas}
          />
          <Text style={estilos.ayuda}>Sepáralas con comas. Se muestran junto a tu nombre en el buscador de horas.</Text>
          {erroresCampo.areas ? <Text style={estilos.textoError}>{erroresCampo.areas}</Text> : null}

          {/* Modalidad */}
          <Text style={estilos.etiqueta}>Modalidad general de atención</Text>
          <View style={[estilos.selector, erroresCampo.modalidad && estilos.campoError]}>
            <Picker selectedValue={modalidad} onValueChange={setModalidad} dropdownIconColor={colores.primario}>
              {MODALIDADES.map((opcion) => (
                <Picker.Item key={opcion.valor} label={opcion.etiqueta} value={opcion.valor} />
              ))}
            </Picker>
          </View>
          <Text style={estilos.ayuda}>
            Cada bloque de tu jornada puede tener su propia modalidad; esta es la que se muestra como general.
          </Text>

          {/* Comunas de atención a domicilio */}
          <Text style={estilos.etiqueta}>Comunas donde atiendes a domicilio</Text>
          {comunas.length === 0 ? (
            <Text style={estilos.ayuda}>No se pudo cargar el listado de comunas.</Text>
          ) : (
            <>
              <View style={estilos.comunas}>
                {comunas.map((comuna) => {
                  const elegida = comunasElegidas.includes(comuna.comuna_id);
                  return (
                    <TouchableOpacity
                      key={comuna.comuna_id}
                      style={[estilos.comuna, elegida && estilos.comunaElegida]}
                      onPress={() =>
                        setComunasElegidas((previas) =>
                          previas.includes(comuna.comuna_id)
                            ? previas.filter((id) => id !== comuna.comuna_id)
                            : [...previas, comuna.comuna_id]
                        )
                      }
                      activeOpacity={interaccion.opacidadActiva}
                    >
                      <Text style={[estilos.comunaTexto, elegida && estilos.comunaTextoElegida]}>
                        {elegida ? '✓ ' : ''}{comuna.nombre}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={estilos.ayuda}>
                {comunasElegidas.length === 0
                  ? 'Sin comunas elegidas apareces en las búsquedas de todas las comunas. Elige las tuyas para que solo te vean los pacientes a los que puedes llegar.'
                  : `Elegidas: ${comunasElegidas.length}. Los pacientes de otras comunas no verán tus horas a domicilio; las teleconsultas no dependen de la comuna.`}
              </Text>
            </>
          )}

          {/* La jornada semanal se edita en su propia pantalla. */}
          <Text style={estilos.etiqueta}>Horarios de atención</Text>
          <TouchableOpacity
            style={estilos.botonHorarios}
            onPress={() => navigation.navigate('MisHorarios')}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={estilos.botonHorariosTexto}>🕘 Gestionar mis bloques horarios</Text>
            <Text style={estilos.botonHorariosFlecha}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[estilos.botonGuardar, guardando && estilos.botonDeshabilitado]}
            onPress={guardar}
            disabled={guardando}
            activeOpacity={interaccion.opacidadActiva}
          >
            <Text style={estilos.botonGuardarTexto}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Text>
          </TouchableOpacity>
        </>
      )}

      {comoPestana && <PieDePerfil navigation={navigation} tituloSeguridad="Seguridad de la cuenta" />}

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
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg, paddingBottom: espacio.xxl },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espacio.lg, backgroundColor: colores.fondo },
  intro: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.base },
  filaIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: espacio.md },
  introTexto: { flex: 1 },
  botonLiquidaciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.primarioBorde,
    backgroundColor: colores.superficie,
    ...sombra.suave,
  },
  botonLiquidacionesTexto: { ...tipografia.metaFuerte, color: colores.primario },
  estadoEnLinea: { paddingVertical: espacio.xxl, alignItems: 'center' },

  bloqueFoto: { ...piezas.tarjeta, flexDirection: 'row', alignItems: 'center', marginBottom: espacio.lg },
  foto: { width: 84, height: 84, borderRadius: 42, backgroundColor: colores.primarioSuave },
  fotoVacia: { justifyContent: 'center', alignItems: 'center' },
  iniciales: { ...tipografia.titulo, color: colores.primario },
  fotoTexto: { flex: 1, marginLeft: espacio.base },
  nombre: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo },
  meta: { ...tipografia.meta, color: colores.textoSuave, marginBottom: espacio.sm },
  calificacion: { ...tipografia.meta, color: colores.secundarioFuerte },
  verEvaluaciones: { ...tipografia.micro, color: colores.primario, marginTop: 2, marginBottom: espacio.sm },
  botonFoto: { ...piezas.botonSecundario, paddingVertical: espacio.sm, alignSelf: 'flex-start' },
  botonFotoTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },

  etiqueta: { ...piezas.etiqueta, marginTop: espacio.md },
  campo: { ...piezas.campo },
  campoLargo: { minHeight: 110, textAlignVertical: 'top' },
  campoError: { borderColor: colores.error },
  selector: { ...piezas.campo, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' },
  contador: { ...tipografia.micro, color: colores.textoTenue, textAlign: 'right', marginTop: 4 },
  contadorError: { color: colores.error },
  ayuda: { ...tipografia.meta, color: colores.textoTenue, marginTop: 4 },
  textoError: { ...tipografia.meta, color: colores.error, marginTop: 4 },

  comunas: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, marginTop: espacio.sm },
  comuna: {
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: radio.completo,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    backgroundColor: colores.superficie,
  },
  comunaElegida: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  comunaTexto: { ...tipografia.meta, color: colores.textoSuave, fontWeight: '600' },
  comunaTextoElegida: { color: colores.primario },

  botonHorarios: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colores.primarioBorde,
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.base,
    marginTop: espacio.xs,
  },
  botonHorariosTexto: { ...tipografia.cuerpoFuerte, color: colores.primario },
  botonHorariosFlecha: { ...tipografia.subtitulo, color: colores.primario },
  botonGuardar: { ...piezas.botonPrimario, alignItems: 'center', marginTop: espacio.xl },
  botonDeshabilitado: { opacity: 0.6 },
  botonGuardarTexto: { ...tipografia.cuerpoFuerte, color: colores.textoInverso },
});
