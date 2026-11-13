/**
 * Componente: C_API_REST
 * Casos de uso: apoyo común, usado por CU53, CU66, CU69.
 *
 * Arma la aplicación Express: CORS, JSON, diagnóstico y el montaje de todas
 * las rutas bajo /api.
 */
const express = require('express');
const cors = require('cors');

const C_API_REST = require('./componentes/C_API_REST');
const pagoController = require('./controllers/pagoController');
const C_Cifrado_Mensajeria = require('./componentes/C_Cifrado_Mensajeria');
const C_Motor_Clinico = require('./componentes/C_Motor_Clinico');
const C_Capa_de_Acceso_a_Datos = require('./componentes/C_Capa_de_Acceso_a_Datos');

const app = express();

// En la nube conviene limitar quién puede llamar a la API. Si no se define
// CORS_ORIGIN se permite cualquier origen, que es lo cómodo en desarrollo.
// Se aceptan varios orígenes separados por coma.
const origenesPermitidos = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origen) => origen.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origenesPermitidos.includes('*') ? true : origenesPermitidos,
  })
);
app.use(express.json());

// Registro de actividad: una línea por petición con su caso de uso y los
// componentes que participan (ver services/registro/registroActividad.js).
app.use(require('./services/registro/registroActividad').registrarPeticiones);

// Apoyo común: chequeo de vida del servidor
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Servidor operativo'
    });
});

/**
 * Apoyo común: soporte técnico del despliegue.
 * Diagnóstico de configuración. Dice qué integraciones quedaron bien cargadas
 * en el servidor SIN revelar ningún secreto: solo si cada variable existe y,
 * cuando ayuda a detectar un error de pegado, su largo.
 *
 * Sirve para no adivinar cuando algo "no conecta": basta abrir
 *   https://<tu-servidor>/api/diagnostico
 * en el navegador y mirar qué aparece en false.
 */
app.get('/api/diagnostico', (req, res) => {
    const definida = (clave) => Boolean(process.env[clave]);

    const ahora = new Date();
    const p = (n) => String(n).padStart(2, '0');
    // Render expone el commit desplegado en RENDER_GIT_COMMIT: con esto se
    // sabe de inmediato si un cambio ya está vivo o si el despliegue aún no
    // termina (los free tier tardan varios minutos y arrancan en frío).

    res.status(200).json({
        version: {
            commit: (process.env.RENDER_GIT_COMMIT || 'desconocido (fuera de Render)').slice(0, 8),
            rama: process.env.RENDER_GIT_BRANCH || null,
        },
        zona_horaria: process.env.TZ || '(no definida)',
        hora_servidor: `${p(ahora.getDate())}/${p(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${p(ahora.getHours())}:${p(ahora.getMinutes())}`,
        // Preguntas vivas de la entrevista previa (solo sus identificadores).
        entrevista_previa: { preguntas: Object.keys(C_Motor_Clinico.ARBOL_TRIAJE.nodos) },
        base_de_datos: {
            // Una u otra forma de configuración basta.
            configurada: definida('DATABASE_URL') || definida('DB_HOST'),
        },
        correo: {
            // Con Brevo el correo sale por HTTPS; SMTP directo no funciona en
            // el plan gratuito de Render (bloquea los puertos 25, 465 y 587).
            brevo_configurado: definida('BREVO_API_KEY'),
            remitente_definido: definida('BREVO_SENDER') || definida('SMTP_USER'),
            smtp_configurado: definida('SMTP_USER') && definida('SMTP_PASS'),
            via_efectiva: definida('BREVO_API_KEY') ? 'Brevo (HTTPS)' : 'SMTP directo',
        },
        repositorio_multimedia: {
            // Los tres nombres deben ser EXACTOS, con el prefijo CLOUDINARY_.
            CLOUDINARY_CLOUD_NAME: definida('CLOUDINARY_CLOUD_NAME'),
            CLOUDINARY_API_KEY: definida('CLOUDINARY_API_KEY'),
            CLOUDINARY_API_SECRET: definida('CLOUDINARY_API_SECRET'),
            operativo:
                definida('CLOUDINARY_CLOUD_NAME') &&
                definida('CLOUDINARY_API_KEY') &&
                definida('CLOUDINARY_API_SECRET'),
        },
        // CU53: el chat clínico se guarda cifrado. Sin CLAVE_CIFRADO_CHAT la
        // clave se deriva del JWT_SECRET: funciona, pero si ese secreto cambia
        // los mensajes ya guardados dejan de poder leerse.
        mensajeria_cifrada: C_Cifrado_Mensajeria.estadoClave(),
    });
});

