/**
 * Aplica a la base de datos los cambios de estructura pendientes SIN borrar
 * datos. Sirve para poner al día una base ya desplegada (por ejemplo la de
 * la nube) cuando el esquema cambió después de haberla creado.
 *
 * Uso:
 *   npm run db:migrar
 *
 * Es seguro ejecutarlo más de una vez: cada migración revisa primero si ya
 * fue aplicada y no repite nada.
 */

const mysql = require('mysql2/promise');

const { opcionesSSL, urlConexion, datosSueltos } = require('../src/config/dbOptions');

// ── Lista de migraciones ─────────────────────────────────────────────────────
// Cada entrada dice cómo saber si ya está aplicada y qué ejecutar si no.
const MIGRACIONES = [
  // CU39, CU42, CU43 — evidencia de atención en la cita
  {
    nombre: 'Evidencia de atencion en Cita (CU39/CU42/CU43)',
    descripcion: 'Agrega modalidad, evidencia GPS y firma de conformidad a la cita',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Cita'
            AND COLUMN_NAME = 'evidencia_presencial'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Cita
           ADD COLUMN modalidad ENUM('DOMICILIO', 'ONLINE') NULL,
           ADD COLUMN evidencia_presencial JSON NULL,
           ADD COLUMN firma_conformidad_datos JSON NULL`
      );
    },
  },
  // CU39, CU41 — parámetros de presencialidad y de certificación multi-factor
  {
    nombre: 'Parametros de evidencia de sesion (CU39/CU41)',
    descripcion: 'Radio de presencialidad y tolerancia del protocolo multi-factor',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave = 'RADIO_PRESENCIALIDAD_METROS'`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('RADIO_PRESENCIALIDAD_METROS', '200', 'Distancia máxima en metros entre los check-in GPS del paciente y del profesional.', 1),
         ('TOLERANCIA_MULTIFACTOR_MINUTOS', '15', 'Diferencia máxima en minutos entre marcas de presencia para certificar una sesión.', 1)`
      );
    },
  },
  // CU66 — Registrando y Validando Bonos de Cobertura
  {
    nombre: 'Financiadores con convenio (CU66)',
    descripcion: 'Siembra los financiadores simulados si la tabla esta vacia',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(`SELECT 1 FROM Financiador LIMIT 1`);
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Financiador (nombre_institucion, rut_institucion, convenio_activo) VALUES
         ('FONASA (simulado)', '61.603.000-0', TRUE),
         ('ISAPRE Salud Plena (simulada)', '96.856.780-2', TRUE)`
      );
    },
  },
  // CU23, CU24 — entrevista de triaje y su paso a la ficha
  {
    nombre: 'Tabla Triaje (CU23/CU24)',
    descripcion: 'Entrevista clínica automatizada con reanudación e integración a ficha',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Triaje'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Triaje (
            triaje_id INT PRIMARY KEY AUTO_INCREMENT,
            estado ENUM('EN_PROGRESO', 'COMPLETADO') NOT NULL DEFAULT 'EN_PROGRESO',
            respuestas JSON,
            momento_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            momento_completado TIMESTAMP NULL,
            integrado BOOLEAN NOT NULL DEFAULT FALSE,
            paciente_id INT NOT NULL,
            FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id)
         )`
      );
    },
  },
  // CU47 — Prescribiendo pautas de ejercicio técnico
  {
    nombre: 'Pauta_Ejercicio con parametros de carga (CU47)',
    descripcion: 'Agrega id propio, series, repeticiones, frecuencia y material a cada ejercicio',
    // Antes esto era un unico ALTER TABLE gigante. Si cualquier parte fallaba
    // (por ejemplo, no habia PRIMARY KEY que borrar) se perdia el ALTER
    // completo, la tabla quedaba sin ninguna columna nueva y las consultas de
    // pautas reventaban en produccion con un 500. Ahora cada columna se agrega
    // por separado y un paso que falle no arrastra a los demas.
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Pauta_Ejercicio'
            AND COLUMN_NAME IN ('pauta_ejercicio_id', 'series', 'repeticiones',
                                'frecuencia', 'material_terapeutico_id')`,
        [baseDatos]
      );
      return filas[0].total === 5;
    },
    aplicar: async (conexion, baseDatos) => {
      const existeColumna = async (columna) => {
        const [filas] = await conexion.query(
          `SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Pauta_Ejercicio'
              AND COLUMN_NAME = ?`,
          [baseDatos, columna]
        );
        return filas.length > 0;
      };

      // 1. La clave primaria propia. Tiene que ir en una sola sentencia porque
      //    MySQL exige que una columna AUTO_INCREMENT sea clave de inmediato.
      if (!(await existeColumna('pauta_ejercicio_id'))) {
        try {
          await conexion.query(
            `ALTER TABLE Pauta_Ejercicio
               DROP PRIMARY KEY,
               ADD COLUMN pauta_ejercicio_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST`
          );
        } catch (error) {
          // La tabla puede no tener clave primaria previa que borrar.
          await conexion.query(
            `ALTER TABLE Pauta_Ejercicio
               ADD COLUMN pauta_ejercicio_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST`
          );
        }
      }

      // 2. Parametros de carga, uno por uno.
      const columnas = [
        ['series', `INT NOT NULL DEFAULT 1`],
        ['repeticiones', `INT NOT NULL DEFAULT 1`],
        ['frecuencia', `VARCHAR(20) NOT NULL DEFAULT 'DIARIA'`],
        ['material_terapeutico_id', `INT NULL`],
      ];
      for (const [columna, definicion] of columnas) {
        if (!(await existeColumna(columna))) {
          await conexion.query(
            `ALTER TABLE Pauta_Ejercicio ADD COLUMN ${columna} ${definicion}`
          );
        }
      }

      // 3. Indice y llave foranea: son mejoras de integridad, no requisitos
      //    para que la pantalla funcione, asi que un fallo aca no detiene nada.
      try {
        await conexion.query(
          `ALTER TABLE Pauta_Ejercicio
             ADD UNIQUE KEY uq_pauta_nombre (pauta_tratamiento_id, nombre_ejercicio)`
        );
      } catch (error) {
        console.warn(`   (indice uq_pauta_nombre omitido: ${error.code || error.message})`);
      }
      try {
        await conexion.query(
          `ALTER TABLE Pauta_Ejercicio
             ADD CONSTRAINT fk_pauta_ejercicio_material
               FOREIGN KEY (material_terapeutico_id)
               REFERENCES Material_Terapeutico(material_terapeutico_id)`
        );
      } catch (error) {
        console.warn(`   (llave foranea de material omitida: ${error.code || error.message})`);
      }
    },
  },
  // CU48 — Registrando cumplimiento diario de tareas
  {
    nombre: 'Tabla Pauta_Cumplimiento (CU48)',
    descripcion: 'Registro diario de cumplimiento de ejercicios, con control anti-rebote',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Pauta_Cumplimiento'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Pauta_Cumplimiento(
            pauta_cumplimiento_id INT PRIMARY KEY AUTO_INCREMENT,
            pauta_ejercicio_id INT NOT NULL,
            fecha DATE NOT NULL,
            momento_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_ejercicio_dia (pauta_ejercicio_id, fecha),
            FOREIGN KEY (pauta_ejercicio_id) REFERENCES Pauta_Ejercicio(pauta_ejercicio_id)
         )`
      );
    },
  },
  // CU46 — Seleccionando material en biblioteca centralizada
  {
    nombre: 'Catalogo inicial de Material_Terapeutico (CU46)',
    descripcion: 'Siembra la biblioteca con recursos de ejemplo si esta vacia',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(`SELECT 1 FROM Material_Terapeutico LIMIT 1`);
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Material_Terapeutico (nombre, tipo, url_archivo, categoria, formato, disponibilidad) VALUES
         ('Elongación de isquiotibiales', 'GUIA', 'https://biblioteca.frosalud.cl/isquiotibiales', 'Kinesiología', 'PDF', TRUE),
         ('Fortalecimiento de cuádriceps', 'GUIA', 'https://biblioteca.frosalud.cl/cuadriceps', 'Kinesiología', 'PDF', TRUE),
         ('Movilidad de hombro con banda', 'VIDEO', 'https://biblioteca.frosalud.cl/hombro-banda', 'Kinesiología', 'MP4', TRUE),
         ('Respiración diafragmática guiada', 'VIDEO', 'https://biblioteca.frosalud.cl/respiracion', 'Kinesiología Respiratoria', 'MP4', TRUE),
         ('Ejercicios de expansión torácica', 'GUIA', 'https://biblioteca.frosalud.cl/expansion-toracica', 'Kinesiología Respiratoria', 'PDF', TRUE),
         ('Pauta de hidratación y colaciones', 'GUIA', 'https://biblioteca.frosalud.cl/hidratacion', 'Nutrición', 'PDF', TRUE),
         ('Plan de comidas semanal base', 'PLANTILLA', 'https://biblioteca.frosalud.cl/plan-comidas', 'Nutrición', 'PDF', TRUE),
         ('Rutina de marcha progresiva (versión 2019)', 'GUIA', 'https://biblioteca.frosalud.cl/marcha-2019', 'Kinesiología', 'PDF', FALSE)`
      );
    },
  },
  // CU08 — Gestionando sesiones y tokens de acceso
  {
    nombre: 'Tabla Sesion_Usuario (CU08)',
    descripcion: 'Registro de sesiones activas por dispositivo, revocables',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Sesion_Usuario'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Sesion_Usuario (
            sesion_usuario_id INT PRIMARY KEY AUTO_INCREMENT,
            jti CHAR(36) NOT NULL UNIQUE,
            dispositivo VARCHAR(120),
            ip_origen VARCHAR(45),
            momento_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            activa BOOLEAN DEFAULT TRUE,
            usuario_id INT NOT NULL,
            FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
         )`
      );
    },
  },
  // CU09 — Configurando privacidad de datos de contacto
  {
    nombre: 'Paciente.privacidad_contacto (CU09)',
    descripcion: 'Preferencias de visibilidad de los datos de contacto',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Paciente'
            AND COLUMN_NAME = 'privacidad_contacto'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Paciente ADD COLUMN privacidad_contacto JSON NULL`
      );
    },
  },
  // CU17, CU18 — plazos para reprogramar o cancelar
  {
    nombre: 'Parametros de anticipacion de agenda (CU17/CU18)',
    descripcion: 'Agrega los plazos mínimos para reprogramar y cancelar citas',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global
          WHERE clave = 'ANTICIPACION_MINIMA_REPROGRAMACION_HORAS'`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('ANTICIPACION_MINIMA_REPROGRAMACION_HORAS', '24', 'Horas mínimas de anticipación con que un paciente puede reprogramar su cita.', 1),
         ('ANTICIPACION_MINIMA_CANCELACION_HORAS', '2', 'Horas mínimas de anticipación con que un paciente puede cancelar su cita.', 1)`
      );
    },
  },
  // CU10, CU14 — modalidad de cada bloque del horario del profesional
  {
    nombre: 'Profesional_Disponibilidad.modalidad',
    descripcion: 'Agrega la modalidad (DOMICILIO/ONLINE/AMBOS) a cada bloque horario',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Profesional_Disponibilidad'
            AND COLUMN_NAME = 'modalidad'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Profesional_Disponibilidad
           ADD COLUMN modalidad ENUM('DOMICILIO', 'ONLINE', 'AMBOS')
             NOT NULL DEFAULT 'DOMICILIO'`
      );
      // Los bloques ya existentes heredan la modalidad que el profesional
      // declaró al registrarse, para no dejarlos todos como DOMICILIO.
      await conexion.query(
        `UPDATE Profesional_Disponibilidad pd
           JOIN Profesional p ON p.profesional_id = pd.profesional_id
            SET pd.modalidad = p.tipo_sede`
      );
    },
  },
  // CU08 — Gestionando sesiones y tokens de acceso
  {
    nombre: 'Sesion_Usuario.dispositivo_id (CU08)',
    descripcion: 'Identifica cada instalacion para que reingresar no acumule sesiones duplicadas',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Sesion_Usuario'
            AND COLUMN_NAME = 'dispositivo_id'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Sesion_Usuario ADD COLUMN dispositivo_id VARCHAR(64)`
      );
    },
  },
  // CU31, CU33 — repositorio de documentos y versiones de evolución
  {
    nombre: 'Tablas de documentos y versiones (CU31/CU33)',
    descripcion: 'Crea Evolucion_Version (correcciones auditadas) y Documento_Clinico (repositorio multimedia)',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT COUNT(*) AS total FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('Evolucion_Version', 'Documento_Clinico')`,
        [baseDatos]
      );
      return filas[0].total === 2;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE IF NOT EXISTS Evolucion_Version (
            version_id INT PRIMARY KEY AUTO_INCREMENT,
            numero_version INT NOT NULL,
            texto_correccion TEXT NOT NULL,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            evolucion_clinica_id INT NOT NULL,
            profesional_id INT NOT NULL,
            FOREIGN KEY (evolucion_clinica_id) REFERENCES Evolucion_Clinica(Evolucion_clinica_id),
            FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
        )`
      );
      await conexion.query(
        `CREATE TABLE IF NOT EXISTS Documento_Clinico (
            documento_id INT PRIMARY KEY AUTO_INCREMENT,
            nombre_original VARCHAR(255) NOT NULL,
            categoria VARCHAR(40) NOT NULL DEFAULT 'SIN_CLASIFICAR',
            formato VARCHAR(10) NOT NULL,
            tamano_bytes INT NOT NULL,
            tipo_recurso VARCHAR(10) NOT NULL,
            url_publica VARCHAR(500) NOT NULL,
            public_id_cloud VARCHAR(255) NOT NULL,
            fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paciente_id INT NOT NULL,
            episodio_clinico_id INT,
            profesional_id INT NOT NULL,
            FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
            FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id),
            FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)
        )`
      );
    },
  },
  // CU31, CU33 — límites de archivos y de versiones
  {
    nombre: 'Parametros de multimedia y versionado (CU31/CU33)',
    descripcion: 'Limite de tamaño de archivos y tope de versiones de corrección',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT COUNT(*) AS total FROM Parametro_Global
          WHERE clave IN ('MAX_TAMANO_ARCHIVO_MB', 'MAX_VERSIONES_CORRECCION')`
      );
      return filas[0].total === 2;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT IGNORE INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
          ('MAX_TAMANO_ARCHIVO_MB', '10', 'Tamaño máximo en megabytes aceptado al cargar archivos al repositorio multimedia.', 1),
          ('MAX_VERSIONES_CORRECCION', '5', 'Cantidad máxima de correcciones versionadas permitidas sobre una evolución clínica cerrada.', 1)`
      );
    },
  },
  // CU41 — Validando sesión mediante protocolo multi-factor
  {
    nombre: 'Cita.sesion_certificada_en (CU41)',
    descripcion: 'Persiste en la cita cuando y como se certifico la sesion',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Cita'
            AND COLUMN_NAME = 'sesion_certificada_en'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Cita
           ADD COLUMN sesion_certificada_en DATETIME NULL,
           ADD COLUMN certificacion_tipo VARCHAR(20) NULL`
      );
    },
  },
  // CU35 — Visualizando archivos con visor embebido
  {
    nombre: 'Documento_Clinico.paginas (CU35)',
    descripcion: 'Cantidad de paginas de los PDF para el visor pagina a pagina',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Documento_Clinico' AND COLUMN_NAME = 'paginas'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`ALTER TABLE Documento_Clinico ADD COLUMN paginas INT NULL`);
    },
  },
  // CU78 — Agrupando registros bajo entidad episodio clínico
  {
    nombre: 'Cita.episodio_clinico_id (vinculo cita-episodio)',
    descripcion: 'Conecta cada cita con el episodio clinico que genero',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Cita'
            AND COLUMN_NAME = 'episodio_clinico_id'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`ALTER TABLE Cita ADD COLUMN episodio_clinico_id INT NULL`);
      // La llave foranea es deseable pero no imprescindible: si falla por
      // datos historicos, la columna igual queda utilizable.
      try {
        await conexion.query(
          `ALTER TABLE Cita ADD CONSTRAINT fk_cita_episodio
             FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id)`
        );
      } catch (error) {
        console.warn(`   (llave foranea cita-episodio omitida: ${error.code || error.message})`);
      }
    },
  },
  // CU18, CU20 — cancelación separada por paciente o profesional
  {
    nombre: 'Cita.estado con cancelacion por actor (D2)',
    descripcion: 'Amplia la columna y separa CANCELADA en CANCELADA_PACIENTE / CANCELADA_PROFESIONAL',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Cita' AND COLUMN_NAME = 'estado'`,
        [baseDatos]
      );
      return String(filas[0]?.tipo || '').toLowerCase() === 'varchar(30)';
    },
    aplicar: async (conexion) => {
      // 'CANCELADA_PROFESIONAL' tiene 21 caracteres: no cabía en VARCHAR(20).
      await conexion.query(
        `ALTER TABLE Cita MODIFY COLUMN estado VARCHAR(30) NOT NULL DEFAULT 'AGENDADA'`
      );
      // Las cancelaciones antiguas se reclasifican con el rol que quedó en la
      // trazabilidad (CU22); sin rastro, se asume cancelada por el paciente.
      await conexion.query(
        `UPDATE Cita c
            SET c.estado = CASE
              WHEN EXISTS (
                SELECT 1 FROM Bitacora_Auditoria b
                 WHERE b.entidad_afectada = 'Cita'
                   AND JSON_EXTRACT(b.datos_adicionales, '$.cita_id') = c.cita_id
                   AND JSON_UNQUOTE(JSON_EXTRACT(b.datos_adicionales, '$.nuevo_estado')) = 'CANCELADA'
                   AND JSON_UNQUOTE(JSON_EXTRACT(b.datos_adicionales, '$.rol_actor')) IN ('Profesional', 'Administrador')
              ) THEN 'CANCELADA_PROFESIONAL'
              ELSE 'CANCELADA_PACIENTE'
            END
          WHERE c.estado = 'CANCELADA'`
      );
    },
  },
  // CU41 — Validando sesión mediante protocolo multi-factor
  {
    nombre: 'Cita: suspension de validacion multi-factor (D11)',
    descripcion: 'Guarda cuando y por que se suspendio la certificacion, para derivarla al Administrador',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Cita' AND COLUMN_NAME = 'sesion_suspendida_en'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Cita
           ADD COLUMN sesion_suspendida_en DATETIME NULL,
           ADD COLUMN motivo_suspension JSON NULL`
      );
    },
  },
  // CU10 — Administrando catálogo de perfil profesional
  {
    nombre: 'Profesional.areas_experticia (CU10)',
    descripcion: 'Areas de experticia del catalogo publico del profesional',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Profesional' AND COLUMN_NAME = 'areas_experticia'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`ALTER TABLE Profesional ADD COLUMN areas_experticia VARCHAR(255) NULL`);
    },
  },
  // CU78 — Agrupando registros bajo entidad episodio clínico
  {
    nombre: 'Episodio_Clinico.estado ABIERTO por defecto (D12)',
    descripcion: 'Los episodios sin estado pasan a ABIERTO; los cerrados dejan de admitir registros',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT COLUMN_DEFAULT AS valor FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Episodio_Clinico' AND COLUMN_NAME = 'estado'`,
        [baseDatos]
      );
      return String(filas[0]?.valor || '').toUpperCase() === 'ABIERTO';
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Episodio_Clinico ALTER COLUMN estado SET DEFAULT 'ABIERTO'`
      );
      await conexion.query(
        `UPDATE Episodio_Clinico SET estado = 'ABIERTO'
          WHERE estado IS NULL OR TRIM(estado) = ''`
      );
    },
  },
  // CU78 — Agrupando registros bajo entidad episodio clínico
  {
    nombre: 'Episodio_Clinico.fecha_terminado sin valor por defecto (CU78)',
    descripcion: 'El episodio abierto no tiene fecha de termino: antes nacia terminado en el mismo instante',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT IS_NULLABLE AS nulos FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Episodio_Clinico' AND COLUMN_NAME = 'fecha_terminado'`,
        [baseDatos]
      );
      return String(filas[0]?.nulos || '').toUpperCase() === 'YES';
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Episodio_Clinico
           MODIFY COLUMN fecha_terminado TIMESTAMP NULL DEFAULT NULL`
      );
      // Los episodios ya creados arrastran una fecha de termino falsa (la de su
      // creacion). Solo los cerrados tienen un termino real.
      await conexion.query(
        `UPDATE Episodio_Clinico
            SET fecha_terminado = NULL
          WHERE UPPER(TRIM(COALESCE(estado, ''))) <> 'CERRADO'`
      );
    },
  },
  // CU10, CU14 — comunas que cubre el profesional a domicilio
  {
    nombre: 'Tabla Profesional_Comuna (CU10/CU14)',
    descripcion: 'Comunas en las que atiende cada profesional, para filtrar la busqueda del paciente',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Profesional_Comuna'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Profesional_Comuna (
            profesional_id INT NOT NULL,
            comuna_id INT NOT NULL,
            PRIMARY KEY (profesional_id, comuna_id),
            FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
            FOREIGN KEY (comuna_id) REFERENCES Comuna(comuna_id)
         )`
      );
    },
  },
  // CU52 — Emitiendo notificaciones multicanal
  {
    nombre: 'Notificacion con titulo y datos (CU52)',
    descripcion: 'Titulo del aviso y carga util para abrir la pantalla correcta al tocarlo',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Notificacion' AND COLUMN_NAME = 'datos'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`ALTER TABLE Notificacion ADD COLUMN titulo VARCHAR(120) NULL AFTER tipo`);
      await conexion.query(`ALTER TABLE Notificacion ADD COLUMN datos JSON NULL AFTER contenido`);
    },
  },
  // CU52 — Emitiendo notificaciones multicanal
  {
    nombre: 'Tabla Preferencia_Notificacion (CU52)',
    descripcion: 'Canales de salida que acepta cada usuario: push y correo',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Preferencia_Notificacion'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Preferencia_Notificacion (
            usuario_id INT PRIMARY KEY,
            canal_push BOOLEAN NOT NULL DEFAULT TRUE,
            canal_email BOOLEAN NOT NULL DEFAULT TRUE,
            ultima_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
         )`
      );
    },
  },
  // CU52 — Emitiendo notificaciones multicanal
  {
    nombre: 'Tabla Dispositivo_Push (CU52)',
    descripcion: 'Tokens de notificacion push por dispositivo, listos para cuando exista build propia',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Dispositivo_Push'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Dispositivo_Push (
            dispositivo_push_id INT PRIMARY KEY AUTO_INCREMENT,
            token VARCHAR(255) NOT NULL UNIQUE,
            plataforma VARCHAR(20) NOT NULL DEFAULT 'DESCONOCIDA',
            activo BOOLEAN NOT NULL DEFAULT TRUE,
            momento_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            usuario_id INT NOT NULL,
            FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
         )`
      );
    },
  },
  // CU21 — Confirmando asistencia a cita de forma distribuida
  {
    nombre: 'Tabla Solicitud_Confirmacion (CU21)',
    descripcion: 'Solicitud de confirmacion de asistencia con token de un solo uso y vencimiento',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Solicitud_Confirmacion'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Solicitud_Confirmacion (
            solicitud_confirmacion_id INT PRIMARY KEY AUTO_INCREMENT,
            token VARCHAR(64) NOT NULL UNIQUE,
            momento_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            momento_expira TIMESTAMP NOT NULL,
            momento_respuesta TIMESTAMP NULL,
            respuesta VARCHAR(20) NULL,
            canal_respuesta VARCHAR(20) NULL,
            cita_id INT NOT NULL UNIQUE,
            FOREIGN KEY (cita_id) REFERENCES Cita(cita_id)
         )`
      );
    },
  },
  // CU19 — Gestionando lista de espera secuencial
  {
    nombre: 'Lista_Espera secuencial con plazo (CU19)',
    descripcion: 'Estado del turno, momento de aviso y vencimiento para ofrecer el cupo de a uno',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Lista_Espera' AND COLUMN_NAME = 'estado'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion, baseDatos) => {
      await conexion.query(
        `ALTER TABLE Lista_Espera
           ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'ESPERANDO' AFTER notificado,
           ADD COLUMN momento_notificacion TIMESTAMP NULL AFTER estado,
           ADD COLUMN momento_expira TIMESTAMP NULL AFTER momento_notificacion`
      );
      // Las inscripciones anteriores ya avisadas se dan por atendidas: con la
      // regla nueva habrian quedado esperando un turno que nadie les ofrece.
      await conexion.query(
        `UPDATE Lista_Espera SET estado = 'VENCIDO' WHERE notificado = TRUE`
      );
      // Un paciente no puede estar dos veces en la misma lista.
      const [duplicados] = await conexion.query(
        `SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Lista_Espera'
            AND INDEX_NAME = 'uq_espera_cita_paciente' LIMIT 1`,
        [baseDatos]
      );
      if (duplicados.length === 0) {
        await conexion.query(
          `DELETE le FROM Lista_Espera le
             JOIN Lista_Espera otra
               ON otra.cita_id = le.cita_id
              AND otra.paciente_id = le.paciente_id
              AND otra.lista_espera_id < le.lista_espera_id`
        );
        await conexion.query(
          `ALTER TABLE Lista_Espera
             ADD UNIQUE KEY uq_espera_cita_paciente (cita_id, paciente_id)`
        );
      }
    },
  },
  // CU19, CU21, CU52 — plazos de avisos, confirmación y lista de espera
  {
    nombre: 'Parametros de avisos, confirmacion y lista de espera (CU19/CU21/CU52)',
    descripcion: 'Plazos del bloque de notificaciones y agenda del Incremento 3',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave = 'MAX_PACIENTES_LISTA_ESPERA' LIMIT 1`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('ANTICIPACION_SOLICITUD_CONFIRMACION_HORAS', '24', 'Horas antes de la cita en que se pide al paciente confirmar su asistencia.', 1),
         ('VIGENCIA_ENLACE_CONFIRMACION_HORAS', '48', 'Horas que dura el enlace de confirmacion enviado por correo.', 1),
         ('MAX_PACIENTES_LISTA_ESPERA', '5', 'Cantidad maxima de pacientes inscritos en la lista de espera de un mismo bloque.', 1),
         ('PLAZO_RESPUESTA_LISTA_ESPERA_MINUTOS', '30', 'Minutos que tiene el primero de la lista para tomar el cupo antes de cederlo al siguiente.', 1)`
      );
    },
  },
  // CU25, CU26 — reporte pre-clínico y especialidad sugerida
  {
    nombre: 'Tabla Reporte_Preclinico (CU25/CU26)',
    descripcion: 'Sintesis del triaje con banderas rojas y especialidad sugerida',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Reporte_Preclinico'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Reporte_Preclinico (
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
         )`
      );
    },
  },
  // CU50 — Generando y notificando alerta por deterioro clínico
  {
    nombre: 'Tabla Reporte_Sintoma (CU50)',
    descripcion: 'Reportes de evolucion que el paciente envia entre sesiones',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Reporte_Sintoma'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Reporte_Sintoma (
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
         )`
      );
    },
  },
  // CU50 — Generando y notificando alerta por deterioro clínico
  {
    nombre: 'Tabla Alerta_Clinica (CU50)',
    descripcion: 'Banderas rojas que llegan al panel del profesional',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Alerta_Clinica'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Alerta_Clinica (
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
         )`
      );
    },
  },
  // CU25, CU50 — parámetros del reporte pre-clínico y del deterioro
  {
    nombre: 'Parametros de triaje inteligente y deterioro (CU25/CU50)',
    descripcion: 'Umbrales del reporte pre-clinico y de las alertas por deterioro',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave = 'UMBRAL_DOLOR_CRITICO' LIMIT 1`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('UMBRAL_DOLOR_CRITICO', '8', 'Nivel de dolor (0-10) desde el cual el reporte del paciente levanta una alerta.', 1),
         ('UMBRAL_ALZA_DOLOR', '3', 'Puntos de aumento del dolor respecto al reporte anterior que levantan una alerta.', 1),
         ('MINIMO_RESPUESTAS_PRECLINICO', '4', 'Respuestas minimas del triaje para generar un reporte util; bajo eso se marca Informacion Insuficiente.', 1),
         ('LATENCIA_MAXIMA_REPORTE_MS', '2000', 'Milisegundos sobre los cuales la carga del reporte pre-clinico queda anotada como lenta en la bitacora.', 1)`
      );
    },
  },
  // CU44 — Actualizando indicadores de adherencia y síntomas
  {
    nombre: 'Tabla Indicador_Adherencia (CU44)',
    descripcion: 'Indice de adherencia por dia, base de la curva de progreso del paciente',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Indicador_Adherencia'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Indicador_Adherencia (
            indicador_adherencia_id INT PRIMARY KEY AUTO_INCREMENT,
            fecha DATE NOT NULL,
            porcentaje TINYINT NOT NULL,
            tareas_programadas INT NOT NULL,
            tareas_cumplidas INT NOT NULL,
            momento_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            paciente_id INT NOT NULL,
            UNIQUE KEY uq_adherencia_dia (paciente_id, fecha),
            FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id)
         )`
      );
    },
  },
  // CU44 — Actualizando indicadores de adherencia y síntomas
  {
    nombre: 'Parametros de adherencia (CU44)',
    descripcion: 'Umbral de adherencia critica y minimo de tareas para alertar',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave = 'UMBRAL_ADHERENCIA_CRITICA' LIMIT 1`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('UMBRAL_ADHERENCIA_CRITICA', '50', 'Porcentaje de adherencia bajo el cual se levanta una bandera roja al profesional.', 1),
         ('MINIMO_TAREAS_PARA_ALERTA_ADHERENCIA', '5', 'Tareas programadas minimas antes de poder alertar por adherencia baja.', 1)`
      );
    },
  },
  // CU53 — Comunicando mediante mensajería clínica cifrada
  {
    nombre: 'Mensaje_Chat con remitente y lectura (CU53)',
    descripcion: 'Quien escribe cada mensaje del chat clinico y si la otra parte ya lo leyo',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Mensaje_Chat'
            AND COLUMN_NAME = 'remitente_usuario_id'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      // La tabla nunca se uso: si hubiera filas antiguas no tendrian remitente,
      // asi que se limpian antes de exigir la columna.
      await conexion.query(`DELETE FROM Mensaje_Chat`);
      await conexion.query(
        `ALTER TABLE Mensaje_Chat
           ADD COLUMN remitente_usuario_id INT NOT NULL AFTER momento_envio,
           ADD COLUMN leido BOOLEAN NOT NULL DEFAULT FALSE AFTER remitente_usuario_id,
           ADD KEY idx_chat_episodio (episodio_clinico_id, mensaje_id),
           ADD CONSTRAINT fk_chat_remitente
               FOREIGN KEY (remitente_usuario_id) REFERENCES Usuario(usuario_id)`
      );
    },
  },
  // CU57 — Filtrando automáticamente contenido restringido
  {
    nombre: 'Tabla Palabra_Restringida (CU57)',
    descripcion: 'Diccionario de terminos no permitidos, con siembra inicial',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Palabra_Restringida'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Palabra_Restringida (
            palabra_restringida_id INT PRIMARY KEY AUTO_INCREMENT,
            termino VARCHAR(80) NOT NULL UNIQUE,
            categoria VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
            activa BOOLEAN NOT NULL DEFAULT TRUE,
            momento_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            administrador_id INT NULL,
            FOREIGN KEY (administrador_id) REFERENCES Usuario(usuario_id)
         )`
      );
      // Siembra minima para que el filtro exista desde el primer arranque. El
      // administrador la edita desde su panel; son terminos de ejemplo, no una
      // lista definitiva.
      await conexion.query(
        `INSERT INTO Palabra_Restringida (termino, categoria, administrador_id) VALUES
         ('idiota', 'OFENSA', 1),
         ('estupido', 'OFENSA', 1),
         ('imbecil', 'OFENSA', 1),
         ('tarado', 'OFENSA', 1),
         ('charlatan', 'DESCALIFICACION', 1),
         ('curandero', 'DESCALIFICACION', 1)`
      );
    },
  },
  // CU55, CU56 — evaluación post-sesión y moderación de reseñas
  {
    nombre: 'Evaluacion_Satisfaccion con moderacion (CU55/CU56)',
    descripcion: 'Estado de moderacion con causal y responsable, en vez de un booleano',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Evaluacion_Satisfaccion'
            AND COLUMN_NAME = 'motivo_rechazo'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Evaluacion_Satisfaccion
           MODIFY COLUMN estado_moderacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
           ADD COLUMN motivo_rechazo VARCHAR(255) NULL AFTER estado_moderacion,
           ADD COLUMN moderador_id INT NULL AFTER motivo_rechazo,
           ADD COLUMN momento_moderacion TIMESTAMP NULL AFTER moderador_id,
           ADD CONSTRAINT fk_evaluacion_moderador
               FOREIGN KEY (moderador_id) REFERENCES Usuario(usuario_id)`
      );
      // El booleano anterior queda como '0'/'1' al cambiar de tipo: se
      // normaliza a los estados nuevos.
      await conexion.query(
        `UPDATE Evaluacion_Satisfaccion
            SET estado_moderacion = CASE WHEN estado_moderacion = '1' THEN 'APROBADA' ELSE 'PENDIENTE' END
          WHERE estado_moderacion IN ('0', '1')`
      );
    },
  },
  // CU60, CU61 — solicitudes de soporte y su enrutamiento
  {
    nombre: 'Ticket_Soporte con enrutamiento y adjunto (CU60/CU61)',
    descripcion: 'Operador asignado, momento de enrutamiento, adjunto y resolucion',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Ticket_Soporte'
            AND COLUMN_NAME = 'asignado_a'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Ticket_Soporte
           ADD COLUMN asignado_a INT NULL AFTER momento_resuelto,
           ADD COLUMN momento_enrutamiento TIMESTAMP NULL AFTER asignado_a,
           ADD COLUMN adjunto_url VARCHAR(500) NULL AFTER momento_enrutamiento,
           ADD COLUMN resolucion VARCHAR(500) NULL AFTER adjunto_url,
           ADD CONSTRAINT fk_ticket_operador
               FOREIGN KEY (asignado_a) REFERENCES Usuario(usuario_id)`
      );
    },
  },
  // CU61 — Enrutando automáticamente solicitudes por categoría
  {
    nombre: 'Tabla Area_Soporte_Operador (CU61)',
    descripcion: 'Areas que atiende cada operador; sin operador, el ticket va a supervision general',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Area_Soporte_Operador'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Area_Soporte_Operador (
            usuario_id INT NOT NULL,
            categoria VARCHAR(50) NOT NULL,
            PRIMARY KEY (usuario_id, categoria),
            FOREIGN KEY (usuario_id) REFERENCES Usuario(usuario_id)
         )`
      );
    },
  },
  // CU60, CU63 — parámetros de soporte y de informes
  {
    nombre: 'Parametros de soporte y reportes (CU60/CU63)',
    descripcion: 'Limite del adjunto de un ticket y tope de filas por tomo de informe',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave = 'MAX_ADJUNTO_TICKET_MB' LIMIT 1`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('MAX_ADJUNTO_TICKET_MB', '5', 'Peso maximo en MB de la imagen que se adjunta a un ticket de soporte.', 1),
         ('MAX_FILAS_POR_TOMO_INFORME', '2000', 'Filas por tomo al exportar un informe; sobre eso se divide en partes.', 1)`
      );
    },
  },
  // CU75 — Liquidando ganancias en panel financiero
  {
    nombre: 'Tabla Liquidacion (CU75)',
    descripcion: 'Historial mensual de liquidaciones por profesional, inalterable',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Liquidacion'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Liquidacion (
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
         )`
      );
    },
  },
  // CU73, CU74, CU75 — parámetros de cobro, devoluciones y liquidación
  {
    nombre: 'Parametros de comercializacion y liquidacion (CU73/CU74/CU75)',
    descripcion: 'Descuento de los planes, ventana de actualizacion y honorario del profesional',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave = 'DESCUENTO_PAQUETE_PORCENTAJE' LIMIT 1`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('DESCUENTO_PAQUETE_PORCENTAJE', '10', 'Descuento porcentual al comprar un plan de sesiones en vez de sesiones sueltas.', 1),
         ('HORAS_ANTICIPACION_DEVOLUCION', '24', 'Anticipacion minima de una cancelacion para que corresponda devolucion total.', 1),
         ('PORCENTAJE_HONORARIO_PROFESIONAL', '70', 'Porcentaje del arancel que se liquida al profesional por cada prestacion validada.', 1),
         ('LATENCIA_MAXIMA_LIQUIDACION_MS', '2000', 'Milisegundos sobre los cuales el calculo de la liquidacion queda anotado como lento.', 1)`
      );
    },
  },
  // CU47 — Prescribiendo pautas de ejercicio técnico (el material va por ejercicio)
  {
    nombre: 'Eliminar Pauta_Material (D8)',
    descripcion: 'La tabla no la usa ningun flujo: el material se asocia por ejercicio',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Pauta_Material'`,
        [baseDatos]
      );
      return filas.length === 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`DROP TABLE IF EXISTS Pauta_Material`);
    },
  },
  // CU19 — Gestionando lista de espera secuencial
  {
    nombre: 'Lista_Espera.token_cupo (CU19 desde el correo)',
    descripcion: 'Enlace seguro para tomar el cupo liberado directamente desde el correo',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Lista_Espera' AND COLUMN_NAME = 'token_cupo'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Lista_Espera
           ADD COLUMN token_cupo VARCHAR(64) NULL,
           ADD UNIQUE KEY uq_lista_espera_token (token_cupo)`
      );
    },
  },
  // CU58 — Calculando y visualizando calificación profesional
  {
    nombre: 'Paciente.resena_anonima (CU58)',
    descripcion: 'El paciente decide si su nombre aparece bajo sus calificaciones escritas',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Paciente' AND COLUMN_NAME = 'resena_anonima'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Paciente ADD COLUMN resena_anonima BOOLEAN NOT NULL DEFAULT FALSE`
      );
    },
  },
  // ── Incremento 4 ──────────────────────────────────────────────────────────
  // CU51, CU37 — preparación para el alta e informe de alta
  {
    nombre: 'Alta del tratamiento en Episodio_Clinico (CU51/CU37)',
    descripcion: 'Preparación para el alta, pautas de continuidad e informe de alta del episodio',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Episodio_Clinico' AND COLUMN_NAME = 'preparacion_alta_en'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Episodio_Clinico
           ADD COLUMN preparacion_alta_en TIMESTAMP NULL DEFAULT NULL,
           ADD COLUMN pautas_continuidad TEXT NULL,
           ADD COLUMN informe_alta_documento_id INT NULL,
           ADD COLUMN informe_alta_emitido_en TIMESTAMP NULL DEFAULT NULL,
           ADD CONSTRAINT fk_episodio_informe_alta FOREIGN KEY (informe_alta_documento_id) REFERENCES Documento_Clinico(documento_id)`
      );
    },
  },
  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  {
    nombre: 'Material_Terapeutico.proposito e imagen (CU51)',
    descripcion: 'Distingue el material de tratamiento del de prevención y mantenimiento post-alta',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Material_Terapeutico' AND COLUMN_NAME = 'proposito'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Material_Terapeutico
           ADD COLUMN proposito VARCHAR(20) NOT NULL DEFAULT 'TRATAMIENTO',
           ADD COLUMN imagen_url VARCHAR(255) NULL`
      );
    },
  },
  // CU51 — Habilitando Automáticamente Contenidos de Preparación para el Alta
  {
    nombre: 'Catalogo de prevencion y mantenimiento (CU51)',
    descripcion: 'Siembra los contenidos que se habilitan al alcanzar el umbral de egreso',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(`SELECT 1 FROM Material_Terapeutico WHERE proposito = 'PREVENCION' LIMIT 1`);
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Material_Terapeutico (nombre, tipo, url_archivo, categoria, formato, disponibilidad, proposito, imagen_url) VALUES
         ('Rutina de mantenimiento articular', 'GUIA', 'https://biblioteca.frosalud.cl/mantenimiento-articular', 'Kinesiología', 'PDF', TRUE, 'PREVENCION', 'https://res.cloudinary.com/demo/image/upload/w_800/sample.jpg'),
         ('Estiramientos para prevenir recaídas', 'VIDEO', 'https://biblioteca.frosalud.cl/estiramientos-prevencion', 'Kinesiología', 'MP4', TRUE, 'PREVENCION', NULL),
         ('Higiene postural en el trabajo y el hogar', 'GUIA', 'https://biblioteca.frosalud.cl/higiene-postural', 'Kinesiología', 'PDF', TRUE, 'PREVENCION', NULL),
         ('Ejercicios respiratorios de mantención', 'VIDEO', 'https://biblioteca.frosalud.cl/respiratorios-mantencion', 'Kinesiología Respiratoria', 'MP4', TRUE, 'PREVENCION', 'https://res.cloudinary.com/demo/image/upload/w_800/sample.jpg'),
         ('Señales de alarma respiratoria: cuándo consultar', 'GUIA', 'https://biblioteca.frosalud.cl/alarma-respiratoria', 'Kinesiología Respiratoria', 'PDF', TRUE, 'PREVENCION', NULL),
         ('Hábitos para mantener un peso saludable', 'GUIA', 'https://biblioteca.frosalud.cl/peso-saludable', 'Nutrición', 'PDF', TRUE, 'PREVENCION', NULL),
         ('Lista de compras saludable', 'PLANTILLA', 'https://biblioteca.frosalud.cl/lista-compras', 'Nutrición', 'PDF', TRUE, 'PREVENCION', NULL)`
      );
    },
  },
  // CU51, CU37 — umbral de avance para habilitar el alta
  {
    nombre: 'Parametro UMBRAL_EGRESO_CLINICO (CU51/CU37)',
    descripcion: 'Porcentaje de cumplimiento de metas que habilita la preparación para el alta',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(`SELECT 1 FROM Parametro_Global WHERE clave = 'UMBRAL_EGRESO_CLINICO'`);
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('UMBRAL_EGRESO_CLINICO', '80', 'Porcentaje promedio de cumplimiento de las metas del episodio a partir del cual el paciente ve sus contenidos de prevención y el profesional puede emitir el informe de alta.', 1)`
      );
    },
  },
  // CU54 — Enviando Mensajes de Refuerzo Positivo
  {
    nombre: 'Preferencia_Notificacion.refuerzos (CU54)',
    descripcion: 'El paciente activa o desactiva los mensajes de refuerzo positivo',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Preferencia_Notificacion' AND COLUMN_NAME = 'refuerzos'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Preferencia_Notificacion ADD COLUMN refuerzos BOOLEAN NOT NULL DEFAULT TRUE`
      );
    },
  },
  // CU62 — Escalando Automáticamente Eventos Críticos a Supervisión
  {
    nombre: 'Tabla Evento_Critico (CU62)',
    descripcion: 'Eventos escalados a supervisión por términos críticos, con acuse de recibo',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Evento_Critico'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `CREATE TABLE Evento_Critico (
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
         )`
      );
    },
  },
  // CU62 — Escalando Automáticamente Eventos Críticos a Supervisión
  {
    nombre: 'Terminos criticos del diccionario (CU62)',
    descripcion: 'Categoría CRITICO: no bloquea el texto, lo escala a supervisión',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(`SELECT 1 FROM Palabra_Restringida WHERE categoria = 'CRITICO' LIMIT 1`);
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT IGNORE INTO Palabra_Restringida (termino, categoria, administrador_id) VALUES
         ('suicidarme', 'CRITICO', 1),
         ('matarme', 'CRITICO', 1),
         ('quitarme la vida', 'CRITICO', 1),
         ('no quiero vivir', 'CRITICO', 1),
         ('me quiero morir', 'CRITICO', 1),
         ('dolor en el pecho', 'CRITICO', 1),
         ('no puedo respirar', 'CRITICO', 1),
         ('me desmaye', 'CRITICO', 1),
         ('sangrado', 'CRITICO', 1),
         ('emergencia', 'CRITICO', 1)`
      );
    },
  },
  // CU65 — Registrando y Siguiendo Derivaciones Internas
  {
    nombre: 'Derivacion_Interna: respuesta y cierre (CU65)',
    descripcion: 'Momento y comentario de la respuesta del profesional derivado, y momento de cierre',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Derivacion_Interna' AND COLUMN_NAME = 'momento_respuesta'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Derivacion_Interna
           ADD COLUMN momento_respuesta TIMESTAMP NULL DEFAULT NULL,
           ADD COLUMN comentario_respuesta VARCHAR(255) NULL,
           ADD COLUMN momento_cierre TIMESTAMP NULL DEFAULT NULL`
      );
    },
  },
  // CU72 — Ingresando Datos mediante Interfaz de Contingencia
  {
    nombre: 'Bono: registro manual por contingencia (CU72)',
    descripcion: 'Bono PROVISORIO ingresado a mano: financiador escrito a mano, quién y cuándo lo registró, regularización',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Bono' AND COLUMN_NAME = 'registrado_por_usuario_id'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      // Exc. 2: sin catálogo de financiadores el bono se registra con texto libre.
      await conexion.query(`ALTER TABLE Bono MODIFY COLUMN financiador_id INT NULL`);
      await conexion.query(
        `ALTER TABLE Bono
           ADD COLUMN financiador_manual VARCHAR(100) NULL,
           ADD COLUMN registrado_por_usuario_id INT NULL,
           ADD COLUMN momento_registro_manual TIMESTAMP NULL DEFAULT NULL,
           ADD COLUMN regularizado_en TIMESTAMP NULL DEFAULT NULL,
           ADD CONSTRAINT fk_bono_registrado_por FOREIGN KEY (registrado_por_usuario_id) REFERENCES Usuario(usuario_id)`
      );
    },
  },
  // CU72 — Ingresando Datos mediante Interfaz de Contingencia
  {
    nombre: 'Parametros de contingencia del financiador (CU72)',
    descripcion: 'Modo de contingencia forzado y ventana de detección automática',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave IN ('MODO_CONTINGENCIA_FINANCIADOR', 'VENTANA_CONTINGENCIA_MINUTOS')`
      );
      return filas.length >= 2;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT IGNORE INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('MODO_CONTINGENCIA_FINANCIADOR', '0', 'Con 1 se habilita a mano el ingreso de bonos por contingencia aunque el financiador responda; con 0 se activa solo cuando el financiador no responde.', 1),
         ('VENTANA_CONTINGENCIA_MINUTOS', '30', 'Minutos que dura la contingencia automática después de que el financiador deja de responder (se apaga antes si vuelve a responder).', 1)`
      );
    },
  },
  // CU53 — Comunicando mediante mensajería clínica cifrada
  {
    nombre: 'Chat general por paciente y profesional, con adjuntos (CU53)',
    descripcion: 'Una conversación por pareja en vez de una por episodio; imágenes, archivos y documentos de la ficha en el chat',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Mensaje_Chat' AND COLUMN_NAME = 'paciente_id'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Mensaje_Chat
           ADD COLUMN paciente_id INT NULL,
           ADD COLUMN profesional_id INT NULL,
           ADD COLUMN adjunto_url VARCHAR(500) NULL,
           ADD COLUMN adjunto_public_id VARCHAR(255) NULL,
           ADD COLUMN adjunto_nombre VARCHAR(255) NULL,
           ADD COLUMN adjunto_formato VARCHAR(10) NULL,
           ADD COLUMN adjunto_tipo_recurso VARCHAR(10) NULL,
           ADD COLUMN adjunto_bytes INT NULL,
           ADD COLUMN adjunto_paginas INT NULL,
           ADD COLUMN documento_id INT NULL`
      );
      // Las conversaciones de cada episodio pasan a la de su pareja.
      await conexion.query(
        `UPDATE Mensaje_Chat m
           JOIN Episodio_Clinico e ON e.episodio_clinico_id = m.episodio_clinico_id
            SET m.paciente_id = e.paciente_id, m.profesional_id = e.profesional_id`
      );
      await conexion.query(
        `ALTER TABLE Mensaje_Chat
           MODIFY COLUMN episodio_clinico_id INT NULL,
           ADD KEY idx_chat_pareja (paciente_id, profesional_id, mensaje_id),
           ADD CONSTRAINT fk_chat_paciente FOREIGN KEY (paciente_id) REFERENCES Paciente(paciente_id),
           ADD CONSTRAINT fk_chat_profesional FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id),
           ADD CONSTRAINT fk_chat_documento FOREIGN KEY (documento_id) REFERENCES Documento_Clinico(documento_id)`
      );
    },
  },
  // CU09 — Configurando privacidad de datos de contacto (foto del perfil del paciente)
  {
    nombre: 'Paciente.foto_url (foto de perfil opcional)',
    descripcion: 'Fotografía del paciente; sin ella se muestran sus iniciales',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Paciente' AND COLUMN_NAME = 'foto_url'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`ALTER TABLE Paciente ADD COLUMN foto_url VARCHAR(500) NULL`);
    },
  },
  // CU38, CU40 — sesión finalizada que se documenta después
  {
    nombre: 'Cita.documentacion_pendiente (documentar al final de la jornada)',
    descripcion: 'Sesión finalizada cuyo registro clínico se completa después',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Cita' AND COLUMN_NAME = 'documentacion_pendiente'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`ALTER TABLE Cita ADD COLUMN documentacion_pendiente BOOLEAN NOT NULL DEFAULT FALSE`);
    },
  },
  // CU47 — Prescribiendo pautas de ejercicio técnico
  {
    nombre: 'Pautas: días de la semana y material de apoyo por ejercicio (CU47)',
    descripcion: 'Días específicos en que se realiza cada ejercicio y archivos de apoyo subidos al ejercicio',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Pauta_Ejercicio' AND COLUMN_NAME = 'dias_semana'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(`ALTER TABLE Pauta_Ejercicio ADD COLUMN dias_semana VARCHAR(20) NULL`);
      await conexion.query(
        `CREATE TABLE IF NOT EXISTS Pauta_Ejercicio_Material (
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
         )`
      );
    },
  },
  // CU39 — Validando presencialidad mediante coordenadas GPS
  {
    nombre: 'Presencialidad automática: radio 100 m y ventana de ubicación del paciente (CU39)',
    descripcion: 'Las marcas las dispara el profesional; la ubicación del paciente vale 30 minutos',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(`SELECT 1 FROM Parametro_Global WHERE clave = 'VENTANA_UBICACION_PACIENTE_MINUTOS'`);
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `INSERT IGNORE INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('VENTANA_UBICACION_PACIENTE_MINUTOS', '30', 'Minutos durante los que vale la última ubicación que envió la app del paciente para validar la presencialidad.', 1)`
      );
      await conexion.query(
        `UPDATE Parametro_Global
            SET valor = '100',
                descripcion = 'Distancia máxima en metros entre el profesional y el paciente en visitas a domicilio.'
          WHERE clave = 'RADIO_PRESENCIALIDAD_METROS'`
      );
    },
  },  /* CU55 — Evaluando satisfacción post-sesión */ {
    nombre: 'Evaluación por sesión (satisfacción) y por tratamiento (estrellas) (CU55)',
    descripcion: 'Por cita solo sí/no y comentario; la nota en estrellas se pide al cerrar el episodio',
    yaAplicada: async (conexion, baseDatos) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Evaluacion_Satisfaccion' AND COLUMN_NAME = 'tipo'`,
        [baseDatos]
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      await conexion.query(
        `ALTER TABLE Evaluacion_Satisfaccion
           MODIFY COLUMN puntuacion TINYINT NULL,
           MODIFY COLUMN cita_id INT NULL,
           ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'SESION',
           ADD COLUMN satisfecho BOOLEAN NULL,
           ADD COLUMN episodio_clinico_id INT NULL,
           ADD COLUMN profesional_id INT NULL`
      );
      // Las evaluaciones anteriores eran por cita y con estrellas: se conservan
      // y siguen contando en el promedio del profesional.
      await conexion.query(
        `UPDATE Evaluacion_Satisfaccion e JOIN Cita c ON c.cita_id = e.cita_id
            SET e.profesional_id = c.profesional_id`
      );
      await conexion.query(
        `ALTER TABLE Evaluacion_Satisfaccion
           ADD UNIQUE KEY uq_eval_episodio (episodio_clinico_id),
           ADD CONSTRAINT fk_eval_episodio FOREIGN KEY (episodio_clinico_id) REFERENCES Episodio_Clinico(episodio_clinico_id),
           ADD CONSTRAINT fk_eval_profesional FOREIGN KEY (profesional_id) REFERENCES Profesional(profesional_id)`
      );
    },
  },  /* CU53, CU62 — el chat cifrado no se escala con extractos */ {
    nombre: 'Retirar del escalamiento los mensajes del chat cifrado (CU53/CU62)',
    descripcion: 'Borra los eventos críticos que guardaron un extracto de un mensaje del chat',
    yaAplicada: async (conexion) => {
      const [filas] = await conexion.query(
        `SELECT 1 FROM Parametro_Global WHERE clave = 'CHAT_FUERA_DE_ESCALAMIENTO'`
      );
      return filas.length > 0;
    },
    aplicar: async (conexion) => {
      // El extracto del mensaje quedó sin cifrar en la bandeja del
      // administrador: se borran esos eventos (la bitácora conserva solo que
      // hubo un escalamiento y sus términos, nunca el texto).
      await conexion.query(`DELETE FROM Evento_Critico WHERE origen = 'CHAT'`);
      // Marca de que ya se hizo, para que no se repita en cada arranque.
      await conexion.query(
        `INSERT IGNORE INTO Parametro_Global (clave, valor, descripcion, administrador_id) VALUES
         ('CHAT_FUERA_DE_ESCALAMIENTO', '1', 'El chat cifrado no escala eventos críticos: solo lo leen el paciente y su profesional.', 1)`
      );
    },
  },
];

