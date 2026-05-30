#!/usr/bin/env bash
# Regression test for F-080: production deploy must not disable SSH host-key
# checking. Streaming a source tarball over SSH and building prod images from
# it means a MITM with StrictHostKeyChecking=no could inject code into the
# prod image with no warning.
#
# This test is a static assertion over deploy-prod.sh (the script itself is not
# safely runnable in CI: it SSHes to real prod VPSes). It is deterministic and
# has no external dependencies.
#
# Usage: bash deploy/scripts/deploy-prod_test.sh
# Exit 0 = pass, non-zero = fail.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$SCRIPT_DIR/deploy-prod.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[ -f "$TARGET" ] || fail "deploy-prod.sh not found at $TARGET"

# 1. Host-key checking must NOT be disabled anywhere in the script.
#    This is the exact regression F-080 guards against (would fail pre-fix).
if grep -q 'StrictHostKeyChecking=no' "$TARGET"; then
  fail "deploy-prod.sh disables SSH host-key checking (StrictHostKeyChecking=no) — MITM/supply-chain risk (F-080)"
fi

# 2. Host-key checking must be explicitly enforced.
if ! grep -q 'StrictHostKeyChecking=yes' "$TARGET"; then
  fail "deploy-prod.sh does not enforce StrictHostKeyChecking=yes"
fi

# 3. A pinned known-hosts file must back the strict check, otherwise yes is
#    unusable (no seeded fingerprints) and an operator would be tempted to
#    revert to =no.
if ! grep -q 'UserKnownHostsFile=' "$TARGET"; then
  fail "deploy-prod.sh enforces strict host-key checking but pins no UserKnownHostsFile"
fi

# 4. The same hardened SSH invocation must be reused for the tarball push (the
#    actual supply-chain sink). The script funnels every remote call through the
#    single $SSH variable, so assert the tarball stream is piped into $SSH
#    rather than a raw ssh that would bypass the pinned known-hosts file.
#    Fixed-string match (grep -F) so the literal '$SSH' is matched verbatim.
if ! grep -qF '| $SSH "root@$ip"' "$TARGET"; then
  fail "push_code no longer routes the tarball stream through the hardened \$SSH command"
fi

echo "PASS: deploy-prod.sh enforces strict SSH host-key verification (F-080)"
