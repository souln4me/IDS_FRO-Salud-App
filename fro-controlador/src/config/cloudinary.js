// Ruta: fro-controlador/src/config/cloudinary.js
//
// Repositorio multimedia externo (CU33/CU35). Los archivos clínicos no pueden
// vivir en el disco de Render porque es efímero: cada despliegue lo borra.
// Cloudinary los persiste y entrega una URL estable que la app usa como visor.
//
// Credenciales por variables de entorno (en Render, nunca en el código):
//   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Sin credenciales el módulo de documentos responde 503 en vez de fallar raro.
function cloudinaryConfigurado() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

// Sube un buffer (archivo recibido por multer) y devuelve el resultado de
// Cloudinary. resource_type 'auto' clasifica solo: imagen, video o raw (PDF).
function subirBuffer(buffer, opciones = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto', ...opciones },
      (error, resultado) => (error ? reject(error) : resolve(resultado))
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, cloudinaryConfigurado, subirBuffer };
