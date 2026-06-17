#!/usr/bin/env bash
# Trainer Arena — restaura un backup de PostgreSQL creado por backup.sh.
# Uso:  ./deploy/restore.sh deploy/backups/trainerarena-AAAA-MM-DD_HHMMSS.sql.gz
#
# CUIDADO: sobrescribe los datos actuales de la base (el dump usa --clean).
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: $0 <ruta-al-backup.sql.gz>" >&2
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"
[ -f .env ] && set -a && . ./.env && set +a
PGUSER="${POSTGRES_USER:-apptorneos}"
PGDB="${POSTGRES_DB:-apptorneos}"

read -r -p "Vas a SOBRESCRIBIR la base '$PGDB' con '$FILE'. ¿Seguro? (escribe SI): " ok
[ "$ok" = "SI" ] || { echo "Cancelado."; exit 1; }

echo "[$(date)] Restaurando $FILE en $PGDB…"
gunzip -c "$FILE" | $COMPOSE exec -T postgres psql -U "$PGUSER" -d "$PGDB"
echo "[$(date)] Restauración completada."
