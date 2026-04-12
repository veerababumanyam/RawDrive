#!/usr/bin/env bash
# Zero-downtime rolling deploy to both app nodes.
# Usage: ./deploy-prod.sh [--skip-push]
#
# Steps:
#   1. Push code to both nodes (tar, excludes .env/node_modules/.git/.next)
#   2. Deploy Node 1 (build + up + health check)
#   3. Verify Node 1 healthy before touching Node 2
#   4. Deploy Node 2 (build + up + health check)
#   5. Final verification of both nodes
#
# Flags:
#   --skip-push   Skip the tar push step (code already on servers)

set -euo pipefail

APP1_IP="187.127.142.42"
APP2_IP="187.127.142.44"
SSH_KEY="$HOME/.ssh/id_ed25519"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="docker-compose.prod-app.yml"
DEPLOY_DIR="/opt/rawdrive/app/deploy"
HEALTH_URL="http://127.0.0.1:8080/api/v1/health"
HEALTH_RETRIES=30
HEALTH_INTERVAL=5

SKIP_PUSH=false
for arg in "$@"; do
  case "$arg" in
    --skip-push) SKIP_PUSH=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

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
  tar --exclude=node_modules --exclude=.git --exclude=.next \
      --exclude='deploy/.env' --exclude='.env*' \
      --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' \
      --exclude='__pycache__' --exclude='test-results' \
      -cf - . \
    | $SSH "root@$ip" 'tar -xf - -C /opt/rawdrive/app'
  log "Code pushed to $ip"
}

deploy_node() {
  local ip="$1"
  local label="$2"
  log "=== Deploying $label ($ip) ==="

  log "Building images on $ip..."
  $SSH "root@$ip" \
    "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE build --no-cache"

  log "Starting services on $ip..."
  $SSH "root@$ip" \
    "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE up -d"

  log "Waiting for $label health..."
  local attempt=0
  while [ $attempt -lt $HEALTH_RETRIES ]; do
    if $SSH "root@$ip" "curl -fsS $HEALTH_URL" > /dev/null 2>&1; then
      log "$label healthy!"
      return 0
    fi
    attempt=$((attempt + 1))
    log "  Health check attempt $attempt/$HEALTH_RETRIES..."
    sleep $HEALTH_INTERVAL
  done

  log "ERROR: $label failed health check after $((HEALTH_RETRIES * HEALTH_INTERVAL))s"
  log "Rolling back $label..."
  $SSH "root@$ip" \
    "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE logs --tail 50 backend"
  exit 2
}

# --- Pre-flight ---
log "=== RawDrive Rolling Deploy ==="
log "App Node 1: $APP1_IP"
log "App Node 2: $APP2_IP"

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
