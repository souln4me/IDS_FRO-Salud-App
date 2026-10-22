# Guía de Instalación y Despliegue - Punto Paz Salud

Esta guía detalla los pasos necesarios para instalar, configurar y ejecutar el entorno de desarrollo local de la aplicación Punto Paz Salud (Vista y Controlador).

[Video guía de instalación del Sistema - Incremento 1](https://drive.google.com/file/d/1eLFtI8UtEgKLBEWcWh41RKkWUYzGCzV2/view?usp=sharing)

[Video guía de instalación del Sistema - Incremento 2](https://drive.google.com/file/d/1_xMmd3us80S_haojx5Ob2dhY5-8mHdj7/view?usp=sharing)

[Video guía de instalación del Sistema - Incremento 3](https://drive.google.com/file/d/1Te3ZVsdT2w2XvmSlFMz2knO7yfjF3HiU/view?usp=sharing)

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
### Paso 2.2: Inicialización de la Base de Datos

Con MySQL instalado y encendido, ejecute dentro de `fro-controlador`:

```
npm run db:local
```

El script (`src/database/mysql/iniciar-db-local.js`, junto a `schema.sql`) hace
todo solo: crea el `.env` si no existe y le pregunta el usuario y la contraseña
de MySQL, crea la base `fro_salud_db`, carga `schema.sql` (tablas y datos
iniciales), aplica las migraciones pendientes y verifica que todo quedó en
orden. Se puede volver a ejecutar las veces que quiera: si la base ya existe no
la toca. Para partir de cero: `npm run db:local -- --reiniciar`.

Además deja tres cuentas de prueba activas para entrar desde la app sin pasar
por el correo de verificación (RUT / contraseña):

| Rol | RUT | Contraseña |
|---|---|---|
| Administrador | `111111111` | `Prueba.2026` |
| Profesional | `222222222` | `Prueba.2026` |
| Paciente | `333333333` | `Prueba.2026` |

### Paso 2.3: Levantar el Controlador
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

   Si en vez del controlador local quiere usar el de la nube, ponga ahí la dirección
   que compartió el equipo.

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
