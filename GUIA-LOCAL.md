# Guía: correr Punto Paz Salud en tu propio computador

Esta guía sirve para tener **todo en local**: el servidor y la base de datos en
tu computador, y la app en tu celular. No usa la base de datos de la nube, así
que lo que pruebes aquí no afecta a nadie más.

Si solo quieres probar la app con el servidor de la nube, no necesitas esta
guía: usa la [Guía de la nube](GUIA-NUBE.md).

Tiempo estimado: 15 minutos la primera vez.

---

## Antes de empezar: qué necesitas instalado

| Programa | Para qué | Dónde se baja |
|---|---|---|
| **Node.js** 20 o superior | Corre el servidor | nodejs.org (versión LTS) |
| **MySQL Server** 8 | Base de datos | dev.mysql.com/downloads/installer (Windows) o `brew install mysql` (Mac) |
| **Git** | Bajar el proyecto | git-scm.com |
| **Expo Go** en el celular | Ver la app | Play Store / App Store |

Cuando instales MySQL te pedirá una contraseña para el usuario `root`.
**Anótala**: la vas a necesitar en el paso 2.

Para comprobar que Node y Git quedaron bien, abre una terminal (PowerShell en
Windows, Terminal en Mac) y escribe:

```bash
node --version
```

```bash
git --version
```

Si los dos responden con un número de versión, sigue adelante.

---

## Paso 1: bajar el proyecto

En la terminal, párate en la carpeta donde quieras dejar el proyecto (por
ejemplo el Escritorio) y ejecuta:

```bash
git clone https://github.com/ThecheeseDX/IDS_FRO-Salud-App.git
```

```bash
cd IDS_FRO-Salud-App
```

> Si ya tenías el proyecto bajado, en vez de clonar entra a la carpeta y
> ejecuta `git pull` para traer lo último. Si lo bajaste como ZIP, es mejor
> borrarlo y clonar: con el ZIP no se puede actualizar.

---

## Paso 2: el servidor y la base de datos

Todo este paso se hace dentro de la carpeta `fro-controlador`:

```bash
cd fro-controlador
```

### 2.1 Instalar las dependencias (solo la primera vez)

```bash
npm install
```

Tarda uno o dos minutos. Los avisos amarillos (`WARN`) son normales.

### 2.2 Crear la base de datos con un solo comando

Asegúrate de que MySQL esté encendido (en Windows arranca solo al instalarlo;
si no, abre "Servicios" y arranca `MySQL80`). Luego:

```bash
npm run db:local
```

El script hace todo por ti y te va contando:

1. Crea el archivo de configuración `.env` y te pregunta la **contraseña de
   MySQL** (la que anotaste al instalarlo). No se ve mientras la escribes; es
   normal. Queda guardada, no la vuelve a pedir.
2. Prueba que MySQL responda.
3. Crea la base `fro_salud_db` con todas sus tablas y datos iniciales.
4. Aplica las migraciones (cambios de la base que vinieron después).
5. Crea tres cuentas de prueba (ver más abajo).
6. Verifica que quedó todo en orden.

Si termina con **"✅ Base de datos lista"**, sigue al 2.3.

Si dice que la base quedó incompleta (pasa cuando ya tenías una base vieja de
otra versión), bórrala y créala de nuevo con:

```bash
npm run db:local -- --reiniciar
```

(los dos guiones sueltos antes de `--reiniciar` son necesarios).

### 2.3 Encender el servidor

```bash
npm run dev
```

Tiene que aparecer:

```
✅ Conectado a MySQL exitosamente
🚀 Servidor backend escuchando en 0.0.0.0:3000
```

**Deja esta terminal abierta**: mientras esté abierta, el servidor está
funcionando. Para comprobarlo, abre en el navegador
<http://localhost:3000/api/diagnostico/base-datos>: debe decir
`"todo_en_orden": true`.

---

## Paso 3: la app en el celular

Abre **otra** terminal (la del servidor sigue abierta) y entra a `fro-vista`:

