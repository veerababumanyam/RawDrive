#!/usr/bin/env bash
# =============================================================================
# RawDrive — Patroni cluster status (deploy/scripts/patroni-status.sh)
# =============================================================================
#
#  READ-ONLY. Safe to run any time. Makes NO changes to the cluster.
#
# Part of the Patroni automatic-failover subsystem (active ONLY after the
# maintenance-window cutover in docs/runbooks/patroni-failover.md). Before
# cutover this prints "nothing running yet", which is expected — the manual model
# in docs/runbooks/postgres-failover.md is in force until then.
#
# Wraps:
#   • patronictl list            — cluster members, roles, lag, leader
#   • etcdctl endpoint health    — DCS quorum health
#   • HAProxy stats              — which backend is UP (the leader)
#   • current leader + replication lag from Postgres
#
# Run on any cluster node (it inspects local containers and, where useful, the
# Patroni REST API which already aggregates the whole cluster).
#
# Usage:
#   bash deploy/scripts/patroni-status.sh
# Optional:
#   PATRONI_CONF=/etc/patroni/patroni.yml   (default)
# =============================================================================

set -uo pipefail   # NOTE: no -e — this is a best-effort read-only dashboard; a
                   # missing component should print a warning, not abort the rest.

PATRONI_CONF="${PATRONI_CONF:-/etc/patroni/patroni.yml}"
PATRONI_CTR="deploy-patroni-1"
ETCD_CTR="deploy-etcd-1"
HAPROXY_STATS="http://127.0.0.1:7000/;csv"

hdr()  { echo -e "\n\033[1;36m======== $* ========\033[0m"; }
warn() { echo -e "\033[1;33m  ! $*\033[0m"; }

have_ctr() { docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$1"; }

# -----------------------------------------------------------------------------
hdr "PATRONI CLUSTER (patronictl list)"
if have_ctr "$PATRONI_CTR"; then
    # patronictl list shows Member / Host / Role (Leader|Replica|Sync Standby) /
    # State / TL (timeline) / Lag-in-MB for EVERY member — the single most useful
    # view. It reads the DCS, so running it on any node shows the whole cluster.
    docker exec "$PATRONI_CTR" patronictl -c "$PATRONI_CONF" list \
        || warn "patronictl list failed (is Patroni healthy on this node?)"
else
    warn "no $PATRONI_CTR on this host — run on a node where Patroni runs (.46/.44),"
    warn "or the subsystem is not cut over yet (manual model still in force)."
fi

# -----------------------------------------------------------------------------
hdr "ETCD (DCS) HEALTH / QUORUM"
if have_ctr "$ETCD_CTR"; then
    echo "-- member list --"
    docker exec "$ETCD_CTR" sh -c \
        "ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 member list" \
        || warn "etcdctl member list failed"
    echo "-- endpoint health (this member) --"
    docker exec "$ETCD_CTR" sh -c \
        "ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 endpoint health" \
        || warn "etcd endpoint unhealthy — DCS quorum at risk (failover may be frozen)"
    echo "-- endpoint status (leader/raft) --"
    docker exec "$ETCD_CTR" sh -c \
        "ETCDCTL_API=3 etcdctl --endpoints=http://127.0.0.1:2379 -w table endpoint status" \
        || warn "etcd endpoint status failed"
else
    warn "no $ETCD_CTR on this host (etcd should run on .42/.44/.46)."
fi

# -----------------------------------------------------------------------------
hdr "HAPROXY LEADER ROUTING (stats)"
if have_ctr "deploy-haproxy-1"; then
    # Pull the CSV stats and show, per backend, which server is UP. The UP server
    # in pg_primary_backend IS the current write leader as HAProxy sees it.
    raw="$(docker exec deploy-haproxy-1 sh -c "wget -qO- '$HAPROXY_STATS'" 2>/dev/null)"
    if [ -n "$raw" ]; then
        echo "  backend / server / status (look for pg_primary_backend → which server is UP):"
        # Columns: pxname(1) svname(2) status(18). Print readable triples.
        echo "$raw" | awk -F',' 'NR>1 && $2!="FRONTEND" && $2!="BACKEND" {printf "    %-22s %-10s %s\n", $1, $2, $18}'
    else
        warn "could not read HAProxy stats CSV"
    fi
else
    warn "no deploy-haproxy-1 on this host (HAProxy runs on app nodes .42/.44)."
fi

# -----------------------------------------------------------------------------
hdr "CURRENT LEADER + REPLICATION LAG (Patroni REST)"
if have_ctr "$PATRONI_CTR"; then
    # The Patroni REST /cluster endpoint reports every member's role, state, and
    # lag in one JSON blob — no DB password needed. Pretty-print key fields.
    json="$(docker exec "$PATRONI_CTR" sh -c "curl -fsS http://127.0.0.1:8008/cluster" 2>/dev/null)"
    if [ -n "$json" ]; then
        if command -v jq >/dev/null 2>&1; then
            echo "$json" | jq -r '.members[] | "  \(.name)  role=\(.role)  state=\(.state)  lag=\(.lag // "n/a")  tl=\(.timeline // "n/a")"'
        else
            # No jq on the host — dump the raw JSON so the data is still visible.
            echo "$json"
            warn "(install jq for a prettier view)"
        fi
    else
        warn "Patroni REST /cluster unreachable on this node"
    fi
    # Also surface the synchronous-replication state explicitly: with
    # synchronous_mode=true this MUST show a sync standby, or writes are running
    # in the degraded async-fallback window (synchronous_mode_strict=false).
    echo "-- synchronous_standby_names (must be non-empty for zero-data-loss) --"
    docker exec "$PATRONI_CTR" sh -c \
        "curl -fsS http://127.0.0.1:8008/patroni 2>/dev/null" \
        | (command -v jq >/dev/null 2>&1 && jq -r '"  role=\(.role)  sync_standby=\(.replication // [] | map(select(.sync_state==\"sync\")) | length)"' || cat) \
        || warn "could not read /patroni endpoint"
else
    warn "no $PATRONI_CTR on this host — cannot query the Patroni REST API."
fi

echo
echo "Read-only status complete. For actions (switchover/reinit) use patronictl"
echo "directly — see docs/runbooks/patroni-failover.md."
