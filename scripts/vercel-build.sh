#!/usr/bin/env sh
# Build for Vercel (vercel.json). With MIGRATE_DATABASE_URL set (the session pooler, port 5432),
# the build first applies pending migrations to the cloud database, and with SEED_ON_DEPLOY=true
# also runs the seed, which only fills an empty demo location. Set both for Production only, so a
# preview of a branch never changes the shared database.
set -eu

pnpm build:packages
if [ -n "${MIGRATE_DATABASE_URL:-}" ]; then
  DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm db:migrate
  if [ "${SEED_ON_DEPLOY:-}" = "true" ]; then
    DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm db:seed
  fi
fi
pnpm --filter @plateguard/api build
pnpm --filter @plateguard/web build
