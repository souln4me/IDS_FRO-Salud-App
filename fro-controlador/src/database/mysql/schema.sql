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
    cuenta_activo BOOLEAN DEFAULT TRUE,
    hora_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    usuario_id INT NOT NULL,
    especialidad_id INT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (especialidad_id) REFERENCES especialidad(especialidad_id)
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
    contacto_emergencia_id INT,
    usuario_id INT NOT NULL UNIQUE,
    comuna_id INT NOT NULL,
    FOREIGN KEY (contacto_emergencia_id) REFERENCES Contacto_Emergencia(contacto_emergencia_id),
    FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id),
    FOREIGN KEY (comuna_id) REFERENCES Comuna(comuna_id)
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
    estado VARCHAR(255),
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
    pauta_tratamiento_id INT,
    nombre_ejercicio VARCHAR(255),
    PRIMARY KEY (pauta_tratamiento_id, nombre_ejercicio),
    FOREIGN KEY (pauta_tratamiento_id) REFERENCES Pauta_Tratamiento(pauta_tratamiento_id)
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

CREATE TABLE Pauta_Material(
    material_terapeutico_id INT,
    pauta_tratamiento_id INT,
    cantidad INT NOT NULL,
    frecuencia VARCHAR(100) NOT NULL,
    PRIMARY KEY (material_terapeutico_id, pauta_tratamiento_id),
    FOREIGN KEY (material_terapeutico_id) REFERENCES Material_Terapeutico(material_terapeutico_id),
    FOREIGN KEY (pauta_tratamiento_id) REFERENCES Pauta_Tratamiento(pauta_tratamiento_id)
);

CREATE TABLE Cita(
    cita_id INT PRIMARY KEY AUTO_INCREMENT,
    fecha_hora_inicio TIMESTAMP NOT NULL,
    fecha_hora_fin TIMESTAMP NOT NULL,
    checkin_profesional TIMESTAMP,
    checkin_paciente TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'AGENDADA',
    motivo_cancelacion VARCHAR(255),
    coordenadas_gps_paciente VARCHAR(100),
    coordenadas_gps_profesional VARCHAR(100),
    firma_conformidad_url VARCHAR(255),
    metadatos_teleconsulta JSON,
    paciente_id INT NOT NULL,
    profesional_id INT NOT NULL,
    sede_id INT NOT NULL,
    FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
    FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
    FOREIGN KEY (sede_id) REFERENCES Sede(sede_id)
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

-- 2. Creamos un usuario Administrador "fantasma" (Requisito por tu llave foránea en Profesional_Autorizado)
INSERT INTO Usuario (rut, nombres, apellido_paterno, apellido_materno, email, contrasena_hash, rol_id) 
VALUES ('ADMIN-1', 'Sistema', 'Admin', 'Admin', 'admin@sistema.cl', 'hash_falso', 3);

-- 3. Insertamos un RUT de prueba en la nómina de autorizados (Ej: 123456789)
-- Cambia '123456789' por el RUT que usarás para probar el registro de profesional.
INSERT INTO Profesional_Autorizado (rut_autorizado, habilitado, administrador_id) 
VALUES ('123456789', TRUE, (SELECT usuario_id FROM Usuario WHERE rut = 'ADMIN-1'));