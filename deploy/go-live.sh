#!/usr/bin/env bash
# Trainer Arena — puesta en producción en un solo comando.
# Ejecútalo EN EL SERVIDOR, desde la raíz del repo, una vez que:
#   1) Docker y docker compose están instalados
#   2) existe el archivo .env (copia de .env.production.local) con todo relleno
#   3) el dominio de DOMAIN apunta a la IP de este servidor y los puertos 80/443 están abiertos
#
# Qué hace:  valida el .env -> construye y levanta el stack -> siembra roles+superadmin
#            -> instala el cron de backup diario -> comprueba /health.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> 1/6  Comprobando requisitos…"
command -v docker >/dev/null || { echo "ERROR: Docker no está instalado."; exit 1; }
[ -f .env ] || { echo "ERROR: falta .env (copia .env.production.local a .env y rellénalo)."; exit 1; }

echo "==> 2/6  Validando variables obligatorias del .env…"
set -a && . ./.env && set +a
missing=0
for v in DOMAIN SESSION_SECRET APP_KEY POSTGRES_PASSWORD PUSHER_APP_KEY PUSHER_APP_SECRET \
         MAIL_HOST MAIL_USER MAIL_PASSWORD RECAPTCHA_SITE_KEY RECAPTCHA_SECRET_KEY \
         SUPERADMIN_EMAIL SUPERADMIN_PASSWORD; do
  if [ -z "${!v:-}" ]; then echo "   FALTA: $v"; missing=1; fi
done
if [ "$missing" = "1" ]; then
  echo "ERROR: rellena las variables que faltan en .env antes de continuar."
  echo "       (MAIL_* y RECAPTCHA_* son obligatorias: sin ellas no hay emails ni anti-bot)"
  exit 1
fi
echo "   OK — todas las variables obligatorias están definidas."

echo "==> 3/6  Construyendo y levantando el stack (puede tardar varios minutos)…"
$COMPOSE up -d --build

echo "==> 4/6  Esperando a que el API responda…"
for i in $(seq 1 30); do
  if $COMPOSE exec -T api wget -qO- http://localhost:3000/health >/dev/null 2>&1; then
    echo "   API arriba."; break
  fi
  sleep 5
  [ "$i" = "30" ] && { echo "ERROR: el API no respondió a tiempo. Revisa: $COMPOSE logs api"; exit 1; }
done

echo "==> 5/6  Sembrando roles + superadmin…"
$COMPOSE exec -T api node seed/seed.js

echo "==> 6/6  Instalando cron de backup diario (04:00)…"
chmod +x deploy/backup.sh deploy/restore.sh
CRON_LINE="0 4 * * * cd $(pwd) && ./deploy/backup.sh >> deploy/backups/backup.log 2>&1"
if ! crontab -l 2>/dev/null | grep -qF "deploy/backup.sh"; then
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "   Cron instalado."
else
  echo "   Cron ya existía, no se duplica."
fi

echo ""
echo "============================================================"
echo " ¡LISTO!  Trainer Arena está en https://${DOMAIN}"
echo " Superadmin: ${SUPERADMIN_EMAIL}"
echo " Caddy tarda ~1 min en emitir el certificado HTTPS la 1ª vez."
echo " Logs:    $COMPOSE logs -f"
echo " Backup:  ./deploy/backup.sh   (ya programado a las 04:00)"
echo "============================================================"
