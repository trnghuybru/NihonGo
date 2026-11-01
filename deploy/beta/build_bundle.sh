#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${OUTPUT_PATH:?Set OUTPUT_PATH to an absolute .tar.gz path outside the repo}"
case "$OUTPUT_PATH" in
  /*.tar.gz) ;;
  *) echo "OUTPUT_PATH must be an absolute .tar.gz path" >&2; exit 2 ;;
esac

root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$(dirname "$OUTPUT_PATH")"
temporary="${OUTPUT_PATH}.partial"
trap 'rm -f "$temporary"' EXIT

COPYFILE_DISABLE=1 tar --no-xattrs -C "$root" -czf "$temporary" \
  --exclude='backend/.env' --exclude='backend/.env.*' \
  --exclude='backend/venv' --exclude='backend/.runtime' \
  --exclude='backend/data' --exclude='backend/tests' \
  --exclude='backend/models/translation' \
  --exclude='deploy/beta/secrets' \
  --exclude='__pycache__' --exclude='*.pyc' \
  compose.beta.yaml deploy/beta backend frontend/dist-web frontend/src/assets/characters

if tar -tzf "$temporary" | grep -E '(^|/)\.env($|\.)|^backend/(venv|data|tests)/|^backend/models/translation/|^deploy/beta/secrets/.*\.(json|yaml)$' > /dev/null; then
  echo "Bundle contains a prohibited path" >&2
  exit 1
fi
mv "$temporary" "$OUTPUT_PATH"
trap - EXIT
echo "Created code and web bundle: $OUTPUT_PATH"
echo "Transfer backend/models/translation/m2m100_418M separately if local translation is required."
