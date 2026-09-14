# Guía de la nube — FRO Salud

Hasta ahora, para probar la app cada uno necesitaba levantar el backend y MySQL
en su propio computador, y andar cambiando la IP a mano. Con la nube eso se
acaba: **el backend y la base de datos viven en internet, siempre en la misma
dirección**, y la app solo apunta ahí.

```
   App (Expo en el celular)
            │
            ▼
   Backend en Render  ──►  Base de datos MySQL en Aiven
```

La guía tiene dos partes:

- **Parte 1** — Montar la nube. Se hace **una sola vez** y ya está hecha por
  quien administra la cuenta del grupo. El resto del equipo puede saltarla.
- **Parte 2** — Conectar la app. Esto **sí lo hace cada integrante** en su
  computador. Son 5 minutos.

---

# Parte 1 — Montar la nube (una sola vez)

> Todo esto se hace con la cuenta del grupo: **frosalud.app@gmail.com**
> Ambos servicios son gratis y **no piden tarjeta de crédito**.

## Paso 1: Crear la base de datos (Aiven)

1. Entra a [aiven.io](https://aiven.io) y crea una cuenta con el correo del grupo.
2. Crea un servicio nuevo (*Create service*) y elige **MySQL**.
3. En el plan, elige **Free**. Deja la región que viene sugerida.
4. Espera a que el estado cambie de *Rebuilding* a **Running** (unos minutos).
5. En la pantalla del servicio busca **Service URI** y cópiala. Se ve así:

   ```
   mysql://avnadmin:CLAVE@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED
   ```

   Esa línea es la dirección + usuario + contraseña, todo junto. **Trátala como
   una contraseña: no la subas al repositorio ni la pegues en WhatsApp.**

## Paso 2: Cargar las tablas en esa base

La base recién creada está vacía. Para crear las tablas y los datos iniciales
no necesitas instalar MySQL ni ningún programa: el proyecto trae un comando.

1. En tu computador, dentro de la carpeta `fro-controlador`, crea un archivo
   llamado `.env` (puedes copiar `.env.example` y renombrarlo).
2. Escribe adentro estas tres líneas, pegando tu dirección del paso anterior:

   ```
   DATABASE_URL=mysql://avnadmin:CLAVE@mysql-xxxx.aivencloud.com:12345/defaultdb
   DB_SSL=true
   DB_SSL_REJECT_UNAUTHORIZED=false
   ```

   > Puedes pegar la dirección con `?ssl-mode=REQUIRED` incluido; el proyecto lo
   > limpia solo.

3. Ejecuta:

   ```bash
   npm install
   npm run db:importar -- --sin-crear-base
   ```

   Debería decir *"Esquema y datos iniciales cargados correctamente"* y cuántas
   tablas creó. Si dice que las tablas ya existen, significa que alguien ya lo
   hizo: no pasa nada, sigue adelante.

## Paso 3: Publicar el backend (Render)

1. Entra a [render.com](https://render.com) y crea la cuenta con el correo del grupo.
2. Conéctala con GitHub y dale acceso al repositorio `IDS_FRO-Salud-App`.
3. Elige **New → Blueprint**. Render leerá el archivo `render.yaml` del
   repositorio y configurará el servicio solo (nombre, carpeta, comandos).
4. Cuando pida las variables que faltan, complétalas:

   | Variable | Qué poner |
   |---|---|
   | `DATABASE_URL` | La dirección de Aiven del Paso 1 |
   | `SMTP_USER` | El correo del grupo: `frosalud.app@gmail.com` |
   | `SMTP_PASS` | La contraseña de aplicación de Gmail (ver abajo) |
   | `DB_SSL_CA` | Déjala vacía por ahora |

   `JWT_SECRET` la genera Render sola, no tienes que inventar nada.

5. Dale a desplegar y espera. Al terminar te da una dirección tipo:

   ```
   https://fro-salud-api.onrender.com
   ```

   **Esa es la dirección que le pasas al equipo.** Esa sí se puede compartir.

### Sobre la contraseña de Gmail (SMTP_PASS)

El sistema envía códigos de verificación por correo. Gmail no acepta la
contraseña normal, hay que generar una "contraseña de aplicación":

1. Entra a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   con el correo del grupo.
2. Si pide activar la verificación en dos pasos, actívala primero.
3. En el nombre escribe `Fro Salud` y presiona Crear.
4. Copia la clave de 16 caracteres y pégala en `SMTP_PASS` en Render.

## Paso 4: Comprobar que quedó funcionando

Abre en el navegador tu dirección de Render agregando `/api/health`:

```
https://fro-salud-api.onrender.com/api/health
```

Si responde algo como `{"status":"OK","message":"Servidor operativo"}`, la nube
está lista. **La primera vez puede demorar hasta un minuto** (ver más abajo).

---

# Parte 2 — Conectar la app (cada integrante del equipo)

Esto es lo único que necesitas hacer para probar la app. No necesitas cuenta en
Render ni en Aiven, ni instalar MySQL, ni levantar el backend.

### 1. Clona el repositorio

```bash
git clone https://github.com/ThecheeseDX/IDS_FRO-Salud-App.git
```

### 2. Entra a la carpeta de la app e instala

```bash
cd IDS_FRO-Salud-App/fro-vista
npm install
```

### 3. Crea tu archivo `.env`

En la carpeta `fro-vista` (la misma donde está `package.json`), crea un archivo
llamado exactamente `.env` con **una sola línea**, usando la dirección que les
compartió el equipo:

```
EXPO_PUBLIC_API_URL=https://fro-salud-api.onrender.com
```

> Puedes copiar el archivo `.env.example` que ya viene y renombrarlo a `.env`.

### 4. Levanta la app

```bash
npx expo start -c
```

La `-c` limpia la caché; es importante la primera vez y cada vez que cambies el
`.env`, porque si no Expo sigue usando la dirección antigua.

### 5. Ábrela en tu celular

1. Instala **Expo Go** desde Play Store (Android) o App Store (iPhone).
2. Escanea el código QR que aparece en la terminal.
3. Tu celular y tu computador deben estar en la misma red WiFi.

Listo: la app quedará hablando con el backend en la nube. Todos ven los mismos
datos, sin importar en qué computador estén.

---

# Cosas importantes que conviene saber

### El servidor "se duerme"

El plan gratuito de Render **apaga el servidor si nadie lo usa por 15 minutos**.
La siguiente vez que alguien entre, tarda **cerca de un minuto** en despertar y
recién ahí responde normal.

Esto no es una falla: es cómo funciona el plan gratis. Consecuencias prácticas:

- Si van a mostrar la app en una presentación, **entren 2 minutos antes** para
  despertarlo (basta con abrir la dirección `/api/health` en el navegador).
- Si el equipo prefiere que nunca se duerma, el plan de pago de Render cuesta
  unos 7 dólares al mes.

La base de datos de Aiven también se apaga si pasa mucho tiempo sin uso, pero
avisan por correo antes y se puede volver a encender desde el panel.

### Límites del plan gratuito

| | Render (backend) | Aiven (base de datos) |
|---|---|---|
| Memoria | 512 MB | 1 GB |
| Almacenamiento | — | 1 GB |
| Conexiones | — | 76 simultáneas |
| Tiempo | 750 horas al mes | Ilimitado |
| Tarjeta de crédito | No pide | No pide |

Para un proyecto de este tamaño, esos límites sobran con holgura.

### ¿Y si quiero trabajar con el backend en mi propio computador?

Sigue siendo posible, no perdimos nada. En vez de la dirección de la nube, pon
en tu `.env` de `fro-vista` la IP de tu máquina:

```
EXPO_PUBLIC_API_URL=http://192.168.1.130:3000
```

(No sirve `localhost`: desde el celular, "localhost" es el propio celular.)
Y levanta el backend con `npm run dev` dentro de `fro-controlador`.

### Nunca subir contraseñas al repositorio

Los archivos `.env` están ignorados por Git a propósito. Los que sí se suben son
los `.env.example`, que solo tienen los nombres de las variables, sin valores.
Si alguna vez se filtra la dirección de Aiven o la clave de Gmail, hay que
cambiarlas de inmediato desde sus paneles.

---

# Si algo falla

| Lo que ves | Qué significa y qué hacer |
|---|---|
| La app queda cargando y no responde | El servidor está despertando. Espera un minuto y reintenta. |
| "Network Error" en la app | Revisa que el `.env` de `fro-vista` tenga la dirección correcta y que hayas reiniciado con `npx expo start -c`. |
| Cambié el `.env` y sigue igual | Expo guardó la dirección en caché. Cierra Expo y levanta con `-c`. |
| El backend en Render muestra error de base de datos | Revisa que `DATABASE_URL` esté bien pegada y que `DB_SSL=true`. |
| `self-signed certificate in certificate chain` | **No es la contraseña.** Aiven firma con su propia autoridad certificadora, que no viene en el sistema. En Render → Environment, agrega `DB_SSL_REJECT_UNAUTHORIZED=false`. Si además creaste `DB_SSL_CA` sin pegarle un certificado, bórrala. |
| Error 502 en la dirección de Render | El servidor no llegó a arrancar. Mira los **Logs** del servicio: casi siempre es la conexión a la base. Si acabas de guardar una variable, espera dos minutos: el redespliegue da 502 mientras ocurre. |
| "Las tablas ya existen" al importar | No es error: alguien ya cargó el esquema. Puedes continuar. |
| "Failed to open the referenced table" | La importación quedó a medias y dejó tablas sueltas. Repite el comando agregando `--reiniciar`: `npm run db:importar -- --sin-crear-base --reiniciar`. Borra lo que haya y carga todo de nuevo. |
| "You have an error in your SQL syntax" | Hay una sentencia mal escrita en `schema.sql`. Ejecuta `npm run db:validar` (no necesita conexión) y te dirá en qué línea está. |

### Antes de tocar el SQL, valida

Si alguien modifica `schema.sql` o escribe consultas nuevas, conviene ejecutar:

```bash
npm run db:validar
```

No se conecta a nada y revisa dos cosas que **en Mac y Windows pasan
desapercibidas pero rompen la app en la nube**: sentencias a las que les falta
un punto y coma, y nombres de tabla escritos con mayúsculas distintas a las del
esquema (Linux distingue `Paciente` de `paciente`; Mac y Windows no).
| No llegan los correos con el código | Revisa `SMTP_USER` y `SMTP_PASS` en Render. La clave debe ser la de aplicación de 16 caracteres, no la contraseña normal de Gmail. |
