#!/bin/sh
# Puts the Convex half of a backup back (the Notice board, until more modules move to Convex).
# Run it right after restoring the matching .dump file (docs/backups.md):
#   docker compose run --rm app sh docker/convex-restore.sh edubotics-one-2026-10-07-1700.convex.zip
set -eu
[ $# -ge 1 ] || { echo "Say which file, for example: edubotics-one-2026-10-07-1700.convex.zip"; exit 1; }
NAME="$(basename "$1")"
FILE=""
for dir in /backups /backup-copy; do
  if [ -f "$dir/$NAME" ]; then FILE="$dir/$NAME"; break; fi
done
[ -n "$FILE" ] || { echo "Not restored: there is no file named $NAME in the backups folder."; exit 1; }
[ -s /convex-keys/admin-key ] || { echo "Not restored: Convex is not set up yet (no admin key). Run: docker compose up -d"; exit 1; }
CONVEX_SELF_HOSTED_ADMIN_KEY="$(cat /convex-keys/admin-key)"
export CONVEX_SELF_HOSTED_ADMIN_KEY
echo "This replaces everything in Convex (the Notice board) with $NAME."
npx convex import --replace-all --yes "$FILE"
echo "Convex restored."
