#!/usr/bin/env bash
# Rolling app deploy driver; run from a local workstation.
# Usage: ./deploy-app.sh <node-ip> [--no-cache] [--pull]
# Pushes source, rebuilds images, rolls containers with health gates.

set -euo pipefail

NODE_IP="${1:-}"
if [ -z "$NODE_IP" ]; then
    echo "usage: $0 <node-ip> [--no-cache] [--pull]" >&2
    exit 1
fi
shift || true

NO_CACHE=false
PULL=false
for arg in "$@"; do
    case "$arg" in
        --no-cache) NO_CACHE=true ;;
        --pull) PULL=true ;;
        *) echo "unknown flag: $arg" >&2; exit 1 ;;
    esac
done

if [ "$(uname -s 2>/dev/null || true)" = "Linux" ] && [ -r /proc/version ] && grep -qiE 'microsoft|wsl' /proc/version; then
    echo "ERROR: deploy-app.sh is running under WSL bash. Use Git Bash or deploy-prod.ps1 on Windows." >&2
    exit 1
fi

tar_excludes=(
    --exclude=node_modules
    --exclude='*/node_modules'
    --exclude=.git
    --exclude='*/.git'
    --exclude=.next
    --exclude='*/.next'
    --exclude='deploy/.env'
    --exclude='.env*'
    --exclude='*.log'
    --exclude='*.tsbuildinfo'
    --exclude='__pycache__'
    --exclude='*/__pycache__'
    --exclude='.claude'
    --exclude='.codex'
    --exclude='.codex-runtime-logs'
    --exclude='.playwright-mcp'
    --exclude='.stitch'
    --exclude='.vscode'
    --exclude='_cobolt-output'
    --exclude='*/_cobolt-output'
    --exclude='playwright-report'
    --exclude='test-results'
    --exclude='*/test-results'
    --exclude='coverage'
    --exclude='*/coverage'
    --exclude='backend/.storage'
    --exclude='backend/.tmp'
    --exclude='backend/*.exe'
    --exclude='backend/*.exe~'
    --exclude='backend/api-fixed'
    --exclude='backend/api-fixed~'
    --exclude='backend/rawdrive-api'
    --exclude='backend/rawdrive-api~'
    --exclude='backend/*.test'
    --exclude='backend/*.test.exe'
    --exclude='e2e'
    --exclude='tests'
    --exclude='docs/archive'
    --exclude='references'
)

build_args=()
if [ "$NO_CACHE" = true ]; then
    build_args+=(--no-cache)
fi
if [ "$PULL" = true ]; then
    build_args+=(--pull)
fi

echo "==> pushing source to $NODE_IP"
tar "${tar_excludes[@]}" -cf - . \
    | ssh "root@$NODE_IP" 'tar -xf - -C /opt/rawdrive/app'

echo "==> building images on $NODE_IP"
ssh "root@$NODE_IP" \
    "cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build ${build_args[*]}"

echo "==> rolling up (respects dependency order: pgbouncer -> migrate -> backend -> frontend -> nginx)"
ssh "root@$NODE_IP" \
    'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d'

echo "==> verifying health"
ssh "root@$NODE_IP" 'curl -fsS http://127.0.0.1:8080/health' \
    || { echo "backend health check failed on $NODE_IP"; exit 2; }

echo "==> deploy complete: $NODE_IP"
