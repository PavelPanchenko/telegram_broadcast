#!/usr/bin/env bash
# Бэкап telegram-broadcast: SQLite-база (server/data/database.db) + uploads/ + .env в один архив.
#
# Запуск из любой папки: /путь/к/telegram_broadcast/scripts/backup.sh
# Настройки (переменные окружения или scripts/backup.conf рядом со скриптом):
#   BACKUP_DIR        куда складывать архивы              (по умолчанию ~/backups/telegram_broadcast)
#   BACKUP_KEEP       сколько последних архивов хранить   (по умолчанию 7)
#   BACKUP_PASSPHRASE_FILE  файл с паролем — архив шифруется gpg (рекомендуется при выгрузке в облако)
#   RCLONE_REMOTE     куда выгружать через rclone, например yandex:telegram-broadcast-backups (пусто — не выгружать)
#   RCLONE_KEEP_DAYS  сколько дней хранить архивы в облаке (по умолчанию 30)
#
# Пока контейнер работает, база копируется онлайн-бэкапом SQLite (better-sqlite3 .backup()) —
# копия целостная даже во время записи. Другие контейнеры на сервере не затрагиваются.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
# shellcheck source=/dev/null
[ -f "$SCRIPT_DIR/backup.conf" ] && . "$SCRIPT_DIR/backup.conf"

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/telegram_broadcast}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
RCLONE_KEEP_DAYS="${RCLONE_KEEP_DAYS:-30}"
CONTAINER="telegram-broadcast"
SNAPSHOT_NAME=".backup-snapshot.db"

log() { echo "[$(date '+%F %T')] $*"; }
fail() { log "ОШИБКА: $*"; exit 1; }

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || fail "бэкап уже выполняется"

STAMP="$(date +%F_%H%M%S)"
WORK="$(mktemp -d "$BACKUP_DIR/.tmp.XXXXXX")"
DATA="$WORK/data"
mkdir -p "$DATA"
cleanup() {
  rm -rf "$WORK"
  rm -f "server/data/$SNAPSHOT_NAME" "server/data/$SNAPSHOT_NAME-wal" "server/data/$SNAPSHOT_NAME-shm"
}
trap cleanup EXIT

log "База данных..."
[ -f server/data/database.db ] || fail "не найден server/data/database.db (скрипт должен лежать в папке проекта)"
if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ]; then
  # Онлайн-бэкап внутри контейнера; снимок появляется в server/data на хосте (bind mount)
  docker exec -w /app "$CONTAINER" node -e "
    const Database = require('better-sqlite3');
    const db = new Database('server/data/database.db', { readonly: true });
    db.backup('server/data/$SNAPSHOT_NAME')
      .then(() => {
        db.close();
        // Снимок — один самодостаточный файл без -wal/-shm
        const snap = new Database('server/data/$SNAPSHOT_NAME');
        snap.pragma('journal_mode = DELETE');
        snap.close();
      })
      .catch((e) => { console.error(e.message); process.exit(1); });
  " || fail "онлайн-бэкап SQLite не удался"
  mv "server/data/$SNAPSHOT_NAME" "$DATA/database.db"
else
  log "  контейнер $CONTAINER не запущен — копирую файл базы напрямую"
  cp server/data/database.db "$DATA/database.db"
fi

# Проверка целостности копии (тем же better-sqlite3 из образа, база монтируется только на чтение)
IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)"
if [ -n "$IMAGE" ]; then
  RESULT="$(docker run --rm -v "$DATA":/check:ro -w /app "$IMAGE" node -e "
    const Database = require('better-sqlite3');
    const db = new Database('/check/database.db', { readonly: true });
    console.log(db.pragma('integrity_check', { simple: true }));
  " 2>&1)" || fail "проверка базы не удалась: $RESULT"
  [ "$RESULT" = "ok" ] || fail "копия базы повреждена: $RESULT"
  log "  integrity_check: ok"
else
  log "  образ $CONTAINER не найден — проверку целостности пропускаю"
fi

log "Загруженные файлы..."
if [ -d uploads ]; then
  tar czf "$DATA/uploads.tar.gz" -C uploads .
else
  log "  папки uploads нет — пропускаю"
fi

log "Настройки..."
cp .env "$DATA/env" 2>/dev/null || log "  .env не найден — пропускаю"

ARCHIVE="$BACKUP_DIR/telegram_broadcast_$STAMP.tar.gz"
tar czf "$WORK/archive.tar.gz" -C "$DATA" .
if [ -n "$BACKUP_PASSPHRASE_FILE" ]; then
  [ -r "$BACKUP_PASSPHRASE_FILE" ] || fail "нет доступа к файлу пароля $BACKUP_PASSPHRASE_FILE"
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
    --symmetric --cipher-algo AES256 -o "$WORK/archive.tar.gz.gpg" "$WORK/archive.tar.gz"
  ARCHIVE="$ARCHIVE.gpg"
  mv "$WORK/archive.tar.gz.gpg" "$ARCHIVE"
else
  mv "$WORK/archive.tar.gz" "$ARCHIVE"
fi
chmod 600 "$ARCHIVE"
log "Готово: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/telegram_broadcast_*.tar.gz* 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))")
for f in "${OLD[@]}"; do
  rm -f -- "$f" && log "Удалён старый архив: $(basename "$f")"
done

if [ -n "$RCLONE_REMOTE" ]; then
  log "Выгрузка в $RCLONE_REMOTE..."
  rclone copy "$ARCHIVE" "$RCLONE_REMOTE" || fail "выгрузка через rclone не удалась"
  rclone delete "$RCLONE_REMOTE" --min-age "${RCLONE_KEEP_DAYS}d" --include 'telegram_broadcast_*' || log "  не удалось удалить старые архивы в облаке"
  log "Выгружено"
fi
