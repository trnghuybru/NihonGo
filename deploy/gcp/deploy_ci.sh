#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${BETA_DEPLOY_PRIVATE_KEY:?Set the existing BETA_DEPLOY_PRIVATE_KEY Actions secret}"
: "${GITHUB_SHA:?Set GITHUB_SHA}"
: "${RUNNER_TEMP:?Set RUNNER_TEMP}"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid release revision' >&2; exit 2; }
project=true-shore-451709-f3
zone=asia-southeast1-b
instance=momonihongo-sg
port=22022
keyfile="$RUNNER_TEMP/nihongo_deploy_key"
tunnel_log="$RUNNER_TEMP/nihongo_iap.log"
printf '%s\n' "$BETA_DEPLOY_PRIVATE_KEY" > "$keyfile"
chmod 600 "$keyfile"
tunnel_pid=''
cleanup() {
  if [[ -n "$tunnel_pid" ]]; then kill "$tunnel_pid" 2>/dev/null || true; wait "$tunnel_pid" 2>/dev/null || true; fi
  rm -f "$keyfile"
}
trap cleanup EXIT
state="$(gcloud --project="$project" compute instances describe "$instance" --zone="$zone" --format='value(status)')"
[[ "$state" == RUNNING ]] || { echo "VM is $state. Its night schedule is preserved; rerun after it starts." >&2; exit 1; }
gcloud --project="$project" compute start-iap-tunnel "$instance" 22 \
  --zone="$zone" --local-host-port="127.0.0.1:$port" --quiet >"$tunnel_log" 2>&1 &
tunnel_pid=$!
ssh_args=(-i "$keyfile" -p "$port" -o IdentitiesOnly=yes -o BatchMode=yes
  -o StrictHostKeyChecking=yes -o HostKeyAlias=momonihongo-sg
  -o UserKnownHostsFile=deploy/gcp/known_hosts -o ConnectTimeout=5)
ready=0
for _ in $(seq 1 30); do
  kill -0 "$tunnel_pid" 2>/dev/null || { cat "$tunnel_log" >&2; exit 1; }
  if ssh "${ssh_args[@]}" nihongo-deploy@127.0.0.1 true 2>/dev/null; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo 'IAP SSH did not become ready' >&2; cat "$tunnel_log" >&2; exit 1; }
bundle="$RUNNER_TEMP/nihongo-${GITHUB_SHA}.tar.gz"
OUTPUT_PATH="$bundle" bash deploy/beta/build_bundle.sh
digest="$(sha256sum "$bundle" | cut -d ' ' -f 1)"
scp -i "$keyfile" -P "$port" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o HostKeyAlias=momonihongo-sg \
  -o UserKnownHostsFile=deploy/gcp/known_hosts \
  "$bundle" "nihongo-deploy@127.0.0.1:/home/nihongo-deploy/incoming/${GITHUB_SHA}.tar.gz"
ssh "${ssh_args[@]}" nihongo-deploy@127.0.0.1 \
  sudo -n /usr/local/sbin/nihongo-deploy "$GITHUB_SHA" "$digest"
curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
  https://api.momonihongo.app/api/auth/config -o /dev/null
