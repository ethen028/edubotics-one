#!/bin/sh
# Starts Edubotics One inside Docker: applies database changes, adds starter data, runs the app.
set -e

# Make a random session secret on first start and keep it in the data volume.
if [ -z "$SESSION_SECRET" ]; then
  [ -f /data/session-secret ] || head -c 48 /dev/urandom | base64 | tr -d '\n' > /data/session-secret
  SESSION_SECRET="$(cat /data/session-secret)"
  export SESSION_SECRET
fi

npx prisma migrate deploy
npx tsx prisma/seed.ts
exec npx next start -H 0.0.0.0 -p 3000
