#!/usr/bin/env bash
# Copia diaria de la base de datos (se guardan 14 días en data/copias)
set -euo pipefail
cd /opt/perrufest
F="/data/copias/perrufest-$(date +%F).db"
docker compose exec -T web node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
if (!fs.existsSync('$F')) new DatabaseSync('/data/perrufest.db').exec(\"VACUUM INTO '$F'\");"
find data/copias -name 'perrufest-*.db' -mtime +14 -delete
