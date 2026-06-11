# RawDrive CI/CD — How We Ship

> The single source of truth for taking a change from your laptop to production,
> cleanly and automatically. If you only read one thing: **`npm run ship`** to get
> code onto GitHub, **`npm run deploy:prod`** to release it to production.

---

## The mental model

```
  develop / fix locally
        │
        ▼
  npm run ship -- "fix(galleries): correct thumbnail order"
        │   ├─ refuses to commit on main → auto-creates a feature branch
        │   ├─ tests in Docker (backend go test + frontend test + build)
        │   ├─ commits (Conventional Commit, validated by hooks)
        │   ├─ pushes the branch
        │   ├─ opens a PR (templated, labelled)
        │   └─ arms auto-merge (squash + delete branch)
        ▼
  GitHub runs CI gates on the PR
   backend · backend-lint · frontend · openapi · security · images · pr-title
        │   all green?
        ▼
  GitHub squash-merges into main + deletes the branch    ← automatic, no clicks
        │
        ▼
  cd-production deploys from the self-hosted rawdrive-prod runner
        │   guards: on main · clean tree · local main == origin/main
        ▼
  rolling deploy: Node .42 → health check → Node .44      ← reuses deploy-prod.sh
```

**GitHub merge and production release are automatic through repo-native CD.**
`cd-production` runs on the self-hosted `rawdrive-prod` runner after each `main`
push, so production release does not depend on hourly Codex automation or
GitHub-hosted runner availability. The local `npm run deploy:prod` command
remains the manual break-glass release path and uses the same guarded rolling
deploy engine.

The CI workflows read the repository variable `RAWDRIVE_ACTIONS_RUNNER` as a
JSON runner-label array. In the current private-repo setup it is set to
`["self-hosted","rawdrive-prod"]` so PR and main-push checks do not fail before
runner assignment when GitHub-hosted Actions billing is unavailable. Delete the
variable, or set it to `["ubuntu-24.04"]`, to move checks back to GitHub-hosted
runners.

---

## Daily workflow (the only two commands you need)

### 1. Ship a change to GitHub

```bash
npm run ship -- "fix(galleries): correct thumbnail order"
```

That's it. The tool branches, tests in Docker, commits, pushes, opens the PR, and
arms auto-merge. When CI passes, GitHub merges and deletes the branch for you.

Watch it land:

```bash
gh pr checks --watch        # live CI status for the current branch's PR
```

Useful flags:

| Flag | When to use |
|------|-------------|
| `--skip-tests` | Docs-only change (CI still gates the PR) |
| `--full-stack` | Also bring up `docker-compose.dev.yml` before testing |
| `--no-merge` | Open the PR but don't auto-merge (you'll merge manually) |
| `--draft` | Open as a draft PR |
| `--dry-run` | Show the plan without pushing or opening a PR |

### 2. Release to production

The default production path is automatic:

1. A PR squash-merges into `main`.
2. `cd-production` deploys the exact main SHA from the self-hosted
   `rawdrive-prod` runner.
3. `production-gates` continues to run as CI hygiene for PR/main validation, but
   deploy does not wait on GitHub-hosted runners.

Manual deploy remains available when GitHub Actions is down or when an operator
needs to redeploy/rollback deliberately:

```bash
npm run deploy:prod              # rolling deploy of GitHub main
npm run deploy:prod -- --pull    # also refresh Docker base images
npm run deploy:prod -- --no-cache# force a clean rebuild on the VPS
```

`deploy:prod` **refuses to run** unless you're on `main`, your tree is clean, and
local `main` exactly matches `origin/main` — so you can only ever deploy what's on
GitHub. It then hands off to the existing rolling engine
(`deploy/scripts/deploy-prod.sh`): build on Node .42 → health-check → Node .44.
See [`rolling-deploy.md`](./rolling-deploy.md) and
[`production-deployment.md`](./production-deployment.md) for the deploy internals.

#### One command, full pipeline (default)

`npm run deploy:prod` runs the **entire hardened pipeline by default** — no flags
to remember:

```
guard (on main · clean · == origin/main)
  → SSH pre-flight (all 3 nodes) → DB-node health
  → push code
  → pending-aware pre-migration backup   (skipped when no migrations are pending)
  → rolling deploy Node .42 → readiness-gate → Node .44 → readiness-gate
  → final verification: /health/deep + /health/ready on both nodes,
    same-revision check, DB-node (postgres/valkey/nats) + standby replication lag
    + backup freshness, public smoke test
```

Everything above is **on by default**. Overrides (rarely needed):

| Invocation / var | Effect |
|------------------|--------|
| `npm run deploy:prod -- --fast` | Skip the pre-migration backup (quick **code-only** redeploy). |
| `npm run deploy:prod -- --minimal` | Old minimal flow: no backup, no readiness gate, no DB-node verify, no smoke. |
| `DEPLOY_FROM_REGISTRY=1 npm run deploy:prod` | Pull prebuilt images from GHCR by commit SHA (`build-images` workflow) instead of rebuilding on each VPS. Nodes must `docker login ghcr.io` first. **Opt-in** — the only phase not on by default. |
| `deploy/.env` `DEPLOY_*` | Per-phase opt-out overrides (documented in `deploy/.env.example`). |