```bash
cd fro-vista
```

### 3.1 Averiguar la dirección de tu computador

El celular tiene que encontrar a tu computador en la red Wi-Fi. En la terminal:

- Windows: `ipconfig` → busca **Dirección IPv4** (algo como `192.168.1.80`).
- Mac: `ipconfig getifaddr en0`.

Anota esa dirección.

### 3.2 Decirle a la app dónde está el servidor

Dentro de `fro-vista` hay un archivo `.env.example`. Haz una copia llamada
`.env` y escribe adentro, con **tu** dirección:

```
EXPO_PUBLIC_API_URL=http://192.168.1.80:3000
```

No uses `localhost`: desde el celular, "localhost" es el propio celular.

### 3.3 Instalar e iniciar (dependencias solo la primera vez)

```bash
npm install
```

```bash
npx expo start -c
```

Aparece un código QR. En el celular, abre **Expo Go** y escanea el código
(Android: desde la app; iPhone: con la cámara). El celular y el computador
tienen que estar en la **misma red Wi-Fi**.

> La primera vez, Windows puede preguntar si permite que Node use la red: dale
> **Permitir** en redes privadas. Si no, el celular no va a poder conectarse.

---

## Cuentas de prueba

En local no hay correo configurado, así que registrarse desde la app (que pide
un código por correo) no funciona. Usa estas cuentas, que ya vienen creadas:

| Rol | RUT | Contraseña |
|---|---|---|
| Paciente | `333333333` | `Prueba.2026` |
| Profesional | `222222222` | `Prueba.2026` |
| Administrador | `111111111` | `Prueba.2026` |

El profesional ya tiene especialidad, comuna y horario de lunes a viernes, así
que el paciente puede agendarle una hora de inmediato.

---

## Cada vez que vuelvas a trabajar

Solo hacen falta dos terminales:

1. En `fro-controlador`: `npm run dev`
2. En `fro-vista`: `npx expo start -c`

Y cuando el equipo suba cambios: `git pull` en la carpeta del proyecto, y
`npm run db:local` de nuevo si avisan que hubo cambios en la base (es seguro:
no borra nada, solo aplica lo nuevo).

---

## Si algo falla

| Qué ves | Qué pasa | Qué hacer |
|---|---|---|
| `Missing script: "db:local"` | Tu copia del proyecto está desactualizada | `git pull` en la carpeta del proyecto |
| `Could not read package.json` / `ENOENT` | Estás en la carpeta equivocada | Entra a `fro-controlador` (o `fro-vista`) con `cd` |
| `MySQL no está encendido` | El servicio de MySQL está apagado | Windows: Servicios → MySQL80 → Iniciar. Mac: `brew services start mysql` |
| `Usuario o contraseña incorrectos` | La clave de MySQL en el `.env` está mal | Borra la línea `DB_PASSWORD` del `.env` de `fro-controlador` y vuelve a correr `npm run db:local` |
| `La base quedó incompleta` | Había una base vieja con otra estructura | `npm run db:local -- --reiniciar` |
| `Falta JWT_SECRET` al arrancar el servidor | El `.env` se hizo a mano y le falta la clave de sesión | `npm run db:local` la genera sola |
| La app dice **"Servicio no disponible"** al entrar | El servidor respondió con error; mira su terminal | Lee el mensaje que empieza con `Error crítico` y busca en esta tabla |
| La app se queda cargando o dice que no hay conexión | El celular no encuentra al computador | Revisa la IP en `fro-vista/.env`, que ambos estén en la misma Wi-Fi y el firewall. Luego `npx expo start -c` |
| `DATABASE_URL` detectada | Tu `.env` apunta a la base de la nube | Pon `#` al inicio de esa línea mientras trabajes en local |
| No llega el correo de registro | En local no hay correo configurado | Usa las cuentas de prueba |

Si el problema no está aquí, copia el mensaje completo de la terminal y
compártelo con el equipo.
