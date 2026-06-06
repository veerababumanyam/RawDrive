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
SSH_KEY="${SSH_KEY:-$HOME/.ssh/rawdrive_hostinger}"
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
DEPLOY_REVISION="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
DEPLOY_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
COMPOSE_FILE="docker-compose.prod-app.yml"
DEPLOY_DIR="/opt/rawdrive/app/deploy"
HEALTH_URL="http://127.0.0.1:8080/health/deep"
READY_URL="http://127.0.0.1:8080/health/ready"
HEALTH_RETRIES=30
HEALTH_INTERVAL=5

# ─────────────────────────────────────────────────────────────────────────────
# ONE COMMAND, FULL PIPELINE. `npm run deploy:prod` runs the entire hardened
# pipeline BY DEFAULT — no flags to remember:
#   pre-flight SSH + DB-node health → push → (pending-aware) pre-migration backup
#   → rolling zero-downtime deploy with a per-node readiness gate → full
#   all-servers-healthy verification (deep + ready + same-revision + DB-node +
#   replica lag + backup freshness) → smoke test.
#
# The defaults below turn every SAFE, gracefully-degrading phase ON. Each can be
# individually overridden from the environment / deploy/.env if ever needed, and
# `--fast` skips the pre-migration backup for a quick code-only redeploy. The
# only capability that stays OPT-IN is pulling images from a registry
# (DEPLOY_FROM_REGISTRY=1) — it needs a one-time `docker login ghcr.io` on the
# nodes, so it can't be a safe default. See deploy/.env.example + cicd.md.
# ─────────────────────────────────────────────────────────────────────────────
DB_NODE_IP="${DB_NODE_IP:-187.127.142.46}"
DEPLOY_FROM_REGISTRY="${DEPLOY_FROM_REGISTRY:-0}"        # opt-in (needs ghcr login)
DEPLOY_IMAGE_REGISTRY="${DEPLOY_IMAGE_REGISTRY:-ghcr.io}"
DEPLOY_IMAGE_OWNER="${DEPLOY_IMAGE_OWNER:-manyamprasad}"
# Default tag = the exact commit being deployed (matches the build-images CI
# workflow which tags each image with the full commit SHA).
DEPLOY_IMAGE_TAG="${DEPLOY_IMAGE_TAG:-$DEPLOY_REVISION}"
DEPLOY_PRE_MIGRATION_BACKUP="${DEPLOY_PRE_MIGRATION_BACKUP:-1}"  # ON; skipped when no migrations pending
DEPLOY_MIGRATE_STRICT="${DEPLOY_MIGRATE_STRICT:-1}"             # ON; readiness-gate each node + final verdict
DEPLOY_VERIFY_DB_NODE="${DEPLOY_VERIFY_DB_NODE:-1}"            # ON; degrades to warnings if .46 unreachable
DEPLOY_SMOKE_URL="${DEPLOY_SMOKE_URL:-https://api.rawdrive.in/health/ready}"  # informative
DEPLOY_REPLICA_LAG_MAX_BYTES="${DEPLOY_REPLICA_LAG_MAX_BYTES:-134217728}"  # 128 MiB
# SSH command targeting the DB node (.46). Same key + pinned known_hosts as the
# app nodes (deploy/known_hosts pins all three).
SSH_DB="ssh -i $SSH_KEY -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o ConnectTimeout=10"

SKIP_PUSH=false
NO_CACHE=false
PULL=false
for arg in "$@"; do
  case "$arg" in
    --skip-push) SKIP_PUSH=true ;;
    --no-cache) NO_CACHE=true ;;
    --pull) PULL=true ;;
    # Quick code-only redeploy: skip the pre-migration backup. (Migrations still
    # apply via compose; only the backup step is skipped. Use when you KNOW the
    # change has no schema migration and want the fastest path.)
    --fast) DEPLOY_PRE_MIGRATION_BACKUP=0 ;;
    # Escape hatch: revert to the old minimal flow (no backup, no strict gate,
    # no DB-node verification, no smoke) for emergency/manual deploys.
    --minimal)
      DEPLOY_PRE_MIGRATION_BACKUP=0
      DEPLOY_MIGRATE_STRICT=0
      DEPLOY_VERIFY_DB_NODE=0
      DEPLOY_SMOKE_URL=""
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# Resolve the live Postgres primary container on the DB node. After the Patroni
# cutover it is `deploy-patroni-1`; pre-cutover it was `deploy-postgres-1`.
# Lazy + cached so callers can use `$(pg_primary_container)` inline.
PG_PRIMARY_CONTAINER=""
pg_primary_container() {
  if [ -z "$PG_PRIMARY_CONTAINER" ]; then
    PG_PRIMARY_CONTAINER="$($SSH_DB "root@$DB_NODE_IP" 'docker ps --format "{{.Names}}" | grep -xE "deploy-(patroni|postgres)-1" | head -1' 2>/dev/null || true)"
    PG_PRIMARY_CONTAINER="${PG_PRIMARY_CONTAINER:-deploy-postgres-1}"
  fi
  printf '%s' "$PG_PRIMARY_CONTAINER"
}

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

