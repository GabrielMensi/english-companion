#!/usr/bin/env bash
# Deploys an image tag on the server: pull, back up + migrate with the app stopped, start, check health.
#   ./deploy.sh v1.0.0 [https://companion.example.com]
# Run from this folder (compose.yml, Caddyfile and .env.production live here). The tag in use is kept in
# ./.env (read by docker compose), so `docker compose` and backup.sh work without passing TAG.
# See docs/platform/DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:?usage: deploy.sh <tag> [public-url]}"
URL="${2:-}"
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid tag '$TAG' (expected something like v1.0.0)" >&2
  exit 1
fi
PREVIOUS="$(sed -n 's/^TAG=//p' .env 2>/dev/null || true)"
compose() { docker compose -f compose.yml "$@"; }

echo "==> Pulling $TAG"
TAG="$TAG" compose pull app

echo "==> Stopping the app, backing up and migrating"
TAG="$TAG" compose stop app
INIT=()
[ -e data/companion.db ] || INIT=(--init) # first deploy: a new database
if ! TAG="$TAG" compose run --rm --no-deps app node scripts/db-migrate.mjs --label="$TAG" "${INIT[@]}"; then
  echo "Migration failed: nothing was applied (they run in one transaction). The backup is in data/backups/." >&2
  if [ -n "$PREVIOUS" ]; then
    echo "Restarting the previous version ($PREVIOUS)" >&2
    TAG="$PREVIOUS" compose up -d app caddy
  else
    echo "No previous version recorded: the app stays stopped." >&2
  fi
  exit 1
fi

echo "==> Starting"
echo "TAG=$TAG" >.env
compose up -d app caddy

echo "==> Waiting for the healthcheck"
status=""
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q app)" 2>/dev/null || true)"
  [ "$status" = healthy ] && break
  sleep 2
done
if [ "$status" != healthy ]; then
  echo "The app did not become healthy. Roll back, see 'Rollback' in docs/platform/DEPLOY.md." >&2
  compose logs --tail 40 app >&2
  exit 1
fi
if [ -n "$URL" ]; then
  curl -fsS "$URL/api/health"
  echo
fi

echo "==> Done: $TAG is running (previous: ${PREVIOUS:-none})"
docker image prune -f >/dev/null
