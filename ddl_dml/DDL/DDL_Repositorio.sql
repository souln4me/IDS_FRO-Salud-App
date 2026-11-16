CREATE DATABASE IF NOT EXISTS fro_salud_db;
USE fro_salud_db;

CREATE TABLE Rol (
    rol_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_rol VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE Usuario (
    usuario_id INT PRIMARY KEY AUTO_INCREMENT,
    rut VARCHAR(10) NOT NULL UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    cuenta_activo BOOLEAN DEFAULT FALSE,
    hora_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    otp_codigo VARCHAR(6) NULL,
    otp_expiracion TIMESTAMP NULL,
    rol_id INT NOT NULL,
    FOREIGN KEY (rol_id) REFERENCES Rol(rol_id)
);

CREATE TABLE Usuario_Telefono (
    usuario_id INT NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    PRIMARY KEY (usuario_id, telefono),
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Notificacion (
    notificacion_id INT PRIMARY KEY AUTO_INCREMENT,
    canal VARCHAR(50) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    titulo VARCHAR(120),
    contenido TEXT NOT NULL,
    datos JSON,
    momento_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leida BOOLEAN DEFAULT FALSE,
    usuario_id INT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Preferencia_Notificacion (
    usuario_id INT PRIMARY KEY,
    canal_push BOOLEAN NOT NULL DEFAULT TRUE,
    canal_email BOOLEAN NOT NULL DEFAULT TRUE,
    refuerzos BOOLEAN NOT NULL DEFAULT TRUE,
    ultima_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Dispositivo_Push (
    dispositivo_push_id INT PRIMARY KEY AUTO_INCREMENT,
    token VARCHAR(255) NOT NULL UNIQUE,
    plataforma VARCHAR(20) NOT NULL DEFAULT 'DESCONOCIDA',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    momento_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Ticket_Soporte (
    ticket_soporte_id INT PRIMARY KEY AUTO_INCREMENT,
    categoria VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO',
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    momento_resuelto TIMESTAMP,
    asignado_a INT NULL,
    momento_enrutamiento TIMESTAMP NULL,
    adjunto_url VARCHAR(500) NULL,
    resolucion VARCHAR(500) NULL,
    usuario_id INT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (asignado_a) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Area_Soporte_Operador (
    usuario_id INT NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    PRIMARY KEY (usuario_id, categoria),
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Bitacora_Auditoria (
    bitacora_auditoria_id INT PRIMARY KEY AUTO_INCREMENT,
    accion VARCHAR(50) NOT NULL,
    entidad_afectada VARCHAR(50),
    ip_origen VARCHAR(45),
    momento_evento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    datos_adicionales JSON,
    usuario_id INT,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id) 
);

CREATE TABLE Sesion_Usuario (
    sesion_usuario_id INT PRIMARY KEY AUTO_INCREMENT,
    jti CHAR(36) NOT NULL UNIQUE,
    dispositivo VARCHAR(120),
    dispositivo_id VARCHAR(64),
    ip_origen VARCHAR(45),
    momento_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activa BOOLEAN DEFAULT TRUE,
    usuario_id INT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Comuna (
    comuna_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE Sede (
    sede_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    estado_sede BOOLEAN
);

CREATE TABLE Sede_Presencial (
    sede_id INT,
    calle VARCHAR(100) NOT NULL,
    numero_calle VARCHAR(10) NOT NULL,
    departamento VARCHAR(10) NOT NULL,
    infraestructura TEXT NOT NULL,
    comuna_id INT NOT NULL,
    PRIMARY KEY (sede_id),
    FOREIGN KEY (sede_id) REFERENCES Sede(sede_id),
    FOREIGN KEY (comuna_id) REFERENCES Comuna(comuna_id)
);

CREATE TABLE Sede_Online(
    sede_id INT,
    link VARCHAR(255) NOT NULL,
    contraseña VARCHAR(50) NOT NULL,
    codigo VARCHAR(50) NOT NULL,
    PRIMARY KEY (sede_id),
    FOREIGN KEY (sede_id) REFERENCES Sede(sede_id)
);

CREATE TABLE Sede_Horario(
    sede_id INT,
    dia_semana TINYINT NOT NULL,
    hora_apertura TIME NOT NULL,
    hora_cierre TIME NOT NULL,
    PRIMARY KEY (sede_id),
    FOREIGN KEY (sede_id) REFERENCES Sede(sede_id)
);

CREATE TABLE Especialidad (
    especialidad_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT NOT NULL
);

CREATE TABLE Profesional (
    profesional_id INT PRIMARY KEY AUTO_INCREMENT,
    num_registro_salud VARCHAR(30) NOT NULL UNIQUE,
    reseña_curricular TEXT NOT NULL,
    calificacion_promedio DECIMAL(3,2) NOT NULL,
    foto_url VARCHAR(255) NOT NULL,
    tipo_sede ENUM('DOMICILIO', 'ONLINE', 'AMBOS') NOT NULL,
    areas_experticia VARCHAR(255) NULL,
    usuario_id INT NOT NULL,
    especialidad_id INT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (especialidad_id) REFERENCES Especialidad(especialidad_id)
);

CREATE TABLE Profesional_Autorizado (
    rut_autorizado VARCHAR(10) PRIMARY KEY,
    habilitado BOOLEAN DEFAULT FALSE,
    administrador_id INT NOT NULL,
    FOREIGN KEY (administrador_id) References Usuario(usuario_id)
);

CREATE TABLE Profesional_Disponibilidad (
    profesional_id INT NOT NULL,
    dia_semana TINYINT NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    modalidad ENUM('DOMICILIO', 'ONLINE', 'AMBOS') NOT NULL DEFAULT 'DOMICILIO',
    PRIMARY KEY (profesional_id, dia_semana, hora_inicio),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
);

CREATE TABLE Profesional_Comuna (
    profesional_id INT NOT NULL,
    comuna_id INT NOT NULL,
    PRIMARY KEY (profesional_id, comuna_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (comuna_id) REFERENCES Comuna(comuna_id)
);

CREATE TABLE Contacto_Emergencia (
    contacto_emergencia_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    parentesco VARCHAR(50) NOT NULL
);

CREATE TABLE Paciente (
    paciente_id INT PRIMARY KEY AUTO_INCREMENT,
    sexo_clinico VARCHAR(20) NOT NULL,
    calle VARCHAR(100) NOT NULL,
    numero_calle VARCHAR(10) NOT NULL,
    departamento VARCHAR(10),
    privacidad_contacto JSON,
    resena_anonima BOOLEAN NOT NULL DEFAULT FALSE,
    foto_url VARCHAR(500) NULL,
    contacto_emergencia_id INT,
    usuario_id INT NOT NULL UNIQUE,
    comuna_id INT NOT NULL,
    FOREIGN KEY (contacto_emergencia_id) REFERENCES Contacto_Emergencia(contacto_emergencia_id),
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (comuna_id) REFERENCES Comuna(comuna_id)
);

CREATE TABLE Evento_Critico (
    evento_critico_id INT PRIMARY KEY AUTO_INCREMENT,
    origen VARCHAR(20) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    entidad_id INT NULL,
    termino VARCHAR(80) NOT NULL,
    terminos JSON NULL,
    extracto VARCHAR(300) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    momento_acuse TIMESTAMP NULL DEFAULT NULL,
    usuario_origen_id INT NULL,
    paciente_id INT NULL,
    acusado_por INT NULL,
    FOREIGN KEY (usuario_origen_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (acusado_por) REFERENCES Usuario(usuario_id),
    INDEX idx_evento_critico_estado (estado, momento_creacion)
);

CREATE TABLE Triaje (
    triaje_id INT PRIMARY KEY AUTO_INCREMENT,
    estado ENUM('EN_PROGRESO', 'COMPLETADO') NOT NULL DEFAULT 'EN_PROGRESO',
    respuestas JSON,
    momento_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    momento_completado TIMESTAMP NULL,
    integrado BOOLEAN NOT NULL DEFAULT FALSE,
    paciente_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id)
);

CREATE TABLE Reporte_Preclinico (
    reporte_preclinico_id INT PRIMARY KEY AUTO_INCREMENT,
    resumen TEXT NOT NULL,
    banderas JSON,
    etiquetas JSON,
    suficiente BOOLEAN NOT NULL DEFAULT TRUE,
    especialidad_sugerida_id INT NULL,
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    triaje_id INT NOT NULL UNIQUE,
    paciente_id INT NOT NULL,
    FOREIGN KEY (triaje_id) REFERENCES Triaje(triaje_id),
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (especialidad_sugerida_id) REFERENCES Especialidad(especialidad_id)
);

CREATE TABLE Indicador_Adherencia (
    indicador_adherencia_id INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL,
    porcentaje TINYINT NOT NULL,
    tareas_programadas INT NOT NULL,
    tareas_cumplidas INT NOT NULL,
    momento_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    paciente_id INT NOT NULL,
    UNIQUE KEY uq_adherencia_dia (paciente_id, fecha),
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id)
);

CREATE TABLE Disclaimer (
    disclaimer_id INT PRIMARY KEY AUTO_INCREMENT,
    momento_aceptacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version_disclaimer VARCHAR(20) NOT NULL,
    paciente_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id)
);

CREATE TABLE Paquete_Sesiones (
    paquete_sesiones_id INT PRIMARY KEY AUTO_INCREMENT,
    sesiones_total TINYINT NOT NULL,
    sesiones_usadas TINYINT NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL,
    precio_total INT NOT NULL,
    momento_adquisicion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paciente_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id)
);

CREATE TABLE Ficha_Clinica (
    ficha_clinica_id INT PRIMARY KEY AUTO_INCREMENT,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    anamnesis TEXT NOT NULL,
    plantilla_especialidad VARCHAR(100) NOT NULL,
    paciente_id INT NOT NULL UNIQUE,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id)
);

CREATE TABLE Ficha_Alergia(
    ficha_clinica_id INT NOT NULL,
    alergia VARCHAR(100) NOT NULL,
    PRIMARY KEY (ficha_clinica_id, alergia),
    FOREIGN KEY (ficha_clinica_id) REFERENCES Ficha_Clinica(ficha_clinica_id)
);

CREATE TABLE Ficha_Antecedente_Quirurgico(
    ficha_clinica_id INT NOT NULL,
    antecedente VARCHAR(255) NOT NULL,
    PRIMARY KEY (ficha_clinica_id, antecedente),
    FOREIGN KEY (ficha_clinica_id) REFERENCES Ficha_Clinica(ficha_clinica_id)
);

CREATE TABLE Ficha_Antecedente_Patologico(
    ficha_clinica_id INT NOT NULL,
    antecedente VARCHAR(255) NOT NULL,
    PRIMARY KEY (ficha_clinica_id, antecedente),
    FOREIGN KEY (ficha_clinica_id) REFERENCES Ficha_Clinica(ficha_clinica_id)
);

CREATE TABLE Episodio_Clinico (
    episodio_clinico_id INT PRIMARY KEY AUTO_INCREMENT,
    motivo_consulta VARCHAR(255) NOT NULL,
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_terminado TIMESTAMP NULL DEFAULT NULL,
    estado VARCHAR(255) DEFAULT 'ABIERTO',
    preparacion_alta_en TIMESTAMP NULL DEFAULT NULL,
    pautas_continuidad TEXT NULL,
    informe_alta_documento_id INT NULL,
    informe_alta_emitido_en TIMESTAMP NULL DEFAULT NULL,
    paciente_id INT,
    profesional_id INT,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
);

CREATE TABLE Reporte_Sintoma (
    reporte_sintoma_id INT PRIMARY KEY AUTO_INCREMENT,
    nivel_dolor TINYINT NOT NULL,
    limitacion_funcional TINYINT NOT NULL,
    comentario VARCHAR(500),
    clave_envio VARCHAR(64) NOT NULL UNIQUE,
    momento_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paciente_id INT NOT NULL,
    episodio_clinico_id INT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id)
);

CREATE TABLE Alerta_Clinica (
    alerta_clinica_id INT PRIMARY KEY AUTO_INCREMENT,
    tipo VARCHAR(40) NOT NULL,
    severidad VARCHAR(20) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    datos JSON,
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    momento_revision TIMESTAMP NULL,
    paciente_id INT NOT NULL,
    profesional_id INT NULL,
    reporte_sintoma_id INT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (reporte_sintoma_id) REFERENCES Reporte_Sintoma(reporte_sintoma_id)
);

CREATE TABLE Evolucion_Clinica (
    Evolucion_clinica_id INT PRIMARY KEY AUTO_INCREMENT,
    inalterable BOOLEAN DEFAULT FALSE,
    hora_firma_digital TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    firma_digital VARCHAR(255),
    porcentaje_objetivo TINYINT,
    respuesta_fisiologica TEXT,
    tecnicas_aplicadas TEXT,
    episodio_clinico_id INT NOT NULL,
    profesional_id INT NOT NULL,
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
);

CREATE TABLE Evolucion_Version (
    version_id INT PRIMARY KEY AUTO_INCREMENT,
    numero_version INT NOT NULL,
    texto_correccion TEXT NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    evolucion_clinica_id INT NOT NULL,
    profesional_id INT NOT NULL,
    FOREIGN KEY (evolucion_clinica_id) REFERENCES Evolucion_Clinica(Evolucion_clinica_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
);

CREATE TABLE Documento_Clinico (
    documento_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_original VARCHAR(255) NOT NULL,
    categoria VARCHAR(40) NOT NULL DEFAULT 'SIN_CLASIFICAR',
    formato VARCHAR(10) NOT NULL,
    tamano_bytes INT NOT NULL,
    tipo_recurso VARCHAR(10) NOT NULL,
    url_publica VARCHAR(500) NOT NULL,
    public_id_cloud VARCHAR(255) NOT NULL,
    paginas INT NULL,
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paciente_id INT NOT NULL,
    episodio_clinico_id INT,
    profesional_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
);

CREATE TABLE Derivacion_Interna (
    derivacion_interna_id INT PRIMARY KEY AUTO_INCREMENT,
    estado VARCHAR(20) NOT NULL,
    justificacion VARCHAR(255) NOT NULL,
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    episodio_clinico_id INT NOT NULL,
    profesional_origen_id INT NOT NULL,
    profesional_destino_id INT NOT NULL,
    momento_respuesta TIMESTAMP NULL DEFAULT NULL,
    comentario_respuesta VARCHAR(255) NULL,
    momento_cierre TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id),
    FOREIGN KEY (profesional_origen_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (profesional_destino_id) REFERENCES Profesional(profesional_id)
);

CREATE TABLE Objetivo_Terapeutico (
    objetivo_terapeutico_id INT PRIMARY KEY AUTO_INCREMENT,
    descripcion VARCHAR(255) NOT NULL,
    meta_valor DECIMAL(6,2) NOT NULL,
    valor_actual DECIMAL(6,2) NOT NULL,
    unidad VARCHAR(20) NOT NULL,
    episodio_clinico_id INT NOT NULL,
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id)
);

CREATE TABLE Mensaje_Chat (
    mensaje_id INT PRIMARY KEY AUTO_INCREMENT,
    contenido_cifrado TEXT NOT NULL,
    bloqueado BOOLEAN DEFAULT FALSE,
    momento_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remitente_usuario_id INT NOT NULL,
    leido BOOLEAN NOT NULL DEFAULT FALSE,
    episodio_clinico_id INT NULL,
    paciente_id INT NULL,
    profesional_id INT NULL,
    adjunto_url VARCHAR(500) NULL,
    adjunto_public_id VARCHAR(255) NULL,
    adjunto_nombre VARCHAR(255) NULL,
    adjunto_formato VARCHAR(10) NULL,
    adjunto_tipo_recurso VARCHAR(10) NULL,
    adjunto_bytes INT NULL,
    adjunto_paginas INT NULL,
    documento_id INT NULL,
    KEY idx_chat_episodio (episodio_clinico_id, mensaje_id),
    KEY idx_chat_pareja (paciente_id, profesional_id, mensaje_id),
    FOREIGN KEY (remitente_usuario_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id),
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (documento_id) REFERENCES Documento_Clinico(documento_id)
);

CREATE TABLE Palabra_Restringida (
    palabra_restringida_id INT PRIMARY KEY AUTO_INCREMENT,
    termino VARCHAR(80) NOT NULL UNIQUE,
    categoria VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    administrador_id INT NULL,
    FOREIGN KEY (administrador_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Material_Terapeutico(
    material_terapeutico_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    tipo VARCHAR(50) NOT NULL,
    url_archivo VARCHAR(255),
    categoria VARCHAR(50) NOT NULL,
    formato VARCHAR(20) NOT NULL,
    disponibilidad BOOLEAN NOT NULL DEFAULT TRUE,
    proposito VARCHAR(20) NOT NULL DEFAULT 'TRATAMIENTO',
    imagen_url VARCHAR(255) NULL
);

CREATE TABLE Pauta_Tratamiento(
    pauta_tratamiento_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_expiracion DATE NOT NULL,
    episodio_clinico_id INT NOT NULL, 
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id)
);

CREATE TABLE Pauta_Ejercicio(
    pauta_ejercicio_id INT PRIMARY KEY AUTO_INCREMENT,
    pauta_tratamiento_id INT NOT NULL,
    nombre_ejercicio VARCHAR(255) NOT NULL,
    series INT NOT NULL DEFAULT 1,
    repeticiones INT NOT NULL DEFAULT 1,
    frecuencia VARCHAR(20) NOT NULL DEFAULT 'DIARIA',
    material_terapeutico_id INT,
    dias_semana VARCHAR(20) NULL,
    UNIQUE KEY uq_pauta_nombre (pauta_tratamiento_id, nombre_ejercicio),
    FOREIGN KEY (pauta_tratamiento_id) REFERENCES Pauta_Tratamiento(pauta_tratamiento_id),
    FOREIGN KEY (material_terapeutico_id) REFERENCES Material_Terapeutico(material_terapeutico_id)
);

CREATE TABLE Pauta_Ejercicio_Material (
    pauta_ejercicio_material_id INT PRIMARY KEY AUTO_INCREMENT,
    pauta_ejercicio_id INT NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    formato VARCHAR(10) NOT NULL,
    tipo_recurso VARCHAR(10) NOT NULL,
    url_publica VARCHAR(500) NOT NULL,
    public_id_cloud VARCHAR(255) NOT NULL,
    tamano_bytes INT NOT NULL,
    paginas INT NULL,
    momento_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT NOT NULL,
    FOREIGN KEY (pauta_ejercicio_id) REFERENCES Pauta_Ejercicio(pauta_ejercicio_id),
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Pauta_Cumplimiento(
    pauta_cumplimiento_id INT PRIMARY KEY AUTO_INCREMENT,
    pauta_ejercicio_id INT NOT NULL,
    fecha DATE NOT NULL,
    momento_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ejercicio_dia (pauta_ejercicio_id, fecha),
    FOREIGN KEY (pauta_ejercicio_id) REFERENCES Pauta_Ejercicio(pauta_ejercicio_id)
);

CREATE TABLE Cita(
    cita_id INT PRIMARY KEY AUTO_INCREMENT,
    fecha_hora_inicio TIMESTAMP NOT NULL,
    fecha_hora_fin TIMESTAMP NOT NULL,
    checkin_profesional TIMESTAMP,
    checkin_paciente TIMESTAMP,
    estado VARCHAR(30) NOT NULL DEFAULT 'AGENDADA',
    motivo_cancelacion VARCHAR(255),
    coordenadas_gps_paciente VARCHAR(100),
    coordenadas_gps_profesional VARCHAR(100),
    modalidad ENUM('DOMICILIO', 'ONLINE'),
    evidencia_presencial JSON,
    firma_conformidad_url VARCHAR(255),
    firma_conformidad_datos JSON,
    sesion_certificada_en DATETIME NULL,
    certificacion_tipo VARCHAR(20) NULL,
    sesion_suspendida_en DATETIME NULL,
    motivo_suspension JSON NULL,
    episodio_clinico_id INT NULL,
    metadatos_teleconsulta JSON,
    documentacion_pendiente BOOLEAN NOT NULL DEFAULT FALSE,
    paciente_id INT NOT NULL,
    profesional_id INT NOT NULL,
    sede_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (sede_id) REFERENCES Sede(sede_id),
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id)
);

CREATE TABLE Solicitud_Confirmacion (
    solicitud_confirmacion_id INT PRIMARY KEY AUTO_INCREMENT,
    token VARCHAR(64) NOT NULL UNIQUE,
    momento_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    momento_expira TIMESTAMP NOT NULL,
    momento_respuesta TIMESTAMP NULL,
    respuesta VARCHAR(20) NULL,
    canal_respuesta VARCHAR(20) NULL,
    cita_id INT NOT NULL UNIQUE,
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id)
);

CREATE TABLE Lista_Espera (
    lista_espera_id INT PRIMARY KEY AUTO_INCREMENT,
    momento_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    posicion INT NOT NULL,
    notificado BOOLEAN DEFAULT FALSE,
    estado VARCHAR(20) NOT NULL DEFAULT 'ESPERANDO',
    momento_notificacion TIMESTAMP NULL,
    momento_expira TIMESTAMP NULL,
    token_cupo VARCHAR(64) NULL,
    paciente_id INT NOT NULL,
    cita_id INT NOT NULL,
    UNIQUE KEY uq_espera_cita_paciente (cita_id, paciente_id),
    UNIQUE KEY uq_lista_espera_token (token_cupo),
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id)
);

CREATE TABLE Liquidacion (
    liquidacion_id INT PRIMARY KEY AUTO_INCREMENT,
    anio SMALLINT NOT NULL,
    mes TINYINT NOT NULL,
    sesiones_validadas INT NOT NULL DEFAULT 0,
    monto_prestaciones INT NOT NULL DEFAULT 0,
    bonificacion INT NOT NULL DEFAULT 0,
    monto_total INT NOT NULL DEFAULT 0,
    observacion VARCHAR(255) NULL,
    momento_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profesional_id INT NOT NULL,
    emitida_por INT NOT NULL,
    UNIQUE KEY uq_liquidacion_periodo (profesional_id, anio, mes),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (emitida_por) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Evaluacion_Satisfaccion(
    evaluacion_satisfaccion_id INT PRIMARY KEY AUTO_INCREMENT,
    tipo VARCHAR(20) NOT NULL DEFAULT 'SESION',
    satisfecho BOOLEAN NULL,
    puntuacion TINYINT NULL,
    resena VARCHAR(300),
    estado_moderacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    motivo_rechazo VARCHAR(255) NULL,
    moderador_id INT NULL,
    momento_moderacion TIMESTAMP NULL,
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cita_id INT NULL UNIQUE,
    episodio_clinico_id INT NULL,
    profesional_id INT NULL,
    UNIQUE KEY uq_eval_episodio (episodio_clinico_id),
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id),
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
);

CREATE TABLE Transaccion(
    transaccion_id INT PRIMARY KEY AUTO_INCREMENT,
    monto_total INT NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    momento_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metodo_pago VARCHAR(50) NOT NULL,
    cita_id INT NOT NULL,
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id)
);

CREATE TABLE Financiador(
    financiador_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_institucion VARCHAR(100) NOT NULL UNIQUE,
    rut_institucion VARCHAR(12) NOT NULL UNIQUE,
    convenio_activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE Bono(
    bono_id INT PRIMARY KEY AUTO_INCREMENT,
    folio VARCHAR(50) UNIQUE,
    monto_cobertura INT NOT NULL,
    copago INT NOT NULL,
    estado_validacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    payload_respuesta JSON,
    cita_id INT NOT NULL UNIQUE,
    financiador_id INT NULL,
    financiador_manual VARCHAR(100) NULL,
    registrado_por_usuario_id INT NULL,
    momento_registro_manual TIMESTAMP NULL DEFAULT NULL,
    regularizado_en TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id),
    FOREIGN KEY (financiador_id) REFERENCES Financiador(financiador_id),
    FOREIGN KEY (registrado_por_usuario_id) REFERENCES Usuario(usuario_id)
);

CREATE TABLE Parametro_Global(
    parametro_id INT PRIMARY KEY AUTO_INCREMENT,
    clave VARCHAR(50) NOT NULL UNIQUE,
    valor VARCHAR(255) NOT NULL,
    descripcion TEXT,
    ultima_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    administrador_id INT NOT NULL,
    FOREIGN KEY (administrador_id) References Usuario(usuario_id)
);

CREATE TABLE Bloqueo_Agenda (
    bloqueo_id INT PRIMARY KEY AUTO_INCREMENT,
    fecha_inicio DATETIME NOT NULL,
    fecha_fin DATETIME NOT NULL,
    motivo TEXT NOT NULL,
    profesional_id INT NOT NULL,
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
);
