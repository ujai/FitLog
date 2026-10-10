#!/usr/bin/env bash
# Dump the database to a timestamped custom-format file and keep the newest
# $BACKUP_KEEP. Images live in the database as bytea, so this one file is the
# whole household's data.
#
#   pnpm db:backup                      # by hand
#   systemctl --user start health-tracker-backup   # via the timer's service
#
# Restore:  docker compose exec -T db pg_restore --clean --if-exists \
#             --no-owner -U health -d health < <file>.dump
#
# pg_dump runs inside the compose `db` container, so the host needs no
# Postgres client and the dump tool always matches the local server's version.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/health-tracker}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

if [[ -z "${DATABASE_URL:-}" && -f .env.local ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set (and not found in .env.local)" >&2
  exit 1
fi
if ! [[ "$BACKUP_KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_KEEP must be a positive integer" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/health-$stamp.dump"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

# Written to a .partial name first so a failed dump never counts towards
# BACKUP_KEEP and never pushes a good backup out of the window.
docker compose exec -T db pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" > "$partial"
chmod 600 "$partial"
mv "$partial" "$target"
echo "Backup written: $target ($(du -h "$target" | cut -f1))"

# Prune: keep the newest $BACKUP_KEEP completed dumps, nothing else is touched.
mapfile -t old < <(ls -1t "$BACKUP_DIR"/health-*.dump 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))")
for f in "${old[@]}"; do
  rm -f -- "$f"
  echo "Pruned: $f"
done