The backend `migrate` runner is now transactional per-migration with sha256
drift detection — see `RAWDRIVE_MIGRATE_STRICT_CHECKSUM` in `deploy/.env.example`.
Incremental backups / PITR (pgBackRest) and automatic DB failover (Patroni) are
the two **infrastructure cutovers** that stay separate (one-time, maintenance
window) — see [`pitr-restore.md`](./pitr-restore.md) and
[`patroni-failover.md`](./patroni-failover.md). Once PITR is activated the
default pre-migration backup automatically uses fast pgBackRest increments.

---

## What enforces "clean" automatically

### Git hooks (installed automatically by `npm install` / `pnpm install`)

Committed in `.githooks/`, activated via `core.hooksPath` (no Husky, no extra deps):

- **pre-commit** — blocks committing on `main`; blocks `.env*`/secret files;
  blocks new >1 MB binaries; runs `gofmt`/`eslint` on staged files only.
- **commit-msg** — enforces Conventional Commits.
- **pre-push** — blocks force-push to `main`; runs quick build/lint/unit checks.

Bypass (rare, deliberate): `git commit --no-verify`, `SKIP_PREPUSH=1 git push`.

If hooks ever seem inactive: `node scripts/install-git-hooks.mjs`.

### CI gates (GitHub Actions — `.github/workflows/production-gates.yml`)

Every PR must pass: `backend` (go test + govulncheck), `backend-lint`
(golangci-lint), `frontend` (audit/lint/test/build), `openapi` (redocly),
`security` (semgrep advisory · gitleaks **blocks new leaks** · trivy **blocking**),
`images` (docker build), plus `pr-title` (Conventional-Commit PR title) and the
`known-hosts-guard`.

### Repo policy (set once via `scripts/setup-repo-hygiene.sh`)

Squash-merge only · auto-delete merged branches · auto-merge enabled · a `main`
ruleset requiring PR + passing checks + linear history + no force-push/deletion.

> **Note:** the `main` ruleset (branch protection) requires **GitHub Pro** on a
> *private* repo owned by a *personal* account — GitHub blocks it on the free plan
> (`"Upgrade to GitHub Pro or make this repository public"`). The script applies the
> merge policy + labels regardless and skips the ruleset gracefully if it's
> unavailable. Without the ruleset, the git hooks + CI-on-PR + manual merge still
> enforce the workflow; auto-merge-on-green needs the ruleset (so, Pro). Org repos
> may have branch protection without per-user Pro.

### Branch cleanup (`.github/workflows/branch-hygiene.yml`)

Weekly, deletes only branches already merged into `main`, older than 30 days, with
no open PR. Never touches protected or `backup/*` branches. Manual run defaults to
a dry-run preview.

---

## One-time setup (do this once, after the pipeline merges)

```bash
# 1. Activate hooks + scripts
npm install                       # runs the prepare hook → installs git hooks

# 2. Apply GitHub repo policy (squash-only, auto-merge, main ruleset, labels)
bash scripts/setup-repo-hygiene.sh  # gh must be authed as the repo admin
```

### GitHub production deploy runner (`cd-production.yml`)

The automatic production path requires:

1. **Register a self-hosted runner on Node .42** labelled `rawdrive-prod`
   (Settings → Actions → Runners → New self-hosted runner; run it as a non-root
   user). GitHub-hosted runners egress from rotating IPs and usually cannot reach
   an SSH-allowlisted VPS — a self-hosted runner keeps the key on your box and
   deploys over the internal network.
2. **Create a `production` Environment** (Settings → Environments). Add a required
   reviewer only if you want a human approval pause; omit the reviewer for fully
   automatic deploys after `main` updates.
3. **Add the Environment secret** `RAWDRIVE_DEPLOY_SSH_KEY` = the private half of
   `~/.ssh/rawdrive_hostinger`.

Automatic deploys trigger directly from `push` to `main` and run on the
self-hosted `rawdrive-prod` runner. Manual deploys and rollbacks are still
available from Actions → `cd-production` → Run workflow.

### Shared CI runner variable

The repo variable `RAWDRIVE_ACTIONS_RUNNER` controls every non-CD workflow that
used to request `ubuntu-24.04` directly:

```json
["self-hosted","rawdrive-prod"]
```

This keeps `production-gates`, `pr-hygiene`, `build-images`, AI review,
release, and branch hygiene off GitHub-hosted runners while the hosted runner
pool is unavailable. The workflow files fall back to `["ubuntu-24.04"]` when
the variable is absent, so rollback is a repository variable change, not a code
change.

---

## Rollback

Three layers, fastest first:

1. **Redeploy the last good commit/tag (recommended).**
   Local: `git switch main && git pull && git reset --hard <good-sha>` is **wrong**
   on main — instead check out the good tag and deploy with the override:
   ```bash
   git fetch --tags
   git -c advice.detachedHead=false switch --detach v0.1.1
   DEPLOY_ALLOW_DIRTY=1 npm run deploy:prod
   git switch main
   ```
   Or, with the GitHub button: `cd-production` → Run workflow → `deploy_ref=v0.1.1`,
   `skip_gates=true` → approve.

2. **Revert forward (clean history).** Never force-push `main` (that caused a prior
   incident). Instead:
   ```bash
   git switch main && git pull
   git revert <bad-squash-sha>
   npm run ship -- "revert: <subject>"
   # after it auto-merges:
   npm run deploy:prod
   ```

3. **On-box image rollback (emergency).** The previous Docker images may still be on
   the VPS; see [`rolling-deploy.md`](./rolling-deploy.md) for retag-and-up steps.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ship` says auto-merge couldn't be armed | Run `bash scripts/setup-repo-hygiene.sh` once. |
| commit rejected "not a Conventional Commit" | Use `type(scope): subject`, e.g. `fix(api): …`. |
| commit rejected on `main` | Branch first, or just use `npm run ship`. |
| `deploy:prod` refuses ("local main != origin/main") | `git pull` (or `git push` your commits through a PR first). |
| pre-push too slow right now | `SKIP_PREPUSH=1 git push` (CI still gates the PR). |
| hooks not running | `node scripts/install-git-hooks.mjs`. |
| `deploy:prod` "deploy key not found" | Ensure `~/.ssh/rawdrive_hostinger` exists, or set `SSH_KEY=`. |
| `deploy:prod` build fails on a removed export / stale import, but `main` builds clean | A file deleted from `main` lingered on a node (older deploys' `tar -x` overwrote but never deleted it). `push_code` now wipes `frontend/src`, `backend/cmd`, `backend/internal` before extract, so this should not recur. If it does (orphan outside those dirs): from a clean `origin/main` checkout, `rsync -a --delete <dir>/ root@<node>:/opt/rawdrive/app/<dir>/` on **both** nodes, then redeploy. A failed build never swaps containers, so prod keeps serving the previous image. |
| `deploy:prod` refuses but your checkout is a live multi-agent (Codex) tree | Don't fight the dirty/occupied tree. Deploy from an isolated worktree: `git worktree add /tmp/rd-deploy main && cd /tmp/rd-deploy && git merge --ff-only origin/main`, then `npm run deploy:prod` from there. |

---

## File map

| Path | Role |
|------|------|
| `.githooks/{pre-commit,commit-msg,pre-push}` | Local guardrails |
| `scripts/install-git-hooks.mjs` | Hook installer (runs on `npm install`) |
| `scripts/rawdrive-ship.mjs` | `npm run ship` — local → clean PR |
| `scripts/setup-repo-hygiene.sh` | One-time GitHub policy + labels + ruleset |
| `deploy/scripts/deploy-from-main.sh` | `npm run deploy:prod` guarded wrapper |
| `deploy/scripts/deploy-prod.sh` | The rolling deploy engine (delete-aware source push: mirrors `main` to each node) |
| `.github/workflows/production-gates.yml` | CI gates (PR + push) |
| `.github/workflows/pr-hygiene.yml` | Conventional-Commit PR-title check |
| `.github/workflows/branch-hygiene.yml` | Weekly merged-branch cleanup |
| `.github/workflows/cd-production.yml` | Optional GitHub deploy button |
| `.github/workflows/release.yml` | GitHub Release on `v*` tag |

---

## Multi-Node Operational Notes

### After any `platform_settings` change (M-1)

Admin writes to `platform_settings` (SMTP credentials, storage keys, feature flags) are
cached per-node with a 30-second TTL (`repository/platform_settings_repo.go`). After
making any such change — including via `go run ./backend/cmd/sync-platform-settings-from-env`
— **wait at least 30 seconds** before running traffic verification on the second node.
The cache expires automatically; no manual invalidation is required.

### Valkey / Redis health monitoring (M-3)

The `rawdrive_valkey_fallback_total{limiter="..."}` Prometheus counter at `/metrics`
increments every time a rate-limiter falls back to per-node in-memory enforcement
because Valkey is unavailable. A sustained non-zero rate means:

- Rate limits are no longer cluster-wide — each node enforces independently
- Brute-force protection is weakened in multi-node mode

**Alert threshold:** if the counter increases at >1/min for more than 2 minutes,
investigate Valkey connectivity (`VALKEY_URL`, UFW rules between nodes, Valkey process).

Before enabling Patroni active-active (`PATRONI_ENABLED=true`), verify that:
1. `VALKEY_URL` is set on both app nodes and the `startup ping` log line is green
2. `rawdrive_valkey_fallback_total` is 0 on a fresh boot (no Valkey errors)
3. The storage analytics widget shows a consistent value from both nodes
