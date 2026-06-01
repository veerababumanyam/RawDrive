#!/usr/bin/env bash
# Zero-downtime rolling deploy to both app nodes.
# Usage: ./deploy-prod.sh [--skip-push] [--no-cache] [--pull]
#
# Steps:
#   1. Push code to both nodes.
#   2. Deploy Node 1 (build + up + health check).
#   3. Verify Node 1 healthy before touching Node 2.
#   4. Deploy Node 2 (build + up + health check).
#   5. Final verification of both nodes.
#
# Flags:
#   --skip-push   Skip the tar push step (code already on servers).
#   --no-cache    Force a clean Docker rebuild. Slow; use only when cache is suspect.
#   --pull        Ask Docker Compose to pull newer base images before building.
#
# SSH host-key verification (supply-chain hardening):
#   This script streams a source tarball over SSH and builds the prod Docker
#   images from it on the VPS. If host-key verification were disabled, a MITM
#   on the SSH path could tamper with the streamed tarball and inject code into
#   the prod image with no warning. We therefore pin the VPS host keys and run
#   with StrictHostKeyChecking=yes.
#
#   Known-hosts file (pinned VPS fingerprints), resolution order:
#     1. $DEPLOY_KNOWN_HOSTS env var (if set)
#     2. deploy/known_hosts next to this script (checked into the repo)
#     3. ~/.ssh/known_hosts (operator default)
#
#   First-connect / key-rotation seeding (do this ONCE per VPS, out of band,
#   then verify the fingerprint against the value the VPS provider published):
#     ssh-keyscan -t ed25519 187.127.142.42 >> deploy/known_hosts
#     ssh-keyscan -t ed25519 187.127.142.44 >> deploy/known_hosts
#     ssh-keygen -lf deploy/known_hosts        # print fingerprints to verify
#   Compare the printed SHA256 fingerprints against the documented VPS host-key
#   fingerprints before committing deploy/known_hosts. NEVER seed blind on an
#   untrusted network — that reintroduces the TOFU/MITM window this guards against.

set -euo pipefail

APP1_IP="187.127.142.42"
APP2_IP="187.127.142.44"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
# Pinned known-hosts file for strict host-key verification. Env override first,
# then the repo-committed deploy/known_hosts, then the operator's default.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -n "${DEPLOY_KNOWN_HOSTS:-}" ]; then
  KNOWN_HOSTS="$DEPLOY_KNOWN_HOSTS"
elif [ -f "$SCRIPT_DIR/../known_hosts" ]; then
  KNOWN_HOSTS="$SCRIPT_DIR/../known_hosts"
else
  KNOWN_HOSTS="$HOME/.ssh/known_hosts"
fi
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o ConnectTimeout=10"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="docker-compose.prod-app.yml"
DEPLOY_DIR="/opt/rawdrive/app/deploy"
HEALTH_URL="http://127.0.0.1:8080/health"
HEALTH_RETRIES=30
HEALTH_INTERVAL=5

SKIP_PUSH=false
NO_CACHE=false
PULL=false
for arg in "$@"; do
  case "$arg" in
    --skip-push) SKIP_PUSH=true ;;
    --no-cache) NO_CACHE=true ;;
    --pull) PULL=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

guard_supported_shell() {
  # On Windows, plain `bash` often resolves to WSL/System32 bash. That
  # environment cannot reliably stream Windows paths/SSH keys for this script
  # and has already caused production deploys to hang. Git Bash reports
  # MSYS/MINGW/CYGWIN; native Linux is also valid for non-Windows operators.
  local kernel
  kernel="$(uname -s 2>/dev/null || true)"
  if [ "$kernel" = "Linux" ] && [ -r /proc/version ] && grep -qiE 'microsoft|wsl' /proc/version; then
    cat >&2 <<'EOF'
ERROR: deploy-prod.sh is running under WSL bash.

Run the Windows wrapper instead:
  powershell -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod.ps1

Or run Git Bash directly:
  "C:\Program Files\Git\bin\bash.exe" deploy/scripts/deploy-prod.sh
EOF
    exit 1
  fi
}

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

check_ssh() {
  local ip="$1"
  log "Testing SSH to $ip..."
  $SSH "root@$ip" 'echo ok' > /dev/null 2>&1 \
    || { log "ERROR: Cannot SSH to $ip"; exit 1; }
}

push_code() {
  local ip="$1"
  log "Pushing code to $ip..."
  cd "$REPO_ROOT"
  tar "${tar_excludes[@]}" -cf - . \
    | $SSH "root@$ip" 'tar -xf - -C /opt/rawdrive/app'
  # Belt-and-suspenders: the tar excludes ._* on push, but tar -xf never
  # deletes files that exist on the target but not in the new stream.
  # Without this sweep, AppleDouble droppings from earlier deploys
  # (pre-2026-05-19) remain and re-break the migration runner with
  # SQLSTATE 08P01 on ._NNN_*.sql files. Idempotent + fast.
  $SSH "root@$ip" 'find /opt/rawdrive/app -name "._*" -type f -delete 2>/dev/null'
  log "Code pushed to $ip"
}

