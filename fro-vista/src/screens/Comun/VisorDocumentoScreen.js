// Ruta: fro-vista/src/screens/Comun/VisorDocumentoScreen.js
//
// CU35: visor embebido de documentos clínicos. Renderiza el contenido sin
// descarga persistente en el teléfono: imágenes con el componente nativo,
// PDF y video dentro de un visor web incrustado. El backend valida el RBAC
// antes de entregar la URL y registra cada visualización (o intento
// denegado) en la bitácora.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';

import apiClient from '../../api/client';
import ErrorRetry from '../../components/ErrorRetry';
import { formatearFecha } from '../../utils/fechas';
import { colores, radio } from '../../theme';

export default function VisorDocumentoScreen({ route }) {
  const { documentoId, nombre } = route?.params || {};

  const [documento, setDocumento] = useState(null);
  const [errorCarga, setErrorCarga] = useState('');
  // Excepción 4: falla del renderizador embebido → código de error + recarga.
  const [errorVisor, setErrorVisor] = useState(false);
  const [claveVisor, setClaveVisor] = useState(0);

  const cargar = async () => {
    setErrorCarga('');
    try {
      const { data } = await apiClient.get(`/clinica/documentos/${documentoId}/ver`);
      setDocumento(data.documento);
    } catch (error) {
      const respuesta = error.response?.data;
      // Excepción 2: acceso denegado queda registrado en el log del servidor.
      setErrorCarga(
        respuesta?.mensaje ||
          (error.response?.status === 403
            ? 'No tienes autorización para visualizar este documento.'
            : 'No se pudo preparar el visor. Revisa tu conexión.')
      );
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const recargarVisor = () => {
    setErrorVisor(false);
    setClaveVisor((n) => n + 1);
  };

  if (errorCarga !== '') {
    return (
      <View style={estilos.centrado}>
        <ErrorRetry mensaje={errorCarga} onRetry={cargar} />
      </View>
    );
  }

  if (!documento) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (errorVisor) {
    return (
      <View style={estilos.centrado}>
        <Text style={estilos.codigoError}>ERROR_RENDER_VISOR</Text>
        <Text style={estilos.textoError}>
          El visor embebido falló al renderizar el contenido.
        </Text>
        <TouchableOpacity style={estilos.botonRecarga} onPress={recargarVisor}>
          <Text style={estilos.botonRecargaTexto}>Recargar visor</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Abrir/descargar el original con el navegador del teléfono. Para un PDF
  // depende de que Cloudinary tenga habilitada la entrega de PDF; si no, el
  // navegador mostrará un error de acceso.
  const abrirOriginal = async () => {
    const url = documento.url_descarga || documento.url_publica;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No se pudo abrir', 'El teléfono no pudo abrir el enlace del archivo.');
    }
  };

  // DOCX (D5) llega con url_visor apuntando al visor de Google; el resto usa
  // la URL pública directa.
  const urlVisor = documento.url_visor || documento.url_publica;

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.cabecera}>
        <Text style={estilos.nombre} numberOfLines={1}>
          {nombre || documento.nombre_original}
        </Text>
        <Text style={estilos.detalle}>
          {documento.formato?.toUpperCase()} ·{' '}
          {formatearFecha(documento.fecha_carga)}
          {documento.visor === 'pdf' && documento.paginas ? ` · ${documento.paginas} página(s)` : ''}
          {documento.visor === 'documento' ? ' · documento Word' : ''}
          {' '}· solo visualización
        </Text>
        <TouchableOpacity style={estilos.botonOriginal} onPress={abrirOriginal}>
          <Text style={estilos.botonOriginalTexto}>⬇️ Abrir / descargar original</Text>
        </TouchableOpacity>
      </View>

      {documento.visor === 'pdf' ? (
        // PDF: cada página llega como imagen desde el repositorio. No usa el
        // visor de Google, que mostraba "no hay vista previa".
        <ScrollView key={claveVisor} contentContainerStyle={estilos.paginas}>
          {(documento.paginas_urls || []).map((url, i) => (
            <View key={url} style={estilos.pagina}>
              <Image
                source={{ uri: url }}
                style={estilos.imagenPagina}
                resizeMode="contain"
                onError={() => i === 0 && setErrorVisor(true)}
              />
              <Text style={estilos.numeroPagina}>
                Página {i + 1}{documento.paginas ? ` de ${documento.paginas}` : ''}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : documento.visor === 'imagen' ? (
        <Image
          key={claveVisor}
          source={{ uri: documento.url_publica }}
          style={estilos.imagen}
          resizeMode="contain"
          onError={() => setErrorVisor(true)}
        />
      ) : (
        <WebView
          key={claveVisor}
          source={{ uri: urlVisor }}
          style={estilos.web}
          onError={() => setErrorVisor(true)}
          onHttpError={() => setErrorVisor(true)}
          allowsFullscreenVideo
          startInLoadingState
          renderLoading={() => (
            <View style={estilos.centrado}>
              <ActivityIndicator size="large" color={colores.primario} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.neutro[900] },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colores.fondo },

  cabecera: { padding: 12, backgroundColor: colores.secundario },
  nombre: { color: colores.superficie, fontWeight: 'bold' },
  detalle: { color: colores.textoTenue, fontSize: 13, marginTop: 2 },

  imagen: { flex: 1 },
  web: { flex: 1 },

  botonOriginal: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colores.textoTenue,
    borderRadius: radio.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  botonOriginalTexto: { color: colores.bordeSuave, fontSize: 13, fontWeight: '600' },

  paginas: { padding: 8, paddingBottom: 30 },
  pagina: { marginBottom: 12 },
  imagenPagina: { width: '100%', aspectRatio: 0.7071, backgroundColor: colores.superficie, borderRadius: radio.sm },
  numeroPagina: { color: colores.textoTenue, fontSize: 11, textAlign: 'center', marginTop: 4 },

  codigoError: { fontWeight: 'bold', color: colores.error, fontSize: 17, marginBottom: 6 },
  textoError: { color: colores.textoSuave, textAlign: 'center', marginBottom: 16 },
  botonRecarga: {
    backgroundColor: colores.primario,
    borderRadius: radio.sm,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  botonRecargaTexto: { color: colores.superficie, fontWeight: 'bold' },
});
