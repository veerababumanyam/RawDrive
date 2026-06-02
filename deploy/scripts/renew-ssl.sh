#!/usr/bin/env bash
# Let's Encrypt cert renewal via certbot.
# Runs on both app nodes via cron 0 3,15 * * *.
# Dual-mode: webroot HTTP-01 (initial) and dns-01 via Cloudflare (post orange-cloud flip).

set -euo pipefail

LOG=/var/log/certbot-renew.log
MODE="${CERTBOT_MODE:-webroot}"  # or "dns-01"

log() {
    echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"
}

log "starting cert renewal (mode=$MODE)"

case "$MODE" in
    webroot)
        docker run --rm \
            -v /etc/letsencrypt:/etc/letsencrypt \
            -v /var/www/certbot:/var/www/certbot \
            certbot/certbot:v5.2.2 \
            renew --webroot --webroot-path=/var/www/certbot --non-interactive
        ;;
    dns-01)
        docker run --rm \
            -v /etc/letsencrypt:/etc/letsencrypt \
            -v /etc/letsencrypt/cloudflare.ini:/etc/letsencrypt/cloudflare.ini:ro \
            certbot/certbot:v5.2.2 \
            renew --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini --non-interactive
        ;;
    *)
        log "FATAL: unknown CERTBOT_MODE=$MODE"
        exit 1
        ;;
esac

log "reloading nginx"
docker exec deploy-nginx-1 nginx -s reload

log "cert renewal complete"
