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
    contenido TEXT NOT NULL,
    momento_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    leida BOOLEAN DEFAULT FALSE,
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
    usuario_id INT NOT NULL,
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

-- CU08: registro de sesiones activas por dispositivo. El identificador (jti)
-- viaja dentro del JWT; revocar la fila invalida el token de inmediato.
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
    -- CU10: áreas de experticia declaradas por el profesional (texto libre).
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
    -- Modalidad de atención de ESTE bloque horario. Permite que un mismo
    -- profesional atienda online ciertos horarios y a domicilio otros.
    modalidad ENUM('DOMICILIO', 'ONLINE', 'AMBOS') NOT NULL DEFAULT 'DOMICILIO',
    PRIMARY KEY (profesional_id, dia_semana, hora_inicio),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
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
    -- CU09: qué datos de contacto ve el profesional. NULL = todo visible.
    -- Formato: {"mostrar_direccion": true, "mostrar_telefono": true}
    privacidad_contacto JSON,
    contacto_emergencia_id INT,
    usuario_id INT NOT NULL UNIQUE,
    comuna_id INT NOT NULL,
    FOREIGN KEY (contacto_emergencia_id) REFERENCES Contacto_Emergencia(contacto_emergencia_id),
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (comuna_id) REFERENCES Comuna(comuna_id)
);

-- CU23/CU24: entrevista de triaje. Las respuestas parciales permiten
-- reanudar (Exc.3 del CU23); "integrado" indica si ya se volcó a la ficha.
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
    fecha_terminado TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    -- CU78: ABIERTO admite nuevos registros; CERRADO los rechaza (D12).
    estado VARCHAR(255) DEFAULT 'ABIERTO',
    paciente_id INT,
    profesional_id INT,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
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

-- CU31: correcciones versionadas sobre evoluciones cerradas. El registro
-- original nunca se modifica; cada aclaración es una versión indexada aparte.
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

-- CU33/CU34/CU35: repositorio multimedia clínico. El archivo vive en
-- Cloudinary (disco de Render es efímero); aquí solo la URL y los metadatos.
CREATE TABLE Documento_Clinico (
    documento_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre_original VARCHAR(255) NOT NULL,
    categoria VARCHAR(40) NOT NULL DEFAULT 'SIN_CLASIFICAR',
    formato VARCHAR(10) NOT NULL,
    tamano_bytes INT NOT NULL,
    tipo_recurso VARCHAR(10) NOT NULL,
    url_publica VARCHAR(500) NOT NULL,
    public_id_cloud VARCHAR(255) NOT NULL,
    -- CU35: páginas de un PDF, para mostrarlo página a página como imágenes.
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
    episodio_clinico_id INT NOT NULL,
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id)   
);

CREATE TABLE Material_Terapeutico(
    material_terapeutico_id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    tipo VARCHAR(50) NOT NULL,
    url_archivo VARCHAR(255),
    categoria VARCHAR(50) NOT NULL,
    formato VARCHAR(20) NOT NULL,
    disponibilidad BOOLEAN NOT NULL DEFAULT TRUE
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
    -- CU47: parámetros de carga física y temporalidad
    series INT NOT NULL DEFAULT 1,
    repeticiones INT NOT NULL DEFAULT 1,
    frecuencia VARCHAR(20) NOT NULL DEFAULT 'DIARIA',
    -- CU46: recurso de la biblioteca asociado al ejercicio (opcional)
    material_terapeutico_id INT,
    UNIQUE KEY uq_pauta_nombre (pauta_tratamiento_id, nombre_ejercicio),
    FOREIGN KEY (pauta_tratamiento_id) REFERENCES Pauta_Tratamiento(pauta_tratamiento_id),
    FOREIGN KEY (material_terapeutico_id) REFERENCES Material_Terapeutico(material_terapeutico_id)
);

