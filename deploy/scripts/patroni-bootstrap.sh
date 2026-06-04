#!/usr/bin/env bash
# =============================================================================
# RawDrive — Patroni cutover driver (deploy/scripts/patroni-bootstrap.sh)
# =============================================================================
#
#  ⚠️  PLANNED, IRREVERSIBLE-IN-PARTS CUTOVER — RUN INSIDE A MAINTENANCE WINDOW  ⚠️
#
# This script performs the ONE-TIME, DELIBERATE cutover from the MANUAL Postgres
# failover model (deploy/scripts/promote-postgres-replica.sh + a hand-edited
# deploy/pgbouncer/databases.ini flip) to the AUTOMATIC Patroni model
# (etcd + Patroni + HAProxy). It is NOT idempotent in the dangerous steps and is
# NOT something the normal rolling deploy ever runs.
#
# Converting the live standalone primary on .46 to Patroni control is NOT
# hot-swappable: Patroni seizes ownership of the Postgres process lifecycle and
# rewrites postgresql.conf / pg_hba.conf in the data directory. There WILL be a
# brief write outage while the primary is stopped, adopted by Patroni, and the
# leader key is established in etcd. DO THIS IN A MAINTENANCE WINDOW.
#
# Every irreversible step requires an explicit `y` confirmation. The script exits
# non-zero on ANY failure (set -euo pipefail + explicit checks) so a half-done
# cutover stops loudly rather than limping forward.
#
# -----------------------------------------------------------------------------
# Topology (facts — do not change here):
#   .42  187.127.142.42   app node      → etcd, haproxy
#   .44  187.127.142.44   app + DB node → etcd, haproxy, patroni (today's standby)
#   .46  187.127.142.46   DB node       → etcd, patroni (today's PRIMARY)
#
# Run this script FROM .46 (the current primary / DB node). It SSHes to .42/.44
# for the steps that must happen there. Requires the dedicated deploy key
# (~/.ssh/rawdrive_hostinger) and the pinned known_hosts, exactly like
# deploy-prod.sh.
#
# Usage:
#   sudo bash deploy/scripts/patroni-bootstrap.sh
# Optional env overrides:
#   SSH_KEY=~/.ssh/rawdrive_hostinger   DEPLOY_KNOWN_HOSTS=deploy/known_hosts
#   COMPOSE_DIR=/opt/rawdrive/app/deploy
# =============================================================================

set -euo pipefail

# --- Config / paths ----------------------------------------------------------
NODE_42="187.127.142.42"
NODE_44="187.127.142.44"
NODE_46="187.127.142.46"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/rawdrive_hostinger}"
DEPLOY_KNOWN_HOSTS="${DEPLOY_KNOWN_HOSTS:-/opt/rawdrive/app/deploy/known_hosts}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/rawdrive/app/deploy}"
PATRONI_COMPOSE="docker-compose.patroni.yml"
APP_COMPOSE="docker-compose.prod-app.yml"
DB_COMPOSE="docker-compose.prod-db.yml"

# Standalone-primary container name (the one we are replacing).
STANDALONE_PRIMARY="deploy-postgres-1"
# Standalone standby container name on .44.
STANDALONE_STANDBY="deploy-postgres-replica-1"
# The named docker volume holding the LIVE primary data dir (see prod-db.yml
# `postgres_data` under project `rawdrive-db`).
PROD_DATA_VOLUME="rawdrive-db_postgres_data"

SSH_OPTS=(-i "$SSH_KEY" -o "UserKnownHostsFile=$DEPLOY_KNOWN_HOSTS" -o "StrictHostKeyChecking=yes")

# --- Helpers -----------------------------------------------------------------
log()  { echo -e "\n\033[1;34m==> $*\033[0m"; }
ok()   { echo -e "\033[1;32m    ✔ $*\033[0m"; }
warn() { echo -e "\033[1;33m    ! $*\033[0m"; }
die()  { echo -e "\033[1;31mFATAL: $*\033[0m" >&2; exit 1; }

