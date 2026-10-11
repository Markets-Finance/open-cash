#!/usr/bin/env bash
set -euo pipefail
: "${SERVER:?set SERVER, e.g. ubuntu@1.2.3.4}"
key="${SSH_KEY:-$HOME/.ssh/opencash_aws}"
case "${1:-}" in
  on) remote="sudo -u opencash touch /opt/opencash/backend/data/kill-switch" ;;
  off) remote="sudo rm -f /opt/opencash/backend/data/kill-switch" ;;
  status) remote="test -f /opt/opencash/backend/data/kill-switch && echo on || echo off" ;;
  *) echo "usage: kill.sh on|off|status" >&2; exit 2 ;;
esac
ssh -i "$key" -o IdentitiesOnly=yes "$SERVER" "$remote"
