/**
 * Componente: C_API_REST
 * Casos de uso: apoyo común, usado por CU01, CU02.
 *
 * Entrega el listado de comunas para los formularios de registro.
 */
const C_Capa_de_Acceso_a_Datos = require('../componentes/C_Capa_de_Acceso_a_Datos');

// Apoyo común: listado público de comunas para registrar pacientes y profesionales
exports.obtenerComunas = async (req, res) => {
    try {
        const [filas] = await C_Capa_de_Acceso_a_Datos.query('SELECT comuna_id, nombre FROM Comuna ORDER BY nombre ASC');
        res.status(200).json(filas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener comunas' });
    }
};