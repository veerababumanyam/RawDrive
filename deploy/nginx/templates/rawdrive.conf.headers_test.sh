#!/usr/bin/env bash
# Regression test for F-078 — security-header parity across every HTTPS
# server block in rawdrive.conf.template.
#
# Root cause (F-078): the api.rawdrive.in block carried only HSTS +
# X-Content-Type-Options, the wildcard host block additionally had
# Referrer-Policy but still lacked X-Frame-Options / X-XSS-Protection, and
# NO server block declared a Content-Security-Policy. That left api/gallery
# responses frameable (clickjacking) and left reflected-XSS / injection /
# mixed-content unmitigated at the proxy.
#
# This test asserts that EVERY TLS-terminating server block (each `listen 443
# ssl` block: apex rawdrive.in, api.rawdrive.in, and the retired wildcard host)
# declares the full security-header set, including a Content-Security-Policy
# whose policy contains `frame-ancestors 'none'`. Frontend blocks intentionally
# keep nginx CSP narrow because the Next.js app emits the full per-request
# nonce policy; a broad nginx script-src/style-src policy would intersect with
# and weaken/break the app-level CSP.
#
# Dependency-free: pure awk + grep so ops/CI can run it without nginx
# installed:
#
#   bash deploy/nginx/templates/rawdrive.conf.headers_test.sh
#   # optional: point at a different file
#   bash deploy/nginx/templates/rawdrive.conf.headers_test.sh /path/to/template
#
# Exit 0 = pass, non-zero = a server block is missing a required header or the
# deprecated wildcard host still proxies traffic.
#
# RED proof: delete any required add_header line (or the CSP) from any 443
# block and re-run — the test must exit non-zero. That deleted state is
# exactly the pre-fix config (api block had only HSTS + nosniff; no CSP
# anywhere), so this test fails before the F-078 fix and passes after.

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
TEMPLATE="${1:-${SCRIPT_DIR}/rawdrive.conf.template}"

if [ ! -f "${TEMPLATE}" ]; then
  echo "FAIL: template not found at ${TEMPLATE}" >&2
  exit 2
fi

# Missing build chunks must never be cached by Cloudflare as text/plain 404s;
# the app shell may reference a fresh chunk while the peer node is still
# rolling, so the static location has to intercept misses and mark them no-store.
if ! grep -Eq 'error_page[[:space:]]+404[[:space:]]+=[[:space:]]+@next_static_not_found;' "${TEMPLATE}"; then
  echo "FAIL: /_next/static/ must route 404s to @next_static_not_found" >&2
  exit 1
fi

