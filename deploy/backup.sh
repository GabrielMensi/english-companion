#!/usr/bin/env bash
# Nightly backup, from cron on the server:
#   15 3 * * *  /opt/english-companion/deploy/backup.sh
# Writes data/backups/daily-<date>.db (keeps 14) and, on Sundays, weekly-<date>.db (keeps 8). It runs inside the
# running app container with SQLite's backup API, so it is consistent while the app is in use.
# Copy data/backups/ off the machine as well (restic / rclone), see docs/platform/DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"

backup() { docker compose -f compose.yml exec -T app node scripts/backup.mjs "$@"; }
backup --prefix=daily --keep=14
if [ "$(date +%u)" = 7 ]; then backup --prefix=weekly --keep=8; fi