-- CU48: una marca por ejercicio y día. La clave única es el control
-- anti-rebote: varias marcas repetidas quedan como un solo registro.
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
    -- RF20: AGENDADA, CONFIRMADA, EN_CURSO, REALIZADA, INASISTENCIA,
    -- CANCELADA_PACIENTE y CANCELADA_PROFESIONAL (D2).
    estado VARCHAR(30) NOT NULL DEFAULT 'AGENDADA',
    motivo_cancelacion VARCHAR(255),
    coordenadas_gps_paciente VARCHAR(100),
    coordenadas_gps_profesional VARCHAR(100),
    -- CU39/CU43: modalidad efectiva de ESTA cita (NULL en citas antiguas)
    modalidad ENUM('DOMICILIO', 'ONLINE'),
    -- CU39: check-ins GPS de inicio/término de ambos actores, con timestamps
    evidencia_presencial JSON,
    firma_conformidad_url VARCHAR(255),
    -- CU42: trazos de la firma manuscrita, o el rechazo/envío por correo
    firma_conformidad_datos JSON,
    -- CU41: momento y tipo de certificación multi-factor (NULL = sin validar).
    -- Antes solo quedaba en la bitácora y la app no podía saber que ya estaba
    -- hecha: el botón "Validar sesión" seguía apareciendo.
    sesion_certificada_en DATETIME NULL,
    certificacion_tipo VARCHAR(20) NULL,
    -- CU41 Exc.2: la sesión suspendida queda derivada al Administrador (D11).
    sesion_suspendida_en DATETIME NULL,
    motivo_suspension JSON NULL,
    -- Vincula la cita con el trabajo clínico que generó. Sin esto, ni la cita
    -- sabía qué episodio produjo ni el episodio en qué cita ocurrió, y el
    -- profesional tenía que teclear identificadores a mano.
    episodio_clinico_id INT NULL,
    metadatos_teleconsulta JSON,
    paciente_id INT NOT NULL,
    profesional_id INT NOT NULL,
    sede_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (sede_id) REFERENCES Sede(sede_id),
    FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id)
);

CREATE TABLE Lista_Espera (
    lista_espera_id INT PRIMARY KEY AUTO_INCREMENT,
    momento_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    posicion INT NOT NULL,
    notificado BOOLEAN DEFAULT FALSE,
    paciente_id INT NOT NULL,
    cita_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id)
);

CREATE TABLE Evaluacion_Satisfaccion(
    evaluacion_satisfaccion_id INT PRIMARY KEY AUTO_INCREMENT,
    puntuacion TINYINT NOT NULL,
    resena VARCHAR(300),
    estado_moderacion BOOLEAN DEFAULT FALSE,
    momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cita_id INT NOT NULL UNIQUE,
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id)
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
    financiador_id INT NOT NULL,
    FOREIGN KEY (cita_id) REFERENCES Cita(cita_id),
    FOREIGN KEY (financiador_id) REFERENCES Financiador(financiador_id)
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

INSERT INTO Comuna (nombre) VALUES 
('Las Condes'),
('Providencia'),
('Ñuñoa'),
('Vitacura'),
('Lo Barnechea'),
('Peñalolén'),
('Colina'),
('Padre Hurtado'),
('Peñaflor'),
('La Reina');

INSERT INTO Rol (nombre_rol) VALUES 
('Paciente'),
('Profesional'),
('Administrador');

INSERT INTO Especialidad (nombre, descripcion) VALUES 
('Nutricionista', 'Evaluación y tratamiento nutricional'),
('Kinesiología', 'Rehabilitación física y motora'),
('Kinesiología Respiratoria', 'Terapia y rehabilitación respiratoria');

INSERT INTO Usuario (usuario_id, rut, nombres, apellido_paterno, apellido_materno, email, contrasena_hash, rol_id) 
VALUES (1, 'ADMIN-1', 'Sistema', 'Admin', 'Principal', 'admin@frosalud.cl', 'hash_password', 3);
INSERT INTO Profesional_Autorizado (rut_autorizado, habilitado, administrador_id) VALUES
('123456789', TRUE, 1),
('123334442', TRUE, 1);