if ! awk '
  /^[[:space:]]*location[[:space:]]+@next_static_not_found[[:space:]]*\{/ {
    in_loc = 1; depth = 0; has_cc = 0; has_cdn = 0; has_cf = 0;
  }
  in_loc {
    n = gsub(/\{/, "{"); depth += n;
    m = gsub(/\}/, "}"); depth -= m;
    if ($0 ~ /add_header[[:space:]]+Cache-Control[[:space:]]+"[^"]*no-store[^"]*"[[:space:]]+always/) has_cc = 1;
    if ($0 ~ /add_header[[:space:]]+CDN-Cache-Control[[:space:]]+"no-store"[[:space:]]+always/) has_cdn = 1;
    if ($0 ~ /add_header[[:space:]]+Cloudflare-CDN-Cache-Control[[:space:]]+"no-store"[[:space:]]+always/) has_cf = 1;
    if (depth <= 0) {
      found++;
      in_loc = 0;
      if (!has_cc || !has_cdn || !has_cf) fail = 1;
    }
  }
  END {
    if (found != 1 || fail) exit 1;
  }
' "${TEMPLATE}"; then
  echo "FAIL: @next_static_not_found must return no-store Cache-Control, CDN-Cache-Control, and Cloudflare-CDN-Cache-Control" >&2
  exit 1
fi

# The deprecated wildcard host must fail closed. Exact server blocks for
# rawdrive.in, www.rawdrive.in, and api.rawdrive.in still handle their normal
# traffic; this assertion only inspects the single-label wildcard regex block.
awk '
  /^[[:space:]]*server[[:space:]]*\{/ {
    in_server = 1; depth = 0; is_wildcard = 0; has_return_410 = 0; has_proxy = 0;
  }
  in_server {
    n = gsub(/\{/, "{"); depth += n;
    m = gsub(/\}/, "}"); depth -= m;

    if (index($0, "server_name \"~^[a-z0-9]") > 0 && index($0, "rawdrive") > 0) is_wildcard = 1;
    if ($0 ~ /return[[:space:]]+410;/) has_return_410 = 1;
    if ($0 ~ /proxy_pass[[:space:]]+/) has_proxy = 1;

    if (depth <= 0) {
      in_server = 0;
      if (is_wildcard) {
        wildcard_blocks++;
        if (!has_return_410) { print "FAIL: wildcard rawdrive.in block must return 410"; fail = 1 }
        if (has_proxy) { print "FAIL: wildcard rawdrive.in block must not proxy traffic"; fail = 1 }
      }
    }
  }
  END {
    if (wildcard_blocks != 1) {
      print "FAIL: expected exactly one wildcard rawdrive.in block; found " wildcard_blocks;
      fail = 1;
    }
    if (fail) exit 1;
  }
' "${TEMPLATE}"

# The single awk program below:
#   * walks the file tracking server{...} brace depth,
#   * for each block that contains a `listen 443 ssl` line, checks that the
#     required add_header directives are all present and that the CSP forbids
#     framing (frame-ancestors 'none'),
#   * prints a FAIL line per missing header and exits 1 if any block fails,
#   * also fails if fewer than 3 TLS blocks are found (apex/api/gallery).
awk '
  function reset_block() {
    in_server = 1; depth = 0; is443 = 0;
    has_hsts = 0; has_xfo = 0; has_xcto = 0; has_xss = 0; has_ref = 0;
    has_csp = 0; csp_no_frame = 0; sname = "";
  }
  /^[[:space:]]*server[[:space:]]*\{/ { reset_block() }
  in_server {
    # brace accounting
    n = gsub(/\{/, "{"); depth += n;
    m = gsub(/\}/, "}"); depth -= m;

    if ($0 ~ /listen[[:space:]]+(\[::\]:)?443[[:space:]]+ssl/) is443 = 1;

    if ($0 ~ /server_name[[:space:]]/) {
      sname = $0; sub(/^[[:space:]]*server_name[[:space:]]+/, "", sname);
      sub(/;.*$/, "", sname);
    }

    if ($0 ~ /add_header[[:space:]]+[Ss]trict-[Tt]ransport-[Ss]ecurity/)   has_hsts = 1;
    if ($0 ~ /add_header[[:space:]]+[Xx]-[Ff]rame-[Oo]ptions/)             has_xfo  = 1;
    if ($0 ~ /add_header[[:space:]]+[Xx]-[Cc]ontent-[Tt]ype-[Oo]ptions/)   has_xcto = 1;
    if ($0 ~ /add_header[[:space:]]+[Xx]-[Xx][Ss][Ss]-[Pp]rotection/)      has_xss  = 1;
    if ($0 ~ /add_header[[:space:]]+[Rr]eferrer-[Pp]olicy/)                has_ref  = 1;
    if ($0 ~ /add_header[[:space:]]+[Cc]ontent-[Ss]ecurity-[Pp]olicy/) {
      has_csp = 1;
      if ($0 ~ /frame-ancestors[[:space:]]+'\''none'\''/) csp_no_frame = 1;
    }

    if (depth <= 0) {
      in_server = 0;
      if (is443) {
        blocks++;
        if (sname == "") sname = "(unnamed block #" blocks ")";
        if (!has_hsts) { print "FAIL: [" sname "] missing Strict-Transport-Security"; fail = 1 }
        if (!has_xfo)  { print "FAIL: [" sname "] missing X-Frame-Options";          fail = 1 }
        if (!has_xcto) { print "FAIL: [" sname "] missing X-Content-Type-Options";   fail = 1 }
        if (!has_xss)  { print "FAIL: [" sname "] missing X-XSS-Protection";         fail = 1 }
        if (!has_ref)  { print "FAIL: [" sname "] missing Referrer-Policy";          fail = 1 }
        if (!has_csp)  { print "FAIL: [" sname "] missing Content-Security-Policy";  fail = 1 }
        else if (!csp_no_frame) { print "FAIL: [" sname "] CSP missing frame-ancestors '\''none'\''"; fail = 1 }
      }
    }
  }
  END {
    if (blocks < 3) {
      print "FAIL: expected >=3 TLS server blocks (apex, api, gallery); found " blocks;
      fail = 1;
    }
    if (fail) {
      print "F-078 regression test FAILED (" blocks " TLS blocks checked)";
      exit 1;
    }
    print "PASS: F-078 — all " blocks " TLS server blocks declare the full security-header set (incl. CSP with frame-ancestors '\''none'\'')";
  }
' "${TEMPLATE}"