/**
 * Apoyo común: soporte técnico del despliegue.
 * Estado real del ESQUEMA de la base desplegada. Las migraciones se aplican
 * solas al arrancar, pero si alguna falla el servidor sigue funcionando y la
 * pantalla afectada devuelve un 500 genérico ("servicio no disponible") sin
 * decir por qué. Esto muestra, sin exponer datos, qué migraciones quedaron
 * pendientes y si están las tablas y columnas que cada pantalla necesita.
 *
 *   https://<tu-servidor>/api/diagnostico/base-datos
 */
app.get('/api/diagnostico/base-datos', async (req, res) => {
    try {
        const [[{ baseDatos }]] = await C_Capa_de_Acceso_a_Datos.query('SELECT DATABASE() AS baseDatos');

        // 1. Estado de cada migración automática.
        const { MIGRACIONES } = require('../scripts/migrar-db');
        const migraciones = [];
        for (const migracion of MIGRACIONES) {
            let aplicada;
            try {
                aplicada = await migracion.yaAplicada(C_Capa_de_Acceso_a_Datos, baseDatos);
            } catch (error) {
                aplicada = `error: ${error.sqlMessage || error.message}`;
            }
            migraciones.push({ nombre: migracion.nombre, aplicada });
        }

        // 2. Columnas concretas de las que dependen las pantallas que fallan.
        const requisitos = {
            'Pauta_Ejercicio': ['pauta_ejercicio_id', 'series', 'repeticiones',
                                'frecuencia', 'material_terapeutico_id'],
            'Pauta_Tratamiento': ['pauta_tratamiento_id'],
            'Pauta_Cumplimiento': ['pauta_ejercicio_id', 'fecha'],
            'Material_Terapeutico': ['material_terapeutico_id', 'disponibilidad'],
            'Cita': ['modalidad', 'evidencia_presencial', 'firma_conformidad_datos'],
            'Documento_Clinico': ['documento_id', 'categoria', 'url_publica'],
            'Evolucion_Version': ['version_id', 'numero_version'],
            'Sesion_Usuario': ['jti', 'dispositivo_id'],
        };

        const [columnas] = await C_Capa_de_Acceso_a_Datos.query(
            `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = ?`,
            [baseDatos]
        );
        const porTabla = new Map();
        for (const fila of columnas) {
            if (!porTabla.has(fila.TABLE_NAME)) porTabla.set(fila.TABLE_NAME, new Set());
            porTabla.get(fila.TABLE_NAME).add(fila.COLUMN_NAME);
        }

        const tablas = {};
        const faltantes = [];
        for (const [tabla, requeridas] of Object.entries(requisitos)) {
            const presentes = porTabla.get(tabla);
            if (!presentes) {
                tablas[tabla] = 'FALTA LA TABLA COMPLETA';
                faltantes.push(tabla);
                continue;
            }
            const sinColumna = requeridas.filter((c) => !presentes.has(c));
            tablas[tabla] = sinColumna.length === 0 ? 'OK' : `faltan columnas: ${sinColumna.join(', ')}`;
            sinColumna.forEach((c) => faltantes.push(`${tabla}.${c}`));
        }

        res.status(200).json({
            base: baseDatos,
            todo_en_orden: faltantes.length === 0,
            faltantes,
            tablas,
            migraciones,
        });
    } catch (error) {
        res.status(500).json({
            error: 'No se pudo revisar el esquema.',
            detalle: error.sqlMessage || error.message,
        });
    }
});

// C_API_REST: todas las rutas de la aplicación cuelgan de /api
// (ver src/componentes/C_API_REST.js).
app.use('/api', C_API_REST);

// Simulador del financiador externo (CU66/CU69). Sin autenticación de la app:
// representa al proveedor foráneo; exige su propia credencial X-Api-Key.
app.post('/api/financiador-simulado/validar-bono', express.json(), pagoController.financiadorSimulado);

module.exports = app;