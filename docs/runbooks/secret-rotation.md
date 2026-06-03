# Secret Rotation Runbook

> When a credential is found in git history (gitleaks gate, security review, or
> manual discovery), **rotation is the real fix** — not allowlisting, and not
> (by itself) history rewriting. A secret that was ever pushed must be treated
> as compromised, because clones, forks, and indexers may already have it.

---

## Active item: Google OAuth `client_secret` (found 2026-06-03)

**What leaked:** a Google OAuth client secret in `gen-lang-client-0225070656-9e42fd6f0ba8.json`,
committed 2026-04-07 (commits `00349c7`, `553febb`).

**Current state:**
- ✅ File removed from the working tree.
- ✅ Filename pattern gitignored (`*-client-secret*`-class patterns + the explicit name).
- ✅ gitleaks gate allowlists the **exact filename** so history scans pass (`.gitleaks.toml`).
- ⬜ **NOT yet rotated** — the secret value is still valid until you rotate it.

### Step 1 — Rotate in Google Cloud Console (owner action)
1. Go to **Google Cloud Console → APIs & Services → Credentials**.
2. Find the OAuth 2.0 Client ID that owns this secret (project `gen-lang-client-0225070656`).
3. Either **"Reset secret"** on that client, or create a new OAuth client and migrate to it.
4. Copy the **new** client secret.

### Step 2 — Deploy the new secret (no hardcoding — follow the config model)
Per AGENTS.md, resolution order is `platform_settings` DB → env var → disable. Do NOT
put the secret in source. Use the existing `auth`/OAuth config path:
- Update the Google OAuth secret in `platform_settings` (super-admin settings), **or**
- Update `GOOGLE_CLIENT_SECRET` in the server `.env` on both app nodes, then sync:
  ```bash
  # on each app node, or via the sync tool (filtered to the auth keys)
  go run ./backend/cmd/sync-platform-settings-from-env --category auth
  ```
- Restart/redeploy so the new value is live: `npm run deploy:prod`.

### Step 3 — Verify
- Confirm Google sign-in still works end-to-end (login flow) after the new secret is live.
- Revoke/delete the OLD secret in Google Cloud once the new one is confirmed.

### Step 4 — Tighten the gitleaks allowlist (after rotation)
Once rotated, the history entry is a *revoked* value. Two options:
- **Keep the allowlist entry** (it is already scoped to the exact filename) and note
  "rotated <date>" in `.gitleaks.toml`. Simplest; the revoked value is harmless.
- **Move to commit-SHA scope:** add the offending commit SHAs to the `commits = []`
  list in `.gitleaks.toml` and remove the filename path entry, so only those exact
  historical commits are exempt. Re-derive SHAs from the current history:
  ```bash
  gitleaks detect --config /dev/null --report-format json --report-path /tmp/gl.json
  # (then identify the gen-lang-client commits and add them to commits = [])
  ```

### Step 5 (optional, risky) — Purge from history
History rewriting (`git filter-repo` / BFG) removes the value from the repo, but:
- **It breaks every existing clone** and does NOT recover values already cached by
  GitHub, forks, or indexers — **rotation in Step 1 is what actually protects you.**
- A force-rewrite of `main` previously caused a **production incident** (see repo
  reconciliation notes). If you do this, coordinate it deliberately, take a full
  backup/bundle first, and never do it casually on `main`.

---

## General rotation checklist (any leaked secret)

1. **Treat as compromised** the moment it was pushed.
2. **Rotate at the source** (provider console / key service).
3. **Deploy the new value** via `platform_settings` or env — never source.
4. **Verify** the dependent feature still works; **revoke the old value**.
5. **Stop the bleed forward:** ensure the path/file is gitignored and the gitleaks
   gate scopes (filename or commit-SHA), so a *new* leak still fails CI.
6. Only then consider history rewriting, with backups and out of band.