cleanup_excluded_source_paths() {
  local ip="$1"
  # Keep server source trees aligned with the tar payload. These paths are
  # intentionally excluded from production deploys, so stale copies from older
  # deploys should not remain and confuse release audits.
  $SSH "root@$ip" 'rm -rf /opt/rawdrive/app/e2e /opt/rawdrive/app/tests /opt/rawdrive/app/backend/tests /opt/rawdrive/app/references /opt/rawdrive/app/docs/archive'
}

write_deploy_revision() {
  local ip="$1"
  local deployed_at
  deployed_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  $SSH "root@$ip" "cat > /opt/rawdrive/app/.rawdrive-deploy-revision" <<EOF
commit=$DEPLOY_REVISION
branch=$DEPLOY_BRANCH
deployed_at=$deployed_at
script=$(basename "$0")
EOF
}

push_code() {
  local ip="$1"
  log "Pushing code to $ip..."
  cd "$REPO_ROOT"
  tar "${tar_excludes[@]}" -cf - . \
    | $SSH "root@$ip" 'tar -xf - -C /opt/rawdrive/app'
  cleanup_excluded_source_paths "$ip"
  write_deploy_revision "$ip"
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

# prepare_images makes the prod images available on a node, either by building
# them there (default, current behavior) or — when DEPLOY_FROM_REGISTRY=1 — by
# pulling prebuilt, byte-identical images from the registry by commit SHA and
# retagging them to the local names the compose file expects. Registry mode
# halves prod build CPU and guarantees both nodes run the same image.
prepare_images() {
  local ip="$1"
  local label="$2"

  if [ "$DEPLOY_FROM_REGISTRY" != "1" ]; then
    local build_args
    build_args="$(docker_build_args)"
    log "Building images on $label..."
    $SSH "root@$ip" \
      "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE build $build_args"
    return 0
  fi

  if [ -z "$DEPLOY_IMAGE_OWNER" ]; then
    log "ERROR: DEPLOY_FROM_REGISTRY=1 but DEPLOY_IMAGE_OWNER is empty"
    exit 1
  fi
  local base="$DEPLOY_IMAGE_REGISTRY/$DEPLOY_IMAGE_OWNER"
  log "Pulling prebuilt images on $label ($base/*:$DEPLOY_IMAGE_TAG)..."
  # backend image also backs the migrate + worker services (same image:).
  local svc
  for svc in backend frontend face-svc; do
    local remote="$base/rawdrive-$svc:$DEPLOY_IMAGE_TAG"
    if ! $SSH "root@$ip" "docker pull $remote"; then
      log "ERROR: failed to pull $remote on $label."
      log "  Ensure the build-images CI workflow pushed this commit's images and"
      log "  that the node is logged in: docker login $DEPLOY_IMAGE_REGISTRY"
      exit 1
    fi
    # Retag to the local name the compose file references so 'up -d' uses the
    # pulled image instead of building (the image now exists, so compose skips
    # its build: stage).
    $SSH "root@$ip" "docker tag $remote rawdrive-$svc:local"
  done
}

# wait_ready polls /health/ready (DB + cache reachable AND migrations at head).
# Returns 0 when ready, 1 otherwise. Informative: callers decide fail vs warn.
wait_ready() {
  local ip="$1"
  local label="$2"
  local attempt=0
  while [ $attempt -lt $HEALTH_RETRIES ]; do
    if $SSH "root@$ip" "curl -fsS $READY_URL" > /dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep $HEALTH_INTERVAL
  done
  return 1
}

# pre_migration_backup takes a recoverable DB snapshot on the .46 primary BEFORE
# any migration runs, so a bad migration can be rolled back. Prefers a fast
# pgBackRest incremental backup when the PITR stanza is active; otherwise falls
# back to the logical pg_dump (backup-db.sh). FAIL-CLOSED: if it can't back up,
# the deploy aborts rather than migrating unprotected.
pre_migration_backup() {
  [ "$DEPLOY_PRE_MIGRATION_BACKUP" = "1" ] || return 0
  log "=== Pre-migration backup on DB node ($DB_NODE_IP) ==="
  if ! $SSH_DB "root@$DB_NODE_IP" 'echo ok' >/dev/null 2>&1; then
    log "ERROR: cannot SSH to DB node $DB_NODE_IP for pre-migration backup"
    exit 1
  fi
  if $SSH_DB "root@$DB_NODE_IP" "docker exec -u postgres $(pg_primary_container) pgbackrest --stanza=rawdrive info" >/dev/null 2>&1; then
    log "pgBackRest stanza active → taking an incremental backup..."
    if ! $SSH_DB "root@$DB_NODE_IP" "docker exec -u postgres $(pg_primary_container) pgbackrest --stanza=rawdrive --type=incr backup"; then
      log "ERROR: pgBackRest pre-migration backup failed — aborting deploy"
      exit 1
    fi
  else
    log "pgBackRest not active → taking a logical pg_dump (backup-db.sh)..."
    if ! $SSH_DB "root@$DB_NODE_IP" 'set -a; . /opt/rawdrive/app/.env; set +a; /opt/rawdrive/backup-db.sh'; then
      log "ERROR: logical pre-migration backup failed — aborting deploy"
      exit 1
    fi
  fi
  log "Pre-migration backup complete."
}

# maybe_pre_migration_backup takes a pre-migration backup ONLY when this deploy
# actually has pending migrations — so code-only deploys stay fast (the common
# case) while schema-changing deploys are protected. The pending count is read
# from the NEW image's `migrate status` (read-only); on ANY uncertainty it backs
# up (fail-closed). Node 1's images must already be prepared before this runs.
maybe_pre_migration_backup() {
  local ip="$1"
  [ "$DEPLOY_PRE_MIGRATION_BACKUP" = "1" ] || { log "Pre-migration backup: disabled (--fast/--minimal)"; return 0; }

  # Ensure the pooler is up so `migrate status` can reach the DB.
  $SSH "root@$ip" "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE up -d pgbouncer" >/dev/null 2>&1 || true

  local pending="unknown" out
  if out="$($SSH "root@$ip" "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE run --rm --no-deps --entrypoint /usr/local/bin/migrate migrate status" 2>/dev/null)"; then
    pending="$(printf '%s\n' "$out" | grep -c '^PENDING ' || true)"
  fi

  if [ "$pending" = "0" ]; then
    log "No pending migrations → skipping pre-migration backup (fast path)."
    return 0
  fi
  if [ "$pending" = "unknown" ]; then
    log "Pending-migration check inconclusive → backing up anyway (fail-closed)."
  else
    log "$pending pending migration(s) detected → taking pre-migration backup."
  fi
  pre_migration_backup
}

# verify_db_node checks the .46 DB node's own services, the .44 standby's
# replication lag, and backup freshness. Warnings by default; fails the final
# verdict only via the strict path in the caller.
verify_db_node() {
  [ "$DEPLOY_VERIFY_DB_NODE" = "1" ] || return 0
  local ok=true
  log "=== DB node verification ($DB_NODE_IP) ==="
  if ! $SSH_DB "root@$DB_NODE_IP" 'echo ok' >/dev/null 2>&1; then
    log "  WARNING: cannot SSH to DB node $DB_NODE_IP — skipping DB checks"
    return 0
  fi
  # Postgres primary.
  if $SSH_DB "root@$DB_NODE_IP" "docker exec $(pg_primary_container) pg_isready -U rawdrive -d rawdrive" >/dev/null 2>&1; then
    log "  postgres primary: READY"
  else
    log "  postgres primary: NOT READY"; ok=false
  fi
  # Valkey primary.
  if $SSH_DB "root@$DB_NODE_IP" 'docker exec deploy-valkey-1 sh -c "valkey-cli -a \$VALKEY_PASSWORD ping" 2>/dev/null | grep -q PONG' >/dev/null 2>&1; then
    log "  valkey primary: PONG"
  else
    log "  valkey primary: unverified (check manually)"
  fi
  # NATS (DB-node member).
  if $SSH_DB "root@$DB_NODE_IP" 'curl -fsS http://127.0.0.1:8222/healthz' >/dev/null 2>&1; then
    log "  nats (db node): healthy"
  else
    log "  nats (db node): unverified"
  fi
  # Standby replication lag (bytes between primary LSN and replica replay).
  local lag
  lag="$($SSH_DB "root@$DB_NODE_IP" "docker exec $(pg_primary_container) psql -U rawdrive -d rawdrive -tAc \"SELECT COALESCE(MAX(pg_wal_lsn_diff(sent_lsn, replay_lsn)),0)::bigint FROM pg_stat_replication\"" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$lag" ] && printf '%s' "$lag" | grep -qE '^[0-9]+$'; then
    if [ "$lag" -le "$DEPLOY_REPLICA_LAG_MAX_BYTES" ]; then
      log "  standby replication lag: ${lag} bytes (<= ${DEPLOY_REPLICA_LAG_MAX_BYTES})"
    else
      log "  standby replication lag: ${lag} bytes — EXCEEDS ${DEPLOY_REPLICA_LAG_MAX_BYTES}"; ok=false
    fi
  else
    log "  standby replication lag: no streaming standby connected (or unverified)"
  fi
  # Backup freshness — newest local logical dump younger than 26h.
  if $SSH_DB "root@$DB_NODE_IP" 'find /opt/rawdrive/backups -name "rawdrive_*.dump.gpg" -mmin -1560 2>/dev/null | grep -q .' >/dev/null 2>&1; then
    log "  backup freshness: a dump < 26h old exists"
  else
    log "  backup freshness: no recent logical dump found (check backup cron / pgBackRest info)"
  fi
  [ "$ok" = true ] || FINAL_DB_NODE_OK=false
}

deploy_node() {
  local ip="$1"
  local label="$2"
  log "=== Deploying $label ($ip) ==="

  # Images may have been prepared already (Node 1, for the pending-migration
  # check). Pass "skip_prepare" to avoid building/pulling twice.
  if [ "${3:-}" != "skip_prepare" ]; then
    prepare_images "$ip" "$label"
  fi

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

  # Readiness gate: /health/ready is 200 only when DB + cache are reachable AND
  # migrations are at the head this image embeds. The one-shot migrate service
  # ran during `up -d`, so a not-ready here is a real schema/dependency problem,
  # not a startup race. Strict mode (DEPLOY_MIGRATE_STRICT=1) fails the deploy;
  # otherwise it warns so default behavior is unchanged.
  if wait_ready "$ip" "$label"; then
    log "$label ready (migrations at head)."
  elif [ "$DEPLOY_MIGRATE_STRICT" = "1" ]; then
    log "ERROR: $label not ready (migrations behind / dependency down), DEPLOY_MIGRATE_STRICT=1"
    $SSH "root@$ip" "curl -fsS $READY_URL" 2>&1 | head -c 800 || true
    $SSH "root@$ip" "cd $DEPLOY_DIR && docker compose -f $COMPOSE_FILE logs --tail 50 backend" || true
    exit 2
  else
    log "WARNING: $label /health/ready not 200 (proceeding; set DEPLOY_MIGRATE_STRICT=1 to gate)"
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
FINAL_DB_NODE_OK=true
log "=== RawDrive Rolling Deploy ==="
log "App Node 1: $APP1_IP"
log "App Node 2: $APP2_IP"
log "Revision: ${DEPLOY_REVISION:0:12} ($DEPLOY_BRANCH)"
if [ "$DEPLOY_FROM_REGISTRY" = "1" ]; then
  log "Image source: registry $DEPLOY_IMAGE_REGISTRY/$DEPLOY_IMAGE_OWNER/*:${DEPLOY_IMAGE_TAG:0:12}"
else
  if [ "$NO_CACHE" = true ]; then
    log "Image source: build on each node (cache disabled, --no-cache)"
  else
    log "Image source: build on each node (cache enabled)"
  fi
  [ "$PULL" = true ] && log "Docker base-image pull: enabled (--pull)"
fi
[ "$DEPLOY_PRE_MIGRATION_BACKUP" = "1" ] && log "Pre-migration backup: ENABLED (fail-closed)"
[ "$DEPLOY_MIGRATE_STRICT" = "1" ] && log "Migration head gate: STRICT"
[ "$DEPLOY_VERIFY_DB_NODE" = "1" ] && log "DB node verification: ENABLED ($DB_NODE_IP)"

check_ssh "$APP1_IP"
check_ssh "$APP2_IP"

# Preflight look at the DB node before we change anything (informative).
verify_db_node

# --- Push code ---
if [ "$SKIP_PUSH" = false ]; then
  push_code "$APP1_IP"
  push_code "$APP2_IP"
else
  log "Skipping code push (--skip-push)"
fi

# --- Pre-migration backup (pending-aware) ---
# Prepare Node 1's images first so we can ask the NEW migrate binary whether this
# deploy has pending migrations; if so, take a recoverable snapshot BEFORE Node
# 1's `up -d` applies them. Code-only deploys skip the backup (fast path).
prepare_images "$APP1_IP" "Node 1"
maybe_pre_migration_backup "$APP1_IP"

# --- Rolling deploy: Node 1 first (images already prepared above) ---
deploy_node "$APP1_IP" "Node 1" skip_prepare

# --- Verify Node 1 is serving before touching Node 2 ---
log "Verifying Node 1 frontend..."
$SSH "root@$APP1_IP" "curl -fsS http://127.0.0.1:3000/ > /dev/null" \
  || { log "WARNING: Node 1 frontend not responding, proceeding anyway"; }

# --- Rolling deploy: Node 2 ---
deploy_node "$APP2_IP" "Node 2"

# --- Final verification ---
log "=== Final Verification ==="
FINAL_OK=true
for ip in "$APP1_IP" "$APP2_IP"; do
  if $SSH "root@$ip" "curl -fsS $HEALTH_URL" > /dev/null 2>&1; then
    log "  $ip /health/deep:  HEALTHY"
  else
    log "  $ip /health/deep:  UNHEALTHY (check manually)"; FINAL_OK=false
  fi
  if $SSH "root@$ip" "curl -fsS $READY_URL" > /dev/null 2>&1; then
    log "  $ip /health/ready: READY"
  else
    log "  $ip /health/ready: NOT READY (migrations behind / dependency down)"
    [ "$DEPLOY_MIGRATE_STRICT" = "1" ] && FINAL_OK=false
  fi
done

# Both app nodes must end on the SAME deployed revision (catches a half-rolled
# deploy where one node updated and the other did not).
rev1="$($SSH "root@$APP1_IP" "grep '^commit=' /opt/rawdrive/app/.rawdrive-deploy-revision 2>/dev/null | cut -d= -f2" 2>/dev/null | tr -d '[:space:]' || true)"
rev2="$($SSH "root@$APP2_IP" "grep '^commit=' /opt/rawdrive/app/.rawdrive-deploy-revision 2>/dev/null | cut -d= -f2" 2>/dev/null | tr -d '[:space:]' || true)"
if [ -n "$rev1" ] && [ "$rev1" = "$rev2" ]; then
  log "  both nodes at revision: ${rev1:0:12}"
else
  log "  WARNING: node revisions differ (n1=${rev1:0:12} n2=${rev2:0:12})"
  FINAL_OK=false
fi

# Re-verify the DB node post-deploy (replica may have been catching up).
FINAL_DB_NODE_OK=true
verify_db_node
[ "$FINAL_DB_NODE_OK" = true ] || { log "  DB node verification reported problems"; FINAL_OK=false; }

# End-to-end smoke test through the public edge. Informational only — external
# reachability from the deploy host can vary (DNS/network), so a failure here
# warns but never fails the deploy verdict.
if [ -n "$DEPLOY_SMOKE_URL" ]; then
  log "Smoke test: GET $DEPLOY_SMOKE_URL"
  if curl -fsS --max-time 15 "$DEPLOY_SMOKE_URL" >/dev/null 2>&1; then
    log "  smoke: OK"
  else
    log "  smoke: FAILED (informational — external reachability can vary)"
  fi
fi

if [ "$FINAL_OK" = true ]; then
  log "=== Deploy complete ==="
else
  # Default behavior is preserved (exit 0 with warnings); strict mode turns a
  # degraded final verdict into a non-zero exit so CI/operators must look.
  log "=== Deploy completed WITH WARNINGS — review the log above ==="
  [ "$DEPLOY_MIGRATE_STRICT" = "1" ] && exit 3
fi
