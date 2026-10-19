#!/usr/bin/env bash
# Publica los cambios subidos a GitHub (se ejecuta solo cada 10 minutos)
set -euo pipefail
cd /opt/perrufest
git fetch -q origin
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse '@{u}')
[ "$LOCAL" = "$REMOTE" ] && exit 0
echo "=== $(date) · actualizando a $REMOTE ==="
git reset -q --hard '@{u}'
chmod +x deploy/*.sh
APP_VERSION=${REMOTE:0:8} docker compose up -d --build --remove-orphans
docker compose restart caddy
docker image prune -f >/dev/null
