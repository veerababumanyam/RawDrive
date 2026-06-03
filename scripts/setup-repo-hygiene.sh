#!/usr/bin/env bash
#
# One-time GitHub repo hygiene setup for RawDrive. Idempotent — safe to re-run.
# Run it once after merging the CI/CD pipeline change:
#
#   bash scripts/setup-repo-hygiene.sh
#
# Requires the GitHub CLI authenticated as a repo admin:
#   gh auth status     # should show account 'manyamprasad'
#
# What it configures:
#   1. Merge policy: squash-merge ONLY, auto-delete head branch on merge,
#      enable auto-merge, clean squash commit (title = PR title).
#   2. Type labels used by `npm run ship`.
#   3. A `main` branch ruleset (Rulesets API — works on private repos without
#      a paid plan): require a PR, require the CI status checks to pass,
#      require linear history, block force-push and branch deletion.
#      Repo admins keep an emergency bypass so you can never lock yourself out.
#
set -euo pipefail

GRN=$'\033[0;32m'; YEL=$'\033[0;33m'; CYN=$'\033[0;36m'; NC=$'\033[0m'
say()  { printf '%s▸ %s%s\n' "$CYN" "$1" "$NC"; }
ok()   { printf '%s✓ %s%s\n' "$GRN" "$1" "$NC"; }
warn() { printf '%s! %s%s\n' "$YEL" "$1" "$NC" >&2; }

command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) is required: https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated. Run: gh auth login" >&2; exit 1; }

SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
say "Configuring $SLUG"

# ── 1. Merge policy ───────────────────────────────────────────────────
say "Setting merge policy (squash-only, auto-delete, auto-merge)…"
gh api -X PATCH "repos/$SLUG" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  >/dev/null
ok "Merge policy applied (PR title becomes the squash commit subject)."

# ── 2. Labels used by the ship tool ───────────────────────────────────
say "Creating type labels…"
create_label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null 2>&1 || warn "label '$1' not created"; }
create_label feature       1f883d "New feature (feat:)"
create_label bug           d1242f "Bug fix (fix:)"
create_label chore         6e7781 "Chore (chore:)"
create_label documentation 0969da "Docs (docs:)"
create_label refactor      8250df "Refactor (refactor:)"
create_label tests         bf8700 "Tests (test:)"
create_label performance   fb8500 "Performance (perf:)"
create_label build         57606a "Build system (build:)"
create_label ci            1a7f37 "CI/CD (ci:)"
create_label style         e1e4e8 "Formatting (style:)"
create_label revert        b35900 "Revert (revert:)"
create_label wip           ededed "Work in progress (wip:)"
ok "Labels ready."

# ── 3. main branch ruleset (Rulesets API) ─────────────────────────────
say "Applying 'main protection' ruleset…"
RULESET_JSON="$(cat <<'JSON'
{
  "name": "main protection",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "backend" },
          { "context": "backend-lint" },
          { "context": "frontend" },
          { "context": "openapi" },
          { "context": "security" },
          { "context": "images" },
          { "context": "pr-title" }
        ]
      }
    }
  ]
}
JSON
)"

# Update in place if a ruleset of this name already exists, else create.
EXISTING_ID="$(gh api "repos/$SLUG/rulesets" -q '.[] | select(.name=="main protection") | .id' 2>/dev/null | head -n1 || true)"
if [ -n "${EXISTING_ID:-}" ]; then
  printf '%s' "$RULESET_JSON" | gh api -X PUT "repos/$SLUG/rulesets/$EXISTING_ID" --input - >/dev/null
  ok "Updated existing ruleset #$EXISTING_ID."
else
  printf '%s' "$RULESET_JSON" | gh api -X POST "repos/$SLUG/rulesets" --input - >/dev/null
  ok "Created 'main protection' ruleset."
fi

cat <<EOF

${GRN}Done.${NC} Summary:
  • main now requires a PR + passing CI; force-push and deletion are blocked.
  • PRs squash-merge and auto-delete their branch.
  • '${CYN}npm run ship${NC}' can arm auto-merge so green PRs merge themselves.

Notes:
  • Required reviews are 0 (solo owner — CI gates are the review). To require a
    human approver later, set required_approving_review_count to 1 and add a
    reviewer, or edit the ruleset in: Settings → Rules → Rulesets.
  • Repo admins keep an 'always' bypass, so you can never be locked out of main.
EOF
