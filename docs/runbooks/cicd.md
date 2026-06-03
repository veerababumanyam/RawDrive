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
        ▼   (when YOU decide to release)
  npm run deploy:prod
        │   guards: on main · clean tree · local main == origin/main
        ▼
  rolling deploy: Node .42 → health check → Node .44      ← reuses deploy-prod.sh
```

**GitHub side = fully automatic and self-cleaning. Production = a deliberate one
command you run when ready.** There is no staging environment, so the deploy stays
in human hands on purpose.

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

When `main` has the changes you want live:

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
`security` (semgrep advisory · gitleaks **blocking** · trivy **blocking**),
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

That's everything for the **local-deploy** model you chose. The local
`npm run deploy:prod` needs no GitHub infrastructure.

### Optional: the GitHub "deploy" button (`cd-production.yml`)

If you later want to deploy/rollback from the GitHub UI (e.g. from a phone), the
`cd-production.yml` workflow is ready but **inert** until:

1. **Register a self-hosted runner on Node .42** labelled `rawdrive-prod`
   (Settings → Actions → Runners → New self-hosted runner; run it as a non-root
   user). GitHub-hosted runners egress from rotating IPs and usually cannot reach
   an SSH-allowlisted VPS — a self-hosted runner keeps the key on your box and
   deploys over the internal network.
2. **Create a `production` Environment** (Settings → Environments) with yourself as
   a **required reviewer** → this is the one-click approval gate.
3. **Add the Environment secret** `RAWDRIVE_DEPLOY_SSH_KEY` = the private half of
   `~/.ssh/rawdrive_hostinger`.

Then: Actions → `cd-production` → Run workflow → approve when prompted.

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

---

## File map

| Path | Role |
|------|------|
| `.githooks/{pre-commit,commit-msg,pre-push}` | Local guardrails |
| `scripts/install-git-hooks.mjs` | Hook installer (runs on `npm install`) |
| `scripts/rawdrive-ship.mjs` | `npm run ship` — local → clean PR |
| `scripts/setup-repo-hygiene.sh` | One-time GitHub policy + labels + ruleset |
| `deploy/scripts/deploy-from-main.sh` | `npm run deploy:prod` guarded wrapper |
| `deploy/scripts/deploy-prod.sh` | The rolling deploy engine (unchanged) |
| `.github/workflows/production-gates.yml` | CI gates (PR + push) |
| `.github/workflows/pr-hygiene.yml` | Conventional-Commit PR-title check |
| `.github/workflows/branch-hygiene.yml` | Weekly merged-branch cleanup |
| `.github/workflows/cd-production.yml` | Optional GitHub deploy button |
| `.github/workflows/release.yml` | GitHub Release on `v*` tag |
