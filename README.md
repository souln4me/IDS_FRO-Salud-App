# Guía de Instalación y Despliegue - FRO Salud (Incremento 1)

> ### ⚡ ¿Solo quieres probar la app?
> Ya no hace falta instalar MySQL ni levantar el backend: **están en la nube**.
> Sigue la [**Guía de la nube**](GUIA-NUBE.md) (Parte 2) y en 5 minutos tienes la
> app andando. Son tres pasos: clonar, crear un archivo `.env` con la dirección
> del servidor, y `npx expo start -c`.
>
> Esta guía de abajo sirve si necesitas montar **todo el entorno local**
> (backend + base de datos en tu propio computador), por ejemplo para
> desarrollar el servidor.

Esta guía detalla los pasos necesarios para instalar, configurar y ejecutar el entorno de desarrollo local de la aplicación FRO Salud (Vista y Controlador).

[Video guía de instalación del Sistema](https://drive.google.com/file/d/1eLFtI8UtEgKLBEWcWh41RKkWUYzGCzV2/view?usp=sharing)

## 1. Requisitos Previos (Herramientas necesarias)
Antes de comenzar, asegúrese de tener instalados los siguientes programas en su computador:

- Node.js (Versión 18 o superior).

- MySQL Server (Versión 8.0 o superior) y un cliente de gestión como MySQL Workbench o la extensión database client de visual studio.

- Git y Github Desktop (Para clonar el repositorio).

- Expo Go. [Expo.apk Drive Download](https://drive.google.com/file/d/1TRcHjcN04z99trjF9duqZB4O9h5sxXJX/view?usp=sharing)

## 2. Configuración del Servidor (Controlador)
El controlador está construido con Node.js y Express, y es el encargado de gestionar la lógica de negocio y la conexión con la base de datos.

### Paso 2.1: Instalación de Dependencias
1. Abra una terminal y navegue hasta la carpeta del controlador:

```
cd fro-controlador
```
2. Instale los módulos necesarios ejecutando:
```
npm install
```
### Paso 2.2: Configuración de Variables de Entorno (.env)
1. Dentro de la carpeta fro-controlador, busque el archivo llamado **.env.example**.

2. Haga una copia de ese archivo y renómbrela a **.env**.

### Configuración del Servicio de Correo (OTP por Gmail)
Para el funcionamiento del Caso de Uso 04 (Verificación OTP), el controlador requiere enviar correos electrónicos reales utilizando el servicio SMTP de Gmail. Por políticas de seguridad, Google no permite utilizar la contraseña estándar de la cuenta, sino que exige generar una Contraseña de Aplicación.

Para configurar este servicio localmente, siga estos pasos:

1. Ingrese a la cuenta de Google (Gmail) que actuará como remitente del sistema.

2. Vaya a Gestionar tu cuenta de Google > Seguridad.

3. Asegúrese de tener activada la Verificación en 2 pasos.

4. En el buscador de la cuenta de Google, escriba "Contraseñas de aplicación" y seleccione la opción.

5. Cree una nueva aplicación ingresando un nombre (ej. FRO Salud App) y presione Crear.

6. Google le entregará una clave segura de 16 caracteres (ej: abcd efgh ijkl mnop). Cópiela.

Para probar correctamente el flujo de registro completo en la aplicación móvil, asegúrese de ingresar un correo electrónico real y accesible en el formulario de Registro (Paciente o Profesional). De lo contrario, el código OTP de 6 dígitos será enviado a un buzón inexistente y no podrá finalizar la activación de la cuenta.

Abra el nuevo archivo **.env** y configure sus credenciales locales de MySQL y SMTP. Debería quedar algo similar a esto:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_clave # Su contraseña de MySQL local
DB_NAME=fro_salud_db

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tucorreo@gmail.com
SMTP_PASS=passwordapp

JWT_SECRET=tu_clave # puede ser otra contraseña sin necesidad que sea la misma de mYSQL
```
### Paso 2.3: Inicialización de la Base de Datos

**Opción A (recomendada, sin instalar nada extra):** con el `.env` ya configurado,
ejecute dentro de `fro-controlador`:

```
npm run db:importar
```

Esto crea la base `fro_salud_db`, todas las tablas y los datos iniciales. Si su
base ya existe y solo quiere cargar las tablas dentro de ella, agregue
`-- --sin-crear-base` al final del comando.

**Opción B (manual):**

1. Abra su gestor de bases de datos y conéctese a su servidor local (localhost).

2. Abra el archivo ubicado en ```fro-controlador/src/database/mysql/schema.sql```.

3. Ejecute todo el script. Esto creará automáticamente la base de datos fro_salud_db, todas sus tablas ordenadas y los usuarios/semillas iniciales necesarios.

### Paso 2.4: Levantar el Controlador
1. En la misma terminal que abrió en la carpeta fro-controlador, inicie el servidor:

```
npm start
```
(Debería ver un mensaje indicando "Servidor corriendo en el puerto 3000" y "Conectado a la base de datos MySQL").

## 3. Configuración de la Aplicación Móvil (Vista)
La vista está construido con React Native y Expo. Para que la aplicación en el celular pueda hablar con el servidor en su computador, necesitamos sincronizar sus direcciones IP.

### Paso 3.1: Descubrir su Dirección IP local
1. Abra una nueva terminal (deje el controlador corriendo en la otra).

2. En cmd o powershell, ejecute el comando ipconfig.

3. Busque la línea que dice "Dirección IPv4" (ej. 192.168.1.80) y anótela.

### Paso 3.2: Configurar la conexión (archivo .env)

Ya **no** se edita `client.js` a mano. La dirección del servidor se define en un
archivo de entorno, así cada uno usa la suya sin generar conflictos en Git.

1. Dentro de la carpeta `fro-vista`, copie el archivo `.env.example` y renómbrelo
   a `.env`.

2. Escriba adentro la dirección del servidor:

```
EXPO_PUBLIC_API_URL=http://192.168.1.130:3000
```

   Reemplace `192.168.1.130` por la IP que acaba de anotar. **No use
   `localhost`**: desde el celular, "localhost" apunta al propio celular.

   Si en vez del backend local quiere usar el de la nube, ponga ahí la dirección
   que compartió el equipo (ver [GUIA-NUBE.md](GUIA-NUBE.md)).

3. Cada vez que cambie este archivo, reinicie Expo con `npx expo start -c` para
   que tome la nueva dirección.

### Paso 3.3: Instalación de Dependencias
1. En su terminal, navegue a la carpeta de la vista:

```
cd fro-vista
```
2. Instale los módulos ejecutando:

```
npm install
```
### Paso 3.4: Levantar la Vista (Modo Desarrollo)
1. Ejecute el siguiente comando para iniciar el empaquetador de Expo:

```
npx expo start
```
2. Aparecerá un código QR en la terminal. Escanéelo con la aplicación Expo Go en su celular (asegúrese de que el celular y el PC estén conectados a la misma red Wi-Fi).
