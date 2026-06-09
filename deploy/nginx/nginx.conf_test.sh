#!/usr/bin/env bash
# Regression test: Cloudflare-proxied production traffic must restore the real
# visitor IP before nginx rate limiting is configured.
#
# Without this include, $binary_remote_addr is a Cloudflare edge IP. That makes
# /auth/ rate limits shared across unrelated visitors and can produce 429s on
# login/OAuth flows.

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
NGINX_CONF="${1:-${SCRIPT_DIR}/nginx.conf}"
COMPOSE_FILE="${2:-${SCRIPT_DIR}/../docker-compose.prod-app.yml}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ -f "${NGINX_CONF}" ] || fail "nginx.conf not found at ${NGINX_CONF}"
[ -f "${COMPOSE_FILE}" ] || fail "compose file not found at ${COMPOSE_FILE}"

if ! grep -q 'include /etc/nginx/cloudflare-real-ip.conf;' "${NGINX_CONF}"; then
  fail "nginx.conf must include /etc/nginx/cloudflare-real-ip.conf"
fi

if ! grep -q './nginx/cloudflare-real-ip.conf:/etc/nginx/cloudflare-real-ip.conf:ro' "${COMPOSE_FILE}"; then
  fail "docker-compose.prod-app.yml must mount cloudflare-real-ip.conf into nginx"
fi

awk '
  /include[[:space:]]+\/etc\/nginx\/cloudflare-real-ip\.conf;/ {
    include_line = NR
  }
  /limit_req_zone[[:space:]]+\$binary_remote_addr/ {
    if (!first_limit_line) first_limit_line = NR
  }
  /limit_conn_zone[[:space:]]+\$binary_remote_addr/ {
    if (!first_conn_line) first_conn_line = NR
  }
  END {
    if (!include_line) {
      print "FAIL: missing Cloudflare real-IP include" > "/dev/stderr";
      exit 1;
    }
    if (!first_limit_line) {
      print "FAIL: missing $binary_remote_addr limit_req_zone" > "/dev/stderr";
      exit 1;
    }
    if (!first_conn_line) {
      print "FAIL: missing $binary_remote_addr limit_conn_zone" > "/dev/stderr";
      exit 1;
    }
    if (include_line > first_limit_line || include_line > first_conn_line) {
      print "FAIL: Cloudflare real-IP include must appear before rate-limit zones" > "/dev/stderr";
      exit 1;
    }
  }
' "${NGINX_CONF}"

echo "PASS: nginx restores Cloudflare visitor IP before rate limiting"
