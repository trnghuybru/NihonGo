#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_PATH:?Set BACKUP_PATH to the full .dump path on the VPS}"
compose=(docker compose --env-file backend/.env -f compose.beta.yaml)
check_db=nihongo_restore_check

"${compose[@]}" exec -T postgres createdb -U nihongo "$check_db"
cleanup() {
  "${compose[@]}" exec -T postgres dropdb -U nihongo --if-exists "$check_db" > /dev/null
}
trap cleanup EXIT

"${compose[@]}" exec -T postgres pg_restore -U nihongo -d "$check_db" \
  --no-owner --no-privileges --exit-on-error < "$BACKUP_PATH"
count="$("${compose[@]}" exec -T postgres psql -U nihongo -d "$check_db" -Atc \
  'select count(*) from dictionary_entries')"
if [[ "$count" -lt 200000 ]]; then
  echo "Restore produced too few dictionary entries: $count" >&2
  exit 1
fi
echo "Backup restore verified in temporary database: $count dictionary entries."
