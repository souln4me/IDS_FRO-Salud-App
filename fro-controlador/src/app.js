const express = require('express');
const cors = require('cors');

const app = express();

const authRoutes = require('./routes/authRoutes');
// Middlewares globales obligatorios
const citaRoutes = require('./routes/citaRoutes')
const profesionalRoutes = require("./routes/profesionalRoutes");

app.use(cors()); // Permite que la aplicación móvil hable con el controlador
app.use(express.json()); // Habilita la lectura de payloads en formato JSON

// Ruta de diagnóstico inicial (Prueba de disponibilidad)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Servidor operativo' });
});

app.use('/api/auth', authRoutes);
app.use('/api/citas', citaRoutes);
app.use("/api/profesionales", profesionalRoutes);

module.exports = app;