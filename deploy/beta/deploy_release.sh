#!/usr/bin/env bash
# Install as root-owned /usr/local/sbin/nihongo-deploy; only CI's deploy user may run it via sudo.
set -Eeuo pipefail
umask 077

revision="${1:-}"
digest="${2:-}"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid release revision' >&2; exit 2; }
[[ "$digest" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid bundle digest' >&2; exit 2; }

app=/opt/momonihongo
incoming="/home/nihongo-deploy/incoming/${revision}.tar.gz"
[[ -f "$incoming" && ! -L "$incoming" ]] || { echo 'Release bundle missing' >&2; exit 2; }
exec 9>/var/lock/nihongo-beta-deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }

stage="$(mktemp -d "$app/.deploy-stage.XXXXXXXX")"
snapshot="$app/releases/rollback-$revision"
applied=0
old_backend="$(docker image inspect -f '{{.Id}}' nihongo-beta-backend:local 2>/dev/null || true)"
old_game="$(docker image inspect -f '{{.Id}}' nihongo-beta-gamevoice:local 2>/dev/null || true)"
compose=(docker compose --env-file backend/.env -f compose.beta.yaml)

cleanup() { rm -rf "$stage"; }
rollback() {
  result="$?"
  trap - ERR
  if [[ "$applied" == 1 && -d "$snapshot" ]]; then
    echo 'Deployment failed; restoring previous application code and images.' >&2
    rsync -a "$snapshot/compose.beta.yaml" "$app/" || true
    rsync -a "$snapshot/backend/" "$app/backend/" || true
    rsync -a "$snapshot/deploy/beta/" "$app/deploy/beta/" || true
    rsync -a "$snapshot/frontend/dist-web/" "$app/frontend/dist-web/" || true
    rsync -a "$snapshot/frontend/src/assets/characters/" "$app/frontend/src/assets/characters/" || true
    [[ -z "$old_backend" ]] || docker tag "$old_backend" nihongo-beta-backend:local || true
    [[ -z "$old_game" ]] || docker tag "$old_game" nihongo-beta-gamevoice:local || true
    (cd "$app" && "${compose[@]}" up -d --no-deps --force-recreate backend shadowing-worker game-voice-worker web) || true
    echo 'Database migrations are not reversed; migrations must be backward compatible.' >&2
  fi
  exit "$result"
}
trap cleanup EXIT
trap rollback ERR

cp "$incoming" "$stage/release.tar.gz"
[[ "$(sha256sum "$stage/release.tar.gz" | cut -d ' ' -f 1)" == "$digest" ]] || {
  echo 'Bundle checksum mismatch' >&2; exit 2;
}
python3 - "$stage/release.tar.gz" <<'PY'
import sys
import tarfile
from pathlib import PurePosixPath

required = {"compose.beta.yaml", "backend/app.py", "backend/Dockerfile.shadowing",
            "backend/Dockerfile.gamevoice", "frontend/dist-web/index.html",
            "deploy/beta/validate_env.py"}
allowed = ("backend/", "deploy/beta/", "frontend/dist-web/",
           "frontend/src/assets/characters/")
parents = {"backend", "deploy", "deploy/beta", "frontend", "frontend/dist-web",
           "frontend/src", "frontend/src/assets", "frontend/src/assets/characters"}
with tarfile.open(sys.argv[1], "r:gz") as archive:
    found = set()
    for member in archive:
        name = member.name.rstrip("/")
        parts = PurePosixPath(name).parts
        if (not name or name.startswith("/") or ".." in parts or
                not (name == "compose.beta.yaml" or any(name.startswith(prefix) for prefix in allowed)
                     or (member.isdir() and name in parents)) or
                name == "backend/.env" or name.startswith("backend/.env.") or
                name.startswith(("backend/models/translation/", "backend/data/", "backend/venv/")) or
                name.startswith("deploy/beta/secrets/") or
                not (member.isfile() or member.isdir())):
            raise SystemExit("Unsafe release member: " + name)
        found.add(name)
    if not required <= found:
        raise SystemExit("Release bundle is incomplete")
PY
tar -xzf "$stage/release.tar.gz" -C "$stage"

mkdir -p "$snapshot/backend" "$snapshot/deploy/beta" \
  "$snapshot/frontend/dist-web" "$snapshot/frontend/src/assets/characters"
rsync -a "$app/compose.beta.yaml" "$snapshot/"
rsync -a --exclude='.env' --exclude='.env.*' --exclude='venv/' \
  --exclude='models/translation/' --exclude='data/' --exclude='.runtime/' \
  "$app/backend/" "$snapshot/backend/"
rsync -a --exclude='secrets/' "$app/deploy/beta/" "$snapshot/deploy/beta/"
rsync -a "$app/frontend/dist-web/" "$snapshot/frontend/dist-web/"
rsync -a "$app/frontend/src/assets/characters/" "$snapshot/frontend/src/assets/characters/"

cd "$app"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_PATH="$app/backups/before-$revision-$stamp.dump" bash deploy/beta/backup_db.sh
OUTPUT_PATH="$app/backups/before-$revision-$stamp-audio.tar.gz" bash deploy/beta/backup_audio.sh

applied=1
rsync -a "$stage/compose.beta.yaml" "$app/"
rsync -a --exclude='.env' --exclude='.env.*' --exclude='models/translation/' \
  "$stage/backend/" "$app/backend/"
rsync -a --exclude='secrets/' "$stage/deploy/beta/" "$app/deploy/beta/"
rsync -a "$stage/frontend/dist-web/" "$app/frontend/dist-web/"
rsync -a "$stage/frontend/src/assets/characters/" "$app/frontend/src/assets/characters/"

python3 deploy/beta/validate_env.py backend/.env
"${compose[@]}" config --quiet
"${compose[@]}" build migrate
"${compose[@]}" run --rm --no-deps migrate python -c 'from supertonic import TTS; TTS(auto_download=True)'
"${compose[@]}" run --rm migrate
"${compose[@]}" build game-voice-worker
"${compose[@]}" up -d redis livekit
"${compose[@]}" up -d --no-deps --force-recreate backend shadowing-worker game-voice-worker web

healthy=0
for _ in $(seq 1 40); do
  backend_status="$(docker inspect -f '{{.State.Health.Status}}' momonihongo-backend-1 2>/dev/null || true)"
  if [[ "$backend_status" == healthy ]] && \
     curl -fsS --max-time 5 https://momonihongo.app/ -o /dev/null && \
     curl -fsS --max-time 5 https://voice.momonihongo.app/ -o /dev/null; then
    healthy=1
    break
  fi
  sleep 5
done
[[ "$healthy" == 1 ]] || { echo 'Deployment health check failed' >&2; false; }
printf '%s\n' "$revision" > "$app/deploy/beta/DEPLOYED_SHA"
rm -f "$incoming"
echo "Deployed revision $revision"