INSERT INTO Sede (nombre, estado_sede) VALUES ('Sede Principal', TRUE);

-- CU66: financiadores con convenio para validación de bonos.
INSERT INTO Financiador (nombre_institucion, rut_institucion, convenio_activo) VALUES
('FONASA (simulado)', '61.603.000-0', TRUE),
('ISAPRE Salud Plena (simulada)', '96.856.780-2', TRUE);

-- CU46: catálogo inicial de la biblioteca de material terapéutico.
-- El último recurso queda obsoleto a propósito, para probar la Excepción 4.
INSERT INTO Material_Terapeutico (nombre, tipo, url_archivo, categoria, formato, disponibilidad) VALUES
('Elongación de isquiotibiales', 'GUIA', 'https://biblioteca.frosalud.cl/isquiotibiales', 'Kinesiología', 'PDF', TRUE),
('Fortalecimiento de cuádriceps', 'GUIA', 'https://biblioteca.frosalud.cl/cuadriceps', 'Kinesiología', 'PDF', TRUE),
('Movilidad de hombro con banda', 'VIDEO', 'https://biblioteca.frosalud.cl/hombro-banda', 'Kinesiología', 'MP4', TRUE),
('Respiración diafragmática guiada', 'VIDEO', 'https://biblioteca.frosalud.cl/respiracion', 'Kinesiología Respiratoria', 'MP4', TRUE),
('Ejercicios de expansión torácica', 'GUIA', 'https://biblioteca.frosalud.cl/expansion-toracica', 'Kinesiología Respiratoria', 'PDF', TRUE),
('Pauta de hidratación y colaciones', 'GUIA', 'https://biblioteca.frosalud.cl/hidratacion', 'Nutrición', 'PDF', TRUE),
('Plan de comidas semanal base', 'PLANTILLA', 'https://biblioteca.frosalud.cl/plan-comidas', 'Nutrición', 'PDF', TRUE),
('Rutina de marcha progresiva (versión 2019)', 'GUIA', 'https://biblioteca.frosalud.cl/marcha-2019', 'Kinesiología', 'PDF', FALSE);

INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
('ARANCEL_CONSULTA_GENERAL', '25000', 'Valor base en pesos chilenos para atención de medicina general.', 1),
('ARANCEL_ESPECIALIDAD', '40000', 'Valor base en pesos chilenos para consultas de médicos especialistas.', 1),
('RECARGO_HORARIO_INHABIL', '15000', 'Monto extra sumado al arancel para atenciones de urgencia o fuera de horario.', 1),
('TIEMPO_BLOQUE_MINUTOS', '30', 'Duración estándar en minutos para los bloques de agendamiento clínico.', 1),
('ANTICIPACION_MINIMA_REPROGRAMACION_HORAS', '24', 'Horas mínimas de anticipación con que un paciente puede reprogramar su cita.', 1),
('ANTICIPACION_MINIMA_CANCELACION_HORAS', '2', 'Horas mínimas de anticipación con que un paciente puede cancelar su cita.', 1),
('RADIO_PRESENCIALIDAD_METROS', '200', 'Distancia máxima en metros entre los check-in GPS del paciente y del profesional.', 1),
('TOLERANCIA_MULTIFACTOR_MINUTOS', '15', 'Diferencia máxima en minutos entre marcas de presencia para certificar una sesión.', 1),
('MAX_TAMANO_ARCHIVO_MB', '10', 'Tamaño máximo en megabytes aceptado al cargar archivos al repositorio multimedia.', 1),
('MAX_VERSIONES_CORRECCION', '5', 'Cantidad máxima de correcciones versionadas permitidas sobre una evolución clínica cerrada.', 1);