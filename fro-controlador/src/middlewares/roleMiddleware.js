const pool = require('../config/database');

// D6: antes esto escribía en logs/security_audit.log. En Render el disco es
// efímero y el archivo se perdía en cada despliegue, así que el bloqueo va a
// la tabla Bitacora_Auditoria. Es mejor esfuerzo: un fallo al auditar no
// puede convertirse en un 500 para el usuario.
async function registrarBloqueo(req, userId, userRole) {
    try {
        await pool.query(
            `INSERT INTO Bitacora_Auditoria (accion, entidad_afectada, ip_origen, datos_adicionales, usuario_id)
             VALUES ('BLOQUEO_ACCESO_RBAC', 'Usuario', ?, ?, ?)`,
            [
                req.ip || null,
                JSON.stringify({ rol: userRole, metodo: req.method, ruta: req.originalUrl }),
                userId || null,
            ]
        );
    } catch (error) {
        console.error('[RBAC] No se pudo registrar el bloqueo en la bitácora:', error.message);
    }
}

/**
 * Middleware de Autorización RBAC (Control de Acceso Basado en Roles)
 * @param {Array<string>} allowedRoles - Lista de roles permitidos (ej: ['Administrador', 'Profesional'])
 */
const authorizeRoles = (allowedRoles) => {
    return (req, res, next) => {
        try {
            const userRole = req.user?.nombre_rol;
            const userId = req.user?.usuario_id;

            // EXCEPCIÓN 2: Inconsistencia Estructural
            if (!userRole || typeof userRole !== 'string') {
                return res.status(500).json({
                    error: 'Error de configuración de perfil. Inconsistencia estructural detectada. Contacte al administrador del sistema.'
                });
            }

            // EXCEPCIÓN 4: Privilegios insuficientes
            if (!allowedRoles.includes(userRole)) {
                registrarBloqueo(req, userId, userRole);

                return res.status(403).json({
                    error: 'Acceso restringido. Su rol no cuenta con los privilegios necesarios para visualizar o modificar este recurso.'
                });
            }

            // FLUJO NORMAL
            next();

        } catch (error) {
            console.error(" Error en el motor de políticas (RBAC):", error);
            // EXCEPCIÓN 3: Falla en el servicio de autorización
            res.status(500).json({ 
                error: 'El servicio de validación de políticas no está disponible momentáneamente. Intente recargar.' 
            });
        }
    };
};

module.exports = {
    authorizeRoles
};