USE fro_salud_db;

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


INSERT INTO Financiador (nombre_institucion, rut_institucion, convenio_activo) VALUES
('FONASA (simulado)', '61.603.000-0', TRUE),
('ISAPRE Salud Plena (simulada)', '96.856.780-2', TRUE);


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
('RADIO_PRESENCIALIDAD_METROS', '100', 'Distancia máxima en metros entre el profesional y el paciente en visitas a domicilio.', 1),
('VENTANA_UBICACION_PACIENTE_MINUTOS', '30', 'Minutos durante los que vale la última ubicación que envió la app del paciente para validar la presencialidad.', 1),
('CHAT_FUERA_DE_ESCALAMIENTO', '1', 'El chat cifrado no escala eventos críticos: solo lo leen el paciente y su profesional.', 1),
('TOLERANCIA_MULTIFACTOR_MINUTOS', '15', 'Diferencia máxima en minutos entre marcas de presencia para certificar una sesión.', 1),
('MAX_TAMANO_ARCHIVO_MB', '10', 'Tamaño máximo en megabytes aceptado al cargar archivos al repositorio multimedia.', 1),
('MAX_VERSIONES_CORRECCION', '5', 'Cantidad máxima de correcciones versionadas permitidas sobre una evolución clínica cerrada.', 1);
