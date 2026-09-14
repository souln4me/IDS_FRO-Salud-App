const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { sesionVigente } = require('../services/auth/seguridadService');


const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Acceso denegado. Se requiere un Token de Acceso válido.'
            });
        }

        const token = authHeader.split(' ')[1];

        // Desencriptamos el token
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        // CU08: un token revocado desde otra sesión deja de servir al instante.
        if (payload.jti && !(await sesionVigente(pool, payload.jti))) {
            return res.status(401).json({
                error: 'La sesión fue cerrada desde otro dispositivo. Inicia sesión nuevamente.',
                code: 'SESION_REVOCADA',
            });
        }

        req.user = payload;

        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'La sesión ha expirado. Por favor, inicie sesión nuevamente.'
            });
        }
        // Si lo que falló fue consultar la sesión en la base (no el token),
        // responder 401 hacía que la app cerrara la sesión por una caída de red.
        if (error.name !== 'JsonWebTokenError' && error.name !== 'NotBeforeError') {
            console.error('[verifyToken] No se pudo validar la sesión:', error.code || error.message);
            return res.status(503).json({
                error: 'SERVICIO_NO_DISPONIBLE',
                mensaje: 'No se pudo comunicar con el servidor de datos. Intenta nuevamente en unos momentos.'
            });
        }
        return res.status(401).json({
            error: 'Token de seguridad inválido o corrupto.' 
        });
    }
};

module.exports = {
    verifyToken
};