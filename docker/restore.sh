#!/bin/sh
# Puts a backup back: every record and uploaded file returns to how it was when the backup was made.
#
# On the office computer, in the Edubotics One folder (see docs/backups.md):
#   docker compose stop app
#   docker compose run --rm backup restore edubotics-one-2026-10-07-1700.dump
#   docker compose start app
#
# Before changing anything it saves a backup of how things are now ("...-before-restore.dump"),
# so a restore can itself be undone by restoring that file. The restore runs as one transaction:
# if anything goes wrong, nothing is changed. When the app starts again it brings an older
# backup up to date with the current version (docker/start.sh runs the database migrations).
set -eu

BACKUP_DIR=/backups
COPY_DIR=/backup-copy

fail() {
  echo ""
  echo "Not restored: $1"
  exit 1
}

[ $# -ge 1 ] || fail "say which backup to restore, for example:
  docker compose run --rm backup restore edubotics-one-2026-10-07-1700.dump
The backups are listed in Admin > Backups, and in the backups folder."

NAME="$(basename "$1")"
FILE=""
for dir in "$BACKUP_DIR" "$COPY_DIR"; do
  if [ -f "$dir/$NAME" ]; then
    FILE="$dir/$NAME"
    break
  fi
done
[ -n "$FILE" ] || fail "there is no file named $NAME in the backups folder. Put the file there (copy it from your USB drive or second folder) and try again."

echo "Checking $NAME ..."
pg_restore --list "$FILE" > /dev/null 2>&1 || fail "$NAME is not a complete Edubotics One backup (it may be damaged, or only partly copied)."

# Other connections mean the app is still running and would keep writing during the restore.
OTHERS="$(psql -XAtq -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()")"
[ "$OTHERS" = "0" ] || fail "the app is still running. Stop it first with: docker compose stop app"

echo ""
echo "This replaces everything in Edubotics One with the backup $NAME."
echo "Anything entered after that backup was made will be gone (a copy of how things are now is saved first)."
if [ "${RESTORE_YES:-}" != "yes" ]; then
  printf "Type yes to restore: "
  read -r ANSWER || ANSWER=""
  [ "$ANSWER" = "yes" ] || fail "you didn't type yes."
fi

# India time for the file name, e.g. 2026-10-07-1700.
STAMP="$(TZ=IST-5:30 date +%Y-%m-%d-%H%M)"
SAFETY="$BACKUP_DIR/edubotics-one-$STAMP-before-restore.dump"
if [ -e "$SAFETY" ]; then SAFETY="$BACKUP_DIR/edubotics-one-$STAMP-before-restore-$(date +%S).dump"; fi
echo ""
echo "Saving how things are now as $(basename "$SAFETY") ..."
pg_dump --format=custom --no-owner --no-privileges --file="$SAFETY.part" || fail "could not save the current data first, so nothing was changed."
pg_restore --list "$SAFETY.part" > /dev/null || fail "the copy of the current data didn't check out, so nothing was changed."
mv "$SAFETY.part" "$SAFETY"

echo "Restoring $NAME ..."
SQL="$(mktemp)"
trap 'rm -f "$SQL"' EXIT
{
  echo "DROP SCHEMA public CASCADE;"
  echo "CREATE SCHEMA public;"
  pg_restore --no-owner --no-privileges --file=- "$FILE"
  # Sign-ins saved in the backup may have been signed out since: everyone signs in afresh.
  echo 'DO $$ BEGIN IF to_regclass($t$public."Session"$t$) IS NOT NULL THEN DELETE FROM public."Session"; END IF; END $$;'
} > "$SQL" || fail "could not read $NAME, so nothing was changed."
PGOPTIONS="-c client_min_messages=warning" psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$SQL" > /dev/null || fail "the restore stopped with an error, so nothing was changed."

echo ""
echo "Restored $NAME."
echo "Now start the app again with: docker compose start app"
echo "Everyone signs in again afterwards."
