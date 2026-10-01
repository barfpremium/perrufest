# Web de Perrufest — guía de publicación en Cloudflare

La web funciona entera en Cloudflare, con su plan gratuito:

- **Workers**: la web y el panel de gestión (`/admin`).
- **D1**: la base de datos (eventos, textos, colaboradores y mensajes).
- **R2**: las fotos, los carteles y los vídeos (10 GB gratis).

No hay ningún servidor que mantener. Después de publicarla, todo se gestiona desde `tudominio/admin`.

---

## Publicarla (una sola vez, unos 20 minutos)

### 1. Activar R2 (almacén de fotos)

En el panel de Cloudflare: menú lateral **R2 Object Storage** → **Activar / Purchase R2 Plan** (plan gratuito).
Es posible que te pida una tarjeta. No cobra mientras no pases de 10 GB.

### 2. Subir el código a GitHub

1. Crea una cuenta gratuita en https://github.com si no tienes.
2. Arriba a la derecha, **+** → **New repository**. Ponle de nombre `perrufest`, márcalo como **Private** y pulsa **Create repository**.
3. En la página del repositorio vacío, pulsa **uploading an existing file**.
4. Descomprime el zip y arrastra **el contenido** de la carpeta `perrufest-cf` (las carpetas `src`, `public`, `test` y los archivos `wrangler.jsonc`, `package.json` y `README.md`). No arrastres la carpeta en sí. Después pulsa **Commit changes**.

### 3. Conectar GitHub con Cloudflare

1. Cloudflare → **Workers & Pages** → **Create application** → **Import a repository** → **Get started**.
2. Conecta tu cuenta de GitHub y elige el repositorio `perrufest`.
3. En **Project name** escribe `perrufest` (tiene que llamarse igual). Deja el resto como viene y pulsa **Save and Deploy**.
4. Espera a que termine (1–2 minutos). Cloudflare crea la base de datos y el almacén de fotos.

> Si el despliegue falla con un error sobre `d1_databases` o `r2_buckets`, avísame con el mensaje y te digo cómo crearlos a mano. Son dos clics.

### 4. Poner la contraseña del panel

Workers & Pages → `perrufest` → **Settings** → **Variables and Secrets** → **Add**.
Elige el tipo **Secret**, con nombre `ADMIN_PASSWORD` y como valor una contraseña larga. Pulsa **Deploy**.

### 5. Conectar tu dominio

Workers & Pages → `perrufest` → **Settings** → **Domains & Routes** → **Add** → **Custom domain**. Escribe tu dominio (por ejemplo `perrufest.es`) y repítelo con `www.perrufest.es`.
Como el dominio ya está en Cloudflare, se configura solo, incluido el HTTPS.

### 6. Dominio para las fotos (recomendado)

Así las fotos se sirven directamente desde Cloudflare: cargan más rápido y no gastan el límite gratuito de la web.

1. **R2 Object Storage** → abre el almacén que se ha creado (su nombre empieza por `perrufest`) → **Settings** → **Custom Domains** → **Add**. Escribe `fotos.perrufest.es` (con tu dominio).
2. Workers & Pages → `perrufest` → **Settings** → **Variables and Secrets** → **Add**. Elige el tipo **Text**, con nombre `MEDIA_URL` y valor `https://fotos.perrufest.es`. Pulsa **Deploy**.

### 7. Entrar al panel

Ve a `https://tudominio/admin`, entra con la contraseña y sigue la lista «Pendiente antes de publicar».

---

## Uso diario (sin tocar nada técnico)

Todo se hace desde `tudominio/admin`, en el móvil o en el ordenador:

- **Eventos y galerías**: crear una edición nueva y editar fechas, horarios, cartel, programa, precios, dirección y vídeos. Un evento aparece en «Próximos eventos» hasta que pasa su fecha. Después pasa solo a la Galería.
- **Fotos**: subida por lotes, grupos por día o actividad, orden, portada y borrado. El navegador prepara la miniatura, la versión para ver y la de descarga, y quita los datos de ubicación GPS.
- **Colaboradores**, **Textos y contacto** y **Mensajes** del formulario.

Las fotos HEIC de iPhone se convierten bien si se suben desde Safari. Los vídeos, mejor como enlace de YouTube; si se suben como archivo, el máximo son 95 MB.

## Opcional: aviso por correo de cada mensaje

Crea una cuenta gratuita en https://resend.com, verifica tu dominio y añade el secreto `RESEND_API_KEY` (y, si quieres, la variable `MAIL_FROM`, por ejemplo `Perrufest <web@perrufest.es>`). Mientras no lo actives, los mensajes se ven en el panel.

## Cambios en el diseño o en el código

Sube los archivos nuevos al repositorio de GitHub. Cloudflare publica la nueva versión sola en un par de minutos. Los datos y las fotos no se tocan.

## Para desarrolladores

`ADMIN_PASSWORD=prueba npm run local` arranca un simulador en Node 22 (D1 con SQLite y R2 en carpeta) en http://localhost:8787.