/**
 * Ejecuta las migraciones pendientes sobre una conexión o pool ya abiertos.
 * La usa tanto este script como el servidor al arrancar (server.js), así la
 * base queda al día automáticamente en cada despliegue sin pasos manuales.
 */
async function ejecutarMigraciones(conexion) {
  const [[{ baseDatos }]] = await conexion.query('SELECT DATABASE() AS baseDatos');
  let aplicadas = 0;

  for (const migracion of MIGRACIONES) {
    if (await migracion.yaAplicada(conexion, baseDatos)) {
      continue;
    }

    console.log(`• Migración "${migracion.nombre}" — aplicando… (${migracion.descripcion})`);
    // El nombre de la base va como segundo argumento: algunas migraciones lo
    // necesitan para consultar information_schema y decidir qué falta.
    try {
      await migracion.aplicar(conexion, baseDatos);
      aplicadas++;
      console.log('  ✅ Lista.');
    } catch (error) {
      // Una migración que falla NO puede dejar sin aplicar a las siguientes:
      // antes, un error acá abortaba el resto y la base quedaba a medias sin
      // que nada lo dijera. Se informa fuerte y se continúa con las demás.
      console.error(
        `  ❌ Falló "${migracion.nombre}": ${error.sqlMessage || error.message}\n` +
        `     La base quedó incompleta para esa función. Revisa /api/diagnostico.`
      );
    }
  }

  if (aplicadas > 0) {
    console.log(`✅ ${aplicadas} migración(es) aplicada(s). Base de datos al día.`);
  }
  return aplicadas;
}

module.exports = { ejecutarMigraciones, MIGRACIONES };

// ── Uso directo por consola: npm run db:migrar ──────────────────────────────
async function main() {
  const url = urlConexion();
  const base = { multipleStatements: false, ...opcionesSSL() };

  const conexion = url
    ? await mysql.createConnection({ uri: url, ...base })
    : await mysql.createConnection({ ...datosSueltos(), ...base });

  try {
    const aplicadas = await ejecutarMigraciones(conexion);
    if (aplicadas === 0) {
      console.log('La base de datos ya estaba al día.');
    }
  } finally {
    await conexion.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n❌ No se pudo migrar: ${error.message}`);
    console.error('   Revisa los datos de conexión en tu archivo .env');
    process.exit(1);
  });
}
