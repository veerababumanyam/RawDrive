#!/usr/bin/env bash
# Rolling app deploy driver — run from a local workstation.
# Usage: ./deploy-app.sh <node-ip>
# Pushes source, rebuilds images, rolls containers with health gates.

set -euo pipefail

NODE_IP="${1:-}"
if [ -z "$NODE_IP" ]; then
    echo "usage: $0 <node-ip>" >&2
    exit 1
fi

echo "==> pushing source to $NODE_IP"
tar --exclude=node_modules --exclude=.git --exclude=.next \
    --exclude='deploy/.env' --exclude='.env*' -cf - . \
    | ssh "root@$NODE_IP" 'tar -xf - -C /opt/rawdrive/app'

echo "==> building images on $NODE_IP"
ssh "root@$NODE_IP" \
    'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build --no-cache'

echo "==> rolling up (respects dependency order: pgbouncer → migrate → backend → frontend → nginx)"
ssh "root@$NODE_IP" \
    'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d'

echo "==> verifying health"
ssh "root@$NODE_IP" 'curl -fsS http://127.0.0.1:8080/api/v1/health' \
    || { echo "backend health check failed on $NODE_IP"; exit 2; }

echo "==> deploy complete: $NODE_IP"
