#!/usr/bin/env bash
# RawDrive — Docker published-port hardening (DOCKER-USER peer allowlist).
#
# WHY THIS EXISTS
#   Docker publishes container ports on 0.0.0.0 and installs its OWN iptables
#   rules (the DOCKER chain + docker-proxy) that are evaluated in the FORWARD
#   path and therefore BYPASS UFW's INPUT chain entirely. The UFW rules that
#   appear to "restrict" 5432/6379/4222/9000/... to peer nodes do NOTHING for
#   Docker-published ports — verified 2026-06-05 by reaching Postgres/Valkey/
#   NATS/MinIO/Mailpit from the public internet. The Docker-sanctioned place to
#   filter traffic forwarded to containers is the DOCKER-USER chain, which Docker
#   evaluates BEFORE its own ACCEPT rules and never flushes out from under you
#   (except on full daemon restart — see the systemd unit, which re-applies).
#
# WHAT IT DOES
#   Rebuilds DOCKER-USER as a peer-only allowlist:
#     - established/related            -> RETURN (never disrupt a live flow)
#     - the three node public IPs      -> RETURN (the peer mesh: app<->db, repl,
#                                          nats cluster, nginx backup upstream)
#     - docker-internal + loopback     -> RETURN (container<->container)
#     - data-plane ports from anyone else -> DROP (Postgres/Valkey/NATS/MinIO/
#                                          Mailpit must never face the internet)
#     - app ports 8080/3000 from anyone else -> DROP (public reaches the app via
#                                          nginx on 443 only; :8080/:3000 are
#                                          peer/internal only)
#     - everything else (80/443/...)   -> RETURN (public web stays open)
#
# PROPERTIES
#   Idempotent  : rebuilds the chain from scratch every run.
#   Reversible  : `iptables -F DOCKER-USER` (and ip6tables) restores the default.
#   Lockout-safe: DOCKER-USER is the container FORWARD path; host SSH (INPUT) is
#                 untouched, so a bad rule here can never lock you out of SSH.
set -euo pipefail

# The peer mesh = all three production nodes (superset of what each needs).
PEERS="187.127.142.42 187.127.142.44 187.127.142.46"
# Internal data-plane ports — never reachable from outside the peer mesh.
#   5432 postgres / HAProxy-write ·  6379 valkey ·  4222/6222/8222 NATS
#   9000/9001 minio ·  1025/8025 mailpit (both retired — kept as deny-by-default)
#   2379/2380 etcd client/peer ·  8008 Patroni REST API
# The etcd (2379/2380) and Patroni REST (8008) ports bind to each node's PUBLIC
# IP (docker-compose.patroni.yml scopes them to ${ETCD_NODE_IP}/${PATRONI_NODE_IP},
# not 0.0.0.0, but that is still the internet-facing interface), so they MUST be
# dropped here for non-peers — an open Patroni REST can be used to force a
# failover/restart. Peer-mesh traffic RETURNs above this rule, so intra-cluster
# etcd consensus + Patroni health checks are unaffected. HAProxy (5432/5433/7000)
# binds loopback-only and needs no entry.
DATA_PORTS="5432,6379,4222,6222,8222,9000,9001,1025,8025,2379,2380,8008"
# App origin ports — only the peer nginx backup-upstream + docker-internal use them.
APP_PORTS="8080,3000"
# Public web ports. When CF_IPS_FILE exists (written by cf-origin-lock.sh) these
# are restricted to Cloudflare's published ranges so the origin can't be hit
# directly, bypassing Cloudflare's WAF/DDoS; otherwise they stay fully public.
WEB_PORTS="80,443"
CF_IPS_FILE="/opt/rawdrive/cloudflare-ips.txt"

# Wait for Docker to have created DOCKER-USER and wired the FORWARD jump
# (After=docker.service usually suffices, but tolerate a startup race).
for _ in $(seq 1 20); do
  iptables -S DOCKER-USER >/dev/null 2>&1 && break
  iptables -N DOCKER-USER 2>/dev/null || true
  sleep 0.5
done
iptables -C FORWARD -j DOCKER-USER 2>/dev/null || iptables -I FORWARD -j DOCKER-USER

apply() {
  local ipt="$1" fam_re
  [ "$ipt" = "iptables" ] && fam_re='\.' || fam_re=':'   # v4 CIDRs contain '.', v6 contain ':'
  "$ipt" -F DOCKER-USER 2>/dev/null || true
  "$ipt" -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
  if [ "$ipt" = "iptables" ]; then
    for ip in $PEERS; do "$ipt" -A DOCKER-USER -s "$ip" -j RETURN; done
    "$ipt" -A DOCKER-USER -s 172.16.0.0/12 -j RETURN
    "$ipt" -A DOCKER-USER -s 127.0.0.0/8 -j RETURN
  fi
  "$ipt" -A DOCKER-USER -p tcp -m multiport --dports "$DATA_PORTS" -j DROP
  "$ipt" -A DOCKER-USER -p tcp -m multiport --dports "$APP_PORTS" -j DROP
  # CF origin lock (optional): when the Cloudflare IP list is present, allow 80/443
  # ONLY from Cloudflare ranges and drop the rest. Peers/loopback/docker already
  # RETURNed above, so internal health checks + cert tooling are unaffected.
  if [ -s "$CF_IPS_FILE" ]; then
    while IFS= read -r cidr; do
      case "$cidr" in ''|\#*) continue ;; esac
      printf '%s' "$cidr" | grep -q "$fam_re" || continue
      "$ipt" -A DOCKER-USER -p tcp -m multiport --dports "$WEB_PORTS" -s "$cidr" -j RETURN
    done < "$CF_IPS_FILE"
    "$ipt" -A DOCKER-USER -p tcp -m multiport --dports "$WEB_PORTS" -j DROP
  fi
  "$ipt" -A DOCKER-USER -j RETURN
}

apply iptables
# IPv6: no peer mesh runs over v6, so drop the same dports outright (best-effort;
# a no-op when Docker isn't managing ip6tables).
apply ip6tables 2>/dev/null || true

if [ -s "$CF_IPS_FILE" ]; then
  echo "rawdrive-docker-fw applied: data [$DATA_PORTS] + app [$APP_PORTS] peer-only; web [$WEB_PORTS] Cloudflare-only (origin locked)."
else
  echo "rawdrive-docker-fw applied: data [$DATA_PORTS] + app [$APP_PORTS] restricted to peer mesh ($PEERS); web [$WEB_PORTS] public."
fi
