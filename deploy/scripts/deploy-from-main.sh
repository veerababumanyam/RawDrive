#!/usr/bin/env bash
#
# deploy-from-main — the safe entry point for production deploys.
#
#   npm run deploy:prod            # normal rolling deploy of GitHub main
#   npm run deploy:prod -- --pull  # pass flags through to deploy-prod.sh
#
# This wrapper guarantees you deploy EXACTLY what is on GitHub `main` — never a
# dirty or un-pushed local tree — then hands off to the existing rolling deploy
# engine (deploy/scripts/deploy-prod.sh), which it does not modify.
#
# Guards (all must pass, else it refuses):
#   1. You are on the `main` branch.
#   2. Your working tree is clean (no uncommitted changes).
#   3. Local `main` == `origin/main` (so prod == what merged on GitHub).
#
# Emergency override (skips guards 1–3 — use only for a deliberate hotfix from
# a non-main ref you have reviewed):  DEPLOY_ALLOW_DIRTY=1 npm run deploy:prod
#
set -euo pipefail

RED=$'\033[0;31m'; YEL=$'\033[0;33m'; GRN=$'\033[0;32m'; CYN=$'\033[0;36m'; NC=$'\033[0m'
say()  { printf '%s▸ %s%s\n' "$CYN" "$1" "$NC"; }
ok()   { printf '%s✓ %s%s\n' "$GRN" "$1" "$NC"; }
die()  { printf '%s✗ deploy: %s%s\n' "$RED" "$1" "$NC" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# The correct production deploy key + pinned host keys. Respect an existing
# SSH_KEY override; otherwise default to the dedicated Hostinger deploy key.
export SSH_KEY="${SSH_KEY:-$HOME/.ssh/rawdrive_hostinger}"
export DEPLOY_KNOWN_HOSTS="${DEPLOY_KNOWN_HOSTS:-$REPO_ROOT/deploy/known_hosts}"

[ -f "$SSH_KEY" ] || die "deploy key not found: $SSH_KEY
    Production root SSH uses the dedicated key ~/.ssh/rawdrive_hostinger.
    (Set SSH_KEY=/path/to/key to override.)"

if [ "${DEPLOY_ALLOW_DIRTY:-0}" = "1" ]; then
  printf '%s! deploy: DEPLOY_ALLOW_DIRTY=1 — skipping main/clean/sync guards.%s\n' "$YEL" "$NC" >&2
else
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "main" ] || die "you are on '$branch', not 'main'.
    Production deploys ship GitHub main. Switch:  git switch main && git pull"

  [ -z "$(git status --porcelain)" ] || die "working tree has uncommitted changes.
    Commit/stash them (or ship them) first — prod must match GitHub main exactly."

  say "Fetching origin/main…"
  git fetch --quiet origin main
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse origin/main)"
  if [ "$local_sha" != "$remote_sha" ]; then
    die "local main ($(git rev-parse --short HEAD)) != origin/main ($(git rev-parse --short origin/main)).
    Run 'git pull' to deploy what is on GitHub, or 'git push' if you have
    local commits that should go through a PR first (npm run ship)."
  fi
  ok "On main, clean, and in sync with origin/main ($(git rev-parse --short HEAD))."
fi

say "Handing off to the rolling deploy engine (Node 1 → health → Node 2)…"
echo
exec bash "$SCRIPT_DIR/deploy-prod.sh" "$@"