docker_build_args() {
  # macOS bash 3.2 + set -u: "${args[@]}" on an empty array errors with
  # "unbound variable". The deploy halted on this every time both flags
  # were unset (the normal path — cache enabled, no --pull). The
  # ${args[@]+...} guard skips expansion when the array is empty, which
  # is the documented bash workaround.
  local args=()
  if [ "$NO_CACHE" = true ]; then
    args+=(--no-cache)
  fi
  if [ "$PULL" = true ]; then
    args+=(--pull)
  fi
  if [ ${#args[@]} -gt 0 ]; then
    printf '%s ' "${args[@]}"
  fi
}

deploy_node() {
  local ip="$1"
  local label="$2"
  local build_args
  build_args="$(docker_build_args)"
  log "=== Deploying $label ($ip) ==="

  log "Building images on $ip..."
  $SSH "root@$ip" \
    "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE build $build_args"

  log "Starting services on $ip..."
  $SSH "root@$ip" \
    "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE up -d"

  log "Waiting for $label health..."
  local attempt=0
  local healthy=false
  while [ $attempt -lt $HEALTH_RETRIES ]; do
    if $SSH "root@$ip" "curl -fsS $HEALTH_URL" > /dev/null 2>&1; then
      log "$label healthy!"
      healthy=true
      break
    fi
    attempt=$((attempt + 1))
    log "  Health check attempt $attempt/$HEALTH_RETRIES..."
    sleep $HEALTH_INTERVAL
  done

  if [ "$healthy" = false ]; then
    log "ERROR: $label failed health check after $((HEALTH_RETRIES * HEALTH_INTERVAL))s"
    log "Recent backend logs from $label:"
    $SSH "root@$ip" \
      "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE logs --tail 50 backend"
    exit 2
  fi

  # Force-recreate nginx so it picks up bind-mounted config changes.
  #
  # tar -xf on push replaces the host-side template/nginx.conf with a NEW
  # inode; the running nginx container's bind mount still references the
  # OLD inode (orphaned but still attached). `docker compose up -d` above
  # only recreates containers whose image changed — for nginx-config-only
  # deploys it skips recreate entirely, so the file is updated on disk
  # but the container keeps serving the previous content forever.
  #
  # Burnt by this on 2026-05-28 during the *.rawdrive.in wildcard cutover:
  # template was updated and pushed cleanly but nginx kept serving the old
  # single-domain cert until manually --force-recreate'd. Always doing this
  # at the tail of deploy_node costs ~5s per node and makes the recreate
  # automatic for the common case (CI/cron-driven deploys where no human
  # is watching the logs).
  #
  # No-op when the nginx image+config changed in this deploy (up -d already
  # recreated the container). Safe before moving to the next node — nginx
  # restart is sub-second, backend traffic continues unaffected since the
  # rolling deploy already serves through the other node.
  log "Reconciling nginx (--force-recreate) on $label..."
  $SSH "root@$ip" \
    "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE up -d --force-recreate --no-deps nginx" \
    > /dev/null

  return 0
}

# --- Pre-flight ---
guard_supported_shell
log "=== RawDrive Rolling Deploy ==="
log "App Node 1: $APP1_IP"
log "App Node 2: $APP2_IP"
if [ "$NO_CACHE" = true ]; then
  log "Docker build cache: disabled (--no-cache)"
else
  log "Docker build cache: enabled"
fi
if [ "$PULL" = true ]; then
  log "Docker base-image pull: enabled (--pull)"
fi

check_ssh "$APP1_IP"
check_ssh "$APP2_IP"

# --- Push code ---
if [ "$SKIP_PUSH" = false ]; then
  push_code "$APP1_IP"
  push_code "$APP2_IP"
else
  log "Skipping code push (--skip-push)"
fi

# --- Rolling deploy: Node 1 first ---
deploy_node "$APP1_IP" "Node 1"

# --- Verify Node 1 is serving before touching Node 2 ---
log "Verifying Node 1 frontend..."
$SSH "root@$APP1_IP" "curl -fsS http://127.0.0.1:3000/ > /dev/null" \
  || { log "WARNING: Node 1 frontend not responding, proceeding anyway"; }

# --- Rolling deploy: Node 2 ---
deploy_node "$APP2_IP" "Node 2"

# --- Final verification ---
log "=== Final Verification ==="
for ip in "$APP1_IP" "$APP2_IP"; do
  if $SSH "root@$ip" "curl -fsS $HEALTH_URL" > /dev/null 2>&1; then
    log "  $ip: HEALTHY"
  else
    log "  $ip: UNHEALTHY (check manually)"
  fi
done

log "=== Deploy complete ==="
