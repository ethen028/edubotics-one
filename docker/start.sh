#!/bin/sh
# Starts Orbit inside Docker: applies database changes, adds starter data, runs the app.
set -e
umask 077

# Make a random session secret on first start and keep it in the data volume.
if [ -z "$SESSION_SECRET" ]; then
  [ -f /data/session-secret ] || head -c 48 /dev/urandom | base64 | tr -d '\n' > /data/session-secret
  SESSION_SECRET="$(cat /data/session-secret)"
  export SESSION_SECRET
fi

npx prisma migrate deploy
npx tsx prisma/seed.ts
unset SEED_ADMIN_PASSWORD

# Convex (the Notice board so far). The sign-in key pair is made once and kept in the data volume; the public
# half is handed to Convex, then Orbit's functions are loaded and old notices copied across (skips ones
# already there). If Convex isn't ready, Orbit still starts: only the Notice board shows an error.
npx tsx scripts/convex-keys.ts /data
CONVEX_AUTH_PRIVATE_KEY="$(cat /data/convex-auth-private-key)"
export CONVEX_AUTH_PRIVATE_KEY
if [ -s /convex-keys/admin-key ]; then
  CONVEX_SELF_HOSTED_ADMIN_KEY="$(cat /convex-keys/admin-key)"
  export CONVEX_SELF_HOSTED_ADMIN_KEY
  if npx convex env set ORBIT_JWKS "$(cat /data/convex-auth-jwks)" \
    && npx convex deploy --yes --typecheck disable \
    && npm run --silent convex:move-notices; then
    echo "Convex is up to date."
  else
    echo "WARNING: Convex could not be updated. The Notice board will not work until it is."
  fi
  unset CONVEX_SELF_HOSTED_ADMIN_KEY
else
  echo "WARNING: no Convex admin key yet (the convex-admin-key service makes it). The Notice board will not work."
fi
exec npx next start -H 0.0.0.0 -p 3000
