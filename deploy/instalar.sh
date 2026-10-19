#!/usr/bin/env bash
# Instala la web de Perrufest en un servidor Ubuntu 24.04 recién creado.
# Lo ejecuta solo la configuración inicial (cloud-init). Necesita /opt/perrufest.env con:
#   DOMAIN, ADMIN_PASSWORD, REPO y, para mudar los datos, OLD_URL
set -euo pipefail
exec > >(tee -a /var/log/perrufest-instalacion.log) 2>&1
echo "=== Instalación de Perrufest · $(date) ==="

CONF=/opt/perrufest.env
APP=/opt/perrufest
set -a; . "$CONF"; set +a
if [[ ! "${ADMIN_PASSWORD:-}" =~ ^[A-Za-z0-9_.-]{8,}$ ]]; then
  echo "AVISO: la contraseña debe tener al menos 8 caracteres y solo letras, números, guion, punto o guion bajo."
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git docker.io docker-compose-v2 unattended-upgrades
systemctl enable --now docker
systemctl enable --now unattended-upgrades || true

[ -d "$APP/.git" ] || git clone "$REPO" "$APP"
cp "$CONF" "$APP/.env"; chmod 600 "$APP/.env"
mkdir -p "$APP/data/media" "$APP/data/copias"
chown -R 1000:1000 "$APP/data"
chmod +x "$APP"/deploy/*.sh

cd "$APP"
docker compose up -d --build

# Mudanza: copiar datos y fotos desde la web de Cloudflare
if [ -n "${OLD_URL:-}" ] && ! grep -q '"fallidos": 0' data/importacion.json 2>/dev/null; then
  for i in 1 2 3; do
    echo "--- Copiando datos y fotos desde $OLD_URL (intento $i) ---"
    if docker compose run --rm web node --disable-warning=ExperimentalWarning node/importar.js "$OLD_URL"; then break; fi
    sleep 30
  done
fi

# Tareas automáticas: actualizar desde GitHub cada 10 minutos y copia diaria de la base de datos
cat > /etc/cron.d/perrufest <<CRON
*/10 * * * * root $APP/deploy/actualizar.sh >> /var/log/perrufest-actualizar.log 2>&1
30 4 * * * root $APP/deploy/copia.sh >> /var/log/perrufest-copia.log 2>&1
CRON
echo "=== Instalación terminada · $(date) ==="
