#!/usr/bin/env bash
# Trainer Arena — copia de seguridad diaria de PostgreSQL.
# Hace pg_dump del contenedor `postgres`, lo comprime y rota (guarda los últimos
# RETENTION_DAYS). Pensado para ejecutarse por cron en el servidor.
#
# Instalación del cron (cada día a las 04:00):
#   (crontab -l 2>/dev/null; echo "0 4 * * * cd $(pwd) && ./deploy/backup.sh >> deploy/backups/backup.log 2>&1") | crontab -
#
# Restaurar:  ./deploy/restore.sh deploy/backups/trainerarena-AAAA-MM-DD_HHMMSS.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."   # raíz del repo

COMPOSE="docker compose -f docker-compose.prod.yml"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="deploy/backups"

# Carga POSTGRES_USER/DB desde .env (si existe)
[ -f .env ] && set -a && . ./.env && set +a
PGUSER="${POSTGRES_USER:-apptorneos}"
PGDB="${POSTGRES_DB:-apptorneos}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUP_DIR/trainerarena-$STAMP.sql.gz"

echo "[$(date)] Volcando base $PGDB (usuario $PGUSER)…"
$COMPOSE exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" --clean --if-exists \
  | gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date)] Backup OK: $OUT ($SIZE)"

# Rotación: borra los más antiguos que RETENTION_DAYS
find "$BACKUP_DIR" -name 'trainerarena-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete

# --- Copia externa (opcional, MUY recomendado) -------------------------------
# El backup local no sirve si el servidor se pierde. Descomenta UNA opción:
#
# rclone (Google Drive, Dropbox, S3…):  rclone copy "$OUT" remoto:trainerarena-backups
# scp a otra máquina:                    scp "$OUT" usuario@otra-maquina:/ruta/backups/
echo "[$(date)] Recuerda activar una copia externa (ver final de este script)."
