# Mudanza de la web de Perrufest a un servidor propio

**Por qué:** las operadoras españolas (Movistar, Vodafone, Orange, MásMóvil, DIGI…) bloquean direcciones de Cloudflare por los partidos de LaLiga, y la web queda inaccesible para muchos visitantes. En un servidor propio, la web tiene una dirección solo suya y deja de verse afectada.

**Qué cambia:** nada para los visitantes ni en el panel. El dominio sigue comprado en Cloudflare: solo cambia a dónde apunta.

**Tiempo:** unos 30 minutos, más la espera de la copia de fotos.

---

## Paso 1 · Subir la versión nueva a GitHub

1. Descomprime el zip.
2. En tu repositorio `perrufest` de GitHub, pulsa **Add file** → **Upload files**.
3. Arrastra **todo el contenido** de la carpeta `perrufest-cf`: las carpetas `src`, `public`, `node` y `deploy`, y los archivos `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `package.json`, `wrangler.jsonc`, `README.md` y `GUIA-MUDANZA.md`.
4. Pulsa **Commit changes**.
5. Espera 2 minutos: Cloudflare actualiza la web actual. Esto añade el botón interno que permite copiar los datos.

## Paso 2 · Hacer público el repositorio

El servidor nuevo necesita descargar el código. El código no contiene contraseñas ni datos personales.

GitHub → tu repositorio → **Settings** → abajo del todo, **Danger Zone** → **Change visibility** → **Make public** → confirma.

Copia la dirección del repositorio. Es la que ves arriba en el navegador, por ejemplo `https://github.com/tuusuario/perrufest`.

## Paso 3 · Apuntar dos datos de Cloudflare

1. **Dirección provisional de la web actual:** en Cloudflare, **Workers & Pages** → `perrufest`. Arriba verás una dirección que termina en `.workers.dev`, por ejemplo `https://perrufest.tucuenta.workers.dev`. Cópiala.
2. **Contraseña del panel:** la misma que usas para entrar en `/admin`. Si tiene símbolos raros, espacios, `$` o `ñ`, cámbiala antes por una de solo letras y números:
   1. Ve a Workers & Pages → `perrufest` → **Settings** → **Variables and Secrets**.
   2. Edita `ADMIN_PASSWORD` y pulsa **Deploy**.

## Paso 4 · Crear el servidor en Hetzner

1. Entra en https://console.hetzner.com, crea un **proyecto** llamado «Perrufest» y pulsa **Add Server** (o «Crear servidor»).
2. **Location:** cualquiera de Alemania o Finlandia.
3. **Image:** **Ubuntu 24.04**.
4. **Type:** el más barato disponible de tipo **Shared vCPU** con x86 (Intel/AMD), por ejemplo CX23, CPX12 o similar. Con 2 GB de RAM va sobrado.
5. **Networking:** deja marcadas **Public IPv4** y **IPv6**.
6. **SSH keys:** no hace falta ninguna.
7. **Backups:** márcalo (recomendado). Cuesta un 20 % más, unos céntimos, y guarda copias diarias de todo el servidor.
8. **Cloud config:** abre el archivo `deploy/cloud-init.yaml` del zip con un editor de texto, cambia estas 4 líneas, copia todo el texto y pégalo en este cuadro:

   ```
   DOMAIN=perrufest.com
   ADMIN_PASSWORD=la-contraseña-del-panel
   REPO=https://github.com/tuusuario/perrufest
   OLD_URL=https://perrufest.tucuenta.workers.dev
   ```

9. **Name:** `perrufest`. Pulsa **Create & Buy now**.
10. Apunta la **dirección IPv4** del servidor, del tipo `91.98.xxx.xxx`.

El servidor se instala solo y copia todos los datos y las fotos. Tarda entre **10 y 20 minutos**, según la cantidad de fotos.

## Paso 5 · Comprobar la web nueva antes del cambio

Abre en el navegador `http://LA-IP-DEL-SERVIDOR:8080`, con `http`, sin `s`, y con `:8080` al final.

Deberías ver la web con todas las fotos, eventos y colaboradores. Si falta algo, espera unos minutos más y recarga. **No entres al panel desde esta dirección** (no es segura). Solo es para comprobar.

## Paso 6 · Cambiar el dominio al servidor nuevo

En Cloudflare:

1. **Quitar el dominio de la web antigua:** **Workers & Pages** → `perrufest` → **Settings** → **Domains & Routes**. En `perrufest.com` (y `www.perrufest.com`, si lo añadiste), pulsa los tres puntos → **Remove** / **Delete**.
2. **Apuntar al servidor:** en el menú de tu dominio `perrufest.com`, entra en **DNS** → **Records** → **Add record**:
   - Type **A**, Name `@`, IPv4 address: **la IP del servidor**. **Proxy status: desactivado**, nube **gris**, «DNS only». Pulsa **Save**.
   - Repite con Type **A**, Name `www` y la misma IP, también con la nube gris.

   ⚠️ La nube **tiene que estar gris**. Si está naranja, la web vuelve a pasar por Cloudflare y vuelve el bloqueo.
3. Espera 5–10 minutos. El servidor obtiene solo el certificado HTTPS. Si pasados 20 minutos `https://perrufest.com` sigue sin cargar, en Hetzner abre el servidor y pulsa **Power** → **Reboot**: al reiniciar lo vuelve a intentar al momento.

## Paso 7 · Comprobar

- Abre `https://perrufest.com` desde el ordenador y desde el móvil con **datos móviles de Vodafone**. Ya debería cargar.
- Entra en `https://perrufest.com/admin` con tu contraseña de siempre.
- En **hayahora.futbol** → «Comprueba tu página», `perrufest.com` debería salir **no bloqueada**.

---

## Después de la mudanza

- **Usa solo `perrufest.com/admin`.** La versión antigua (`.workers.dev`) sigue existiendo como copia, pero lo que cambies allí ya no se verá en la web. Cuando todo lleve una semana funcionando, se puede borrar.
- **Cambios en el código:** súbelos a GitHub como siempre. El servidor los comprueba cada 10 minutos y se actualiza solo.
- **Copias de seguridad:** el servidor guarda una copia diaria de la base de datos (14 días). Si marcaste «Backups» en Hetzner, también hay copia diaria de todo el servidor, fotos incluidas.
- **Seguridad:** el sistema se actualiza solo (actualizaciones automáticas de Ubuntu).

## Si algo falla

Mándame una captura del paso en el que estés. En el paso 5, si la web no carga pasados 20 minutos, en Hetzner abre el servidor → **Console** y escribe `tail -50 /var/log/perrufest-instalacion.log`. Mándame una captura de lo que salga.
