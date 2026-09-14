const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const profesionalRoutes = require('./routes/profesionalRoutes');
const clinicaRoutes = require('./routes/clinicaRoutes');
const citaRoutes = require('./routes/citaRoutes');
const inalterabilidadRoutes = require('./routes/inalterabilidadRoutes');
const parametroRoutes = require('./routes/parametroRoutes');

const integracionDemoRoutes = require('./routes/integracionDemoRoutes');
const pagoRoutes = require('./routes/pagoRoutes');
const pagoController = require('./controllers/pagoController');

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

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Servidor operativo'
    });
});

/**
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
    const { ARBOL_TRIAJE } = require('./services/clinico/triajeService');

    res.status(200).json({
        version: {
            commit: (process.env.RENDER_GIT_COMMIT || 'desconocido (fuera de Render)').slice(0, 8),
            rama: process.env.RENDER_GIT_BRANCH || null,
        },
        zona_horaria: process.env.TZ || '(no definida)',
        hora_servidor: `${p(ahora.getDate())}/${p(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${p(ahora.getHours())}:${p(ahora.getMinutes())}`,
        // Preguntas vivas de la entrevista previa (solo sus identificadores).
        entrevista_previa: { preguntas: Object.keys(ARBOL_TRIAJE.nodos) },
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
    });
});

/**
 * Estado real del ESQUEMA de la base desplegada. Las migraciones se aplican
 * solas al arrancar, pero si alguna falla el servidor sigue funcionando y la
 * pantalla afectada devuelve un 500 genérico ("servicio no disponible") sin
 * decir por qué. Esto muestra, sin exponer datos, qué migraciones quedaron
 * pendientes y si están las tablas y columnas que cada pantalla necesita.
 *
 *   https://<tu-servidor>/api/diagnostico/base-datos
 */
app.get('/api/diagnostico/base-datos', async (req, res) => {
    const pool = require('./config/database');

    try {
        const [[{ baseDatos }]] = await pool.query('SELECT DATABASE() AS baseDatos');

        // 1. Estado de cada migración automática.
        const { MIGRACIONES } = require('../scripts/migrar-db');
        const migraciones = [];
        for (const migracion of MIGRACIONES) {
            let aplicada;
            try {
                aplicada = await migracion.yaAplicada(pool, baseDatos);
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

        const [columnas] = await pool.query(
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

app.use('/api/auth', authRoutes);
app.use('/api/profesionales', profesionalRoutes);
app.use('/api/clinica', clinicaRoutes);
app.use('/api/citas', citaRoutes);
app.use('/api/inalterabilidad', inalterabilidadRoutes);
app.use('/api/parametros', parametroRoutes);

app.use('/api/integracion-demo', integracionDemoRoutes);
app.use('/api/pagos', pagoRoutes);

// Simulador del financiador externo (CU66/CU69). Sin autenticación de la app:
// representa al proveedor foráneo; exige su propia credencial X-Api-Key.
app.post('/api/financiador-simulado/validar-bono', express.json(), pagoController.financiadorSimulado);

module.exports = app;