confirm() {
    # confirm "<prompt>" — requires an explicit lowercase 'y'. Anything else aborts.
    local prompt="$1" reply
    read -rp "$(echo -e "\033[1;35m${prompt} [type y to proceed]: \033[0m")" reply
    [ "$reply" = "y" ] || die "Aborted by operator at: ${prompt}"
}

ssh_node() {
    # ssh_node <ip> <command...>
    local ip="$1"; shift
    ssh "${SSH_OPTS[@]}" "root@${ip}" "$@"
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

# =============================================================================
# 0. PRE-FLIGHT — refuse to proceed unless the safety net is in place.
# =============================================================================
log "STEP 0 — PRE-FLIGHT SAFETY CHECKS (read-only, no changes yet)"

require_cmd docker
require_cmd ssh
[ -f "$SSH_KEY" ] || die "SSH key not found: $SSH_KEY (set SSH_KEY=~/.ssh/rawdrive_hostinger)"
[ -f "$DEPLOY_KNOWN_HOSTS" ] || die "known_hosts not found: $DEPLOY_KNOWN_HOSTS"
[ -d "$COMPOSE_DIR" ] || die "compose dir not found: $COMPOSE_DIR"
[ -f "$COMPOSE_DIR/$PATRONI_COMPOSE" ] || die "missing $PATRONI_COMPOSE in $COMPOSE_DIR"

echo "This MUST run on the current primary DB node (.46)."
confirm "Confirm you are running this on .46 and inside an announced maintenance window"

log "0a. Confirm .46 is the current standalone PRIMARY"
docker exec "$STANDALONE_PRIMARY" pg_isready -U "${POSTGRES_USER:-rawdrive}" -d "${POSTGRES_DB:-rawdrive}" \
    || die "$STANDALONE_PRIMARY not ready on .46 — are you on the right node?"
in_recovery="$(docker exec "$STANDALONE_PRIMARY" psql -U "${POSTGRES_USER:-rawdrive}" -d "${POSTGRES_DB:-rawdrive}" -tAc 'SELECT pg_is_in_recovery();' || true)"
[ "$in_recovery" = "f" ] || die ".46 reports pg_is_in_recovery=$in_recovery — expected 'f' (a primary)."
ok ".46 is the live primary"

log "0b. Confirm .44 standby is healthy and STREAMING"
ssh_node "$NODE_44" "docker exec $STANDALONE_STANDBY pg_isready -U ${POSTGRES_USER:-rawdrive} -d ${POSTGRES_DB:-rawdrive}" \
    || die ".44 standby not ready — refusing to cut over without a verified standby."
standby_recovery="$(ssh_node "$NODE_44" "docker exec $STANDALONE_STANDBY psql -U ${POSTGRES_USER:-rawdrive} -d ${POSTGRES_DB:-rawdrive} -tAc 'SELECT pg_is_in_recovery();'" || true)"
[ "$standby_recovery" = "t" ] || die ".44 reports pg_is_in_recovery=$standby_recovery — expected 't' (a standby)."
# Replication actually flowing? Check pg_stat_replication on the primary.
repl_count="$(docker exec "$STANDALONE_PRIMARY" psql -U "${POSTGRES_USER:-rawdrive}" -d "${POSTGRES_DB:-rawdrive}" -tAc "SELECT count(*) FROM pg_stat_replication WHERE state='streaming';" || echo 0)"
[ "${repl_count:-0}" -ge 1 ] || die "No streaming standby in pg_stat_replication — replication is NOT healthy. Aborting."
ok ".44 is a healthy streaming standby"

log "0c. Confirm a FRESH pgBackRest full backup exists (the rollback floor)"
echo "    Patroni will adopt the live data dir; if anything goes wrong we restore"
echo "    from the pgBackRest repo. Verifying a recent full backup in stanza 'rawdrive':"
if docker exec "$STANDALONE_PRIMARY" sh -c "command -v pgbackrest >/dev/null 2>&1"; then
    docker exec "$STANDALONE_PRIMARY" pgbackrest --stanza=rawdrive --config=/etc/pgbackrest/pgbackrest.conf info \
        || die "pgbackrest info failed — cannot confirm a backup floor. Aborting."
    warn "Review the 'info' output above. There MUST be a recent full backup."
    confirm "Confirm a fresh, verified pgBackRest FULL backup exists for stanza rawdrive"
else
    warn "pgbackrest not present in $STANDALONE_PRIMARY (PITR image not yet deployed)."
    confirm "Proceed WITHOUT pgBackRest backup verification? (NOT recommended — only if you have another verified base backup)"
fi

log "0d. Confirm the prod data volume exists (Patroni will ADOPT it)"
docker volume inspect "$PROD_DATA_VOLUME" >/dev/null 2>&1 \
    || die "data volume $PROD_DATA_VOLUME not found on .46 — patroni compose expects to adopt it."
ok "data volume $PROD_DATA_VOLUME present"

log "0e. Confirm required env vars are present in $COMPOSE_DIR (.env)"
# These are interpolated by compose at parse time; missing ones make the cutover
# fail in a confusing way later, so fail NOW.
for v in PATRONI_NAME PATRONI_NODE_IP ETCD_NAME ETCD_NODE_IP \
         ETCD_NODE_42_IP ETCD_NODE_44_IP ETCD_NODE_46_IP ETCD_INITIAL_CLUSTER_TOKEN \
         POSTGRES_USER POSTGRES_PASSWORD POSTGRES_REPLICATION_PASSWORD; do
    grep -q "^${v}=" "/opt/rawdrive/app/.env" 2>/dev/null \
        || die "env var ${v} not set in /opt/rawdrive/app/.env (see .env.example integration notes)."
done
ok "all required env vars present on .46"
warn "Verify the SAME etcd/patroni vars are set with the CORRECT per-node identity on .42 and .44 before continuing."
confirm "Confirm .42 and .44 each have their own PATRONI_NAME/ETCD_NAME/*_NODE_IP set in their .env"

echo
warn "PRE-FLIGHT COMPLETE. Everything past this point CHANGES PRODUCTION."
confirm "BEGIN CUTOVER — bring up the Patroni subsystem now"

# =============================================================================
# 1. Bring up the 3-member etcd cluster FIRST (the DCS must exist before Patroni).
# =============================================================================
log "STEP 1 — start etcd on all three nodes (.42, .44, .46)"
ssh_node "$NODE_42" "cd $COMPOSE_DIR && docker compose -f $PATRONI_COMPOSE --profile etcd up -d etcd" || die "etcd up failed on .42"
ssh_node "$NODE_44" "cd $COMPOSE_DIR && docker compose -f $PATRONI_COMPOSE --profile etcd up -d etcd" || die "etcd up failed on .44"
( cd "$COMPOSE_DIR" && docker compose -f "$PATRONI_COMPOSE" --profile etcd up -d etcd ) || die "etcd up failed on .46"

log "1a. Wait for etcd quorum"
for i in $(seq 1 30); do
    if docker exec deploy-etcd-1 sh -c "ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 endpoint health" 2>/dev/null; then
        ok "local etcd member healthy"
        break
    fi
    [ "$i" -eq 30 ] && die "etcd did not become healthy within 30 attempts."
    sleep 2
done
# Quorum-level check: list members and confirm 3.
member_count="$(docker exec deploy-etcd-1 sh -c "ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 member list" | wc -l | tr -d ' ')"
[ "${member_count:-0}" -eq 3 ] || die "etcd member list shows ${member_count} members, expected 3. Fix etcd before continuing."
ok "etcd 3-member cluster formed (quorum = 2, tolerates 1 failure)"

# =============================================================================
# 2. Quiesce writes, then hand the LIVE primary data dir to Patroni on .46.
#    THIS is the irreversible, write-impacting step.
# =============================================================================
log "STEP 2 — adopt the .46 primary data directory under Patroni"
warn "This STOPS the standalone primary container ($STANDALONE_PRIMARY) and starts"
warn "Patroni against the SAME data volume ($PROD_DATA_VOLUME). Writes will pause."
confirm "IRREVERSIBLE: stop standalone primary on .46 and start Patroni on its data dir"

log "2a. Stop the standalone primary on .46 (clean shutdown so WAL is consistent)"
( cd "$COMPOSE_DIR" && docker compose -f "$DB_COMPOSE" stop postgres ) || die "failed to stop standalone primary"
# Confirm it is actually down before we touch the volume.
if docker ps --format '{{.Names}}' | grep -qx "$STANDALONE_PRIMARY"; then
    die "$STANDALONE_PRIMARY still running after stop — refusing to start Patroni on a live data dir."
fi
ok "standalone primary stopped"

log "2b. Start Patroni on .46 — it will adopt the existing data dir as the leader"
( cd "$COMPOSE_DIR" && docker compose -f "$PATRONI_COMPOSE" --profile patroni up -d patroni ) || die "patroni up failed on .46"

log "2c. Wait for Patroni to take the leader role"
for i in $(seq 1 45); do
    role="$(docker exec deploy-patroni-1 sh -c "curl -fsS http://127.0.0.1:8008/primary >/dev/null 2>&1 && echo primary || echo notyet" 2>/dev/null || echo notyet)"
    if [ "$role" = "primary" ]; then ok ".46 is the Patroni LEADER"; break; fi
    [ "$i" -eq 45 ] && die "Patroni on .46 did not become leader within ~90s. Investigate `docker logs deploy-patroni-1`."
    sleep 2
done

# =============================================================================
# 3. Bring the .44 standby under Patroni (rebuilt from leader / pgBackRest).
# =============================================================================
log "STEP 3 — bring .44 under Patroni as a standby"
warn "The existing standalone standby on .44 ($STANDALONE_STANDBY) is replaced by a"
warn "Patroni-managed standby. Patroni will (re)build it via pgbackrest, else basebackup."
confirm "IRREVERSIBLE on .44: stop standalone standby and start Patroni standby"

log "3a. Stop the standalone standby on .44"
ssh_node "$NODE_44" "cd $COMPOSE_DIR && docker compose -f $APP_COMPOSE --profile postgres-replica stop postgres-replica" \
    || warn "standby stop returned non-zero (may already be stopped) — continuing"

log "3b. Start Patroni on .44 (joins the cluster, streams from the .46 leader)"
ssh_node "$NODE_44" "cd $COMPOSE_DIR && docker compose -f $PATRONI_COMPOSE --profile patroni up -d patroni" \
    || die "patroni up failed on .44"

log "3c. Wait for .44 to become a healthy REPLICA in the cluster"
for i in $(seq 1 60); do
    rep="$(ssh_node "$NODE_44" "docker exec deploy-patroni-1 sh -c 'curl -fsS http://127.0.0.1:8008/replica >/dev/null 2>&1 && echo replica || echo notyet'" 2>/dev/null || echo notyet)"
    if [ "$rep" = "replica" ]; then ok ".44 is a healthy Patroni replica"; break; fi
    [ "$i" -eq 60 ] && die ".44 did not become a healthy replica within ~120s (rebuild may take longer for a large DB — check `docker logs deploy-patroni-1` on .44)."
    sleep 2
done

# =============================================================================
# 4. Start HAProxy on the app nodes (.42, .44) — the leader router.
# =============================================================================
log "STEP 4 — start HAProxy on .42 and .44"
ssh_node "$NODE_42" "cd $COMPOSE_DIR && docker compose -f $PATRONI_COMPOSE --profile haproxy up -d haproxy" || die "haproxy up failed on .42"
ssh_node "$NODE_44" "cd $COMPOSE_DIR && docker compose -f $PATRONI_COMPOSE --profile haproxy up -d haproxy" || die "haproxy up failed on .44"

log "4a. Verify HAProxy routes the leader on each app node (write port 5432)"
for ip in "$NODE_42" "$NODE_44"; do
    # Connect through local HAProxy and confirm we land on the CURRENT primary
    # (pg_is_in_recovery = f). Uses the pinned pgvector image as a throwaway psql.
    res="$(ssh_node "$ip" "docker run --rm --network host -e PGPASSWORD=\$(grep '^POSTGRES_PASSWORD=' /opt/rawdrive/app/.env | cut -d= -f2-) pgvector/pgvector:pg17 psql -h 127.0.0.1 -p 5432 -U ${POSTGRES_USER:-rawdrive} -d ${POSTGRES_DB:-rawdrive} -tAc 'SELECT pg_is_in_recovery();'" 2>/dev/null || echo ERR)"
    [ "$res" = "f" ] || die "HAProxy on $ip did NOT route to a writable primary (got '$res'). Do NOT flip pgbouncer."
    ok "HAProxy on $ip routes :5432 → writable leader"
done

# =============================================================================
# 5. Point pgbouncer at the LOCAL HAProxy (the ONE-TIME databases.ini change).
#    After this, failover NEVER requires touching pgbouncer again.
# =============================================================================
log "STEP 5 — repoint pgbouncer at the local HAProxy on both app nodes"
warn "This rewrites deploy/pgbouncer/databases.ini host → 127.0.0.1:5432 (local HAProxy)"
warn "on .42 AND .44, then reloads pgbouncer. After this the manual databases.ini"
warn "flip is GONE — HAProxy absorbs every future leader change automatically."
confirm "Repoint pgbouncer to HAProxy on .42 and .44 now"

for ip in "$NODE_42" "$NODE_44"; do
    log "5a. Backup + rewrite databases.ini on $ip"
    ssh_node "$ip" "cp $COMPOSE_DIR/pgbouncer/databases.ini $COMPOSE_DIR/pgbouncer/databases.ini.pre-patroni.bak"
    # Replace the host=...:port=... target with the local HAProxy write port.
    # We rewrite the whole rawdrive line to be unambiguous regardless of the old IP.
    ssh_node "$ip" "sed -i -E 's|^rawdrive *=.*|rawdrive = host=127.0.0.1 port=5432 dbname=${POSTGRES_DB:-rawdrive} auth_user=${POSTGRES_USER:-rawdrive}|' $COMPOSE_DIR/pgbouncer/databases.ini"
    ssh_node "$ip" "grep -q 'host=127.0.0.1 port=5432' $COMPOSE_DIR/pgbouncer/databases.ini" \
        || die "databases.ini rewrite failed on $ip"
    log "5b. Reload pgbouncer on $ip (restart picks up the new mounted file)"
    ssh_node "$ip" "cd $COMPOSE_DIR && docker compose -f $APP_COMPOSE restart pgbouncer" || die "pgbouncer restart failed on $ip"
    ok "pgbouncer on $ip now routes via local HAProxy"
done

# =============================================================================
# 6. Validate end-to-end and report.
# =============================================================================
log "STEP 6 — end-to-end validation"
log "6a. Patroni cluster topology (one Leader, one Replica expected)"
docker exec deploy-patroni-1 sh -c "patronictl -c /etc/patroni/patroni.yml list" || warn "patronictl list failed — check manually"

log "6b. App-level write health through the full path"
for url in "https://api.rawdrive.in/health/deep" "https://api.rawdrive.in/health"; do
    if curl -fsS "$url" >/dev/null 2>&1; then ok "API healthy: $url"; break; fi
done || warn "API health check did not return OK — investigate before ending the maintenance window."

echo
ok "CUTOVER COMPLETE."
cat <<'EOF'

    Automatic failover is now ACTIVE. From here:
      • Primary death → etcd election → Patroni promotes the standby → HAProxy
        reroutes :5432 → pgbouncer is UNAFFECTED (no human, no databases.ini edit).
      • Planned switchover: patronictl switchover  (see patroni-status.sh + runbook).
      • Reads can use HAProxy :5433 (replica pool).

    THIS SUPERSEDES the manual model. Mark deploy/scripts/promote-postgres-replica.sh
    and docs/runbooks/postgres-failover.md as deprecated (see docs/runbooks/patroni-failover.md).

    ROLLBACK (if the cutover misbehaved during the window): restore databases.ini
    from databases.ini.pre-patroni.bak on both app nodes + reload pgbouncer, stop the
    patroni profile, and restart the standalone primary:
      docker compose -f docker-compose.prod-db.yml up -d postgres
    Full rollback steps are in docs/runbooks/patroni-failover.md.
EOF
