#!/bin/sh
# Makes the database backups Edubotics One asks for.
#
# The app (src/lib/backups.ts) drops an empty file named after the backup it wants into
# /backups/.queue. This dumps the database to that name, checks the file opens, and leaves
# "<name>.result" next to the request: "ok", or the error. Everything else (when to back up,
# copying to the second folder, removing old backups) is decided by the app.
set -u
QUEUE=/backups/.queue
trap 'exit 0' TERM INT
mkdir -p "$QUEUE"
echo "Backup helper ready."

while true; do
  # Lets the app see the helper is running (Admin → Backups warns when it isn't).
  touch "$QUEUE/.alive"
  for request in "$QUEUE"/*.dump; do
    [ -f "$request" ] || continue
    name="$(basename "$request")"
    part="/backups/.$name.part"
    if err="$(pg_dump --format=custom --no-owner --no-privileges --file="$part" 2>&1)" &&
      err="$(pg_restore --list "$part" 2>&1 > /dev/null)" &&
      err="$(mv "$part" "/backups/$name" 2>&1)"; then
      echo ok > "$QUEUE/$name.tmp"
      echo "Saved $name"
    else
      rm -f "$part"
      printf '%s\n' "${err:-the backup file could not be saved}" > "$QUEUE/$name.tmp"
      echo "Backup $name failed: $err"
    fi
    mv "$QUEUE/$name.tmp" "$QUEUE/$name.result"
    rm -f "$request"
  done
  sleep 2
done
