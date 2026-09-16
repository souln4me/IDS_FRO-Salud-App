# Guía de Instalación y Despliegue - FRO Salud

Esta guía detalla los pasos necesarios para instalar, configurar y ejecutar el entorno de desarrollo local de la aplicación FRO Salud (Vista y Controlador).

[Video guía de instalación del Sistema - Incremento 1](https://drive.google.com/file/d/1eLFtI8UtEgKLBEWcWh41RKkWUYzGCzV2/view?usp=sharing)

[Video guía de instalación del Sistema - Incremento 2](https://drive.google.com/file/d/1_xMmd3us80S_haojx5Ob2dhY5-8mHdj7/view?usp=sharing)

## 1. Requisitos Previos (Herramientas necesarias)
Antes de comenzar, asegúrese de tener instalados los siguientes programas en su computador:

- Node.js (Versión 18 o superior).

- MySQL Server (Versión 8.0 o superior) y un cliente de gestión como MySQL Workbench o la extensión database client de visual studio.

- Git y Github Desktop (Para clonar el repositorio).

- Expo Go. [Expo.apk Drive Download](https://drive.google.com/file/d/1TRcHjcN04z99trjF9duqZB4O9h5sxXJX/view?usp=sharing)

## 2. Configuración del Servidor (Controlador)

El controlador está construido con Node.js y Express, y es el encargado de gestionar la lógica de negocio. La base de datos, el envío de correos y el almacenamiento de archivos **ya viven en la nube**, por lo que no es necesario instalar MySQL, generar contraseñas de aplicación en Gmail, ni ejecutar scripts de creación de base de datos. Aun así, es necesario instalar sus dependencias localmente para poder trabajar sobre el código; la aplicación móvil, por su parte, se conecta directamente al controlador ya desplegado en la nube (Render.com).

- **Aiven.io**: aloja la base de datos en la nube.
- **Render.com**: aloja las APIs y el controlador en su versión desplegada.
- **Brevo.com**: gestiona el envío de correos (OTP y notificaciones).
- **Cloudinary**: almacena los archivos e imágenes subidos desde la app.

### Paso 2.1: Instalación de Dependencias
1. Abra una terminal y navegue hasta la carpeta del controlador:

```
cd fro-controlador
```
2. Instale los módulos necesarios ejecutando:
```
npm install
```
3. Abra otra terminal y navegue hasta la carpeta de la vista:
```
cd fro-vista
```
4. Instale los módulos necesarios ejecutando nuevamente:
```
npm install
```

### Paso 2.2: Configuración de Variables de Entorno (.env)
1. Dentro de la carpeta `fro-controlador`, busque el archivo llamado **.env.example**.
2. Haga una copia de ese archivo y renómbrela a **.env**.
3. Complete el archivo con las credenciales de conexión a la base de datos en la nube (Aiven.io) y con las credenciales del servicio de correo (Brevo o SMTP). A continuación se muestra un ejemplo:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tucorreo@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx
```

> **Nota:** las credenciales de base de datos, correo y Cloudinary ya están generadas y son compartidas por el equipo. No es necesario instalar MySQL localmente, generar una Contraseña de Aplicación propia en Gmail, ni ejecutar `npm run db:importar` o el `schema.sql`, ya que la base de datos vive en Aiven y ya está creada con sus tablas y datos iniciales.

## 3. Configuración de la Aplicación Móvil (Vista)

La vista está construida con React Native y Expo. Para que la aplicación en el celular pueda hablar con el controlador desplegado en la nube (Render.com), solo necesita apuntar al `.env` a la URL correspondiente.

### Paso 3.1: Configurar la conexión (archivo .env)

La dirección del servidor se define en un archivo de entorno, así cada uno usa la suya sin generar conflictos en Git.

1. Dentro de la carpeta `fro-vista`, copie el archivo `.env.example` y renómbrelo a `.env`.
2. Escriba adentro la dirección del servidor:

```
EXPO_PUBLIC_API_URL=http://enlacedeejemplo.com/
```

   Reemplace `http://enlacedeejemplo.com/` por la dirección real de Render.com.

3. Cada vez que cambie este archivo, reinicie Expo con `npx expo start -c` para que tome la nueva dirección.

### Paso 3.2: Levantar la Vista (Modo Desarrollo)
1. Ejecute el siguiente comando para iniciar el empaquetador de Expo:

```
npx expo start -c
```
2. Aparecerá un código QR en la terminal. Escanéelo con la aplicación Expo Go en su celular (asegúrese de que el celular y el PC estén conectados a la misma red Wi-Fi).
