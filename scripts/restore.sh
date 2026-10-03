#!/usr/bin/env bash
# Восстановление telegram-broadcast из архива, сделанного scripts/backup.sh.
#
#   scripts/restore.sh /путь/к/telegram_broadcast_ДАТА.tar.gz[.gpg]
#
# Для зашифрованного архива: BACKUP_PASSPHRASE_FILE=/путь/к/файлу_с_паролем scripts/restore.sh ...
# ВНИМАНИЕ: текущая база и uploads/ будут заменены данными из архива (старая база сохраняется рядом как .before-restore).
# .env восстанавливается из архива, только если его ещё нет в папке проекта.

set -euo pipefail

ARCHIVE="${1:-}"
[ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] || { echo "Использование: $0 /путь/к/telegram_broadcast_ДАТА.tar.gz[.gpg]"; exit 1; }
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"

log() { echo "[$(date '+%F %T')] $*"; }

read -r -p "База и uploads telegram-broadcast будут заменены данными из $(basename "$ARCHIVE"). Продолжить? [y/N] " answer
[ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Отменено"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ "$ARCHIVE" == *.gpg ]]; then
  [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] || { echo "Архив зашифрован: укажите BACKUP_PASSPHRASE_FILE"; exit 1; }
  gpg --batch --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" -d "$ARCHIVE" | tar xzf - -C "$WORK"
else
  tar xzf "$ARCHIVE" -C "$WORK"
fi
[ -f "$WORK/database.db" ] || { echo "В архиве нет database.db"; exit 1; }

if [ ! -f .env ] && [ -f "$WORK/env" ]; then
  cp "$WORK/env" .env && chmod 600 .env && log ".env восстановлен из архива"
fi

log "Останавливаю telegram-broadcast..."
docker compose stop telegram-broadcast 2>/dev/null || true

mkdir -p server/data uploads
if [ -f server/data/database.db ]; then
  mv server/data/database.db "server/data/database.db.before-restore-$(date +%F_%H%M%S)"
fi
rm -f server/data/database.db-wal server/data/database.db-shm
cp "$WORK/database.db" server/data/database.db
log "База восстановлена"

if [ -f "$WORK/uploads.tar.gz" ]; then
  find uploads -mindepth 1 -delete
  tar xzf "$WORK/uploads.tar.gz" -C uploads
  log "uploads восстановлены"
fi

log "Запускаю telegram-broadcast..."
docker compose up -d --build telegram-broadcast
log "Готово. Проверьте вход и данные в панели."
