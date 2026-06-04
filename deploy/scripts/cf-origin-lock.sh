#!/usr/bin/env bash
# cf-origin-lock.sh — restrict the public web ports (80/443) to Cloudflare only.
#
# WHY: once Cloudflare proxies the site, the origin IPs (.42/.44) should accept
# 80/443 traffic ONLY from Cloudflare's edge — otherwise an attacker who learns an
# origin IP can bypass Cloudflare's WAF/DDoS and hit nginx directly (and could do
# TLS, since the origin holds the real cert). Locking 80/443 to Cloudflare's
# published ranges forces ALL public traffic through Cloudflare.
#
# HOW: nginx is containerized, so 80/443 are filtered in the DOCKER-USER chain
# (the FORWARD path) — NOT host INPUT (UFW). This script writes Cloudflare's ranges
# to /opt/rawdrive/cloudflare-ips.txt; rawdrive-docker-fw.sh reads that file and,
# when present, rebuilds DOCKER-USER to RETURN 80/443 from CF ranges and DROP them
# from everyone else. Keeping the lock inside docker-fw means it survives the
# chain rebuild on docker restart (a standalone rule would be flushed).
#
# SAFETY: run ONLY after Cloudflare proxying is verified end-to-end. SSH (22) is
# host INPUT and untouched, so this cannot lock you out of SSH. To revert: delete
# /opt/rawdrive/cloudflare-ips.txt and re-run rawdrive-docker-fw.sh (80/443 back to
# public). Run on EACH app node.
#
# Usage:  cf-origin-lock.sh           # fetch CF ranges, write file, re-apply fw
#         cf-origin-lock.sh --unlock  # remove the lock (80/443 public again)
set -euo pipefail

IPS_FILE=/opt/rawdrive/cloudflare-ips.txt
FW=/opt/rawdrive/rawdrive-docker-fw.sh

if [ "${1:-}" = "--unlock" ]; then
  rm -f "$IPS_FILE"
  echo "cf-origin-lock: removed $IPS_FILE — 80/443 will be public again after fw re-apply."
  [ -x "$FW" ] && "$FW" || systemctl start rawdrive-docker-fw.service || true
  exit 0
fi

echo "cf-origin-lock: fetching Cloudflare published ranges…"
tmp="$(mktemp)"
{ curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; } > "$tmp"
# Sanity: Cloudflare should return a healthy number of CIDRs; refuse a truncated list
# (a partial list could lock out real Cloudflare edges → site down).
n="$(grep -cE '/[0-9]+$' "$tmp" || true)"
if [ "$n" -lt 15 ]; then
  echo "cf-origin-lock: ABORT — only $n CIDRs fetched (expected ~22). Not applying a partial lock." >&2
  rm -f "$tmp"; exit 2
fi
install -m 0644 "$tmp" "$IPS_FILE"
rm -f "$tmp"
echo "cf-origin-lock: wrote $n Cloudflare CIDRs to $IPS_FILE"

# Re-apply the docker firewall so it picks up the lock (rawdrive-docker-fw.sh reads
# $IPS_FILE; see that script's CF-LOCK block). Prefer the systemd unit if present.
if systemctl list-unit-files 2>/dev/null | grep -q '^rawdrive-docker-fw.service'; then
  systemctl restart rawdrive-docker-fw.service
else
  "$FW"
fi
echo "cf-origin-lock: applied. 80/443 now reachable ONLY from Cloudflare. SSH (22) unaffected."
echo "  Verify from a non-Cloudflare host:  curl -m5 https://<origin-ip>/  → should TIME OUT/refuse"
echo "  Verify the site still works through Cloudflare:  curl -I https://rawdrive.in/"
