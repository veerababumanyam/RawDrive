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
    --exclude='._*'
    --exclude='*/._*'
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -n "${DEPLOY_KNOWN_HOSTS:-}" ]; then
    KNOWN_HOSTS="$DEPLOY_KNOWN_HOSTS"
elif [ -f "$SCRIPT_DIR/../known_hosts" ]; then
    KNOWN_HOSTS="$SCRIPT_DIR/../known_hosts"
else
    KNOWN_HOSTS="$HOME/.ssh/known_hosts"
fi
SSH_KEY="${SSH_KEY:-$HOME/.ssh/rawdrive_hostinger}"
SSH=(ssh)
if [ -n "${SSH_KEY:-}" ]; then
    SSH+=(-i "$SSH_KEY")
fi
SSH+=(-o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN_HOSTS" -o ConnectTimeout=10)

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DEPLOY_REVISION="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
DEPLOY_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"

cleanup_excluded_source_paths() {
    # Keep server source trees aligned with the tar payload. These paths are
    # intentionally excluded from production deploys, so stale copies from older
    # deploys should not remain and confuse release audits.
    "${SSH[@]}" "root@$NODE_IP" \
        'rm -rf /opt/rawdrive/app/e2e /opt/rawdrive/app/tests /opt/rawdrive/app/backend/tests /opt/rawdrive/app/references /opt/rawdrive/app/docs/archive'
}

write_deploy_revision() {
    local deployed_at
    deployed_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    "${SSH[@]}" "root@$NODE_IP" "cat > /opt/rawdrive/app/.rawdrive-deploy-revision" <<EOF
commit=$DEPLOY_REVISION
branch=$DEPLOY_BRANCH
deployed_at=$deployed_at
script=$(basename "$0")
EOF
}

echo "==> pushing source to $NODE_IP"
cd "$REPO_ROOT"
tar "${tar_excludes[@]}" -cf - . \
    | "${SSH[@]}" "root@$NODE_IP" 'tar -xf - -C /opt/rawdrive/app'
cleanup_excluded_source_paths
write_deploy_revision

echo "==> building images on $NODE_IP"
"${SSH[@]}" "root@$NODE_IP" \
    "cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml build ${build_args[*]}"

echo "==> rolling up (respects dependency order: pgbouncer -> migrate -> backend -> frontend -> nginx)"
"${SSH[@]}" "root@$NODE_IP" \
    'cd /opt/rawdrive/app/deploy && docker compose -f docker-compose.prod-app.yml up -d'

echo "==> verifying health"
"${SSH[@]}" "root@$NODE_IP" 'curl -fsS http://127.0.0.1:8080/health/deep' \
    || { echo "backend health check failed on $NODE_IP"; exit 2; }

echo "==> deploy complete: $NODE_IP"
