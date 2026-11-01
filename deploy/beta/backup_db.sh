#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${OUTPUT_PATH:?Set OUTPUT_PATH to an absolute private .dump path}"
case "$OUTPUT_PATH" in
  /*.dump) ;;
  *) echo "OUTPUT_PATH must be an absolute .dump path" >&2; exit 2 ;;
esac

mkdir -p "$(dirname "$OUTPUT_PATH")"
temporary="${OUTPUT_PATH}.partial"
trap 'rm -f "$temporary"' EXIT

docker compose --env-file backend/.env -f compose.beta.yaml exec -T postgres \
  pg_dump -U nihongo -d nihongo --format=custom --no-owner --no-privileges > "$temporary"
docker compose --env-file backend/.env -f compose.beta.yaml exec -T postgres \
  pg_restore --list > /dev/null < "$temporary"
mv "$temporary" "$OUTPUT_PATH"
trap - EXIT
echo "Verified PostgreSQL backup: $OUTPUT_PATH"
