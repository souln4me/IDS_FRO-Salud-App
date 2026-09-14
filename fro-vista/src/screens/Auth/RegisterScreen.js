import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import apiClient from '../../api/client';
import VistaConTeclado from '../../components/VistaConTeclado';
import LogoFro from '../../components/LogoFro';
import { validateRut } from '../../utils/validators';
import { requisitosIncumplidos } from '../../utils/contrasena';
import { colores, espacio, radio, tipografia, piezas } from '../../theme';
import DialogoAviso from '../../components/DialogoAviso';
import DialogoConfirmacion from '../../components/DialogoConfirmacion';

const RegisterScreen = ({ navigation }) => {
    // Avisos con el diálogo de la app (el Alert nativo no se estiliza).
    const [aviso, setAviso] = useState(null);
    const [confirmacion, setConfirmacion] = useState(null);
    const [esProfesional, setEsProfesional] = useState(false);
    const [comunas, setComunas] = useState([]);
    const [especialidades, setEspecialidades] = useState([]);
    const [errores, setErrores] = useState({});
    const [disponibilidad, setDisponibilidad] = useState([]);

    const [formData, setFormData] = useState({
        rut: '', nombres: '', apellido_paterno: '', apellido_materno: '', email: '', telefono: '', contrasena: '', confirmar_contrasena: '',
        sexo_clinico: '', calle: '', numero_calle: '', departamento: '', comuna_id: '', emergencia_nombre: '', emergencia_parentesco: '', emergencia_telefono: '',
        num_registro_salud: '', especialidad_id: '', tipo_sede: '', resena_curricular: ''
    });

    useEffect(() => {
        const cargarDatosBD = async () => {
            try {
                const resComunas = await apiClient.get('/auth/comunas');
                setComunas(resComunas.data);
                const resEspecialidades = await apiClient.get('/auth/especialidades');
                setEspecialidades(resEspecialidades.data);
            } catch (error) {
                console.error("Error cargando diccionarios", error);
            }
        };
        cargarDatosBD();
    }, []);

    const handleChange = (name, value) => {
        setFormData({ ...formData, [name]: value });
        if (errores[name]) setErrores({ ...errores, [name]: false });
    };

    const validarRUTProfesional = async () => {
        if (!validateRut(formData.rut)) {
            setAviso({ tono: 'error', titulo: "Error", mensaje: "Ingrese un RUT válido primero." });
            return;
        }
        try {
            const res = await apiClient.get(`/auth/validar-profesional/${formData.rut}`);
            if (res.status === 200) {
                setEsProfesional(true);
                setAviso({ tono: 'ok', titulo: "Acreditación Exitosa", mensaje: "Se han habilitado los campos para registro médico." });
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                setAviso({ tono: 'error', titulo: "Acreditación Denegada", mensaje: error.response.data.error });
            } else {
                setAviso({ tono: 'error', titulo: "Error", mensaje: "No se pudo validar el RUT en este momento." });
            }
            setEsProfesional(false);
        }
    };

    const agregarBloqueHorario = () => {
        // El bloque nuevo hereda la modalidad general elegida arriba, pero se
        // puede cambiar por bloque (ej: lunes online, martes a domicilio).
        const modalidadInicial = formData.tipo_sede || 'DOMICILIO';
        setDisponibilidad([...disponibilidad, { dia_semana: '1', hora_inicio: '08:00', hora_fin: '12:00', modalidad: modalidadInicial }]);
    };

    const actualizarHorario = (index, campo, valor) => {
        const nuevosHorarios = [...disponibilidad];
        nuevosHorarios[index][campo] = valor;
        setDisponibilidad(nuevosHorarios);
    };

    const eliminarHorario = (index) => {
        const nuevosHorarios = disponibilidad.filter((_, i) => i !== index);
        setDisponibilidad(nuevosHorarios);
    };

    const validarFormatosSintacticos = () => {
        let nuevosErrores = {};
        let esValido = true;

        // D4: misma política que el servidor (8+, letra, número y símbolo). Antes
        // el registro aceptaba "11111111" sin ningún aviso.
        const faltantes = requisitosIncumplidos(formData.contrasena);
        if (faltantes.length > 0) {
            nuevosErrores.contrasena = true; esValido = false;
            setAviso({
                tono: 'error',
                titulo: 'Contraseña insegura',
                mensaje: 'La contraseña no cumple el formato exigido:\n• ' + faltantes.join('\n• '),
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            nuevosErrores.email = true; esValido = false;
        }
        if (faltantes.length === 0 && formData.contrasena !== formData.confirmar_contrasena) {
            nuevosErrores.contrasena = true; nuevosErrores.confirmar_contrasena = true; esValido = false;
            setAviso({ tono: 'error', titulo: "Alerta de discrepancia", mensaje: "Las contraseñas no coinciden." });
        }
        if (!validateRut(formData.rut)) { 
            nuevosErrores.rut = true; 
            esValido = false; 
        }

        if (!esProfesional) {
            if (formData.comuna_id === '') { nuevosErrores.comuna_id = true; esValido = false; }
            if (formData.sexo_clinico === '') { nuevosErrores.sexo_clinico = true; esValido = false; }
        } else {
            if(formData.num_registro_salud === '') { nuevosErrores.num_registro_salud = true; esValido = false; }
            if(formData.especialidad_id === '') { nuevosErrores.especialidad_id = true; esValido = false; }
            if(formData.tipo_sede === '') { nuevosErrores.tipo_sede = true; esValido = false; }
            if(disponibilidad.length === 0) { 
                setAviso({ tono: 'error', titulo: "Agenda Vacía", mensaje: "Debe agregar al menos un bloque horario." }); 
                esValido = false; 
            }
        }

        setErrores(nuevosErrores);
        
        const tieneErroresRojos = Object.keys(nuevosErrores).some(key => key !== 'contrasena' && key !== 'confirmar_contrasena');
        
        if (tieneErroresRojos) {
            setAviso({ tono: 'error', titulo: "Error", mensaje: "Por favor, revise los campos marcados en rojo." });
        }

        return esValido;
    };

    const confirmarCreacionCuenta = async () => {
        if (!validarFormatosSintacticos()) return;

        try {
            const response = await apiClient.post('/auth/verificar-unicidad', {
                rut: formData.rut,
                email: formData.email
            });

            if (response.status === 200) {
                let mensajeDinamico = esProfesional
                    ? "¿Declara que los datos de contacto y la matriz horaria ingresada son precisos y veraces?"
                    : "¿Declara que sus datos personales y de contacto ingresados son precisos y veraces?";

                // Había un registro anterior con este RUT/correo que nunca se
                // verificó: se avisa que será reemplazado por este nuevo.
                if (response.data?.reemplazo) {
                    mensajeDinamico =
                        "Existía un registro anterior sin verificar con estos datos; será reemplazado por este.\n\n" +
                        mensajeDinamico;
                }

                setConfirmacion({
                    titulo: 'Confirma tus datos',
                    mensaje: mensajeDinamico,
                    etiqueta: 'Confirmar y registrar',
                    etiquetaCancelar: 'Revisar',
                    accion: procesarRegistro,
                });
            }
        } catch (error) {
            if (error.response && error.response.status === 409) {
                const campoError = error.response.data.campo;
                setErrores(prevErrores => ({ ...prevErrores, [campoError]: true }));
                setAviso({ tono: 'error', titulo: "Aviso de Duplicidad", mensaje: error.response.data.error });
            } else if (error.code === 'ECONNABORTED' || (error.message && error.message.includes('Network'))) {
                setAviso({ tono: 'error', titulo: "Error de Conexión", mensaje: "El servicio de validación no está disponible. Verifique su conexión y reintente." });
            } else {
                setAviso({ tono: 'error', titulo: "Error del sistema", mensaje: "Ocurrió un error inesperado al validar la información." });
            }
        }
    };

    // ── CAMBIO CU04 ───────────────────────────────────────────────────────────
    // Antes: navegaba directo a Login al recibir 201.
    // Ahora: el backend devuelve { usuario_id, email } junto al 201,
    //        y navegamos a OTPScreen pasando esos datos como parámetros.
    // ─────────────────────────────────────────────────────────────────────────
    const procesarRegistro = async () => {
        try {
            let response;
            if (esProfesional) {
                const payloadProfesional = { ...formData, disponibilidad };
                response = await apiClient.post('/auth/registrar-profesional', payloadProfesional);
            } else {
                response = await apiClient.post('/auth/registrar', formData);
            }

            if (response.status === 201) {
                const { usuario_id, email } = response.data;

                const partes = email.split('@');
                const emailMascarado = partes[0][0] + '***@' + partes[1];

                navigation.navigate('OTP', {
                    usuario_id,
                    canal: 'EMAIL',
                    destino: emailMascarado,
                });
            }
        } catch (error) {
            const respuesta = error.response?.data;
            // D4: el servidor también valida la contraseña y devuelve los requisitos.
            if (respuesta?.error === 'CONTRASENA_DEBIL') {
                setErrores(prev => ({ ...prev, contrasena: true }));
                setAviso({
                    tono: 'error',
                    titulo: 'Contraseña insegura',
                    mensaje: respuesta.mensaje + '\n• ' + (respuesta.requisitos || []).join('\n• '),
                });
                return;
            }
            const msg = respuesta ? (respuesta.mensaje || respuesta.error) : "No se pudo conectar con el servidor.";
            setAviso({ tono: 'error', titulo: "Error del sistema", mensaje: msg });
        }
    };

    return (
        <VistaConTeclado style={styles.container} contentContainerStyle={{ paddingBottom: 80 }}>
                <View style={styles.cabecera}>
                    <LogoFro tamano="md" />
                    <Text style={styles.title}>
                        {esProfesional ? 'Alta de profesional' : 'Crear cuenta'}
                    </Text>
                    <Text style={styles.bajada}>
                        {esProfesional
                            ? 'Acredita tu RUT y completa tus datos profesionales.'
                            : 'Completa tus datos para acceder a tu ficha y tus horas.'}
                    </Text>
                </View>

                <Text style={styles.sectionHeader}>Sección 1: Identidad y Credenciales</Text>

                <View style={styles.row}>
                    <View style={styles.campoMitad}>
                        <Text style={styles.label}>RUT</Text>
                        <TextInput style={[styles.input, errores.rut && styles.inputError]} placeholder="12345678K" value={formData.rut} onChangeText={(v) => handleChange('rut', v)} />
                    </View>
                    <TouchableOpacity style={styles.btnValidar} onPress={validarRUTProfesional}>
                        <Text style={styles.txtBtnValidar}>Acreditar RUT Médico</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.campo}>
                    <Text style={styles.label}>Nombres</Text>
                    <TextInput style={[styles.input, errores.nombres && styles.inputError]} placeholder="Como aparece en tu cédula" value={formData.nombres} onChangeText={(v) => handleChange('nombres', v)} />
                </View>

                <View style={styles.row}>
                    <View style={styles.campoMitad}>
                        <Text style={styles.label}>Apellido paterno</Text>
                        <TextInput style={[styles.input, errores.apellido_paterno && styles.inputError]} placeholder="" value={formData.apellido_paterno} onChangeText={(v) => handleChange('apellido_paterno', v)} />
                    </View>
                    <View style={styles.campoMitad}>
                        <Text style={styles.label}>Apellido materno</Text>
                        <TextInput style={[styles.input, errores.apellido_materno && styles.inputError]} placeholder="" value={formData.apellido_materno} onChangeText={(v) => handleChange('apellido_materno', v)} />
                    </View>
                </View>

                <View style={styles.campo}>
                    <Text style={styles.label}>Correo electrónico</Text>
                    <TextInput style={[styles.input, errores.email && styles.inputError]} placeholder="correo@ejemplo.cl" keyboardType="email-address" value={formData.email} onChangeText={(v) => handleChange('email', v)} autoCapitalize="none" />
                </View>
                <View style={styles.campo}>
                    <Text style={styles.label}>Teléfono</Text>
                    <TextInput style={[styles.input, errores.telefono && styles.inputError]} placeholder="+56 9 XXXX XXXX" keyboardType="phone-pad" value={formData.telefono} onChangeText={(v) => handleChange('telefono', v)} />
                </View>
                <View style={styles.campo}>
                    <Text style={styles.label}>Contraseña</Text>
                    <TextInput style={[styles.input, errores.contrasena && styles.inputError]} placeholder="8+ caracteres, letra, número y símbolo" secureTextEntry value={formData.contrasena} onChangeText={(v) => handleChange('contrasena', v)} />
                </View>
                <View style={styles.campo}>
                    <Text style={styles.label}>Confirmar contraseña</Text>
                    <TextInput style={[styles.input, errores.confirmar_contrasena && styles.inputError]} placeholder="Repite la contraseña" secureTextEntry value={formData.confirmar_contrasena} onChangeText={(v) => handleChange('confirmar_contrasena', v)} />
                </View>

                {!esProfesional && (
                    <View>
                        <Text style={styles.sectionHeader}>Sección 2: Parámetros Paciente</Text>

                        <View style={[styles.pickerContainer, errores.sexo_clinico && styles.inputError]}>
                            <Picker selectedValue={formData.sexo_clinico} onValueChange={(v) => handleChange('sexo_clinico', v)}>
                                <Picker.Item label="Seleccione su Sexo..." value="" color={colores.textoTenue} />
                                <Picker.Item label="Hombre" value="Hombre" />
                                <Picker.Item label="Mujer" value="Mujer" />
                            </Picker>
                        </View>

                        <Text style={styles.subHeader}>Dirección</Text>
                        <View style={[styles.pickerContainer, errores.comuna_id && styles.inputError]}>
                            <Picker selectedValue={formData.comuna_id} onValueChange={(v) => handleChange('comuna_id', v)}>
                                <Picker.Item label="Seleccione su comuna..." value="" color={colores.textoTenue} />
                                {comunas.map((c) => (<Picker.Item key={c.comuna_id.toString()} label={c.nombre} value={c.comuna_id.toString()} />))}
                            </Picker>
                        </View>
                        <View style={styles.campo}>
                            <Text style={styles.label}>Calle</Text>
                            <TextInput style={styles.input} placeholder="" value={formData.calle} onChangeText={(v) => handleChange('calle', v)} />
                        </View>
                        <View style={styles.row}>
                            <View style={styles.campoMitad}>
                                <Text style={styles.label}>Número</Text>
                                <TextInput style={[styles.input]} placeholder="" value={formData.numero_calle} onChangeText={(v) => handleChange('numero_calle', v)} />
                            </View>
                            <View style={styles.campoMitad}>
                                <Text style={styles.label}>Departamento (opcional)</Text>
                                <TextInput style={[styles.input]} placeholder="" value={formData.departamento} onChangeText={(v) => handleChange('departamento', v)} />
                            </View>
                        </View>

                        <Text style={styles.subHeader}>Contacto de Emergencia</Text>
                        <View style={styles.campo}>
                            <Text style={styles.label}>Nombre del contacto</Text>
                            <TextInput style={styles.input} placeholder="" value={formData.emergencia_nombre} onChangeText={(v) => handleChange('emergencia_nombre', v)} />
                        </View>
                        <View style={styles.row}>
                            <View style={styles.campoMitad}>
                                <Text style={styles.label}>Parentesco</Text>
                                <TextInput style={[styles.input]} placeholder="Madre, hermano…" value={formData.emergencia_parentesco} onChangeText={(v) => handleChange('emergencia_parentesco', v)} />
                            </View>
                            <View style={styles.campoMitad}>
                                <Text style={styles.label}>Teléfono</Text>
                                <TextInput style={[styles.input]} placeholder="+56 9 XXXX XXXX" keyboardType="phone-pad" value={formData.emergencia_telefono} onChangeText={(v) => handleChange('emergencia_telefono', v)} />
                            </View>
                        </View>
                    </View>
                )}

                {esProfesional && (
                    <View>
                        <Text style={styles.sectionHeader}>Sección 3: Acreditación Profesional</Text>

                        <View style={styles.campo}>
                            <Text style={styles.label}>Número de registro</Text>
                            <TextInput style={[styles.input, errores.num_registro_salud && styles.inputError]} placeholder="Superintendencia de Salud" value={formData.num_registro_salud} onChangeText={(v) => handleChange('num_registro_salud', v)} />
                        </View>

                        <View style={[styles.pickerContainer, errores.especialidad_id && styles.inputError]}>
                            <Picker selectedValue={formData.especialidad_id} onValueChange={(v) => handleChange('especialidad_id', v)}>
                                <Picker.Item label="Especialidad Clínica..." value="" color={colores.textoTenue} />
                                {especialidades.map((e) => (<Picker.Item key={e.especialidad_id.toString()} label={e.nombre} value={e.especialidad_id.toString()} />))}
                            </Picker>
                        </View>

                        <View style={[styles.pickerContainer, errores.tipo_sede && styles.inputError]}>
                            <Picker selectedValue={formData.tipo_sede} onValueChange={(v) => handleChange('tipo_sede', v)}>
                                <Picker.Item label="Modalidad de Atención..." value="" color={colores.textoTenue} />
                                <Picker.Item label="Atención Domiciliaria" value="DOMICILIO" />
                                <Picker.Item label="Teleconsulta Online" value="ONLINE" />
                                <Picker.Item label="Ambas Modalidades" value="AMBOS" />
                            </Picker>
                        </View>

                        <View style={styles.campo}>
                            <Text style={styles.label}>Reseña curricular</Text>
                            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Breve descripción de tu experiencia" multiline numberOfLines={3} value={formData.resena_curricular} onChangeText={(v) => handleChange('resena_curricular', v)} />
                        </View>

                        <Text style={styles.subHeader}>Matriz de Jornada Laboral</Text>
                        {disponibilidad.map((bloque, index) => (
                            <View key={index} style={styles.horarioBox}>
                                <View style={styles.pickerContainerHorario}>
                                    <Picker selectedValue={bloque.dia_semana} onValueChange={(v) => actualizarHorario(index, 'dia_semana', v)} style={{ height: 55, justifyContent: 'center' }}>
                                        <Picker.Item label="Lunes" value="1" />
                                        <Picker.Item label="Martes" value="2" />
                                        <Picker.Item label="Miércoles" value="3" />
                                        <Picker.Item label="Jueves" value="4" />
                                        <Picker.Item label="Viernes" value="5" />
                                        <Picker.Item label="Sábado" value="6" />
                                        <Picker.Item label="Domingo" value="7" />
                                    </Picker>
                                </View>
                                <View style={styles.pickerContainerHorario}>
                                    <Picker selectedValue={bloque.modalidad || 'DOMICILIO'} onValueChange={(v) => actualizarHorario(index, 'modalidad', v)} style={{ height: 55, justifyContent: 'center' }}>
                                        <Picker.Item label="En este horario: A Domicilio" value="DOMICILIO" />
                                        <Picker.Item label="En este horario: Online" value="ONLINE" />
                                        <Picker.Item label="En este horario: Ambas" value="AMBOS" />
                                    </Picker>
                                </View>
                                <View style={styles.row}>
                                    <View style={styles.campo}>
                                        <Text style={styles.label}>Inicio</Text>
                                        <TextInput style={[styles.input, { width: '40%', marginBottom: 0 }]} placeholder="08:00" value={bloque.hora_inicio} onChangeText={(v) => actualizarHorario(index, 'hora_inicio', v)} />
                                    </View>
                                    <View style={styles.campo}>
                                        <Text style={styles.label}>Fin</Text>
                                        <TextInput style={[styles.input, { width: '40%', marginBottom: 0 }]} placeholder="13:00" value={bloque.hora_fin} onChangeText={(v) => actualizarHorario(index, 'hora_fin', v)} />
                                    </View>
                                    <TouchableOpacity style={styles.btnEliminar} onPress={() => eliminarHorario(index)}>
                                        <Text style={{ color: colores.superficie, fontWeight: 'bold' }}>X</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                        <Button title="+ Añadir Bloque Horario" onPress={agregarBloqueHorario} color={colores.primario} />
                    </View>
                )}

                <View style={styles.buttonContainer}>
                    <Button title={esProfesional ? "FINALIZAR ALTA MÉDICA" : "FINALIZAR REGISTRO PACIENTE"} onPress={confirmarCreacionCuenta} color={esProfesional ? colores.primario : colores.primario} />
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
          onCerrar={() => {
            const seguir = aviso?.alCerrar;
            setAviso(null);
            if (seguir) seguir();
          }}
        />
        </VistaConTeclado>
    );
};

const styles = StyleSheet.create({
    // Mismo lenguaje que el login: fondo blanco, formulario en tarjeta,
    // campos y botones del sistema.
    container: { flex: 1, padding: espacio.xl, backgroundColor: colores.superficie },

    cabecera: { alignItems: 'center', marginBottom: espacio.xl },
    title: { ...tipografia.titulo, color: colores.textoTitulo, marginTop: espacio.base },
    bajada: {
        ...tipografia.meta,
        color: colores.textoSuave,
        textAlign: 'center',
        marginTop: espacio.xs,
    },

    // Rótulo de sección: mayúsculas pequeñas, sin la franja gris de antes.
    // Título de sección: verde de marca, con una barra que lo ancla a la
    // izquierda en vez del rótulo gris apagado de antes.
    sectionHeader: {
        ...tipografia.subtitulo,
        color: colores.primario,
        borderLeftWidth: 3,
        borderLeftColor: colores.primario,
        paddingLeft: espacio.md,
        marginTop: espacio.xxl,
        marginBottom: espacio.base,
    },
    campo: { marginBottom: espacio.base },
    campoMitad: { flex: 1, marginBottom: espacio.base },
    label: { ...piezas.etiqueta },
    subHeader: { ...tipografia.cuerpoFuerte, color: colores.textoTitulo, marginTop: espacio.md, marginBottom: espacio.sm },

    // alignItems al final: el botón queda a la altura del campo, no de su etiqueta.
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: espacio.md, alignItems: 'flex-end' },
    input: { ...piezas.campo },
    halfInput: { flex: 1 },
    inputError: { ...piezas.campoError },

    pickerContainer: {
        backgroundColor: colores.superficie,
        borderWidth: 1,
        borderColor: colores.bordeCampo,
        borderRadius: radio.md,
        marginBottom: espacio.base,
        overflow: 'hidden',
        paddingHorizontal: espacio.sm,
    },
    pickerContainerHorario: {
        backgroundColor: colores.superficie,
        borderWidth: 1,
        borderColor: colores.bordeCampo,
        borderRadius: radio.md,
        marginBottom: espacio.sm,
        overflow: 'hidden',
        paddingHorizontal: espacio.sm,
    },

    btnValidar: {
        ...piezas.botonSecundario,
        width: '40%',
        paddingHorizontal: espacio.sm,
        marginBottom: espacio.base,
    },
    txtBtnValidar: { ...tipografia.metaFuerte, color: colores.primario, textAlign: 'center' },

    horarioBox: {
        ...piezas.tarjeta,
        padding: espacio.md,
        marginBottom: espacio.base,
    },
    btnEliminar: {
        width: 48,
        borderRadius: radio.md,
        borderWidth: 1.5,
        borderColor: colores.error,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: espacio.sm,
    },

    buttonContainer: { marginTop: espacio.xl, marginBottom: espacio.xxxl },
});

export default RegisterScreen;