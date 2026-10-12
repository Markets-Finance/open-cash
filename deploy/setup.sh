#!/usr/bin/env bash
set -euo pipefail
: "${API_HOST:=hl-api.opencash.in}"

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y curl ca-certificates rsync
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
corepack enable
corepack prepare pnpm@9.15.4 --activate

id opencash >/dev/null 2>&1 || useradd --system --home /opt/opencash --shell /usr/sbin/nologin opencash
mkdir -p /opt/opencash/backend/data /var/backups/opencash
chown -R opencash:opencash /opt/opencash

if [ ! -f /etc/opencash.env ]; then
  cat > /etc/opencash.env <<'ENV'
PORT=8787
BOT_RUNNER=1
BOT_RUNNER_ALLOW_MAINNET=true
RELAYER_ALLOW_MAINNET=true
BOT_KEY_SECRET=
RELAYER_PRIVATE_KEY=
BUILDER_ADDRESS=
OPENAI_API_KEY=
CORS_ORIGIN=https://hl.opencash.in
ENV
  chmod 600 /etc/opencash.env
fi

cd /opt/opencash
sudo -u opencash pnpm install --frozen-lockfile --filter backend...

install -m 644 deploy/opencash-backend.service /etc/systemd/system/
install -m 644 deploy/opencash-backup.service /etc/systemd/system/
install -m 644 deploy/opencash-backup.timer /etc/systemd/system/
chmod +x deploy/backup.sh

if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb"
  dpkg -i /tmp/cloudflared.deb
fi
mkdir -p /etc/cloudflared
if [ -n "${TUNNEL_ID:-}" ]; then
  cat > /etc/cloudflared/config.yml <<CF
tunnel: ${TUNNEL_ID}
credentials-file: /etc/cloudflared/${TUNNEL_ID}.json
ingress:
  - hostname: ${API_HOST}
    service: http://localhost:8787
  - service: http_status:404
CF
fi

systemctl daemon-reload
systemctl enable --now opencash-backup.timer
echo "Fill /etc/opencash.env, then: systemctl enable --now opencash-backend"
