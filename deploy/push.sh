#!/usr/bin/env bash
set -euo pipefail
: "${SERVER:?set SERVER, e.g. ubuntu@1.2.3.4}"
key="${SSH_KEY:-$HOME/.ssh/opencash_aws}"
ssh_cmd="ssh -i $key -o IdentitiesOnly=yes"
root="$(cd "$(dirname "$0")/.." && pwd)"
rsync -az --delete -e "$ssh_cmd" \
  --exclude '/.*' --exclude node_modules --exclude .git --exclude '.env*' --exclude data \
  --exclude 'mobile/android' --exclude 'mobile/ios' --exclude 'web/dist*' --exclude 'web/.astro' \
  --exclude 'contracts/lib' --exclude 'contracts/out' --exclude 'contracts/cache' \
  --rsync-path="sudo mkdir -p /opt/opencash && sudo rsync" "$root/" "$SERVER:/opt/opencash/"
$ssh_cmd "$SERVER" "id opencash >/dev/null 2>&1 || exit 0; sudo chown -R opencash:opencash /opt/opencash && cd /opt/opencash && sudo -u opencash env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter backend... && sudo systemctl restart opencash-backend"
