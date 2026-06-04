#!/usr/bin/env bash
# add-app-node.sh — provision a fresh Hostinger VPS as a STATELESS RawDrive app node.
#
# This is the "add a VPS with minimal effort" mechanism from
# docs/architecture/rawdrive-target-architecture.md §12. An app node is stateless
# (no DB/cache/queue DATA), so it is pure pull-and-join: it gets the security
# baseline + pulls pre-built images from GHCR + starts the app stack + (you) add
# it to the Cloudflare Load Balancer pool. ~3-5 min, one command.
#
# It is IDEMPOTENT and SAFE: it only configures the NEW node; it never touches the
# data tier or existing nodes. It does NOT itself change DNS/Cloudflare — adding
# the node to the CF LB pool is the final manual/API step (see end).
#
# PREREQUISITES (one-time, before running):
#   1. A fresh Ubuntu 24.04 Hostinger VPS, root SSH reachable with the deploy key.
#   2. The new node's host key appended to deploy/known_hosts (verify out of band!).
#   3. GHCR pull credentials available (the build-images workflow publishes images).
#   4. A sealed env file for app nodes (NO crypto-key drift — pull from your secret
#      store, NOT by copying another node's .env blindly). See $ENV_SOURCE below.
#   5. DEPLOY_FROM_REGISTRY path working (images tagged per-commit in GHCR).
#
# Usage:  ./add-app-node.sh <new-node-ip> [<git-sha-or-tag>]
set -euo pipefail

NEW_IP="${1:?usage: add-app-node.sh <new-node-ip> [<image-tag>]}"
IMAGE_TAG="${2:-$(git rev-parse HEAD 2>/dev/null || echo latest)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/rawdrive_hostinger}"
KNOWN_HOSTS="${DEPLOY_KNOWN_HOSTS:-$REPO_ROOT/deploy/known_hosts}"
REGISTRY="${DEPLOY_IMAGE_REGISTRY:-ghcr.io}"
OWNER="${DEPLOY_IMAGE_OWNER:-manyamprasad}"
# Where the new node's app env comes from. MUST be a sealed source (secret store /
# your ops vault), NOT a copy of a data node's .env. NEVER ship crypto keys you
# shouldn't (see the "never sync crypto keys" law). Required keys: DATABASE_URL
# (pointing at the HAProxy leader endpoint, not a fixed DB IP), VALKEY_URL,
# NATS_URL, JWT/KEK/etc as appropriate for an app node.
ENV_SOURCE="${ENV_SOURCE:-}"

rdssh() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$KNOWN_HOSTS" -o ConnectTimeout=10 "$@"; }
say() { printf '\033[0;36m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[0;31m✗ add-app-node: %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$SSH_KEY" ] || die "deploy key not found: $SSH_KEY"
grep -q "$NEW_IP" "$KNOWN_HOSTS" || die "host key for $NEW_IP is NOT in $KNOWN_HOSTS — add + verify it first (never seed blind)."
[ -n "$ENV_SOURCE" ] || die "set ENV_SOURCE to the sealed app-node env file (do NOT copy a data node's .env)."

say "1/6 Connectivity + base packages on $NEW_IP"
rdssh "root@$NEW_IP" 'set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)
  apt-get install -y -q ufw fail2ban rclone
  mkdir -p /opt/rawdrive/app'

say "2/6 Security baseline (UFW, fail2ban, DOCKER-USER fw, BBR, SSH hardening)"
# Push the security artifacts that every node must carry.
scp -i "$SSH_KEY" -o UserKnownHostsFile="$KNOWN_HOSTS" \
  "$REPO_ROOT/deploy/scripts/rawdrive-docker-fw.sh" "root@$NEW_IP:/opt/rawdrive/rawdrive-docker-fw.sh"
scp -i "$SSH_KEY" -o UserKnownHostsFile="$KNOWN_HOSTS" \
  "$REPO_ROOT/deploy/systemd/rawdrive-docker-fw.service" "root@$NEW_IP:/etc/systemd/system/rawdrive-docker-fw.service"
scp -i "$SSH_KEY" -o UserKnownHostsFile="$KNOWN_HOSTS" \
  "$REPO_ROOT/deploy/sysctl/99-rawdrive-net.conf" "root@$NEW_IP:/etc/sysctl.d/99-rawdrive-net.conf"
scp -i "$SSH_KEY" -o UserKnownHostsFile="$KNOWN_HOSTS" -r \
  "$REPO_ROOT/deploy/fail2ban/." "root@$NEW_IP:/etc/fail2ban/"
rdssh "root@$NEW_IP" 'set -e
  # NOTE: add THIS node ip + the peer/data IPs to PEERS in rawdrive-docker-fw.sh
  # before first apply (or template it). Then:
  chmod +x /opt/rawdrive/rawdrive-docker-fw.sh
  sysctl --system >/dev/null
  ufw --force enable
  ufw default deny incoming; ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
  systemctl enable --now fail2ban
  systemctl daemon-reload && systemctl enable --now rawdrive-docker-fw.service
  mkdir -p /var/log/rawdrive-nginx'

say "3/6 App env (sealed) + GHCR login"
scp -i "$SSH_KEY" -o UserKnownHostsFile="$KNOWN_HOSTS" "$ENV_SOURCE" "root@$NEW_IP:/opt/rawdrive/app/.env"
# GHCR login uses a token from your CI/secret store; do NOT hardcode it here.
rdssh "root@$NEW_IP" "echo \"\${GHCR_TOKEN:?set GHCR_TOKEN in the environment}\" | docker login $REGISTRY -u $OWNER --password-stdin"

say "4/6 Ship the deploy tree + pull images (no build) for tag $IMAGE_TAG"
# Reuse the guarded rolling-deploy engine in single-node + registry mode so the
# node pulls pre-built images instead of building locally.
SSH_KEY="$SSH_KEY" DEPLOY_KNOWN_HOSTS="$KNOWN_HOSTS" DEPLOY_FROM_REGISTRY=1 \
  DEPLOY_IMAGE_TAG="$IMAGE_TAG" bash "$SCRIPT_DIR/deploy-app.sh" "$NEW_IP" --pull

say "5/6 Health-check the new node"
rdssh "root@$NEW_IP" 'curl -fsS http://127.0.0.1:8080/health/deep >/dev/null && curl -fsS http://127.0.0.1:3000/ -o /dev/null && echo "  backend + frontend healthy"' \
  || die "new node failed health check — investigate before adding it to the LB pool."

say "6/6 DONE — node provisioned + healthy. FINAL manual/API step:"
cat <<EOF
  • Add $NEW_IP to the Cloudflare Load Balancer ORIGIN POOL (dashboard or API):
      curl -X POST "https://api.cloudflare.com/client/v4/accounts/\$CF_ACCOUNT/load_balancers/pools/\$POOL_ID" ...
    (or add an A-record for apex/api/wildcard → $NEW_IP, proxied, if not using LB).
  • Apply the Cloudflare origin lock on this node once it's serving:
      ssh root@$NEW_IP '/opt/rawdrive/cf-origin-lock.sh'
  • Add $NEW_IP to PEERS in rawdrive-docker-fw.sh on ALL nodes + re-apply, and to
    the nginx peer-backup upstream config, so the mesh knows about it.
EOF
