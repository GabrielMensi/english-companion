#!/usr/bin/env bash
# Nightly backup, from cron on the server:
#   15 3 * * *  /opt/english-companion/deploy/backup.sh
# Writes data/backups/daily-<date>.db (keeps 14) and, on Sundays, weekly-<date>.db (keeps 8). It runs a one-off container with SQLite's backup API, so it works with the app up or down and is consistent while in use.
# Copy data/backups/ off the machine as well (restic / rclone), see docs/platform/DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"

backup() { docker compose -f compose.yml run --rm --no-deps app node scripts/backup.mjs "$@"; }
backup --prefix=daily --keep=14
if [ "$(date +%u)" = 7 ]; then backup --prefix=weekly --keep=8; fi
