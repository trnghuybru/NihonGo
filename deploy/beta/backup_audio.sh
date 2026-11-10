#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${OUTPUT_PATH:?Set OUTPUT_PATH to an absolute private .tar.gz path}"
case "$OUTPUT_PATH" in
  /*.tar.gz) ;;
  *) echo "OUTPUT_PATH must be an absolute .tar.gz path" >&2; exit 2 ;;
esac

mkdir -p "$(dirname "$OUTPUT_PATH")"
temporary="${OUTPUT_PATH}.partial"
trap 'rm -f "$temporary"' EXIT

docker compose --env-file backend/.env -f compose.beta.yaml exec -T backend \
  python -m speaking.storage_backup \
  > "$temporary"
tar -tzf "$temporary" > /dev/null
mv "$temporary" "$OUTPUT_PATH"
trap - EXIT
echo "Verified private audio backup: $OUTPUT_PATH"
