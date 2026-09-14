import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert 
} from 'react-native';
import { validateRut } from '../../utils/validators'; 

// Importamos el cliente centralizado de Axios
import apiClient from '../../api/client';
import { Platform } from 'react-native';
import VistaConTeclado from '../../components/VistaConTeclado';
import LogoFro from '../../components/LogoFro';
import { obtenerDispositivoId, nombreDispositivo } from '../../utils/dispositivo';
import { colores, espacio, radio, sombra, tipografia, piezas } from '../../theme';

export default function LoginScreen({ navigation }) {
  // --- ESTADOS LOCALES ---
  const [rut, setRut] = useState('');
  const [password, setPassword] = useState('');
  const [rutError, setRutError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { loginSession } = useContext(AuthContext);

  // --- VALIDACIÓN SINTÁCTICA EN TIEMPO REAL (Excepción 1) ---
  useEffect(() => {
    const rutLimpio = rut.replace(/[^0-9kK]/g, '');
    
    if (rutLimpio.length >= 8) {
      if (!validateRut(rut)) {
        setRutError('⚠️ Formato de RUT inválido (Módulo 11 incorrecto).');
      } else {
        setRutError('');
      }
    } else if (rutLimpio.length > 0) {
      setRutError('');
    }
  }, [rut]); 

  const isFormValid = password.length > 0 && validateRut(rut);

  // --- DESPACHO DE PETICIÓN HTTP ---
  const handleLogin = async () => {
    setLoginError('');
    setIsLoading(true);

    try {
      const response = await apiClient.post('/auth/login', {
        // CU08: el nombre del dispositivo aparece en "Sesiones activas", y el
        // identificador evita que reingresar desde este mismo teléfono sume
        // una sesión nueva en vez de reemplazar la anterior.
        dispositivo: nombreDispositivo(),
        dispositivo_id: await obtenerDispositivoId(),
        rut: rut,
        contrasena: password
      });

      setIsLoading(false);
      const { token, usuario, mensaje } = response.data;

      await loginSession(token, usuario);
      console.log("✅ Sesión guardada globalmente para el rol:", usuario.rol);
      
    } catch (error) {
      // 3. BLOQUE DE CAPTURA DE ERRORES
      setIsLoading(false);

      if (error.response) {
        // El servidor respondió con un error conocido (Excepciones 2 y 4)
        if (error.response.status === 401) {
          // EXCEPCIÓN 4: Credenciales inválidas (Denegación de acceso)
          setLoginError('Credenciales inválidas. Verifique su RUT y contraseña.');
        } else if (error.response.status === 500) {
          // EXCEPCIÓN 2: Fallo criptográfico o de base de datos en el servidor
          setLoginError('Servicio no disponible temporalmente. Intente nuevamente en unos segundos.');
        } else {
          // Cualquier otro error del backend no mapeado
          setLoginError(error.response.data.error || 'Ocurrió un error en la autenticación.');
        }
      } else {
        // EXCEPCIÓN 3: El servidor nunca respondió (Caída de red o servidor apagado)
        setLoginError('Error de conexión con el servidor. Revise su internet o verifique que el backend esté encendido.');
      }
    }
  };

  return (
    <VistaConTeclado style={styles.fondo} contentContainerStyle={styles.container}>
      <View style={styles.headerContainer}>
        <LogoFro tamano="lg" conNombre />
        <Text style={styles.subtitle}>Portal de acceso seguro</Text>
      </View>

      <View style={styles.formContainer}>
        
        <Text style={styles.label}>RUT</Text>
        <TextInput
          style={[styles.input, rutError ? styles.inputError : null]}
          placeholder="12.345.678-K"
          placeholderTextColor={colores.textoTenue} 
          value={rut}
          onChangeText={setRut}
          autoCapitalize="none"
          editable={!isLoading}
        />
        {rutError ? <Text style={styles.errorText}>{rutError}</Text> : null}

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colores.textoTenue} 
          secureTextEntry={true} 
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          editable={!isLoading}
        />

        {loginError ? <Text style={styles.errorTextGeneral}>{loginError}</Text> : null}

        <View style={styles.buttonContainer}>
          {isLoading ? (
            <ActivityIndicator size="large" color={colores.primario} />
          ) : (
            <TouchableOpacity 
              style={[styles.loginButton, !isFormValid ? styles.loginButtonDisabled : null]} 
              onPress={handleLogin}
              disabled={!isFormValid || isLoading} 
            >
              <Text style={[styles.loginButtonText, !isFormValid ? styles.loginButtonTextDisabled : null]}>
                INICIAR SESIÓN
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.registerLink}
        onPress={() => navigation.navigate('RecuperarContrasena')}
        disabled={isLoading}
      >
        <Text style={styles.registerLinkText}>
          <Text style={styles.registerLinkHighlight}>¿Olvidaste tu contraseña?</Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.registerLink} 
        onPress={() => navigation.navigate('Register')}
        disabled={isLoading}
      >
        <Text style={styles.registerLinkText}>
          ¿No tienes cuenta? <Text style={styles.registerLinkHighlight}>Regístrate aquí</Text>
        </Text>
      </TouchableOpacity>
    </VistaConTeclado>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.superficie },
  container: { flexGrow: 1, justifyContent: 'center', padding: espacio.xl },
  headerContainer: { alignItems: 'center', marginBottom: espacio.xxxl },
  subtitle: { ...tipografia.meta, color: colores.textoSuave, marginTop: espacio.md },

  formContainer: {
    backgroundColor: colores.superficie,
    padding: espacio.xl,
    borderRadius: radio.xl,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    ...sombra.media,
  },
  label: { ...piezas.etiqueta },
  input: { ...piezas.campo, marginBottom: espacio.base },
  inputError: { ...piezas.campoError },
  errorText: { ...tipografia.meta, color: colores.error, marginTop: -espacio.md, marginBottom: espacio.md },
  errorTextGeneral: { ...tipografia.meta, color: colores.error, textAlign: 'center', marginBottom: espacio.base },

  buttonContainer: { height: 52, justifyContent: 'center', marginTop: espacio.sm },
  loginButton: { ...piezas.botonPrimario },
  loginButtonDisabled: { backgroundColor: colores.neutro[200], ...sombra.ninguna, elevation: 0 },
  loginButtonText: { ...tipografia.cuerpoFuerte, color: colores.textoInverso, letterSpacing: 0.8 },
  loginButtonTextDisabled: { color: colores.textoDeshabilitado },

  registerLink: { marginTop: espacio.xl, alignSelf: 'stretch', alignItems: 'center' },
  registerLinkText: { ...tipografia.meta, color: colores.textoSuave, textAlign: 'center' },
  registerLinkHighlight: { color: colores.primario, fontWeight: '700' },
});